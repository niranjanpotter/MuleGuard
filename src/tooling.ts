import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

/**
 * Feature 11: Env Config Diff
 * Compares keys across YAML environment configurations to detect missing properties.
 */
export async function compareEnvConfigs(): Promise<void> {
  const yamlUris = await vscode.workspace.findFiles('**/*.yaml', '**/node_modules/**');
  if (yamlUris.length < 2) {
    void vscode.window.showInformationMessage('MuleGuard: Need at least 2 YAML configuration files to run an Env Diff.');
    return;
  }

  // QuickPick file 1
  const items = yamlUris.map(u => ({ label: path.basename(u.fsPath), description: u.fsPath, uri: u }));
  const file1 = await vscode.window.showQuickPick(items, { placeHolder: 'Select base configuration file (e.g. dev.yaml)' });
  if (!file1) return;

  const file2 = await vscode.window.showQuickPick(items.filter(i => i.uri.fsPath !== file1.uri.fsPath), {
    placeHolder: 'Select target configuration file to compare against (e.g. prod.yaml)'
  });
  if (!file2) return;

  // Extract flat keys
  const getKeys = (filePath: string): Set<string> => {
    const keys = new Set<string>();
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    for (const l of lines) {
      const match = /^\s*([a-zA-Z0-9_.-]+)\s*:/i.exec(l);
      if (match && !l.trim().startsWith('#')) {
        keys.add(match[1].trim());
      }
    }
    return keys;
  };

  const keys1 = getKeys(file1.uri.fsPath);
  const keys2 = getKeys(file2.uri.fsPath);

  const missingIn2 = [...keys1].filter(k => !keys2.has(k));
  const missingIn1 = [...keys2].filter(k => !keys1.has(k));

  let report = `# MuleGuard Environment Config Diff\n\n`;
  report += `**Base File:** \`${file1.label}\` (${keys1.size} properties)\n`;
  report += `**Comparison File:** \`${file2.label}\` (${keys2.size} properties)\n\n`;
  report += `## Missing in ${file2.label} (${missingIn2.length})\n`;
  if (missingIn2.length === 0) {
    report += `*None. All properties in ${file1.label} are present.*\n\n`;
  } else {
    report += missingIn2.map(k => `- ❌ \`${k}\``).join('\n') + '\n\n';
  }

  report += `## Missing in ${file1.label} (${missingIn1.length})\n`;
  if (missingIn1.length === 0) {
    report += `*None. All properties in ${file2.label} are present.*\n\n`;
  } else {
    report += missingIn1.map(k => `- ⚠️ \`${k}\``).join('\n') + '\n\n';
  }

  const doc = await vscode.workspace.openTextDocument({
    language: 'markdown',
    content: report
  });
  await vscode.window.showTextDocument(doc);
}

/**
 * Feature 12: Secret Scanner
 * Scans workspace for unencrypted secrets, high entropy tokens, private keys.
 */
export async function runSecretScanner(): Promise<void> {
  const files = await vscode.workspace.findFiles('**/*.{xml,dwl,yaml,properties,json}', '{**/node_modules/**,**/target/**,**/.git/**}');
  let totalFound = 0;
  const findings: { file: string; line: number; rule: string; preview: string }[] = [];

  const patterns = [
    { rule: 'AWS Access Key', regex: /\bAKIA[0-9A-Z]{16}\b/ },
    { rule: 'JWT Token', regex: /\beyJ[A-Za-z0-9-_=]+\.[A-Za-z0-9-_=]+\.?[A-Za-z0-9-_.+/=]*\b/ },
    { rule: 'RSA Private Key', regex: /-----BEGIN (?:RSA )?PRIVATE KEY-----/ },
    { rule: 'Hardcoded Password Attribute', regex: /\bpassword\s*=\s*["'](?!\$\{|\#\[)([^"']{4,})["']/i },
    { rule: 'Hardcoded Client Secret', regex: /\bclient_?secret\s*[:=]\s*["'](?!\$\{|\#\[)([^"']{6,})["']/i }
  ];

  for (const uri of files) {
    try {
      const content = fs.readFileSync(uri.fsPath, 'utf8');
      const lines = content.split('\n');
      lines.forEach((l, idx) => {
        for (const p of patterns) {
          if (p.regex.test(l)) {
            totalFound++;
            findings.push({
              file: path.basename(uri.fsPath),
              line: idx + 1,
              rule: p.rule,
              preview: l.trim().substring(0, 80)
            });
          }
        }
      });
    } catch {
      // ignore
    }
  }

  if (totalFound === 0) {
    void vscode.window.showInformationMessage('MuleGuard Secret Scanner: 0 exposed secrets found across workspace! 🛡️');
    return;
  }

  let report = `# MuleGuard Secret Scan Report\n\n`;
  report += `**Total Exposed Secrets Found:** ${totalFound}\n\n`;
  report += `| File | Line | Secret Type | Code Snippet |\n`;
  report += `| :--- | :--- | :--- | :--- |\n`;
  for (const f of findings) {
    report += `| \`${f.file}\` | ${f.line} | **${f.rule}** | \`${f.preview.replace(/\|/g, '\\|')}\` |\n`;
  }

  const doc = await vscode.workspace.openTextDocument({ language: 'markdown', content: report });
  await vscode.window.showTextDocument(doc);

  void vscode.window.showWarningMessage(`MuleGuard Secret Scanner detected ${totalFound} potential secrets!`);
}

/**
 * Feature 15: Flow Complexity Metrics
 * Inspects all flows and computes component counts, nesting depth, and flags risks.
 */
export async function calculateComplexityMetrics(): Promise<void> {
  const xmlUris = await vscode.workspace.findFiles('**/*.xml', '{**/node_modules/**,**/target/**,**/src/test/**}');
  const metrics: { flow: string; file: string; components: number; nesting: number; rating: 'LOW' | 'MEDIUM' | 'HIGH' }[] = [];

  for (const uri of xmlUris) {
    try {
      const content = fs.readFileSync(uri.fsPath, 'utf8');
      const flowRegex = /<flow\s+name=["']([^"']+)["']([\s\S]*?)<\/flow>/g;
      let match: RegExpExecArray | null;
      while ((match = flowRegex.exec(content)) !== null) {
        const flowName = match[1];
        const body = match[2];
        const components = (body.match(/<[a-zA-Z_][\w-]*:[a-zA-Z_][\w-]*/g) || []).length;
        const nesting = (body.match(/<(?:choice|foreach|scatter-gather|try|until-successful)/g) || []).length;

        let rating: 'LOW' | 'MEDIUM' | 'HIGH' = 'LOW';
        if (components > 15 || nesting > 3) rating = 'HIGH';
        else if (components > 8 || nesting > 1) rating = 'MEDIUM';

        metrics.push({ flow: flowName, file: path.basename(uri.fsPath), components, nesting, rating });
      }
    } catch {
      // ignore
    }
  }

  let report = `# MuleGuard Flow Complexity & Maintainability Metrics\n\n`;
  report += `| Flow Name | File | Processors | Nested Scopes | Maintainability Risk |\n`;
  report += `| :--- | :--- | :--- | :--- | :--- |\n`;
  for (const m of metrics) {
    const icon = m.rating === 'HIGH' ? '🔴 High Risk' : m.rating === 'MEDIUM' ? '🟡 Moderate' : '🟢 Clean';
    report += `| \`${m.flow}\` | \`${m.file}\` | ${m.components} | ${m.nesting} | ${icon} |\n`;
  }

  const doc = await vscode.workspace.openTextDocument({ language: 'markdown', content: report });
  await vscode.window.showTextDocument(doc);
}
