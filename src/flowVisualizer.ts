import * as path from 'path';
import * as vscode from 'vscode';
import { extractFlows, maskXmlComments } from './diagnostics';

export class FlowVisualizerPanel {
  public static currentPanel: FlowVisualizerPanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private readonly _extensionUri: vscode.Uri;
  private _disposables: vscode.Disposable[] = [];

  public static createOrShow(extensionUri: vscode.Uri, xmlDocument?: vscode.TextDocument): void {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    if (FlowVisualizerPanel.currentPanel) {
      FlowVisualizerPanel.currentPanel._panel.reveal(column);
      if (xmlDocument) {
        FlowVisualizerPanel.currentPanel.update(xmlDocument);
      }
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'muleguardFlowVisualizer',
      'MuleGuard: Flow Visualizer',
      column || vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true
      }
    );

    FlowVisualizerPanel.currentPanel = new FlowVisualizerPanel(panel, extensionUri);
    if (xmlDocument) {
      FlowVisualizerPanel.currentPanel.update(xmlDocument);
    }
  }

  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
    this._panel = panel;
    this._extensionUri = extensionUri;

    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
  }

  public update(document: vscode.TextDocument): void {
    const text = document.getText();
    const masked = maskXmlComments(text);
    const flows = extractFlows(masked);

    this._panel.webview.html = this._getHtmlForWebview(document.fileName, flows);
  }

  private _getHtmlForWebview(fileName: string, flows: { name: string; body: string }[]): string {
    const baseName = path.basename(fileName);

    const flowDiagrams = flows.map((f, i) => {
      // Extract processor names
      const processorRegex = /<([a-zA-Z_][\w-]*:[a-zA-Z_][\w-]*)/g;
      const processors: string[] = [];
      let match: RegExpExecArray | null;
      while ((match = processorRegex.exec(f.body)) !== null) {
        const tag = match[1];
        if (!tag.startsWith('ee:set') && !tag.startsWith('munit:')) {
          processors.push(tag);
        }
      }

      const elements = processors.length > 0 ? processors : ['(empty flow body)'];

      return `
        <div class="flow-card">
          <div class="flow-title">⚡ Flow: <strong>${f.name || 'Flow ' + (i + 1)}</strong></div>
          <div class="pipeline">
            ${elements
              .map(
                (p, idx) => `
                <div class="node ${this._getCategoryClass(p)}">
                  <span class="icon">${this._getIcon(p)}</span>
                  <span class="label">${p}</span>
                </div>
                ${idx < elements.length - 1 ? '<div class="arrow">➔</div>' : ''}
              `
              )
              .join('')}
          </div>
        </div>
      `;
    }).join('');

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Flow Visualizer: ${baseName}</title>
  <style>
    body {
      font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif);
      padding: 20px;
      color: var(--vscode-editor-foreground);
      background-color: var(--vscode-editor-background);
    }
    h2 {
      border-bottom: 1px solid var(--vscode-widget-border, #444);
      padding-bottom: 8px;
    }
    .flow-card {
      background: var(--vscode-editorWidget-background, #252526);
      border: 1px solid var(--vscode-widget-border, #3c3c3c);
      border-radius: 8px;
      margin-bottom: 24px;
      padding: 16px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.2);
    }
    .flow-title {
      font-size: 1.1em;
      margin-bottom: 12px;
      color: var(--vscode-textLink-foreground, #3794ff);
    }
    .pipeline {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 10px;
      padding: 10px 0;
    }
    .node {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 8px 14px;
      border-radius: 6px;
      font-weight: 500;
      font-size: 0.9em;
      border: 1px solid transparent;
    }
    .http { background: #005a9e; color: #fff; }
    .db { background: #107c41; color: #fff; }
    .transform { background: #5c2d91; color: #fff; }
    .logger { background: #605e5c; color: #fff; }
    .error { background: #a80000; color: #fff; }
    .core { background: #008272; color: #fff; }
    .arrow {
      color: var(--vscode-descriptionForeground, #888);
      font-size: 1.2em;
    }
  </style>
</head>
<body>
  <h2>MuleGuard Flow Visualizer: <code>${baseName}</code></h2>
  <p>Visual pipeline execution diagram extracted from Mule 4 XML processors.</p>
  ${flows.length > 0 ? flowDiagrams : '<p>No &lt;flow&gt; definitions found in this XML document.</p>'}
</body>
</html>`;
  }

  private _getCategoryClass(tag: string): string {
    if (tag.startsWith('http:')) return 'http';
    if (tag.startsWith('db:')) return 'db';
    if (tag.startsWith('ee:')) return 'transform';
    if (tag.includes('logger')) return 'logger';
    if (tag.includes('error')) return 'error';
    return 'core';
  }

  private _getIcon(tag: string): string {
    if (tag.startsWith('http:')) return '🌐';
    if (tag.startsWith('db:')) return '🗄️';
    if (tag.startsWith('ee:')) return '🔄';
    if (tag.includes('logger')) return '📝';
    if (tag.includes('error')) return '🛡️';
    return '⚙️';
  }

  public dispose(): void {
    FlowVisualizerPanel.currentPanel = undefined;
    this._panel.dispose();
    while (this._disposables.length) {
      const x = this._disposables.pop();
      if (x) x.dispose();
    }
  }
}
