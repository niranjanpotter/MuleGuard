import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { getResolvedConfig, isExcludedFilePath } from './config';
import { extractFlows, maskXmlComments } from './diagnostics';
import { buildIndex, FlowInfo, WorkspaceIndex } from './workspaceIndex';

export interface FlowDocSummary {
  name: string;
  kind: 'flow' | 'sub-flow';
  fileRel: string;
  processors: string[];
  properties: string[];
  flowRefs: string[];
  errorHandling: string;
  isApikitRoute: boolean;
  mermaid: string;
}

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/^_+|_+$/g, '') || 'flow';
}

function extractProcessorsFromBody(body: string): string[] {
  const processors: string[] = [];
  const tagRegex = /<([a-zA-Z][\w:-]*)(?=[\s/>])/g;
  let m: RegExpExecArray | null;
  while ((m = tagRegex.exec(body)) !== null) {
    const tag = m[1];
    if (
      tag.startsWith('ee:message') ||
      tag.startsWith('ee:set-') ||
      tag.startsWith('ee:variables') ||
      tag.startsWith('http:headers') ||
      tag.startsWith('http:uri-params') ||
      tag.startsWith('http:query-params') ||
      tag === 'when' ||
      tag === 'otherwise' ||
      tag === 'route'
    ) {
      continue;
    }
    processors.push(tag);
  }
  return processors;
}

function extractPropertiesFromBody(body: string): string[] {
  const props = new Set<string>();
  const dollarRegex = /\$\{([^}]+)\}/g;
  let m: RegExpExecArray | null;
  while ((m = dollarRegex.exec(body)) !== null) {
    props.add(m[1].trim());
  }
  const pFuncRegex = /\bp\(\s*['"]([^'"]+)['"]\s*\)/g;
  while ((m = pFuncRegex.exec(body)) !== null) {
    props.add(m[1].trim());
  }
  return Array.from(props);
}

function buildMermaidFlowchart(flowName: string, processors: string[]): string {
  const lines = ['```mermaid', 'flowchart LR'];
  const startId = 'START';
  lines.push(`  ${startId}(["${flowName.replace(/"/g, "'")}"])`);
  let prev = startId;
  const maxNodes = Math.min(processors.length, 20);
  for (let i = 0; i < maxNodes; i++) {
    const nodeId = `N${i}`;
    const label = processors[i].replace(/"/g, "'");
    lines.push(`  ${nodeId}["${label}"]`);
    lines.push(`  ${prev} --> ${nodeId}`);
    prev = nodeId;
  }
  if (processors.length > maxNodes) {
    lines.push(`  MORE["... +${processors.length - maxNodes} more"]`);
    lines.push(`  ${prev} --> MORE`);
  }
  lines.push('```');
  return lines.join('\n');
}

function describeErrorHandling(flowInfo: FlowInfo, index: WorkspaceIndex): string {
  if (flowInfo.kind === 'sub-flow') {
    return 'Sub-flow (errors propagate to caller)';
  }
  if (flowInfo.errorHandlerRef) {
    const exists = index.globalErrorHandlers.has(flowInfo.errorHandlerRef);
    return `References global handler \`${flowInfo.errorHandlerRef}\`${exists ? '' : ' (unresolved)'}`;
  }
  if (flowInfo.hasErrorHandler) {
    return 'Inline `<error-handler>` defined';
  }
  if (flowInfo.isApikitRoute) {
    return 'Handled by parent APIkit router flow';
  }
  return 'No error handler detected';
}

export async function generateFlowDocsForWorkspace(
  rootPath: string
): Promise<{ docsDir: string; flowCount: number; routeCount: number }> {
  const cfg = getResolvedConfig();
  const index = await buildIndex();
  const docsDir = path.join(rootPath, 'docs');
  const flowsSubDir = path.join(docsDir, 'flows');
  fs.mkdirSync(flowsSubDir, { recursive: true });

  const flowDocs: FlowDocSummary[] = [];
  const apikitRoutes: FlowDocSummary[] = [];

  // Group flows by file so we only read each XML once
  const byFile = new Map<string, FlowInfo[]>();
  for (const info of index.flows.values()) {
    const fsPath = info.uri.fsPath;
    if (isExcludedFilePath(fsPath, cfg.exclude)) {
      continue;
    }
    const list = byFile.get(fsPath) ?? [];
    list.push(info);
    byFile.set(fsPath, list);
  }

  for (const [fsPath, infos] of byFile.entries()) {
    let raw = '';
    try {
      raw = fs.readFileSync(fsPath, 'utf8');
    } catch {
      continue;
    }
    const masked = maskXmlComments(raw);
    const parsedFlows = extractFlows(masked);
    const bodyByName = new Map<string, string>();
    for (const pf of parsedFlows) {
      if (pf.name) {
        bodyByName.set(pf.name, pf.body);
      }
    }

    const subFlowRegex = /<sub-flow\s+[^>]*?(?<![\w:-])name\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/sub-flow>/gi;
    let sm: RegExpExecArray | null;
    while ((sm = subFlowRegex.exec(masked)) !== null) {
      bodyByName.set(sm[1].trim(), sm[2]);
    }

    const fileRel = path.relative(rootPath, fsPath).replace(/\\/g, '/');
    for (const info of infos) {
      const body = bodyByName.get(info.name) ?? '';
      const processors = extractProcessorsFromBody(body);
      const properties = extractPropertiesFromBody(body);
      const summary: FlowDocSummary = {
        name: info.name,
        kind: info.kind,
        fileRel,
        processors,
        properties,
        flowRefs: info.flowRefs,
        errorHandling: describeErrorHandling(info, index),
        isApikitRoute: info.isApikitRoute,
        mermaid: buildMermaidFlowchart(info.name, processors),
      };

      if (info.isApikitRoute) {
        apikitRoutes.push(summary);
      } else {
        flowDocs.push(summary);
        const pagePath = path.join(flowsSubDir, `${sanitizeFileName(info.name)}.md`);
        const resolvedRefs = info.flowRefs.map((ref) => {
          const target = index.flows.get(ref);
          if (!target) {
            return `- \`${ref}\` *(external or unresolved)*`;
          }
          const targetRel = path.relative(rootPath, target.uri.fsPath).replace(/\\/g, '/');
          return `- [\`${ref}\`](./${sanitizeFileName(ref)}.md) *(${targetRel})*`;
        });

        const pageContent = [
          `# ${info.kind === 'sub-flow' ? 'Sub-Flow' : 'Flow'}: \`${info.name}\``,
          '',
          `- **Source File:** \`${fileRel}\``,
          `- **Error Handling:** ${summary.errorHandling}`,
          `- **Processors:** ${processors.length}`,
          '',
          '## Flow Diagram',
          '',
          summary.mermaid,
          '',
          '## Flow References',
          '',
          resolvedRefs.length > 0 ? resolvedRefs.join('\n') : '_No outgoing `<flow-ref>` calls._',
          '',
          '## Properties Read',
          '',
          properties.length > 0 ? properties.map((p) => `- \`${p}\``).join('\n') : '_No properties referenced._',
          '',
          '---',
          '*Generated by [MuleGuard](https://github.com/niranjanpotter/MuleGuard)*',
          '',
        ].join('\n');
        fs.writeFileSync(pagePath, pageContent, 'utf8');
      }
    }
  }

  // Write aggregated docs/flows.md
  const indexLines = [
    '# MuleSoft Flow Documentation',
    '',
    `Generated on ${new Date().toISOString()} by **MuleGuard**.`,
    '',
    '## Flows & Sub-Flows',
    '',
    '| Flow | Kind | Source File | Error Handling | Flow Refs |',
    '| :--- | :--- | :--- | :--- | :--- |',
    ...flowDocs.map(
      (f) =>
        `| [\`${f.name}\`](./flows/${sanitizeFileName(f.name)}.md) | ${f.kind} | \`${f.fileRel}\` | ${f.errorHandling} | ${f.flowRefs.length} |`
    ),
    '',
  ];

  if (apikitRoutes.length > 0) {
    indexLines.push(
      '## APIkit Routing Table',
      '',
      '| Route Flow | Target Flow-Ref(s) | Source File |',
      '| :--- | :--- | :--- |',
      ...apikitRoutes.map(
        (r) =>
          `| \`${r.name}\` | ${r.flowRefs.map((ref) => `\`${ref}\``).join(', ') || '_none_'} | \`${r.fileRel}\` |`
      ),
      ''
    );
  }

  fs.writeFileSync(path.join(docsDir, 'flows.md'), indexLines.join('\n'), 'utf8');

  return {
    docsDir,
    flowCount: flowDocs.length,
    routeCount: apikitRoutes.length,
  };
}

export async function runGenerateFlowDocsCommand(): Promise<void> {
  const rootPath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!rootPath) {
    void vscode.window.showErrorMessage('MuleGuard: Open a workspace folder first.');
    return;
  }

  const result = await generateFlowDocsForWorkspace(rootPath);
  const indexUri = vscode.Uri.file(path.join(result.docsDir, 'flows.md'));
  const doc = await vscode.workspace.openTextDocument(indexUri);
  await vscode.window.showTextDocument(doc);
  void vscode.window.showInformationMessage(
    `MuleGuard: Generated docs for ${result.flowCount} flow(s) and ${result.routeCount} APIkit route(s) in docs/flows.md.`
  );
}
