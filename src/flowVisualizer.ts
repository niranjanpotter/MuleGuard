import * as path from 'path';
import * as vscode from 'vscode';
import { CONNECTOR_KNOWLEDGE } from './connectorKnowledge';
import { extractFlows, maskXmlComments } from './diagnostics';

interface ElementDetail {
  id: string;
  tag: string;
  name: string;
  category: string;
  icon: string;
  categoryClass: string;
  attributes: Record<string, string>;
  innerText?: string;
  runtimeNotes: string;
  description: string;
  docsUrl: string;
}

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
      'MuleGuard: Architecture & Flow Inspector',
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

  private _extractElementDetails(rawBody: string, flowIndex: number): ElementDetail[] {
    const elementDetails: ElementDetail[] = [];
    const tagRegex = /<([a-zA-Z0-9_]+:[a-zA-Z0-9_-]+)([^>]*?)(\/?>)/g;
    let match: RegExpExecArray | null;
    let elemIndex = 0;

    while ((match = tagRegex.exec(rawBody)) !== null) {
      const fullTag = match[0];
      const tag = match[1];
      const attrString = match[2];
      const isClosing = match[3] === '/>';

      // Skip inner payload/metadata tags
      if (tag.startsWith('ee:set-') || tag.startsWith('munit:') || tag.startsWith('http:headers') || tag.startsWith('http:query-params')) {
        continue;
      }

      // Extract attributes
      const attributes: Record<string, string> = {};
      const attrRegex = /([a-zA-Z0-9_:-]+)\s*=\s*["']([^"']*)["']/g;
      let attrMatch: RegExpExecArray | null;
      while ((attrMatch = attrRegex.exec(attrString)) !== null) {
        attributes[attrMatch[1]] = attrMatch[2];
      }

      // Check knowledge base
      const kb = CONNECTOR_KNOWLEDGE[tag] || {
        displayName: tag,
        category: this._getCategoryFromTag(tag),
        description: 'Mule message processor responsible for intermediate processing, message dispatching, or enrichment.',
        runtimeNotes: 'Executes sequentially within flow thread context.',
        docsUrl: 'https://docs.mulesoft.com/mule-runtime/latest/'
      };

      // Extract DataWeave or SQL body if present
      let innerText: string | undefined = undefined;
      if (!isClosing) {
        const closeTag = `</${tag}>`;
        const endIdx = rawBody.indexOf(closeTag, match.index);
        if (endIdx !== -1) {
          const bodyContent = rawBody.slice(match.index + fullTag.length, endIdx).trim();
          if (bodyContent.length > 0 && bodyContent.length < 500) {
            innerText = bodyContent;
          }
        }
      }

      elementDetails.push({
        id: `elem_${flowIndex}_${elemIndex++}`,
        tag,
        name: attributes['doc:name'] || attributes['name'] || kb.displayName,
        category: kb.category,
        icon: this._getIcon(tag),
        categoryClass: this._getCategoryClass(tag),
        attributes,
        innerText,
        runtimeNotes: kb.runtimeNotes,
        description: kb.description,
        docsUrl: kb.docsUrl
      });
    }

    return elementDetails;
  }

  private _getHtmlForWebview(fileName: string, flows: { name: string; body: string }[]): string {
    const baseName = path.basename(fileName);

    const parsedFlows = flows.map((f, i) => {
      const elements = this._extractElementDetails(f.body, i);
      return {
        name: f.name || `Flow ${i + 1}`,
        elements
      };
    });

    const flowsJson = JSON.stringify(parsedFlows);

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Architecture Inspector: ${baseName}</title>
  <style>
    :root {
      --bg: var(--vscode-editor-background, #1e1e1e);
      --fg: var(--vscode-editor-foreground, #d4d4d4);
      --card-bg: var(--vscode-editorWidget-background, #252526);
      --border: var(--vscode-widget-border, #3c3c3c);
      --accent: var(--vscode-textLink-foreground, #3794ff);
      --muted: var(--vscode-descriptionForeground, #888);
    }
    * { box-sizing: border-box; }
    body {
      font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif);
      margin: 0;
      padding: 0;
      color: var(--fg);
      background-color: var(--bg);
      display: flex;
      height: 100vh;
      overflow: hidden;
    }
    /* Main Canvas */
    .canvas {
      flex: 1;
      padding: 24px;
      overflow-y: auto;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 1px solid var(--border);
      padding-bottom: 14px;
      margin-bottom: 24px;
    }
    .header h2 { margin: 0; font-size: 1.4em; }
    .badge {
      background: #007acc;
      color: #fff;
      padding: 3px 8px;
      border-radius: 12px;
      font-size: 0.8em;
      font-weight: bold;
    }
    .flow-container {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 8px;
      margin-bottom: 24px;
      padding: 18px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.25);
    }
    .flow-title {
      font-size: 1.15em;
      font-weight: 600;
      color: var(--accent);
      margin-bottom: 14px;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .pipeline {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 12px;
      padding: 8px 0;
    }
    /* Clickable Node Cards */
    .node-card {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 10px 14px;
      border-radius: 6px;
      font-weight: 500;
      font-size: 0.9em;
      cursor: pointer;
      transition: all 0.2s ease;
      border: 2px solid transparent;
      user-select: none;
    }
    .node-card:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 10px rgba(0,0,0,0.3);
      filter: brightness(1.15);
    }
    .node-card.selected {
      border-color: #fff !important;
      box-shadow: 0 0 12px var(--accent);
    }
    /* Component Category Colors */
    .http { background: #005a9e; color: #fff; }
    .db { background: #107c41; color: #fff; }
    .transform { background: #5c2d91; color: #fff; }
    .logger { background: #4a4a4a; color: #fff; }
    .error { background: #a80000; color: #fff; }
    .core { background: #008272; color: #fff; }
    .router { background: #b05000; color: #fff; }
    .arrow {
      color: var(--muted);
      font-size: 1.3em;
    }
    /* Detail Inspector Drawer */
    .inspector {
      width: 380px;
      background: var(--card-bg);
      border-left: 1px solid var(--border);
      padding: 24px;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    .inspector h3 {
      margin-top: 0;
      margin-bottom: 4px;
      font-size: 1.2em;
      color: var(--accent);
    }
    .inspector-sub {
      color: var(--muted);
      font-size: 0.85em;
      margin-bottom: 12px;
    }
    .section-title {
      font-size: 0.8em;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--muted);
      margin-bottom: 6px;
      font-weight: bold;
    }
    .prop-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.85em;
      margin-bottom: 12px;
    }
    .prop-table td {
      padding: 6px 4px;
      border-bottom: 1px solid rgba(255,255,255,0.08);
    }
    .prop-key {
      color: #9cdcfe;
      font-family: monospace;
      width: 40%;
    }
    .prop-val {
      color: #ce9178;
      font-family: monospace;
      word-break: break-all;
    }
    .code-block {
      background: #1e1e1e;
      border: 1px solid var(--border);
      border-radius: 4px;
      padding: 10px;
      font-family: monospace;
      font-size: 0.82em;
      white-space: pre-wrap;
      word-break: break-all;
      color: #dcdcaa;
    }
    .callout {
      background: rgba(0, 122, 204, 0.15);
      border-left: 3px solid #007acc;
      padding: 10px;
      font-size: 0.88em;
      border-radius: 0 4px 4px 0;
    }
    .doc-btn {
      display: inline-block;
      background: #007acc;
      color: #fff;
      text-decoration: none;
      padding: 8px 12px;
      border-radius: 4px;
      font-size: 0.85em;
      text-align: center;
      font-weight: 500;
      margin-top: auto;
    }
    .doc-btn:hover { background: #005999; }
    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100%;
      color: var(--muted);
      text-align: center;
    }
  </style>
</head>
<body>
  <div class="canvas">
    <div class="header">
      <div>
        <h2>Mule 4 Architecture & Flow Inspector</h2>
        <span style="color:var(--muted); font-size:0.9em;">File: <code>${baseName}</code></span>
      </div>
      <div class="badge">${flows.length} Flow(s) Analyzed</div>
    </div>

    ${parsedFlows.map(flow => `
      <div class="flow-container">
        <div class="flow-title">
          <span>⚡</span>
          <span>${flow.name}</span>
          <span style="font-size:0.75em; color:var(--muted); font-weight:normal;">(${flow.elements.length} components)</span>
        </div>
        <div class="pipeline">
          ${flow.elements.length === 0 ? '<span style="color:var(--muted);">(Empty Flow)</span>' : ''}
          ${flow.elements.map((elem, idx) => `
            <div class="node-card ${elem.categoryClass}" id="${elem.id}" onclick="inspectElement('${elem.id}')">
              <span>${elem.icon}</span>
              <span>${elem.name}</span>
            </div>
            ${idx < flow.elements.length - 1 ? '<div class="arrow">➔</div>' : ''}
          `).join('')}
        </div>
      </div>
    `).join('')}
  </div>

  <div class="inspector" id="inspector">
    <div class="empty-state" id="emptyState">
      <div style="font-size:2.5em; margin-bottom:12px;">👆</div>
      <strong>Click Any Component</strong>
      <p style="font-size:0.85em;">Click any connector, router, or transform in the pipeline to inspect its runtime logic, attributes, and threading behavior.</p>
    </div>
    <div id="detailView" style="display:none; flex-direction:column; gap:14px; height:100%;">
      <div>
        <div id="detailIcon" style="font-size:2em; margin-bottom:6px;"></div>
        <h3 id="detailName" style="margin:0;"></h3>
        <div class="inspector-sub" id="detailTag"></div>
      </div>

      <div class="callout" id="detailDesc"></div>

      <div>
        <div class="section-title">Runtime Execution Model</div>
        <div style="font-size:0.88em; color:var(--fg);" id="detailRuntime"></div>
      </div>

      <div>
        <div class="section-title">Component Configurations</div>
        <table class="prop-table" id="detailProps"></table>
      </div>

      <div id="codeSection" style="display:none;">
        <div class="section-title">Payload / Transformation Code</div>
        <div class="code-block" id="detailCode"></div>
      </div>

      <a href="#" class="doc-btn" id="detailDocBtn" target="_blank">📖 Open Anypoint Documentation</a>
    </div>
  </div>

  <script>
    const flowsData = ${flowsJson};
    const elementMap = {};

    flowsData.forEach(f => {
      f.elements.forEach(el => {
        elementMap[el.id] = el;
      });
    });

    function inspectElement(id) {
      document.querySelectorAll('.node-card').forEach(c => c.classList.remove('selected'));
      const card = document.getElementById(id);
      if (card) card.classList.add('selected');

      const data = elementMap[id];
      if (!data) return;

      document.getElementById('emptyState').style.display = 'none';
      const detailView = document.getElementById('detailView');
      detailView.style.display = 'flex';

      document.getElementById('detailIcon').textContent = data.icon;
      document.getElementById('detailName').textContent = data.name;
      document.getElementById('detailTag').textContent = data.tag + ' • ' + data.category;
      document.getElementById('detailDesc').textContent = data.description;
      document.getElementById('detailRuntime').textContent = data.runtimeNotes;

      // Render props
      const table = document.getElementById('detailProps');
      table.innerHTML = '';
      const keys = Object.keys(data.attributes);
      if (keys.length === 0) {
        table.innerHTML = '<tr><td colspan="2" style="color:var(--muted);">(No explicit XML attributes)</td></tr>';
      } else {
        keys.forEach(k => {
          const row = document.createElement('tr');
          row.innerHTML = '<td class="prop-key">' + k + '</td><td class="prop-val">' + data.attributes[k] + '</td>';
          table.appendChild(row);
        });
      }

      // Code block
      const codeSec = document.getElementById('codeSection');
      if (data.innerText) {
        codeSec.style.display = 'block';
        document.getElementById('detailCode').textContent = data.innerText;
      } else {
        codeSec.style.display = 'none';
      }

      const docBtn = document.getElementById('detailDocBtn');
      docBtn.href = data.docsUrl;
    }

    // Auto-select first component if available
    window.addEventListener('DOMContentLoaded', () => {
      const firstId = Object.keys(elementMap)[0];
      if (firstId) inspectElement(firstId);
    });
  </script>
</body>
</html>`;
  }

  private _getCategoryFromTag(tag: string): string {
    if (tag.startsWith('http:')) return 'Connector / HTTP';
    if (tag.startsWith('db:')) return 'Connector / Database';
    if (tag.startsWith('ee:')) return 'Transform';
    if (tag.includes('logger')) return 'Core / Logging';
    if (tag.includes('error')) return 'Error Handling';
    if (tag === 'choice' || tag === 'scatter-gather' || tag === 'foreach') return 'Router / Scope';
    return 'Core';
  }

  private _getCategoryClass(tag: string): string {
    if (tag.startsWith('http:')) return 'http';
    if (tag.startsWith('db:')) return 'db';
    if (tag.startsWith('ee:')) return 'transform';
    if (tag.includes('logger')) return 'logger';
    if (tag.includes('error')) return 'error';
    if (tag === 'choice' || tag === 'scatter-gather' || tag === 'foreach' || tag === 'until-successful') return 'router';
    return 'core';
  }

  private _getIcon(tag: string): string {
    if (tag.startsWith('http:')) return '🌐';
    if (tag.startsWith('db:')) return '🗄️';
    if (tag.startsWith('ee:')) return '🔄';
    if (tag.includes('logger')) return '📝';
    if (tag.includes('error')) return '🛡️';
    if (tag === 'choice') return '🔀';
    if (tag === 'scatter-gather') return '⚡';
    if (tag === 'foreach') return '🔁';
    if (tag === 'until-successful') return '⏳';
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
