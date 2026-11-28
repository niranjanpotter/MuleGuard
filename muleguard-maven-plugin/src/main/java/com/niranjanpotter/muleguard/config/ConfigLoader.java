package com.niranjanpotter.muleguard.config;

import com.niranjanpotter.muleguard.model.Finding;
import com.niranjanpotter.muleguard.model.Severity;

import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.security.MessageDigest;
import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class ConfigLoader {

    private final List<String> secretProviders = new ArrayList<String>(Arrays.asList("secure::", "aws-secrets::", "aws-s3::"));
    private final List<String> acceptedLoggingFlows = new ArrayList<String>(Arrays.asList("mule-logging-utilFlow", "*-logger", "*logging*"));
    private final List<String> namingIgnorePatterns = new ArrayList<String>(Arrays.asList("^(get|post|put|patch|delete|head|options):\\\\", "-main$"));
    private final List<String> environments = new ArrayList<String>(Arrays.asList(
        "dev", "development", "test", "qa", "sit", "uat", "tlb", "sandbox", "stage", "staging", "prod", "production", "local"
    ));
    private final Map<String, String> ruleSeverities = new HashMap<String, String>();
    private final Set<String> baselineKeys = new HashSet<String>();

    private int minDepth = 3;
    private int maxPerFile = 20;
    private String referenceEnvironment = "production";
    private boolean lintFixtures = false;

    public static ConfigLoader load(File baseDir) {
        ConfigLoader cfg = new ConfigLoader();
        cfg.loadMuleGuardJson(new File(baseDir, ".muleguard.json"));
        cfg.loadBaselineJson(new File(baseDir, ".muleguard-baseline.json"));
        return cfg;
    }

    private void loadMuleGuardJson(File file) {
        if (!file.exists()) return;
        try {
            String raw = new String(Files.readAllBytes(file.toPath()), StandardCharsets.UTF_8);

            // Parse secretProviders array
            List<String> parsedProviders = extractJsonStringArray(raw, "secretProviders");
            if (!parsedProviders.isEmpty()) {
                secretProviders.clear();
                secretProviders.addAll(parsedProviders);
            }

            // Parse acceptedFlows array
            List<String> parsedFlows = extractJsonStringArray(raw, "acceptedFlows");
            if (!parsedFlows.isEmpty()) {
                acceptedLoggingFlows.clear();
                acceptedLoggingFlows.addAll(parsedFlows);
            }

            // Parse minDepth & maxPerFile
            Integer md = extractJsonInt(raw, "minDepth");
            if (md != null) minDepth = md;
            Integer mp = extractJsonInt(raw, "maxPerFile");
            if (mp != null) maxPerFile = mp;

            // Parse simple rule string overrides: "BP-01": "off" or "severity": "info"
            Pattern simpleRule = Pattern.compile("\"(MG\\d+b?|BP-\\d+|S-\\d+)\"\\s*:\\s*\"(off|info|warning|error)\"", Pattern.CASE_INSENSITIVE);
            Matcher m = simpleRule.matcher(raw);
            while (m.find()) {
                ruleSeverities.put(m.group(1).toUpperCase(), m.group(2).toLowerCase());
            }

            Pattern objRule = Pattern.compile("\"(MG\\d+b?|BP-\\d+|S-\\d+)\"\\s*:\\s*\\{[^}]*\"severity\"\\s*:\\s*\"(off|info|warning|error)\"", Pattern.CASE_INSENSITIVE);
            Matcher om = objRule.matcher(raw);
            while (om.find()) {
                ruleSeverities.put(om.group(1).toUpperCase(), om.group(2).toLowerCase());
            }
        } catch (Exception ignored) {}
    }

    private void loadBaselineJson(File file) {
        if (!file.exists()) return;
        try {
            String raw = new String(Files.readAllBytes(file.toPath()), StandardCharsets.UTF_8);
            Pattern entryPattern = Pattern.compile("\\{[^}]*\"file\"\\s*:\\s*\"([^\"]+)\"[^}]*\"rule\"\\s*:\\s*\"([^\"]+)\"[^}]*\"hash\"\\s*:\\s*\"([^\"]+)\"[^}]*\\}");
            Matcher m = entryPattern.matcher(raw);
            while (m.find()) {
                String key = m.group(1).replace("\\", "/") + "::" + m.group(2) + "::" + m.group(3);
                baselineKeys.add(key);
            }
        } catch (Exception ignored) {}
    }

    public boolean isRuleOff(String ruleId) {
        return "off".equalsIgnoreCase(ruleSeverities.get(ruleId.toUpperCase()));
    }

    public Severity resolveSeverity(String ruleId, Severity defaultSeverity) {
        String override = ruleSeverities.get(ruleId.toUpperCase());
        if (override == null) return defaultSeverity;
        if ("error".equalsIgnoreCase(override)) return Severity.CRITICAL;
        if ("warning".equalsIgnoreCase(override)) return Severity.HIGH;
        if ("info".equalsIgnoreCase(override)) return Severity.INFO;
        return defaultSeverity;
    }

    public boolean isBaselined(File baseDir, Finding finding, String sourceLine) {
        if (baselineKeys.isEmpty()) return false;
        try {
            String rel = baseDir.toPath().toAbsolutePath().normalize()
                .relativize(new File(finding.getFilePath()).toPath().toAbsolutePath().normalize())
                .toString().replace("\\", "/");
            String hash = sha1(sourceLine.trim());
            return baselineKeys.contains(rel + "::" + finding.getRuleId() + "::" + hash);
        } catch (Exception e) {
            return false;
        }
    }

    public boolean isSafeSecretExpression(String value) {
        if (value == null) return true;
        String trimmed = value.trim();
        if (trimmed.isEmpty()) return true;
        if (trimmed.startsWith("${") && trimmed.endsWith("}")) return true;
        if (trimmed.startsWith("#[") && trimmed.endsWith("]")) return true;
        for (String provider : secretProviders) {
            if (trimmed.startsWith("${" + provider) || trimmed.contains("p('" + provider) || trimmed.contains("p(\"" + provider)) {
                return true;
            }
        }
        return false;
    }

    public boolean matchesAcceptedLoggingFlow(String flowName) {
        if (flowName == null) return false;
        for (String pat : acceptedLoggingFlows) {
            if (globMatches(flowName, pat)) return true;
        }
        return false;
    }

    public boolean isIgnoredFlowName(String flowName) {
        if (flowName == null) return false;
        for (String pat : namingIgnorePatterns) {
            try {
                if (Pattern.compile(pat, Pattern.CASE_INSENSITIVE).matcher(flowName).find()) {
                    return true;
                }
            } catch (Exception ignored) {}
        }
        return false;
    }

    public static boolean globMatches(String text, String glob) {
        String regex = "^" + glob.replace(".", "\\.").replace("*", ".*").replace("?", ".") + "$";
        return Pattern.compile(regex, Pattern.CASE_INSENSITIVE).matcher(text).matches();
    }

    public List<String> getEnvironments() {
        return environments;
    }

    public int getMinDepth() {
        return minDepth;
    }

    public int getMaxPerFile() {
        return maxPerFile;
    }

    public String getReferenceEnvironment() {
        return referenceEnvironment;
    }

    public boolean isLintFixtures() {
        return lintFixtures;
    }

    private static List<String> extractJsonStringArray(String json, String key) {
        List<String> list = new ArrayList<String>();
        Pattern p = Pattern.compile("\"" + key + "\"\\s*:\\s*\\[([^\\]]*)\\]");
        Matcher m = p.matcher(json);
        if (m.find()) {
            Matcher item = Pattern.compile("\"([^\"]+)\"").matcher(m.group(1));
            while (item.find()) {
                list.add(item.group(1));
            }
        }
        return list;
    }

    private static Integer extractJsonInt(String json, String key) {
        Matcher m = Pattern.compile("\"" + key + "\"\\s*:\\s*(\\d+)").matcher(json);
        if (m.find()) {
            return Integer.parseInt(m.group(1));
        }
        return null;
    }

    public static String sha1(String input) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-1");
            byte[] bytes = md.digest(input.getBytes(StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder();
            for (byte b : bytes) {
                sb.append(String.format("%02x", b));
            }
            return sb.toString();
        } catch (Exception e) {
            return "";
        }
    }
}
