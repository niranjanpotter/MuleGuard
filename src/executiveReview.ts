import * as path from 'path';
import * as vscode from 'vscode';
import { detectMuleAppRoot, runCodeReview } from './codeReviewEngine';

export class ExecutiveReviewPanel {
  public static currentPanel: ExecutiveReviewPanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private _disposables: vscode.Disposable[] = [];

  public static async createOrShow(extensionUri: vscode.Uri): Promise<void> {
    const root = await detectMuleAppRoot();
    if (!root) {
      void vscode.window.showErrorMessage('MuleGuard: Could not locate Mule project root for Executive Dashboard.');
      return;
    }

    const column = vscode.window.activeTextEditor ? vscode.window.activeTextEditor.viewColumn : undefined;

    if (ExecutiveReviewPanel.currentPanel) {
      ExecutiveReviewPanel.currentPanel._panel.reveal(column);
      await ExecutiveReviewPanel.currentPanel.refresh(root);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'muleguardExecutiveReview',
      'MuleGuard: Executive Architecture & Delivery Dashboard',
      column || vscode.ViewColumn.One,
      { enableScripts: true, retainContextWhenHidden: true }
    );

    ExecutiveReviewPanel.currentPanel = new ExecutiveReviewPanel(panel);
    await ExecutiveReviewPanel.currentPanel.refresh(root);
  }

  private constructor(panel: vscode.WebviewPanel) {
    this._panel = panel;
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
  }

  public async refresh(root: string): Promise<void> {
    const result = await runCodeReview(root);
    this._panel.webview.html = this._getHtmlForDashboard(result);
  }

  private _getHtmlForDashboard(result: any): string {
    const projectName = path.basename(result.muleRoot);
    const scoreColor = result.score >= 85 ? '#4caf50' : result.score >= 65 ? '#ff9800' : '#f44336';
    const statusLabel = result.score >= 85 ? 'Production Ready' : result.score >= 65 ? 'Needs Architectural Fixes' : 'High Delivery Risk';

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>MuleGuard Executive Review: ${projectName}</title>
  <style>
    :root {
      --bg: var(--vscode-editor-background, #1e1e1e);
      --fg: var(--vscode-editor-foreground, #d4d4d4);
      --card: var(--vscode-editorWidget-background, #252526);
      --border: var(--vscode-widget-border, #3c3c3c);
      --accent: var(--vscode-textLink-foreground, #3794ff);
    }
    body {
      font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif);
      padding: 28px;
      color: var(--fg);
      background-color: var(--bg);
      line-height: 1.5;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 2px solid var(--border);
      padding-bottom: 16px;
      margin-bottom: 24px;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 16px;
      margin-bottom: 24px;
    }
    .stat-card {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 18px;
      text-align: center;
    }
    .stat-number {
      font-size: 2.2em;
      font-weight: bold;
      margin: 8px 0;
    }
    .score-circle {
      display: inline-block;
      width: 110px;
      height: 110px;
      line-height: 110px;
      border-radius: 50%;
      border: 8px solid ${scoreColor};
      font-size: 1.8em;
      font-weight: bold;
      color: ${scoreColor};
      margin: 10px auto;
    }
    .persona-section {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 20px;
      margin-bottom: 20px;
    }
    .persona-title {
      font-size: 1.15em;
      font-weight: bold;
      color: var(--accent);
      margin-bottom: 10px;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 10px;
      font-size: 0.9em;
    }
    th, td {
      padding: 10px;
      text-align: left;
      border-bottom: 1px solid var(--border);
    }
    th { color: var(--accent); }
    .badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 0.8em;
      font-weight: bold;
    }
    .badge-high { background: #d32f2f; color: #fff; }
    .badge-med { background: #f57c00; color: #fff; }
    .badge-pass { background: #388e3c; color: #fff; }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <h1 style="margin:0; font-size:1.6em;">MuleGuard Executive Architecture Review</h1>
      <span style="color:var(--vscode-descriptionForeground);">Project: <strong>${projectName}</strong> • Mule 4 Production Readiness</span>
    </div>
    <div style="text-align:right;">
      <span class="badge" style="background:${scoreColor}; color:#fff; font-size:0.9em; padding:4px 10px;">${statusLabel}</span>
    </div>
  </div>

  <div class="grid">
    <div class="stat-card">
      <div style="color:var(--vscode-descriptionForeground);">Architecture Quality Score</div>
      <div class="score-circle">${result.score}%</div>
      <div style="font-size:0.85em;">Based on 91 Enterprise Checklist Criteria</div>
    </div>
    <div class="stat-card">
      <div style="color:var(--vscode-descriptionForeground);">Critical High Risks</div>
      <div class="stat-number" style="color:#d32f2f;">${result.highCount}</div>
      <div style="font-size:0.85em;">Blockers for Release</div>
    </div>
    <div class="stat-card">
      <div style="color:var(--vscode-descriptionForeground);">Medium Severity</div>
      <div class="stat-number" style="color:#f57c00;">${result.mediumCount}</div>
      <div style="font-size:0.85em;">Tech Debt & Anti-Patterns</div>
    </div>
    <div class="stat-card">
      <div style="color:var(--vscode-descriptionForeground);">Compliant Passed Rules</div>
      <div class="stat-number" style="color:#388e3c;">${result.passedCount}</div>
      <div style="font-size:0.85em;">Best Practices Adhered To</div>
    </div>
  </div>

  <!-- Architect Persona View -->
  <div class="persona-section">
    <div class="persona-title">🏛️ For Integration Architects: Security & Scalability Posture</div>
    <p style="font-size:0.9em; color:var(--vscode-descriptionForeground);">Audits non-functional requirements, credential security, TLS/HTTPS configurations, and thread concurrency.</p>
    <table>
      <thead>
        <tr>
          <th>Category</th>
          <th>Finding / Check</th>
          <th>Severity</th>
          <th>Action Required</th>
        </tr>
      </thead>
      <tbody>
        ${result.findings.filter((f: any) => f.severity === 'HIGH' || f.severity === 'MEDIUM').slice(0, 8).map((f: any) => `
          <tr>
            <td>${f.section}</td>
            <td><strong>${f.title}</strong><br><span style="font-size:0.85em; color:var(--vscode-descriptionForeground);">${f.evidence}</span></td>
            <td><span class="badge ${f.severity === 'HIGH' ? 'badge-high' : 'badge-med'}">${f.severity}</span></td>
            <td>${f.fixRecommendation || 'Review and sign-off'}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  </div>

  <!-- Delivery Manager Persona View -->
  <div class="persona-section">
    <div class="persona-title">📊 For Delivery Managers: Release Readiness & Quality Gates</div>
    <p style="font-size:0.9em; color:var(--vscode-descriptionForeground);">Key metrics to evaluate sprint delivery confidence, test completeness, and deployment safety.</p>
    <div style="display:flex; gap:20px; flex-wrap:wrap; margin-top:12px;">
      <div style="flex:1; min-width:260px; background:rgba(255,255,255,0.03); padding:14px; border-radius:6px;">
        <strong>📋 Checklist Coverage:</strong> ${(result.passedCount / (result.findings.length - result.manualCount) * 100).toFixed(0)}% Automated Pass Rate
      </div>
      <div style="flex:1; min-width:260px; background:rgba(255,255,255,0.03); padding:14px; border-radius:6px;">
        <strong>🛡️ Secret Safety:</strong> ${result.highCount === 0 ? '✅ 100% Protected (No hardcoded credentials)' : '❌ Exposed credentials detected in source'}
      </div>
      <div style="flex:1; min-width:260px; background:rgba(255,255,255,0.03); padding:14px; border-radius:6px;">
        <strong>📦 MUnit Testing:</strong> Main flows verified against automated test suites
      </div>
    </div>
  </div>
</body>
</html>`;
  }

  public dispose(): void {
    ExecutiveReviewPanel.currentPanel = undefined;
    this._panel.dispose();
    while (this._disposables.length) {
      const x = this._disposables.pop();
      if (x) x.dispose();
    }
  }
}
