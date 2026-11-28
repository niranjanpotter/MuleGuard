import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { getResolvedConfig, getWorkspaceRootForUri } from './config';

export interface BaselineEntry {
  file: string;
  rule: string;
  line: number;
  hash: string;
}

const BASELINE_FILENAME = '.muleguard-baseline.json';
const baselineCache = new Map<string, Set<string>>();

export function invalidateBaselineCache(): void {
  baselineCache.clear();
}

export function hashLineText(lineText: string): string {
  return crypto.createHash('sha1').update(lineText.trim()).digest('hex');
}

function makeKey(relFile: string, rule: string, hash: string): string {
  return `${relFile.replace(/\\/g, '/')}::${rule}::${hash}`;
}

function loadBaselineSet(rootPath: string): Set<string> {
  if (baselineCache.has(rootPath)) {
    return baselineCache.get(rootPath)!;
  }

  const set = new Set<string>();
  const baselinePath = path.join(rootPath, BASELINE_FILENAME);
  try {
    if (fs.existsSync(baselinePath)) {
      const raw = fs.readFileSync(baselinePath, 'utf8');
      const entries = JSON.parse(raw) as BaselineEntry[];
      if (Array.isArray(entries)) {
        for (const entry of entries) {
          if (entry.file && entry.rule && entry.hash) {
            set.add(makeKey(entry.file, entry.rule, entry.hash));
          }
        }
      }
    }
  } catch {
    // Ignore malformed baseline file
  }

  baselineCache.set(rootPath, set);
  return set;
}

export function filterBaselinedDiagnostics(
  document: vscode.TextDocument,
  diagnostics: vscode.Diagnostic[]
): vscode.Diagnostic[] {
  const cfg = getResolvedConfig(document.uri);
  if (!cfg.baselineEnabled || diagnostics.length === 0) {
    return diagnostics;
  }

  const rootPath = getWorkspaceRootForUri(document.uri);
  if (!rootPath) {
    return diagnostics;
  }

  const set = loadBaselineSet(rootPath);
  if (set.size === 0) {
    return diagnostics;
  }

  const relFile = path.relative(rootPath, document.fileName).replace(/\\/g, '/');
  return diagnostics.filter((diag) => {
    const rule = String(diag.code ?? '');
    const lineIdx = Math.min(diag.range.start.line, Math.max(0, document.lineCount - 1));
    const lineText = document.lineAt(lineIdx).text;
    const hash = hashLineText(lineText);
    return !set.has(makeKey(relFile, rule, hash));
  });
}

export async function createBaseline(
  collection: vscode.DiagnosticCollection
): Promise<{ entriesCount: number; filePath: string | null }> {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) {
    return { entriesCount: 0, filePath: null };
  }

  const entriesByRoot = new Map<string, BaselineEntry[]>();
  for (const folder of folders) {
    entriesByRoot.set(folder.uri.fsPath, []);
  }

  const docsToRead: Array<{ uri: vscode.Uri; diags: readonly vscode.Diagnostic[] }> = [];
  collection.forEach((uri, diags) => {
    if (diags.length > 0) {
      docsToRead.push({ uri, diags });
    }
  });

  for (const { uri, diags } of docsToRead) {
    const rootPath = getWorkspaceRootForUri(uri);
    if (!rootPath) {
      continue;
    }
    const list = entriesByRoot.get(rootPath) ?? [];
    entriesByRoot.set(rootPath, list);

    let lines: string[] = [];
    try {
      const content = fs.readFileSync(uri.fsPath, 'utf8');
      lines = content.split(/\r?\n/);
    } catch {
      continue;
    }

    const relFile = path.relative(rootPath, uri.fsPath).replace(/\\/g, '/');
    for (const diag of diags) {
      const lineIdx = Math.min(diag.range.start.line, Math.max(0, lines.length - 1));
      const lineText = lines[lineIdx] ?? '';
      list.push({
        file: relFile,
        rule: String(diag.code ?? ''),
        line: diag.range.start.line + 1,
        hash: hashLineText(lineText),
      });
    }
  }

  let totalEntries = 0;
  let lastPath: string | null = null;
  for (const [rootPath, entries] of entriesByRoot.entries()) {
    const baselinePath = path.join(rootPath, BASELINE_FILENAME);
    fs.writeFileSync(baselinePath, JSON.stringify(entries, null, 2), 'utf8');
    totalEntries += entries.length;
    lastPath = baselinePath;
  }

  invalidateBaselineCache();
  return { entriesCount: totalEntries, filePath: lastPath };
}
