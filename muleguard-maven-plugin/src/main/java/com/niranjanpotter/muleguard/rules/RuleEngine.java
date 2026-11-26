package com.niranjanpotter.muleguard.rules;

import com.niranjanpotter.muleguard.model.Finding;
import com.niranjanpotter.muleguard.model.Severity;

import org.w3c.dom.*;
import javax.xml.parsers.DocumentBuilder;
import javax.xml.parsers.DocumentBuilderFactory;
import java.io.BufferedReader;
import java.io.File;
import java.io.FileReader;
import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class RuleEngine {

    public List<Finding> scanProject(File baseDir) {
        List<Finding> findings = new ArrayList<Finding>();
        List<File> xmlFiles = new ArrayList<File>();
        List<File> configFiles = new ArrayList<File>();

        findFiles(baseDir, xmlFiles, configFiles);

        for (File xmlFile : xmlFiles) {
            scanXmlFile(xmlFile, findings);
        }

        for (File configFile : configFiles) {
            scanConfigFile(configFile, findings);
        }

        return findings;
    }

    private void findFiles(File dir, List<File> xmlFiles, List<File> configFiles) {
        if (dir == null || !dir.exists()) return;
        File[] files = dir.listFiles();
        if (files == null) return;

        for (File file : files) {
            String name = file.getName();
            if (file.isDirectory()) {
                if (!name.equals("target") && !name.equals(".git") && !name.equals("node_modules") && !name.equals(".mule")) {
                    findFiles(file, xmlFiles, configFiles);
                }
            } else {
                if (name.endsWith(".xml") && !name.equals("pom.xml")) {
                    xmlFiles.add(file);
                } else if (name.endsWith(".yaml") || name.endsWith(".properties")) {
                    configFiles.add(file);
                }
            }
        }
    }

    private void scanXmlFile(File file, List<Finding> findings) {
        try {
            DocumentBuilderFactory dbf = DocumentBuilderFactory.newInstance();
            dbf.setNamespaceAware(false);
            dbf.setValidating(false);
            // Disable external DTDs for safety
            dbf.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);
            DocumentBuilder db = dbf.newDocumentBuilder();
            Document doc = db.parse(file);
            Element root = doc.getDocumentElement();

            if (root == null || !root.getNodeName().contains("mule")) {
                return; // Not a Mule XML file
            }

            // Read lines for line-number approximation
            List<String> lines = readLines(file);

            // 1. Check Flows for Error Handlers (MG002) & Loggers (MG003)
            NodeList flowNodes = doc.getElementsByTagName("flow");
            for (int i = 0; i < flowNodes.getLength(); i++) {
                Node flowNode = flowNodes.item(i);
                if (flowNode.getNodeType() == Node.ELEMENT_NODE) {
                    Element flowElem = (Element) flowNode;
                    String flowName = flowElem.getAttribute("name");
                    int lineNum = findLineNumber(lines, "<flow", flowName);

                    boolean hasErrorHandler = hasDirectChild(flowElem, "error-handler") || flowElem.hasAttribute("errorHandler-ref");
                    if (!hasErrorHandler) {
                        findings.add(new Finding(
                            "MG002",
                            "Missing Error Handler",
                            Severity.HIGH,
                            file.getAbsolutePath(),
                            lineNum,
                            "Flow '" + flowName + "' does not define an inline error-handler or global error-handler-ref.",
                            "Add an <error-handler> block to ensure failures are caught and returned as structured error responses."
                        ));
                    }

                    boolean hasLogger = hasDescendant(flowElem, "logger");
                    if (!hasLogger) {
                        findings.add(new Finding(
                            "MG003",
                            "Missing Flow Logger",
                            Severity.MEDIUM,
                            file.getAbsolutePath(),
                            lineNum,
                            "Flow '" + flowName + "' does not contain any <logger> components for auditability.",
                            "Add inbound and outbound <logger> processors with correlationId for traceability."
                        ));
                    }
                }
            }

            // 2. Check for Hardcoded Credentials in XML Attributes (S-01 / MG001)
            Pattern credentialAttrPattern = Pattern.compile("(?i)^(password|clientSecret|secret|accessKey|privateKey|api_key)$");
            scanAttributesForSecrets(root, credentialAttrPattern, file, lines, findings);

            // 3. Check for DEBUG/TRACE Loggers (MG008)
            NodeList loggerNodes = doc.getElementsByTagName("logger");
            for (int i = 0; i < loggerNodes.getLength(); i++) {
                Element logger = (Element) loggerNodes.item(i);
                String level = logger.getAttribute("level");
                if ("DEBUG".equalsIgnoreCase(level) || "TRACE".equalsIgnoreCase(level)) {
                    int lineNum = findLineNumber(lines, "<logger", "level=\"" + level + "\"");
                    findings.add(new Finding(
                        "MG008",
                        "Active Verbose Logger in Code",
                        Severity.MEDIUM,
                        file.getAbsolutePath(),
                        lineNum,
                        "Logger configured with level='" + level + "' should be controlled via log4j2.xml, not hardcoded in Mule flows.",
                        "Change hardcoded level to INFO or manage log levels dynamically in log4j2.xml to prevent CloudHub I/O bottlenecks."
                    ));
                }
            }

            // 4. Check for HTTP Request Timeouts (BP-04)
            NodeList httpRequestConfigs = doc.getElementsByTagName("http:request-config");
            for (int i = 0; i < httpRequestConfigs.getLength(); i++) {
                Element reqConfig = (Element) httpRequestConfigs.item(i);
                String configName = reqConfig.getAttribute("name");
                int lineNum = findLineNumber(lines, "<http:request-config", configName);

                boolean hasTimeout = reqConfig.hasAttribute("responseTimeout");
                if (!hasTimeout) {
                    findings.add(new Finding(
                        "BP-04",
                        "Missing HTTP Response Timeout",
                        Severity.HIGH,
                        file.getAbsolutePath(),
                        lineNum,
                        "HTTP Request Config '" + configName + "' does not specify responseTimeout (defaults to infinite/60s).",
                        "Explicitly configure responseTimeout=\"${http.timeout.response}\" to prevent worker thread pool exhaustion."
                    ));
                }
            }

        } catch (Exception e) {
            // Log warning or skip malformed XML
        }
    }

    private void scanAttributesForSecrets(Element elem, Pattern pattern, File file, List<String> lines, List<Finding> findings) {
        NamedNodeMap attrs = elem.getAttributes();
        if (attrs != null) {
            for (int i = 0; i < attrs.getLength(); i++) {
                Node attr = attrs.item(i);
                String attrName = attr.getNodeName();
                String attrValue = attr.getNodeValue();

                // Strip namespace if present
                if (attrName.contains(":")) {
                    attrName = attrName.substring(attrName.indexOf(":") + 1);
                }

                if (pattern.matcher(attrName).matches()) {
                    // Check if value is cleartext (not a property reference ${...} or secure property ${secure::...})
                    if (attrValue != null && !attrValue.isEmpty() && !attrValue.startsWith("${") && !attrValue.startsWith("#[")) {
                        int lineNum = findLineNumber(lines, attrName, attrValue);
                        findings.add(new Finding(
                            "S-01",
                            "Hardcoded Cleartext Secret",
                            Severity.CRITICAL,
                            file.getAbsolutePath(),
                            lineNum,
                            "Attribute '" + attrName + "' contains a cleartext secret: \"" + mask(attrValue) + "\".",
                            "Move credentials into secure.yaml and reference using encrypted properties: ${secure::" + attrName + "}."
                        ));
                    }
                }
            }
        }

        NodeList children = elem.getChildNodes();
        for (int i = 0; i < children.getLength(); i++) {
            if (children.item(i).getNodeType() == Node.ELEMENT_NODE) {
                scanAttributesForSecrets((Element) children.item(i), pattern, file, lines, findings);
            }
        }
    }

    private void scanConfigFile(File file, List<Finding> findings) {
        List<String> lines = readLines(file);
        Pattern plainSecretPattern = Pattern.compile("(?i)^\\s*(password|secret|client_secret|clientSecret|apikey|private_key|token)\\s*:\\s*(?!\\!\\[).{4,}");

        for (int i = 0; i < lines.size(); i++) {
            String line = lines.get(i);
            Matcher matcher = plainSecretPattern.matcher(line);
            if (matcher.find()) {
                findings.add(new Finding(
                    "S-05",
                    "Unencrypted Sensitive Property",
                    Severity.CRITICAL,
                    file.getAbsolutePath(),
                    i + 1,
                    "Environment config property appears to contain an unencrypted plaintext secret: " + line.trim(),
                    "Encrypt property with Mule Secure Configuration Property tool (e.g. ![EncryptedValue])."
                ));
            }
        }
    }

    private boolean hasDirectChild(Element parent, String tagName) {
        NodeList list = parent.getChildNodes();
        for (int i = 0; i < list.getLength(); i++) {
            Node n = list.item(i);
            if (n.getNodeType() == Node.ELEMENT_NODE && n.getNodeName().endsWith(tagName)) {
                return true;
            }
        }
        return false;
    }

    private boolean hasDescendant(Element parent, String tagName) {
        NodeList list = parent.getElementsByTagName(tagName);
        return list != null && list.getLength() > 0;
    }

    private List<String> readLines(File file) {
        List<String> list = new ArrayList<String>();
        try {
            BufferedReader br = new BufferedReader(new FileReader(file));
            String line;
            while ((line = br.readLine()) != null) {
                list.add(line);
            }
            br.close();
        } catch (Exception ignored) {}
        return list;
    }

    private int findLineNumber(List<String> lines, String marker1, String marker2) {
        for (int i = 0; i < lines.size(); i++) {
            String line = lines.get(i);
            if (line.contains(marker1) && (marker2 == null || line.contains(marker2))) {
                return i + 1;
            }
        }
        for (int i = 0; i < lines.size(); i++) {
            if (lines.get(i).contains(marker1)) {
                return i + 1;
            }
        }
        return 1;
    }

    private String mask(String val) {
        if (val.length() <= 3) return "***";
        return val.substring(0, 2) + "***" + val.substring(val.length() - 1);
    }
}
