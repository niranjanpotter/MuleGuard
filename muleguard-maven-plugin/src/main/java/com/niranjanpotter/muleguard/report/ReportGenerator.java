package com.niranjanpotter.muleguard.report;

import com.niranjanpotter.muleguard.model.Finding;
import com.niranjanpotter.muleguard.model.Severity;
import org.apache.maven.plugin.logging.Log;

import java.io.File;
import java.io.FileWriter;
import java.io.IOException;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.List;

public class ReportGenerator {

    public static int calculateQualityScore(List<Finding> findings) {
        int score = 100;
        for (Finding f : findings) {
            score -= f.getSeverity().getPenalty();
        }
        return Math.max(0, score);
    }

    public static void printConsoleReport(Log log, List<Finding> findings, int score, int minScore) {
        log.info("------------------------------------------------------------------------");
        log.info("\u001B[1;36m[MuleGuard]\u001B[0m MuleSoft Code Review & Architecture Quality Audit");
        log.info("------------------------------------------------------------------------");

        if (findings.isEmpty()) {
            log.info("\u001B[1;32m[PASS]\u001B[0m Clean bill of health! No security or best-practice violations detected.");
            log.info("\u001B[1;32mQuality Score: 100/100 (Grade: A+)\u001B[0m");
            return;
        }

        int critical = 0, high = 0, medium = 0, low = 0;
        for (Finding f : findings) {
            if (f.getSeverity() == Severity.CRITICAL) critical++;
            else if (f.getSeverity() == Severity.HIGH) high++;
            else if (f.getSeverity() == Severity.MEDIUM) medium++;
            else low++;

            String shortPath = f.getFilePath();
            int srcIdx = shortPath.indexOf("src");
            if (srcIdx != -1) shortPath = shortPath.substring(srcIdx);

            log.warn(String.format("%s %-6s | %s:%d | %s",
                f.getSeverity().getAnsiLabel(),
                f.getRuleId(),
                shortPath,
                f.getLineNumber(),
                f.getMessage()
            ));
            log.info(String.format("       \u001B[32mRecommendation:\u001B[0m %s", f.getRecommendation()));
        }

        log.info("------------------------------------------------------------------------");
        log.info(String.format("Audit Summary: %d Finding(s) [Critical: %d, High: %d, Medium: %d, Low: %d]",
            findings.size(), critical, high, medium, low));

        String grade = score >= 90 ? "A" : score >= 80 ? "B" : score >= 70 ? "C" : "F";
        String color = score >= minScore ? "\u001B[1;32m" : "\u001B[1;31m";
        log.info(String.format("%sQuality Score: %d/100 (Grade: %s, Min Required: %d)\u001B[0m", color, score, grade, minScore));
        log.info("------------------------------------------------------------------------");
    }

    public static void generateHtmlReport(File outputDir, List<Finding> findings, int score, int minScore) {
        if (!outputDir.exists()) outputDir.mkdirs();
        File htmlFile = new File(outputDir, "muleguard-report.html");

        StringBuilder sb = new StringBuilder();
        sb.append("<!DOCTYPE html>\n<html lang=\"en\">\n<head>\n")
          .append("<meta charset=\"UTF-8\">\n<title>MuleGuard Code Review Report</title>\n")
          .append("<style>\n")
          .append("body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background: #0b1220; color: #e2e8f0; margin: 0; padding: 24px; }\n")
          .append(".header { display: flex; align-items: center; justify-content: space-between; border-bottom: 2px solid #1e293b; padding-bottom: 16px; margin-bottom: 24px; }\n")
          .append(".title { font-size: 24px; font-weight: bold; color: #38bdf8; }\n")
          .append(".score-badge { font-size: 28px; font-weight: bold; padding: 12px 24px; border-radius: 8px; }\n")
          .append(".score-pass { background: #065f46; color: #34d399; }\n")
          .append(".score-fail { background: #7f1d1d; color: #f87171; }\n")
          .append("table { width: 100%; border-collapse: collapse; margin-top: 16px; background: #131c2e; border-radius: 8px; overflow: hidden; }\n")
          .append("th, td { padding: 12px 16px; text-align: left; border-bottom: 1px solid #1e293b; }\n")
          .append("th { background: #1e293b; color: #94a3b8; text-transform: uppercase; font-size: 12px; }\n")
          .append(".crit { color: #ef4444; font-weight: bold; }\n")
          .append(".high { color: #f97316; font-weight: bold; }\n")
          .append(".med { color: #eab308; }\n")
          .append(".low { color: #38bdf8; }\n")
          .append("</style>\n</head>\n<body>\n")
          .append("<div class=\"header\">\n")
          .append("<div><div class=\"title\">🛡️ MuleGuard Enterprise Audit Report</div>")
          .append("<div style=\"color:#64748b; font-size:14px;\">Generated on ").append(new SimpleDateFormat("yyyy-MM-dd HH:mm:ss").format(new Date())).append("</div></div>\n")
          .append("<div class=\"score-badge ").append(score >= minScore ? "score-pass" : "score-fail").append("\">")
          .append("Score: ").append(score).append("/100</div>\n")
          .append("</div>\n");

        sb.append("<table>\n<thead>\n<tr><th>Severity</th><th>Rule</th><th>File:Line</th><th>Message</th><th>Remediation</th></tr>\n</thead>\n<tbody>\n");
        for (Finding f : findings) {
            String sevClass = f.getSeverity() == Severity.CRITICAL ? "crit" : f.getSeverity() == Severity.HIGH ? "high" : f.getSeverity() == Severity.MEDIUM ? "med" : "low";
            String shortPath = f.getFilePath();
            int idx = shortPath.indexOf("src");
            if (idx != -1) shortPath = shortPath.substring(idx);

            sb.append("<tr>")
              .append("<td class=\"").append(sevClass).append("\">").append(f.getSeverity().name()).append("</td>")
              .append("<td>").append(f.getRuleId()).append("</td>")
              .append("<td>").append(shortPath).append(":").append(f.getLineNumber()).append("</td>")
              .append("<td>").append(escapeHtml(f.getMessage())).append("</td>")
              .append("<td style=\"color:#38bdf8;\">").append(escapeHtml(f.getRecommendation())).append("</td>")
              .append("</tr>\n");
        }
        sb.append("</tbody>\n</table>\n</body>\n</html>");

        writeFile(htmlFile, sb.toString());
    }

    public static void generateJsonReport(File outputDir, List<Finding> findings, int score) {
        if (!outputDir.exists()) outputDir.mkdirs();
        File jsonFile = new File(outputDir, "muleguard-report.json");

        StringBuilder sb = new StringBuilder();
        sb.append("{\n")
          .append("  \"tool\": \"MuleGuard Maven Plugin\",\n")
          .append("  \"version\": \"1.1.0\",\n")
          .append("  \"score\": ").append(score).append(",\n")
          .append("  \"timestamp\": \"").append(new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'").format(new Date())).append("\",\n")
          .append("  \"totalFindings\": ").append(findings.size()).append(",\n")
          .append("  \"findings\": [\n");

        for (int i = 0; i < findings.size(); i++) {
            Finding f = findings.get(i);
            sb.append("    {\n")
              .append("      \"ruleId\": \"").append(f.getRuleId()).append("\",\n")
              .append("      \"ruleName\": \"").append(f.getRuleName()).append("\",\n")
              .append("      \"severity\": \"").append(f.getSeverity().name()).append("\",\n")
              .append("      \"file\": \"").append(f.getFilePath().replace("\\", "/")).append("\",\n")
              .append("      \"line\": ").append(f.getLineNumber()).append(",\n")
              .append("      \"message\": \"").append(escapeJson(f.getMessage())).append("\",\n")
              .append("      \"recommendation\": \"").append(escapeJson(f.getRecommendation())).append("\"\n")
              .append("    }").append(i < findings.size() - 1 ? "," : "").append("\n");
        }
        sb.append("  ]\n}");

        writeFile(jsonFile, sb.toString());
    }

    public static void generateSarifReport(File outputDir, File baseDir, List<Finding> findings) {
        if (!outputDir.exists()) outputDir.mkdirs();
        File sarifFile = new File(outputDir, "muleguard-report.sarif");

        StringBuilder sb = new StringBuilder();
        sb.append("{\n")
          .append("  \"$schema\": \"https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json\",\n")
          .append("  \"version\": \"2.1.0\",\n")
          .append("  \"runs\": [\n")
          .append("    {\n")
          .append("      \"tool\": {\n")
          .append("        \"driver\": {\n")
          .append("          \"name\": \"MuleGuard\",\n")
          .append("          \"version\": \"1.1.0\",\n")
          .append("          \"informationUri\": \"https://github.com/niranjanpotter/MuleGuard\"\n")
          .append("        }\n")
          .append("      },\n")
          .append("      \"results\": [\n");

        for (int i = 0; i < findings.size(); i++) {
            Finding f = findings.get(i);
            String level = (f.getSeverity() == Severity.CRITICAL || f.getSeverity() == Severity.HIGH)
                ? "error" : (f.getSeverity() == Severity.MEDIUM ? "warning" : "note");
            String relUri = f.getFilePath().replace("\\", "/");
            try {
                relUri = baseDir.toPath().toAbsolutePath().normalize()
                    .relativize(new File(f.getFilePath()).toPath().toAbsolutePath().normalize())
                    .toString().replace("\\", "/");
            } catch (Exception ignored) {}

            sb.append("        {\n")
              .append("          \"ruleId\": \"").append(f.getRuleId()).append("\",\n")
              .append("          \"level\": \"").append(level).append("\",\n")
              .append("          \"message\": { \"text\": \"").append(escapeJson(f.getMessage() + " " + f.getRecommendation())).append("\" },\n")
              .append("          \"locations\": [{\n")
              .append("            \"physicalLocation\": {\n")
              .append("              \"artifactLocation\": { \"uri\": \"").append(escapeJson(relUri)).append("\" },\n")
              .append("              \"region\": { \"startLine\": ").append(Math.max(1, f.getLineNumber())).append(" }\n")
              .append("            }\n")
              .append("          }]\n")
              .append("        }").append(i < findings.size() - 1 ? "," : "").append("\n");
        }

        sb.append("      ]\n")
          .append("    }\n")
          .append("  ]\n")
          .append("}\n");

        writeFile(sarifFile, sb.toString());
    }

    public static void generateScoreBadge(File outputDir, int score) {
        if (!outputDir.exists()) outputDir.mkdirs();
        File svgFile = new File(outputDir, "muleguard-score.svg");
        String color = score < 60 ? "#e05d44" : (score < 80 ? "#dfb317" : "#4c1");
        String value = score + "/100";
        String svg = "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"124\" height=\"20\" role=\"img\" aria-label=\"muleguard: " + value + "\">\n"
            + "  <clipPath id=\"r\"><rect width=\"124\" height=\"20\" rx=\"3\" fill=\"#fff\"/></clipPath>\n"
            + "  <g clip-path=\"url(#r)\"><rect width=\"70\" height=\"20\" fill=\"#555\"/><rect x=\"70\" width=\"54\" height=\"20\" fill=\"" + color + "\"/></g>\n"
            + "  <g fill=\"#fff\" text-anchor=\"middle\" font-family=\"Verdana,Geneva,DejaVu Sans,sans-serif\" font-size=\"11\">\n"
            + "    <text x=\"35\" y=\"14\">muleguard</text><text x=\"97\" y=\"14\">" + value + "</text>\n"
            + "  </g>\n"
            + "</svg>\n";
        writeFile(svgFile, svg);
    }

    private static void writeFile(File file, String content) {
        try {
            FileWriter fw = new FileWriter(file);
            fw.write(content);
            fw.close();
        } catch (IOException ignored) {}
    }

    private static String escapeHtml(String text) {
        if (text == null) return "";
        return text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\"", "&quot;");
    }

    private static String escapeJson(String text) {
        if (text == null) return "";
        return text.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", "\\n").replace("\r", "");
    }
}
