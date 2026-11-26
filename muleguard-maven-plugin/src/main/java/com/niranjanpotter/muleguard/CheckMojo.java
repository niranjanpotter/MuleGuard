package com.niranjanpotter.muleguard;

import com.niranjanpotter.muleguard.model.Finding;
import com.niranjanpotter.muleguard.model.Severity;
import com.niranjanpotter.muleguard.report.ReportGenerator;
import com.niranjanpotter.muleguard.rules.RuleEngine;

import org.apache.maven.plugin.AbstractMojo;
import org.apache.maven.plugin.MojoExecutionException;
import org.apache.maven.plugin.MojoFailureException;
import org.apache.maven.plugins.annotations.LifecyclePhase;
import org.apache.maven.plugins.annotations.Mojo;
import org.apache.maven.plugins.annotations.Parameter;

import java.io.File;
import java.util.List;

@Mojo(name = "check", defaultPhase = LifecyclePhase.VERIFY, requiresProject = false)
public class CheckMojo extends AbstractMojo {

    @Parameter(property = "muleguard.skip", defaultValue = "false")
    private boolean skip;

    @Parameter(property = "muleguard.failOnError", defaultValue = "false")
    private boolean failOnError;

    @Parameter(property = "muleguard.minScore", defaultValue = "75")
    private int minScore;

    @Parameter(defaultValue = "${project.basedir}", readonly = true)
    private File projectBaseDir;

    @Parameter(defaultValue = "${project.build.directory}", readonly = true)
    private File buildDirectory;

    @Override
    public void execute() throws MojoExecutionException, MojoFailureException {
        if (skip) {
            getLog().info("MuleGuard check is skipped per configuration.");
            return;
        }

        if (projectBaseDir == null || !projectBaseDir.exists() || projectBaseDir.getPath().contains("${")) {
            projectBaseDir = new File(".");
        }

        if (buildDirectory == null || buildDirectory.getPath().contains("${")) {
            buildDirectory = new File(projectBaseDir, "target");
        }

        getLog().info("Scanning MuleSoft project at: " + projectBaseDir.getAbsolutePath());

        RuleEngine engine = new RuleEngine();
        List<Finding> findings = engine.scanProject(projectBaseDir);

        int qualityScore = ReportGenerator.calculateQualityScore(findings);

        // 1. Console Output
        ReportGenerator.printConsoleReport(getLog(), findings, qualityScore, minScore);

        // 2. Generate Artifacts
        ReportGenerator.generateHtmlReport(buildDirectory, findings, qualityScore, minScore);
        ReportGenerator.generateJsonReport(buildDirectory, findings, qualityScore);

        getLog().info("Interactive HTML report saved to: " + new File(buildDirectory, "muleguard-report.html").getAbsolutePath());
        getLog().info("JSON report saved to: " + new File(buildDirectory, "muleguard-report.json").getAbsolutePath());

        // 3. Quality Gate Enforcement
        boolean hasCritical = false;
        for (Finding f : findings) {
            if (f.getSeverity() == Severity.CRITICAL) {
                hasCritical = true;
                break;
            }
        }

        if (failOnError) {
            if (hasCritical) {
                throw new MojoFailureException("[MuleGuard Quality Gate FAILED] Critical security violations detected! Review target/muleguard-report.html.");
            }
            if (qualityScore < minScore) {
                throw new MojoFailureException(String.format("[MuleGuard Quality Gate FAILED] Score %d/100 is below required threshold of %d/100.", qualityScore, minScore));
            }
        }
    }
}
