package com.niranjanpotter.muleguard.model;

public class Finding {
    private final String ruleId;
    private final String ruleName;
    private final Severity severity;
    private final String filePath;
    private final int lineNumber;
    private final String message;
    private final String recommendation;

    public Finding(String ruleId, String ruleName, Severity severity, String filePath, int lineNumber, String message, String recommendation) {
        this.ruleId = ruleId;
        this.ruleName = ruleName;
        this.severity = severity;
        this.filePath = filePath;
        this.lineNumber = lineNumber;
        this.message = message;
        this.recommendation = recommendation;
    }

    public String getRuleId() {
        return ruleId;
    }

    public String getRuleName() {
        return ruleName;
    }

    public Severity getSeverity() {
        return severity;
    }

    public String getFilePath() {
        return filePath;
    }

    public int getLineNumber() {
        return lineNumber;
    }

    public String getMessage() {
        return message;
    }

    public String getRecommendation() {
        return recommendation;
    }
}
