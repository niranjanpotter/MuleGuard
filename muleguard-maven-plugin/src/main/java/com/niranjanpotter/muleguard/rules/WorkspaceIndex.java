package com.niranjanpotter.muleguard.rules;

import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class WorkspaceIndex {

    public static class FlowInfo {
        public final String name;
        public final String kind; // "flow" or "sub-flow"
        public final File file;
        public final int line;
        public final String body;
        public final boolean hasErrorHandler;
        public final String errorHandlerRef;
        public final List<String> flowRefs;
        public final boolean isApikitRoute;
        public final boolean isApikitMain;

        public FlowInfo(String name, String kind, File file, int line, String body,
                        boolean hasErrorHandler, String errorHandlerRef, List<String> flowRefs,
                        boolean isApikitRoute, boolean isApikitMain) {
            this.name = name;
            this.kind = kind;
            this.file = file;
            this.line = line;
            this.body = body;
            this.hasErrorHandler = hasErrorHandler;
            this.errorHandlerRef = errorHandlerRef;
            this.flowRefs = flowRefs;
            this.isApikitRoute = isApikitRoute;
            this.isApikitMain = isApikitMain;
        }
    }

    public final Map<String, FlowInfo> flows = new LinkedHashMap<String, FlowInfo>();
    public final Map<File, List<FlowInfo>> flowsByFile = new LinkedHashMap<File, List<FlowInfo>>();
    public final Set<String> globalErrorHandlers = new HashSet<String>();
    public final Set<String> munitTargets = new HashSet<String>();
    public final List<String> munitSuiteFileNames = new ArrayList<String>();
    public final List<String> munitRawContents = new ArrayList<String>();
    public final Map<String, Set<String>> callers = new HashMap<String, Set<String>>();

    private static final Pattern APIKIT_ROUTE_PATTERN = Pattern.compile("^(get|post|put|patch|delete|head|options):\\\\", Pattern.CASE_INSENSITIVE);
    private static final Pattern FLOW_OPEN_PATTERN = Pattern.compile("<(flow|sub-flow)(?=[\\s>])", Pattern.CASE_INSENSITIVE);
    private static final Pattern NAME_ATTR_PATTERN = Pattern.compile("(?<![\\w:-])name\\s*=\\s*[\"']([^\"']+)[\"']", Pattern.CASE_INSENSITIVE);
    private static final Pattern FLOW_REF_PATTERN = Pattern.compile("<flow-ref\\s+[^>]*?(?<![\\w:-])name\\s*=\\s*[\"']([^\"']+)[\"']", Pattern.CASE_INSENSITIVE);
    private static final Pattern EH_REF_PATTERN = Pattern.compile("<error-handler\\s+[^>]*?(?<![\\w:-])ref\\s*=\\s*[\"']([^\"']+)[\"']", Pattern.CASE_INSENSITIVE);
    private static final Pattern GLOBAL_EH_PATTERN = Pattern.compile("<error-handler\\s+[^>]*?(?<![\\w:-])name\\s*=\\s*[\"']([^\"']+)[\"']", Pattern.CASE_INSENSITIVE);

    public static WorkspaceIndex build(List<File> muleXmlFiles, List<File> munitXmlFiles) {
        WorkspaceIndex index = new WorkspaceIndex();

        for (File xmlFile : muleXmlFiles) {
            try {
                String raw = new String(Files.readAllBytes(xmlFile.toPath()), StandardCharsets.UTF_8);
                index.indexMuleXml(xmlFile, raw);
            } catch (Exception ignored) {}
        }

        for (File munitFile : munitXmlFiles) {
            try {
                String raw = new String(Files.readAllBytes(munitFile.toPath()), StandardCharsets.UTF_8);
                index.munitSuiteFileNames.add(munitFile.getName());
                index.munitRawContents.add(raw);
                index.extractMUnitTargets(raw);
            } catch (Exception ignored) {}
        }

        return index;
    }

    private void indexMuleXml(File file, String raw) {
        String masked = maskXmlComments(raw);

        Matcher ehMatcher = GLOBAL_EH_PATTERN.matcher(masked);
        while (ehMatcher.find()) {
            globalErrorHandlers.add(ehMatcher.group(1).trim());
        }

        List<FlowInfo> fileFlows = new ArrayList<FlowInfo>();
        Matcher openMatcher = FLOW_OPEN_PATTERN.matcher(masked);
        int pos = 0;

        while (openMatcher.find(pos)) {
            String kind = openMatcher.group(1).toLowerCase();
            int openStart = openMatcher.start();
            int openEnd = findTagEnd(masked, openStart);
            if (openEnd == -1) break;

            if (masked.charAt(openEnd - 1) == '/') {
                pos = openEnd + 1;
                continue;
            }

            String openTag = masked.substring(openStart, openEnd + 1);
            Matcher nameMatch = NAME_ATTR_PATTERN.matcher(openTag);
            String name = nameMatch.find() ? nameMatch.group(1).trim() : "";

            Pattern closePattern = Pattern.compile("</" + kind + "\\s*>", Pattern.CASE_INSENSITIVE);
            Matcher closeMatcher = closePattern.matcher(masked);
            if (!closeMatcher.find(openEnd + 1)) {
                pos = openEnd + 1;
                continue;
            }

            String body = masked.substring(openEnd + 1, closeMatcher.start());
            pos = closeMatcher.end();

            if (name.isEmpty()) continue;

            Matcher ehRefMatch = EH_REF_PATTERN.matcher(body);
            String ehRef = ehRefMatch.find() ? ehRefMatch.group(1).trim() : null;
            boolean hasInlineEh = Pattern.compile("<error-handler(?=[\\s>])(?![^>]*/>)|<on-error-propagate(?=[\\s/>])|<on-error-continue(?=[\\s/>])", Pattern.CASE_INSENSITIVE).matcher(body).find();

            List<String> refs = new ArrayList<String>();
            Matcher refMatcher = FLOW_REF_PATTERN.matcher(body);
            while (refMatcher.find()) {
                String target = refMatcher.group(1).trim();
                if (!target.isEmpty() && !target.startsWith("#[")) {
                    refs.add(target);
                }
            }

            boolean isApikitRoute = APIKIT_ROUTE_PATTERN.matcher(name).find();
            boolean isApikitMain = Pattern.compile("<apikit:router(?=[\\s/>])", Pattern.CASE_INSENSITIVE).matcher(body).find()
                || name.toLowerCase().endsWith("-main");
            int line = offsetToLine(masked, openStart);

            FlowInfo info = new FlowInfo(
                name, kind, file, line, body,
                hasInlineEh || ehRef != null, ehRef, refs, isApikitRoute, isApikitMain
            );
            flows.put(name, info);
            fileFlows.add(info);

            for (String ref : refs) {
                Set<String> set = callers.get(ref);
                if (set == null) {
                    set = new HashSet<String>();
                    callers.put(ref, set);
                }
                set.add(name);
            }
        }

        if (!fileFlows.isEmpty()) {
            flowsByFile.put(file, fileFlows);
        }
    }

    private void extractMUnitTargets(String content) {
        String masked = maskXmlComments(content);
        Matcher m = FLOW_REF_PATTERN.matcher(masked);
        while (m.find()) {
            String target = m.group(1).trim();
            if (!target.isEmpty() && !target.startsWith("#[")) {
                munitTargets.add(target);
            }
        }

        Pattern mockWhen = Pattern.compile("<munit-tools:mock-when\\b[^>]*processor\\s*=\\s*[\"']flow-ref[\"'][^>]*>([\\s\\S]*?)</munit-tools:mock-when>", Pattern.CASE_INSENSITIVE);
        Matcher mm = mockWhen.matcher(masked);
        while (mm.find()) {
            Pattern withAttr = Pattern.compile("<munit-tools:with-attribute\\b[^>]*attributeName\\s*=\\s*[\"']name[\"'][^>]*whereValue\\s*=\\s*[\"']([^\"']+)[\"']", Pattern.CASE_INSENSITIVE);
            Matcher wm = withAttr.matcher(mm.group(1));
            while (wm.find()) {
                munitTargets.add(wm.group(1).trim());
            }
        }
    }

    public boolean isFlowCoveredByMUnit(String flowName) {
        if (munitSuiteFileNames.isEmpty() && munitTargets.isEmpty()) {
            return false;
        }
        if (matchesDirectMUnit(flowName)) {
            return true;
        }

        FlowInfo info = flows.get(flowName);
        if (info != null && info.isApikitMain) {
            List<FlowInfo> sameFile = flowsByFile.get(info.file);
            if (sameFile != null) {
                for (FlowInfo candidate : sameFile) {
                    if (candidate.isApikitRoute && matchesDirectMUnit(candidate.name)) {
                        return true;
                    }
                }
            }
        }

        Set<String> visited = new HashSet<String>();
        Queue<String> queue = new LinkedList<String>();
        queue.add(flowName);
        while (!queue.isEmpty()) {
            String current = queue.poll();
            if (!visited.add(current)) continue;
            if (!current.equals(flowName) && matchesDirectMUnit(current)) {
                return true;
            }
            Set<String> flowCallers = callers.get(current);
            if (flowCallers != null) {
                for (String caller : flowCallers) {
                    if (!visited.contains(caller)) queue.add(caller);
                }
            }
        }
        return false;
    }

    private boolean matchesDirectMUnit(String name) {
        if (munitTargets.contains(name)) return true;
        String lower = name.toLowerCase();
        for (String suiteName : munitSuiteFileNames) {
            if (suiteName.toLowerCase().contains(lower)) return true;
        }
        Pattern quoted = Pattern.compile("name\\s*=\\s*[\"']" + Pattern.quote(name) + "[\"']", Pattern.CASE_INSENSITIVE);
        for (String raw : munitRawContents) {
            if (quoted.matcher(raw).find()) return true;
        }
        return false;
    }

    public String checkErrorHandling(FlowInfo info) {
        if ("sub-flow".equals(info.kind)) {
            return "OK";
        }
        if (info.errorHandlerRef != null) {
            if (globalErrorHandlers.isEmpty() || globalErrorHandlers.contains(info.errorHandlerRef)) {
                return "OK";
            }
            return "UNRESOLVED:" + info.errorHandlerRef;
        }
        if (info.hasErrorHandler) {
            return "OK";
        }
        if (info.isApikitRoute) {
            List<FlowInfo> sameFile = flowsByFile.get(info.file);
            if (sameFile != null) {
                for (FlowInfo f : sameFile) {
                    if (f.isApikitMain && f.hasErrorHandler) return "OK";
                }
            }
        }
        if (allCallersHandled(info.name, new HashSet<String>())) {
            return "OK";
        }
        return "MISSING";
    }

    private boolean allCallersHandled(String targetName, Set<String> visited) {
        if (!visited.add(targetName)) return true;
        Set<String> flowCallers = callers.get(targetName);
        if (flowCallers == null || flowCallers.isEmpty()) return false;
        for (String callerName : flowCallers) {
            FlowInfo caller = flows.get(callerName);
            if (caller == null) return false;
            if (caller.hasErrorHandler) continue;
            if (!allCallersHandled(callerName, visited)) return false;
        }
        return true;
    }

    public static String maskXmlComments(String text) {
        Matcher m = Pattern.compile("<!--[\\s\\S]*?(?:-->|$)").matcher(text);
        StringBuffer sb = new StringBuffer();
        while (m.find()) {
            String comment = m.group();
            m.appendReplacement(sb, Matcher.quoteReplacement(comment.replaceAll("[^\\r\\n]", " ")));
        }
        m.appendTail(sb);
        return sb.toString();
    }

    public static int findTagEnd(String text, int tagStart) {
        char quote = 0;
        for (int i = tagStart; i < text.length(); i++) {
            char ch = text.charAt(i);
            if (quote != 0) {
                if (ch == quote) quote = 0;
                continue;
            }
            if (ch == '"' || ch == '\'') {
                quote = ch;
            } else if (ch == '>') {
                return i;
            }
        }
        return -1;
    }

    public static int offsetToLine(String text, int offset) {
        int line = 1;
        for (int i = 0; i < offset && i < text.length(); i++) {
            if (text.charAt(i) == '\n') line++;
        }
        return line;
    }
}
