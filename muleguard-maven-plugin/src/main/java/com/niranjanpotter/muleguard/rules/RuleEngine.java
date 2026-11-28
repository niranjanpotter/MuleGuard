package com.niranjanpotter.muleguard.rules;

import com.niranjanpotter.muleguard.config.ConfigLoader;
import com.niranjanpotter.muleguard.model.Finding;
import com.niranjanpotter.muleguard.model.Severity;
import com.niranjanpotter.muleguard.rules.WorkspaceIndex.FlowInfo;

import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class RuleEngine {

    private static final Pattern KEBAB_CASE = Pattern.compile("^[a-z][a-z0-9]*(-[a-z0-9]+)*$");
    private static final Pattern SECRET_ATTR_PATTERN = Pattern.compile("\\b(password|clientSecret|clientId|client_secret|client_id|client-secret|client-id)\\s*=\\s*([\"'])([^\"']*)\\2", Pattern.CASE_INSENSITIVE);
    private static final Pattern BEARER_ATTR_PATTERN = Pattern.compile("\\b(?:authorization|bearer|access_token|accessToken|apiKey|api_key)\\s*=\\s*[\"']([^\"']*)[\"']", Pattern.CASE_INSENSITIVE);
    private static final Pattern LOGGER_PATTERN = Pattern.compile("<(?:[\\w-]+:)?logger(?=[\\s/>])", Pattern.CASE_INSENSITIVE);
    private static final Pattern HTTP_LISTENER_PATTERN = Pattern.compile("<http:listener(?=[\\s/>])", Pattern.CASE_INSENSITIVE);
    private static final Pattern VALIDATION_PATTERN = Pattern.compile("<(?:validation:[\\w-]+|json:validate-schema|xml-module:validate-schema|apikit:router)(?=[\\s/>])", Pattern.CASE_INSENSITIVE);
    private static final Pattern DW_MEMBER_PATTERN = Pattern.compile("\\b(payload|vars|attributes)((?:\\??\\.[A-Za-z_][\\w$]*|\\[\\d+\\]){2,})");
    private static final Pattern FIXTURE_PATH_PATTERN = Pattern.compile("(?:^|[/\\\\])(?:src[/\\\\]test|sample|samples|fixtures|examples)(?:[/\\\\]|$)", Pattern.CASE_INSENSITIVE);

    public List<Finding> scanProject(File baseDir) {
        ConfigLoader config = ConfigLoader.load(baseDir);

        List<File> muleXmlFiles = new ArrayList<File>();
        List<File> munitXmlFiles = new ArrayList<File>();
        List<File> dwlFiles = new ArrayList<File>();
        List<File> configFiles = new ArrayList<File>();

        findFiles(baseDir, baseDir, muleXmlFiles, munitXmlFiles, dwlFiles, configFiles);

        WorkspaceIndex index = WorkspaceIndex.build(muleXmlFiles, munitXmlFiles);
        List<Finding> rawFindings = new ArrayList<Finding>();

        for (File xmlFile : muleXmlFiles) {
            scanMuleXmlFile(xmlFile, index, config, rawFindings);
        }
        for (File munitFile : munitXmlFiles) {
            scanSecretsOnly(munitFile, config, rawFindings);
        }
        for (File dwlFile : dwlFiles) {
            scanDwlFile(baseDir, dwlFile, index, config, rawFindings);
        }
        checkDwlEnvDrift(baseDir, dwlFiles, config, rawFindings);
        for (File configFile : configFiles) {
            scanConfigFile(configFile, rawFindings);
        }

        List<Finding> finalFindings = new ArrayList<Finding>();
        Map<String, List<String>> fileLinesCache = new HashMap<String, List<String>>();
        for (Finding f : rawFindings) {
            if (config.isRuleOff(f.getRuleId())) continue;
            List<String> lines = getLines(f.getFilePath(), fileLinesCache);
            String lineText = (f.getLineNumber() >= 1 && f.getLineNumber() <= lines.size())
                ? lines.get(f.getLineNumber() - 1) : "";
            if (config.isBaselined(baseDir, f, lineText)) continue;

            Severity resolved = config.resolveSeverity(f.getRuleId(), f.getSeverity());
            if (resolved != f.getSeverity()) {
                finalFindings.add(new Finding(f.getRuleId(), f.getRuleName(), resolved, f.getFilePath(), f.getLineNumber(), f.getMessage(), f.getRecommendation()));
            } else {
                finalFindings.add(f);
            }
        }
        return finalFindings;
    }

    private void findFiles(File baseDir, File dir, List<File> muleXml, List<File> munitXml, List<File> dwlFiles, List<File> configFiles) {
        if (dir == null || !dir.exists()) return;
        File[] files = dir.listFiles();
        if (files == null) return;

        for (File file : files) {
            String name = file.getName();
            if (file.isDirectory()) {
                if (!name.equals("target") && !name.equals(".git") && !name.equals("node_modules")
                    && !name.equals(".mule") && !name.equals(".tooling-project") && !name.equals("out") && !name.equals("dist")) {
                    findFiles(baseDir, file, muleXml, munitXml, dwlFiles, configFiles);
                }
            } else {
                String path = file.getAbsolutePath().replace("\\", "/");
                String lower = name.toLowerCase();
                if (lower.endsWith(".xml") && !lower.equals("pom.xml") && !lower.equals("log4j2.xml")) {
                    if (path.toLowerCase().contains("/src/test/munit/")) {
                        munitXml.add(file);
                    } else if (!path.toLowerCase().contains("/src/test/")) {
                        muleXml.add(file);
                    }
                } else if (lower.endsWith(".dwl")) {
                    dwlFiles.add(file);
                } else if ((lower.endsWith(".yaml") || lower.endsWith(".properties")) && !path.toLowerCase().contains("/src/test/")) {
                    configFiles.add(file);
                }
            }
        }
    }

    private void scanSecretsOnly(File file, ConfigLoader config, List<Finding> findings) {
        try {
            String raw = new String(Files.readAllBytes(file.toPath()), StandardCharsets.UTF_8);
            String masked = WorkspaceIndex.maskXmlComments(raw);
            checkHardcodedSecrets(file, masked, config, findings);
        } catch (Exception ignored) {}
    }

    private void scanMuleXmlFile(File file, WorkspaceIndex index, ConfigLoader config, List<Finding> findings) {
        try {
            String raw = new String(Files.readAllBytes(file.toPath()), StandardCharsets.UTF_8);
            if (!raw.contains("<mule")) return;
            String masked = WorkspaceIndex.maskXmlComments(raw);

            // MG001: Hardcoded secrets
            checkHardcodedSecrets(file, masked, config, findings);

            List<FlowInfo> fileFlows = index.flowsByFile.get(file);
            if (fileFlows != null) {
                for (FlowInfo flow : fileFlows) {
                    // MG002 / MG002b: Error handler
                    String ehStatus = index.checkErrorHandling(flow);
                    if (ehStatus.startsWith("UNRESOLVED:")) {
                        String refName = ehStatus.substring("UNRESOLVED:".length());
                        findings.add(new Finding("MG002b", "Unresolved Error Handler Ref", Severity.HIGH, file.getAbsolutePath(), flow.line,
                            "Flow '" + flow.name + "' references error-handler '" + refName + "' which is not defined in workspace.",
                            "Define <error-handler name=\"" + refName + "\"> in global.xml."));
                    } else if ("MISSING".equals(ehStatus)) {
                        findings.add(new Finding("MG002", "Missing Error Handler", Severity.HIGH, file.getAbsolutePath(), flow.line,
                            "Flow '" + flow.name + "' does not define an error handler.",
                            "Add an <error-handler> block or reference a global error handler."));
                    }

                    if ("flow".equals(flow.kind)) {
                        // MG003: Missing start logger (accepts logging plugin flows & skips single-ref APIkit routes)
                        if (!isSingleFlowRefApikitRoute(flow) && !hasAcceptedLogging(flow.body, config)) {
                            findings.add(new Finding("MG003", "Missing Flow Logger", Severity.MEDIUM, file.getAbsolutePath(), flow.line,
                                "Flow '" + flow.name + "' should start with a <logger> or accepted logging flow-ref.",
                                "Add a <logger> processor with correlationId for traceability."));
                        }

                        // MG004: HTTP Listener without validation
                        Matcher lm = HTTP_LISTENER_PATTERN.matcher(flow.body);
                        if (lm.find() && !VALIDATION_PATTERN.matcher(flow.body).find()) {
                            findings.add(new Finding("MG004", "Missing Payload Validation", Severity.INFO, file.getAbsolutePath(), flow.line,
                                "HTTP listener flow '" + flow.name + "' has no schema validation or APIkit router.",
                                "Add Validation module or APIkit router."));
                        }

                        // MG005: Missing MUnit coverage
                        if (!index.isFlowCoveredByMUnit(flow.name)) {
                            findings.add(new Finding("MG005", "No MUnit Test Found", Severity.MEDIUM, file.getAbsolutePath(), flow.line,
                                "Flow '" + flow.name + "' has no MUnit test coverage.",
                                "Add an MUnit test suite under src/test/munit/ targeting this flow."));
                        }
                    }

                    // BP-01 / BP-02: Kebab-case flow/sub-flow names
                    if ("flow".equals(flow.kind)) {
                        if (!config.isIgnoredFlowName(flow.name) && !KEBAB_CASE.matcher(flow.name).matches()) {
                            findings.add(new Finding("BP-01", "Flow Name Not Kebab-Case", Severity.MEDIUM, file.getAbsolutePath(), flow.line,
                                "Flow name '" + flow.name + "' is not kebab-case.",
                                "Rename flow using lowercase kebab-case (e.g. create-order-flow)."));
                        }
                    } else if (!KEBAB_CASE.matcher(flow.name).matches()) {
                        findings.add(new Finding("BP-02", "Sub-Flow Name Not Kebab-Case", Severity.MEDIUM, file.getAbsolutePath(), flow.line,
                            "Sub-flow name '" + flow.name + "' is not kebab-case.",
                            "Rename sub-flow using lowercase kebab-case."));
                    }

                    // BP-06: Too many components (> 15)
                    int procCount = countDirectProcessors(flow.body);
                    if (procCount > 15) {
                        findings.add(new Finding("BP-06", "Too Many Components in Flow", Severity.MEDIUM, file.getAbsolutePath(), flow.line,
                            "Flow '" + flow.name + "' has " + procCount + " components (max 15).",
                            "Refactor logic into modular <sub-flow> components."));
                    }

                    // BP-09: Empty flow
                    if (flow.body.trim().isEmpty() || !Pattern.compile("<[a-zA-Z]").matcher(flow.body).find()) {
                        findings.add(new Finding("BP-09", "Empty Flow", Severity.LOW, file.getAbsolutePath(), flow.line,
                            "Flow '" + flow.name + "' is empty and has no components.",
                            "Remove unused flow or add implementation processors."));
                    }

                    // BP-10: Broken flow-ref (workspace-wide)
                    for (String target : flow.flowRefs) {
                        if (!index.flows.containsKey(target)) {
                            findings.add(new Finding("BP-10", "Broken Flow-Ref Target", Severity.HIGH, file.getAbsolutePath(), flow.line,
                                "flow-ref target '" + target + "' is not defined in src/main/mule.",
                                "Ensure target flow or sub-flow exists in workspace."));
                        }
                    }
                }
            }

            // MG007: Foreach remote call
            Matcher fe = Pattern.compile("<foreach(?=[\\s>])([\\s\\S]*?)</foreach>", Pattern.CASE_INSENSITIVE).matcher(masked);
            while (fe.find()) {
                if (Pattern.compile("<(?:http:request|db:(?:select|insert|update|delete)|sftp:|ftp:|jms:publish)", Pattern.CASE_INSENSITIVE).matcher(fe.group(1)).find()) {
                    findings.add(new Finding("MG007", "Remote Call Inside Foreach", Severity.HIGH, file.getAbsolutePath(), WorkspaceIndex.offsetToLine(masked, fe.start()),
                        "Remote connector call inside <foreach> causes N+1 latency and thread overhead.",
                        "Use Batch Job or bulk connector operations instead of sequential <foreach> calls."));
                }
            }

            // MG008 & S-07: DEBUG / TRACE loggers
            Matcher logM = Pattern.compile("<logger\\s+[^>]*?\\blevel\\s*=\\s*[\"'](DEBUG|TRACE)[\"']", Pattern.CASE_INSENSITIVE).matcher(masked);
            while (logM.find()) {
                String lvl = logM.group(1).toUpperCase();
                int line = WorkspaceIndex.offsetToLine(masked, logM.start());
                if ("TRACE".equals(lvl)) {
                    findings.add(new Finding("S-07", "TRACE Logger Exposes Payloads", Severity.HIGH, file.getAbsolutePath(), line,
                        "TRACE-level logger may expose sensitive data in production.",
                        "Change level to INFO and manage debug logging in log4j2.xml."));
                } else {
                    findings.add(new Finding("MG008", "Active DEBUG Logger", Severity.MEDIUM, file.getAbsolutePath(), line,
                        "Hardcoded DEBUG logger causes CloudHub I/O overhead.",
                        "Change level to INFO or manage dynamically via log4j2.xml."));
                }
            }

            // BP-03: Hardcoded numeric port
            Matcher portM = Pattern.compile("\\bport\\s*=\\s*\"(\\d+)\"", Pattern.CASE_INSENSITIVE).matcher(masked);
            while (portM.find()) {
                findings.add(new Finding("BP-03", "Hardcoded Port", Severity.MEDIUM, file.getAbsolutePath(), WorkspaceIndex.offsetToLine(masked, portM.start()),
                    "Port is hardcoded to \"" + portM.group(1) + "\".",
                    "Use a property placeholder such as ${http.port}."));
            }

            // BP-04: Missing HTTP responseTimeout
            Matcher reqCfg = Pattern.compile("<http:request-config(?=[\\s>])", Pattern.CASE_INSENSITIVE).matcher(masked);
            while (reqCfg.find()) {
                int end = WorkspaceIndex.findTagEnd(masked, reqCfg.start());
                if (end != -1) {
                    String tag = masked.substring(reqCfg.start(), end + 1);
                    if (!Pattern.compile("\\bresponseTimeout\\s*=", Pattern.CASE_INSENSITIVE).matcher(tag).find()) {
                        findings.add(new Finding("BP-04", "Missing HTTP Response Timeout", Severity.INFO, file.getAbsolutePath(), WorkspaceIndex.offsetToLine(masked, reqCfg.start()),
                            "HTTP Request Config does not specify responseTimeout.",
                            "Configure responseTimeout=\"${http.timeout.response}\" to prevent thread exhaustion."));
                    }
                }
            }

            // BP-05: Commented-out XML code
            Matcher comM = Pattern.compile("<!--([\\s\\S]*?)-->").matcher(raw);
            while (comM.find()) {
                if (Pattern.compile("<[a-zA-Z][\\w:.-]*").matcher(comM.group(1)).find()) {
                    findings.add(new Finding("BP-05", "Commented-Out XML Code", Severity.LOW, file.getAbsolutePath(), WorkspaceIndex.offsetToLine(raw, comM.start()),
                        "Comment appears to contain commented-out XML code.",
                        "Remove dead commented-out code before committing."));
                }
            }

            // BP-07: Missing doc:name
            Matcher docM = Pattern.compile("<(http:request|ee:transform|db:(?:select|insert|update|delete))(?=[\\s/>])", Pattern.CASE_INSENSITIVE).matcher(masked);
            while (docM.find()) {
                int end = WorkspaceIndex.findTagEnd(masked, docM.start());
                if (end != -1 && !masked.substring(docM.start(), end + 1).contains("doc:name")) {
                    findings.add(new Finding("BP-07", "Missing doc:name Attribute", Severity.LOW, file.getAbsolutePath(), WorkspaceIndex.offsetToLine(masked, docM.start()),
                        "<" + docM.group(1) + "> is missing a descriptive doc:name attribute.",
                        "Add doc:name=\"...\" for readability in Anypoint Studio."));
                }
            }

            // BP-08: Mule 3 deprecated syntax
            Matcher m3 = Pattern.compile("<(message-properties-transformer|set-session-variable|copy-properties|message-filter|expression-component)(?=[\\s/>])", Pattern.CASE_INSENSITIVE).matcher(masked);
            while (m3.find()) {
                findings.add(new Finding("BP-08", "Deprecated Mule 3 Syntax", Severity.HIGH, file.getAbsolutePath(), WorkspaceIndex.offsetToLine(masked, m3.start()),
                    "<" + m3.group(1) + "> is deprecated Mule 3 syntax.",
                    "Migrate to Mule 4 DataWeave / standard processors."));
            }

            // S-01: HTTP Listener without TLS
            Matcher httpLst = Pattern.compile("<http:listener-config(?=[\\s>])([\\s\\S]*?)(?:/>|</http:listener-config>)", Pattern.CASE_INSENSITIVE).matcher(masked);
            while (httpLst.find()) {
                String blk = httpLst.group(0);
                if (Pattern.compile("\\bprotocol\\s*=\\s*\"HTTP\"", Pattern.CASE_INSENSITIVE).matcher(blk).find() && !blk.toLowerCase().contains("<tls:context")) {
                    findings.add(new Finding("S-01", "HTTP Listener Without TLS", Severity.HIGH, file.getAbsolutePath(), WorkspaceIndex.offsetToLine(masked, httpLst.start()),
                        "HTTP listener uses HTTP protocol without <tls:context>.",
                        "Use HTTPS with TLS context for production endpoints."));
                }
            }

            // S-02: Insecure TLS trust store
            Matcher tls = Pattern.compile("<tls:trust-store[^>]*\\binsecure\\s*=\\s*\"true\"", Pattern.CASE_INSENSITIVE).matcher(masked);
            while (tls.find()) {
                findings.add(new Finding("S-02", "Insecure TLS Trust Store", Severity.CRITICAL, file.getAbsolutePath(), WorkspaceIndex.offsetToLine(masked, tls.start()),
                    "Trust store has insecure=\"true\" — TLS certificate validation is disabled.",
                    "Remove insecure=\"true\" and configure proper CA certificates."));
            }

            // S-03: Wildcard CORS
            Matcher cors = Pattern.compile("Access-Control-Allow-Origin[^\"]*\"?\\s*\\*|Access-Control-Allow-Origin\\s*=\\s*\"\\*\"", Pattern.CASE_INSENSITIVE).matcher(masked);
            while (cors.find()) {
                findings.add(new Finding("S-03", "Wildcard CORS Origin", Severity.MEDIUM, file.getAbsolutePath(), WorkspaceIndex.offsetToLine(masked, cors.start()),
                    "Access-Control-Allow-Origin is set to wildcard '*'.",
                    "Restrict CORS to explicit trusted origins."));
            }

            // S-04: Hardcoded Bearer / API Key
            Matcher bearer = BEARER_ATTR_PATTERN.matcher(masked);
            while (bearer.find()) {
                String val = bearer.group(1);
                if (!config.isSafeSecretExpression(val) && val.length() >= 6) {
                    findings.add(new Finding("S-04", "Hardcoded Bearer / API Key", Severity.CRITICAL, file.getAbsolutePath(), WorkspaceIndex.offsetToLine(masked, bearer.start()),
                        "Potential hardcoded API key or Bearer token detected.",
                        "Move tokens into secure properties (${secure::...} or ${aws-secrets::...})."));
                }
            }

            // S-05: Deprecated TLS protocols
            Matcher weakTls = Pattern.compile("\\benabledProtocols\\s*=\\s*\"([^\"]*(?:SSLv|TLSv1\\.0|TLSv1\\.1|\\bTLSv1\\b)[^\"]*)\"", Pattern.CASE_INSENSITIVE).matcher(masked);
            while (weakTls.find()) {
                findings.add(new Finding("S-05", "Deprecated TLS Protocol", Severity.CRITICAL, file.getAbsolutePath(), WorkspaceIndex.offsetToLine(masked, weakTls.start()),
                    "Deprecated TLS protocol \"" + weakTls.group(1) + "\" enabled.",
                    "Restrict enabledProtocols to TLSv1.2 and TLSv1.3."));
            }

            // S-06: Basic auth hardcoded
            Matcher basic = Pattern.compile("<http:basic-authentication[^>]*>", Pattern.CASE_INSENSITIVE).matcher(masked);
            while (basic.find()) {
                String tag = basic.group(0);
                for (String field : new String[]{"username", "password"}) {
                    Matcher fm = Pattern.compile("\\b" + field + "\\s*=\\s*\"([^\"]*)\"", Pattern.CASE_INSENSITIVE).matcher(tag);
                    if (fm.find() && !config.isSafeSecretExpression(fm.group(1))) {
                        findings.add(new Finding("S-06", "Hardcoded Basic Auth Credentials", Severity.HIGH, file.getAbsolutePath(), WorkspaceIndex.offsetToLine(masked, basic.start()),
                            "Basic authentication " + field + " is hardcoded.",
                            "Externalize credentials using secure property placeholders."));
                    }
                }
            }

            // MG006 inside <ee:transform>
            boolean isApikitFile = raw.contains("<apikit:router") || (fileFlows != null && anyApikitRoute(fileFlows));
            Matcher cdata = Pattern.compile("<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>").matcher(raw);
            while (cdata.find()) {
                int baseLine = WorkspaceIndex.offsetToLine(raw, cdata.start());
                analyzeDataWeaveText(file, cdata.group(1), baseLine - 1, isApikitFile, config, findings);
            }
        } catch (Exception ignored) {}
    }

    private void checkHardcodedSecrets(File file, String masked, ConfigLoader config, List<Finding> findings) {
        Matcher m = SECRET_ATTR_PATTERN.matcher(masked);
        while (m.find()) {
            String attr = m.group(1);
            String val = m.group(3);
            if (!config.isSafeSecretExpression(val)) {
                findings.add(new Finding("MG001", "Hardcoded Cleartext Secret", Severity.CRITICAL, file.getAbsolutePath(), WorkspaceIndex.offsetToLine(masked, m.start()),
                    "Attribute '" + attr + "' contains a hardcoded secret.",
                    "Move credentials into secure.yaml and reference via ${secure::" + attr + "} or ${aws-secrets::...}."));
            }
        }
    }

    private void scanDwlFile(File baseDir, File file, WorkspaceIndex index, ConfigLoader config, List<Finding> findings) {
        try {
            String raw = new String(Files.readAllBytes(file.toPath()), StandardCharsets.UTF_8);
            String rel = baseDir.toPath().toAbsolutePath().normalize().relativize(file.toPath().toAbsolutePath().normalize()).toString();
            if (!config.isLintFixtures() && isFixtureDwl(rel, raw)) {
                return;
            }
            boolean isApikitWorkspace = false;
            for (FlowInfo fi : index.flows.values()) {
                if (fi.isApikitMain || fi.isApikitRoute) {
                    isApikitWorkspace = true;
                    break;
                }
            }
            analyzeDataWeaveText(file, raw, 0, isApikitWorkspace, config, findings);
        } catch (Exception ignored) {}
    }

    private void analyzeDataWeaveText(File file, String code, int baseLineOffset, boolean isApikitContext, ConfigLoader config, List<Finding> findings) {
        String[] lines = code.split("\\r?\\n", -1);
        int emitted = 0;
        int suppressed = 0;

        for (int i = 0; i < lines.length; i++) {
            String line = lines[i];
            String trimmed = line.trim();
            if (trimmed.startsWith("//") || trimmed.startsWith("/*")) continue;

            Matcher m = DW_MEMBER_PATTERN.matcher(line);
            while (m.find()) {
                String rootIdent = m.group(1);
                String chain = m.group(2);
                if (chain.contains("?.") || chain.contains("!")) continue;

                int depth = countSegments(chain);
                if (depth < config.getMinDepth()) continue;

                if (isApikitContext && "attributes".equals(rootIdent) && Pattern.compile("^\\.(headers|queryParams|uriParams)\\b", Pattern.CASE_INSENSITIVE).matcher(chain).find()) {
                    continue;
                }

                String before = line.substring(0, m.start());
                String after = line.substring(m.end());
                if (Pattern.compile("^\\s*[?(!]").matcher(after).find()) continue;
                if (Pattern.compile("^\\s*(?:as\\s+[A-Za-z0-9_]+\\s*)?\\bdefault\\b", Pattern.CASE_INSENSITIVE).matcher(after).find()) continue;
                if (Pattern.compile("\\bif\\b\\s*\\(?", Pattern.CASE_INSENSITIVE).matcher(line).find()) continue;
                if (Pattern.compile("(?:isEmpty|sizeOf|p)\\s*\\([^)]*$", Pattern.CASE_INSENSITIVE).matcher(before).find()) continue;

                if (emitted < config.getMaxPerFile()) {
                    findings.add(new Finding("MG006", "DataWeave Null Safety", depth >= 3 ? Severity.MEDIUM : Severity.INFO,
                        file.getAbsolutePath(), baseLineOffset + i + 1,
                        "Possible NullPointer on '" + m.group(0) + "' — add default or safe navigation.",
                        "Append `default ''` / `default 0` or use `?.` safe navigation."));
                    emitted++;
                } else {
                    suppressed++;
                }
            }
        }

        if (suppressed > 0) {
            findings.add(new Finding("MG006", "DataWeave Null Safety Summary", Severity.INFO, file.getAbsolutePath(), baseLineOffset + 1,
                suppressed + " additional MG006 null-safety findings suppressed (cap: " + config.getMaxPerFile() + ").",
                "Increase maxPerFile in .muleguard.json if needed."));
        }
    }

    private void checkDwlEnvDrift(File baseDir, List<File> dwlFiles, ConfigLoader config, List<Finding> findings) {
        Map<String, List<File>> byName = new HashMap<String, List<File>>();
        for (File f : dwlFiles) {
            try {
                String raw = new String(Files.readAllBytes(f.toPath()), StandardCharsets.UTF_8);
                String rel = baseDir.toPath().toAbsolutePath().normalize().relativize(f.toPath().toAbsolutePath().normalize()).toString();
                if (isFixtureDwl(rel, raw)) continue;
                String env = detectEnv(rel, config.getEnvironments());
                if (env != null) {
                    List<File> list = byName.get(f.getName());
                    if (list == null) {
                        list = new ArrayList<File>();
                        byName.put(f.getName(), list);
                    }
                    list.add(f);
                }
            } catch (Exception ignored) {}
        }

        for (Map.Entry<String, List<File>> entry : byName.entrySet()) {
            List<File> copies = entry.getValue();
            if (copies.size() < 2) continue;
            File refFile = copies.get(0);
            String refEnv = detectEnv(refFile.getAbsolutePath(), config.getEnvironments());
            for (File c : copies) {
                String env = detectEnv(c.getAbsolutePath(), config.getEnvironments());
                if (config.getReferenceEnvironment().equalsIgnoreCase(env)) {
                    refFile = c;
                    refEnv = env;
                    break;
                }
            }
            try {
                String refHash = ConfigLoader.sha1(new String(Files.readAllBytes(refFile.toPath()), StandardCharsets.UTF_8).replace("\r\n", "\n"));
                List<String> drifted = new ArrayList<String>();
                for (File c : copies) {
                    if (c.equals(refFile)) continue;
                    String cHash = ConfigLoader.sha1(new String(Files.readAllBytes(c.toPath()), StandardCharsets.UTF_8).replace("\r\n", "\n"));
                    if (!cHash.equals(refHash)) {
                        drifted.add(detectEnv(c.getAbsolutePath(), config.getEnvironments()));
                    }
                }
                if (!drifted.isEmpty()) {
                    findings.add(new Finding("BP-11", "DWL Environment Drift", Severity.INFO, refFile.getAbsolutePath(), 1,
                        "DataWeave script '" + entry.getKey() + "' differs from reference '" + refEnv + "' in: " + String.join(", ", drifted),
                        "Compare copies across environments to ensure drift is intentional."));
                }
            } catch (Exception ignored) {}
        }
    }

    private void scanConfigFile(File file, List<Finding> findings) {
        try {
            List<String> lines = Files.readAllLines(file.toPath(), StandardCharsets.UTF_8);
            Pattern plainSecret = Pattern.compile("(?i)^\\s*(password|secret|client_secret|clientSecret|apikey|private_key|token)\\s*:\\s*(?!\\!\\[).{4,}");
            for (int i = 0; i < lines.size(); i++) {
                if (plainSecret.matcher(lines.get(i)).find()) {
                    findings.add(new Finding("S-05", "Unencrypted Sensitive Property", Severity.CRITICAL, file.getAbsolutePath(), i + 1,
                        "Environment config property appears to contain an unencrypted plaintext secret.",
                        "Encrypt property using Mule Secure Configuration Property tool (![EncryptedValue])."));
                }
            }
        } catch (Exception ignored) {}
    }

    private static boolean isSingleFlowRefApikitRoute(FlowInfo flow) {
        if (!flow.isApikitRoute) return false;
        Matcher m = Pattern.compile("<([a-zA-Z][\\w:-]*)").matcher(flow.body);
        int count = 0;
        while (m.find()) {
            if (!"flow-ref".equalsIgnoreCase(m.group(1))) return false;
            count++;
        }
        return count > 0;
    }

    private static boolean hasAcceptedLogging(String body, ConfigLoader config) {
        if (LOGGER_PATTERN.matcher(body).find()) return true;
        Matcher m = Pattern.compile("<flow-ref\\s+[^>]*?(?<![\\w:-])name\\s*=\\s*[\"']([^\"']+)[\"']", Pattern.CASE_INSENSITIVE).matcher(body);
        while (m.find()) {
            if (config.matchesAcceptedLoggingFlow(m.group(1).trim())) return true;
        }
        return false;
    }

    private static boolean anyApikitRoute(List<FlowInfo> flows) {
        for (FlowInfo f : flows) {
            if (f.isApikitRoute || f.isApikitMain) return true;
        }
        return false;
    }

    private static int countDirectProcessors(String body) {
        int count = 0;
        Matcher m = Pattern.compile("<[a-zA-Z][\\w:-]*(?=[\\s/>])").matcher(body);
        while (m.find()) count++;
        return count / 2; // approximate open+close or self-closing
    }

    private static int countSegments(String chain) {
        int count = 0;
        Matcher m = Pattern.compile("\\??\\.[A-Za-z_][\\w$]*|\\[\\d+\\]").matcher(chain);
        while (m.find()) count++;
        return count;
    }

    private static boolean isFixtureDwl(String relPath, String content) {
        if (FIXTURE_PATH_PATTERN.matcher(relPath).find()) return true;
        boolean hasOutput = Pattern.compile("^\\s*output\\b", Pattern.MULTILINE).matcher(content).find();
        boolean hasSep = Pattern.compile("^\\s*---\\s*$", Pattern.MULTILINE).matcher(content).find();
        return !hasOutput && !hasSep;
    }

    private static String detectEnv(String path, List<String> envs) {
        String[] segs = path.replace("\\", "/").split("/");
        for (String seg : segs) {
            for (String e : envs) {
                if (e.equalsIgnoreCase(seg)) return e;
            }
        }
        return null;
    }

    private static List<String> getLines(String filePath, Map<String, List<String>> cache) {
        List<String> lines = cache.get(filePath);
        if (lines == null) {
            try {
                lines = Files.readAllLines(new File(filePath).toPath(), StandardCharsets.UTF_8);
            } catch (Exception e) {
                lines = Collections.emptyList();
            }
            cache.put(filePath, lines);
        }
        return lines;
    }
}
