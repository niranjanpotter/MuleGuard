package com.niranjanpotter.muleguard.model;

public enum Severity {
    CRITICAL(15, "\u001B[31m[CRITICAL]\u001B[0m"),
    HIGH(8, "\u001B[35m[HIGH]\u001B[0m"),
    MEDIUM(4, "\u001B[33m[MEDIUM]\u001B[0m"),
    LOW(1, "\u001B[36m[LOW]\u001B[0m"),
    INFO(0, "\u001B[37m[INFO]\u001B[0m");

    private final int penalty;
    private final String ansiLabel;

    Severity(int penalty, String ansiLabel) {
        this.penalty = penalty;
        this.ansiLabel = ansiLabel;
    }

    public int getPenalty() {
        return penalty;
    }

    public String getAnsiLabel() {
        return ansiLabel;
    }
}
