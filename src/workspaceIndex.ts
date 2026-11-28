import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

export interface FlowInfo {
  name: string;
  kind: 'flow' | 'sub-flow';
  uri: vscode.Uri;
  line: number;
  hasErrorHandler: boolean;
  errorHandlerRef?: string;
  flowRefs: string[];
  isApikitRoute: boolean;
  isApikitMain: boolean;
}

export interface WorkspaceIndex {
  flows: Map<string, FlowInfo>;
  globalErrorHandlers: Set<string>;
  munitTargets: Set<string>;
  munitSuiteFileNames: string[];
  munitRawContents: string[];
  callers: Map<string, Set<string>>;
  builtAt: number;
}

const APIKIT_ROUTE_REGEX = /^(get|post|put|patch|delete|head|options):\\/i;
const INDEX_EXCLUDE_GLOB =
  '{**/node_modules/**,**/target/**,**/.tooling-project/**,**/.mule/**,**/.git/**,**/out/**,**/dist/**}';

let cachedIndex: WorkspaceIndex | null = null;
let rebuildTimer: ReturnType<typeof setTimeout> | undefined;
let activeBuildPromise: Promise<WorkspaceIndex> | null = null;

export function getCachedIndex(): WorkspaceIndex | null {
  return cachedIndex;
}

export function invalidateWorkspaceIndex(): void {
  cachedIndex = null;
}

export function scheduleIndexRebuild(onRebuilt?: (index: WorkspaceIndex) => void): void {
  if (rebuildTimer !== undefined) {
    clearTimeout(rebuildTimer);
  }
  rebuildTimer = setTimeout(() => {
    rebuildTimer = undefined;
    invalidateWorkspaceIndex();
    void buildIndex().then((idx) => {
      onRebuilt?.(idx);
    });
  }, 500);
}

function maskXmlComments(text: string): string {
  return text.replace(/<!--[\s\S]*?(?:-->|$)/g, (c) => c.replace(/[^\r\n]/g, ' '));
}

function findTagEnd(text: string, tagStart: number): number {
  let quote: '"' | "'" | null = null;
  for (let i = tagStart; i < text.length; i++) {
    const ch = text[i];
    if (quote) {
      if (ch === quote) {
        quote = null;
      }
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (ch === '>') {
      return i;
    }
  }
  return -1;
}

function offsetToLine(text: string, offset: number): number {
  let line = 0;
  for (let i = 0; i < offset && i < text.length; i++) {
    if (text.charCodeAt(i) === 10) {
      line++;
    }
  }
  return line;
}

function extractFlowRefs(body: string): string[] {
  const refs: string[] = [];
  const flowRefRegex = /<flow-ref\s+[^>]*?(?<![\w:-])name\s*=\s*["']([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = flowRefRegex.exec(body)) !== null) {
    const target = m[1].trim();
    if (target && !target.startsWith('#[')) {
      refs.push(target);
    }
  }
  return refs;
}

function extractMUnitTargets(content: string, targets: Set<string>): void {
  const masked = maskXmlComments(content);

  // 1. Direct <flow-ref name="..."/> inside <munit:execution> or anywhere in the suite
  const flowRefRegex = /<flow-ref\s+[^>]*?(?<![\w:-])name\s*=\s*["']([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = flowRefRegex.exec(masked)) !== null) {
    const target = m[1].trim();
    if (target && !target.startsWith('#[')) {
      targets.add(target);
    }
  }

  // 2. <munit-tools:mock-when processor="flow-ref"> ... <munit-tools:with-attribute attributeName="name" whereValue="..."/>
  const mockWhenRegex = /<munit-tools:mock-when\b[^>]*processor\s*=\s*["']flow-ref["'][^>]*>([\s\S]*?)<\/munit-tools:mock-when>/gi;
  while ((m = mockWhenRegex.exec(masked)) !== null) {
    const body = m[1];
    const withAttrRegex =
      /<munit-tools:with-attribute\b[^>]*attributeName\s*=\s*["']name["'][^>]*whereValue\s*=\s*["']([^"']+)["']/gi;
    let wm: RegExpExecArray | null;
    while ((wm = withAttrRegex.exec(body)) !== null) {
      targets.add(wm[1].trim());
    }
  }
}

export function indexXmlText(
  text: string,
  uri: vscode.Uri,
  index: WorkspaceIndex
): void {
  const masked = maskXmlComments(text);

  // Top-level global error handlers: <error-handler name="...">
  const globalEhRegex = /<error-handler\s+[^>]*?(?<![\w:-])name\s*=\s*["']([^"']+)["']/gi;
  let ehMatch: RegExpExecArray | null;
  while ((ehMatch = globalEhRegex.exec(masked)) !== null) {
    index.globalErrorHandlers.add(ehMatch[1].trim());
  }

  // Extract <flow ...>...</flow> and <sub-flow ...>...</sub-flow>
  const openRegex = /<(flow|sub-flow)(?=[\s>])/gi;
  let match: RegExpExecArray | null;
  while ((match = openRegex.exec(masked)) !== null) {
    const kind = match[1].toLowerCase() as 'flow' | 'sub-flow';
    const openStart = match.index;
    const openEnd = findTagEnd(masked, openStart);
    if (openEnd === -1) {
      break;
    }
    if (masked[openEnd - 1] === '/') {
      openRegex.lastIndex = openEnd + 1;
      continue;
    }

    const openTag = masked.slice(openStart, openEnd + 1);
    const nameMatch = /(?<![\w:-])name\s*=\s*["']([^"']+)["']/i.exec(openTag);
    const name = (nameMatch?.[1] ?? '').trim();

    const closeRegex = new RegExp(`</${kind}\\s*>`, 'gi');
    closeRegex.lastIndex = openEnd + 1;
    const closeMatch = closeRegex.exec(masked);
    if (!closeMatch) {
      openRegex.lastIndex = openEnd + 1;
      continue;
    }

    const body = masked.slice(openEnd + 1, closeMatch.index);
    openRegex.lastIndex = closeMatch.index + closeMatch[0].length;

    if (!name) {
      continue;
    }

    const ehRefMatch = /<error-handler\s+[^>]*?(?<![\w:-])ref\s*=\s*["']([^"']+)["']/i.exec(body);
    const hasInlineEh =
      /<error-handler(?=[\s>])(?![^>]*\/>)/i.test(body) ||
      /<on-error-propagate(?=[\s/>])|<on-error-continue(?=[\s/>])/i.test(body);
    const flowRefs = extractFlowRefs(body);

    const info: FlowInfo = {
      name,
      kind,
      uri,
      line: offsetToLine(masked, openStart),
      hasErrorHandler: hasInlineEh || Boolean(ehRefMatch),
      errorHandlerRef: ehRefMatch?.[1]?.trim(),
      flowRefs,
      isApikitRoute: APIKIT_ROUTE_REGEX.test(name),
      isApikitMain: /<apikit:router(?=[\s/>])/i.test(body) || /-main$/i.test(name),
    };

    index.flows.set(name, info);
    for (const ref of flowRefs) {
      let set = index.callers.get(ref);
      if (!set) {
        set = new Set<string>();
        index.callers.set(ref, set);
      }
      set.add(name);
    }
  }
}

function collectFilesFromDisk(dirPath: string, suffix: string, out: string[]): void {
  let entries: fs.Dirent[];
  try {
    if (!fs.existsSync(dirPath)) {
      return;
    }
    entries = fs.readdirSync(dirPath, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (
      entry.name === 'node_modules' ||
      entry.name === 'target' ||
      entry.name === '.tooling-project' ||
      entry.name === '.mule' ||
      entry.name === '.git'
    ) {
      continue;
    }
    const full = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      collectFilesFromDisk(full, suffix, out);
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith(suffix)) {
      out.push(full);
    }
  }
}

export async function buildIndex(): Promise<WorkspaceIndex> {
  if (activeBuildPromise) {
    return activeBuildPromise;
  }

  activeBuildPromise = (async () => {
    const index: WorkspaceIndex = {
      flows: new Map(),
      globalErrorHandlers: new Set(),
      munitTargets: new Set(),
      munitSuiteFileNames: [],
      munitRawContents: [],
      callers: new Map(),
      builtAt: Date.now(),
    };

    const seenMulePaths = new Set<string>();
    const seenMunitPaths = new Set<string>();

    // 1. Try vscode.workspace.findFiles across all workspaceFolders
    try {
      const muleUris = await vscode.workspace.findFiles(
        '**/src/main/mule/**/*.xml',
        INDEX_EXCLUDE_GLOB
      );
      for (const uri of muleUris) {
        const fsPath = uri.fsPath;
        if (!seenMulePaths.has(fsPath.toLowerCase())) {
          seenMulePaths.add(fsPath.toLowerCase());
          try {
            const text = fs.readFileSync(fsPath, 'utf8');
            indexXmlText(text, uri, index);
          } catch {
            // Skip unreadable file
          }
        }
      }

      const munitUris = await vscode.workspace.findFiles(
        '**/src/test/munit/**/*.xml',
        INDEX_EXCLUDE_GLOB
      );
      for (const uri of munitUris) {
        const fsPath = uri.fsPath;
        if (!seenMunitPaths.has(fsPath.toLowerCase())) {
          seenMunitPaths.add(fsPath.toLowerCase());
          try {
            const content = fs.readFileSync(fsPath, 'utf8');
            index.munitSuiteFileNames.push(path.basename(fsPath));
            index.munitRawContents.push(content);
            extractMUnitTargets(content, index.munitTargets);
          } catch {
            // Skip unreadable file
          }
        }
      }
    } catch {
      // Fallback to direct disk walk if findFiles is unavailable in mock
    }

    // 2. Also walk all workspaceFolders directly to guarantee multi-root completeness
    const folders = vscode.workspace.workspaceFolders ?? [];
    for (const folder of folders) {
      const muleDir = path.join(folder.uri.fsPath, 'src', 'main', 'mule');
      const muleFiles: string[] = [];
      collectFilesFromDisk(muleDir, '.xml', muleFiles);
      for (const fsPath of muleFiles) {
        if (!seenMulePaths.has(fsPath.toLowerCase())) {
          seenMulePaths.add(fsPath.toLowerCase());
          try {
            const text = fs.readFileSync(fsPath, 'utf8');
            indexXmlText(text, vscode.Uri.file(fsPath), index);
          } catch {
            // Skip
          }
        }
      }

      const munitDir = path.join(folder.uri.fsPath, 'src', 'test', 'munit');
      const munitFiles: string[] = [];
      collectFilesFromDisk(munitDir, '.xml', munitFiles);
      for (const fsPath of munitFiles) {
        if (!seenMunitPaths.has(fsPath.toLowerCase())) {
          seenMunitPaths.add(fsPath.toLowerCase());
          try {
            const content = fs.readFileSync(fsPath, 'utf8');
            index.munitSuiteFileNames.push(path.basename(fsPath));
            index.munitRawContents.push(content);
            extractMUnitTargets(content, index.munitTargets);
          } catch {
            // Skip
          }
        }
      }
    }

    cachedIndex = index;
    activeBuildPromise = null;
    return index;
  })();

  return activeBuildPromise;
}

/**
 * Checks whether a flow is covered by MUnit directly or via any transitive caller (BFS).
 */
export function isFlowCoveredByMUnit(
  flowName: string,
  sourceBaseName: string,
  index: WorkspaceIndex
): boolean {
  if (index.munitSuiteFileNames.length === 0 && index.munitTargets.size === 0) {
    return false;
  }

  const matchesDirectHeuristics = (name: string): boolean => {
    if (index.munitTargets.has(name)) {
      return true;
    }
    const lower = name.toLowerCase();
    if (index.munitSuiteFileNames.some((f) => f.toLowerCase().includes(lower))) {
      return true;
    }
    const quoted = new RegExp(`name\\s*=\\s*["']${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["']`, 'i');
    return index.munitRawContents.some((c) => quoted.test(c));
  };

  if (flowName && matchesDirectHeuristics(flowName)) {
    return true;
  }

  // If this is an APIkit main flow, treat it as covered if any APIkit route in the same file is covered
  const flowInfo = flowName ? index.flows.get(flowName) : undefined;
  if (flowInfo?.isApikitMain) {
    for (const candidate of index.flows.values()) {
      if (
        candidate.isApikitRoute &&
        candidate.uri.fsPath === flowInfo.uri.fsPath &&
        matchesDirectHeuristics(candidate.name)
      ) {
        return true;
      }
    }
  }

  // BFS upward through callers
  const visited = new Set<string>();
  const queue: string[] = flowName ? [flowName] : [];
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (visited.has(current)) {
      continue;
    }
    visited.add(current);

    if (current !== flowName && matchesDirectHeuristics(current)) {
      return true;
    }

    const callers = index.callers.get(current);
    if (callers) {
      for (const caller of callers) {
        if (!visited.has(caller)) {
          queue.push(caller);
        }
      }
    }
  }

  if (!flowName && sourceBaseName) {
    return matchesDirectHeuristics(sourceBaseName);
  }

  return false;
}

/**
 * Checks whether a flow has error handling directly, via global handler, APIkit parent, or all callers (transitive).
 */
export function isFlowErrorHandled(
  flowInfo: FlowInfo,
  sameFileFlows: FlowInfo[],
  index: WorkspaceIndex
): { handled: boolean; unresolvedRef?: string } {
  if (flowInfo.kind === 'sub-flow') {
    return { handled: true };
  }

  if (flowInfo.errorHandlerRef) {
    if (
      index.globalErrorHandlers.size === 0 ||
      index.globalErrorHandlers.has(flowInfo.errorHandlerRef)
    ) {
      return { handled: true };
    }
    return { handled: false, unresolvedRef: flowInfo.errorHandlerRef };
  }

  if (flowInfo.hasErrorHandler) {
    return { handled: true };
  }

  // APIkit route flows execute inside the APIkit main flow's scope in the same file
  if (flowInfo.isApikitRoute) {
    const apikitMain = sameFileFlows.find((f) => f.isApikitMain);
    if (apikitMain && (apikitMain.hasErrorHandler || apikitMain.errorHandlerRef)) {
      return { handled: true };
    }
  }

  // Transitive caller check: if every caller is handled (with cycle guard)
  const visited = new Set<string>();
  const allCallersHandled = (targetName: string): boolean => {
    if (visited.has(targetName)) {
      return true; // cycle guard
    }
    visited.add(targetName);

    const callers = index.callers.get(targetName);
    if (!callers || callers.size === 0) {
      return false;
    }

    for (const callerName of callers) {
      const caller = index.flows.get(callerName);
      if (!caller) {
        return false;
      }
      if (caller.hasErrorHandler || caller.errorHandlerRef) {
        continue;
      }
      if (!allCallersHandled(callerName)) {
        return false;
      }
    }
    return true;
  };

  if (allCallersHandled(flowInfo.name)) {
    return { handled: true };
  }

  return { handled: false };
}
