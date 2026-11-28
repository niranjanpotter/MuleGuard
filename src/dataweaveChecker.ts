import * as path from 'path';
import * as vscode from 'vscode';
import { getResolvedConfig, getWorkspaceRootForUri } from './config';

export const DATAWEAVE_SOURCE = 'MuleGuard';

export const DATAWEAVE_RULE_CODES = {
  NullSafety: 'MG006',
} as const;

const MEMBER_ACCESS_REGEX =
  /\b(payload|vars|attributes)((?:\??\.[A-Za-z_][\w$]*|\[\d+\]){2,})/g;

const NUMERIC_SUFFIX_REGEX =
  /(?:^|_|(?<=[a-z]))(age|count|qty|quantity|amount|total|price|cost|rate|balance|score|num|number|index|size|length|limit|offset|port|year|month|day|days|hours|minutes|seconds|timeout|retries|percent|percentage|tax|discount|fee|weight|height|width|salary|revenue|budget|vcore|vcores)s?$/i;

const SAFE_FOLLOWING_OPERATOR_REGEX =
  /^\s*(?:==|!=|map\b|filter\b|flatMap\b|groupBy\b|orderBy\b|reduce\b|pluck\b|distinctBy\b)/i;

const DEFAULT_AFTER_REGEX = /^\s*(?:as\s+[A-Za-z0-9_]+\s*)?\bdefault\b/i;

const FIXTURE_PATH_REGEX =
  /(?:^|[/\\])(?:src[/\\]test|sample|samples|fixtures|examples)(?:[/\\]|$)/i;

/**
 * Classifies a .dwl file as a test fixture / sample payload when path or body indicates literal test data.
 */
export function isFixtureDwlFile(filePath: string, content?: string): boolean {
  if (FIXTURE_PATH_REGEX.test(filePath)) {
    return true;
  }
  if (content !== undefined) {
    const hasOutput = /^\s*output\b/m.test(content);
    const hasSeparator = /^\s*---\s*$/m.test(content);
    if (!hasOutput && !hasSeparator) {
      return true;
    }
  }
  return false;
}

/**
 * Infers whether a DataWeave expression expects a Number or String default value.
 */
export function inferDataWeaveDefaultType(
  expression: string,
  lineText: string
): 'number' | 'string' {
  if (/\bas\s+Number\b/i.test(lineText)) {
    return 'number';
  }
  if (/\bas\s+String\b/i.test(lineText)) {
    return 'string';
  }

  const lastSegment = expression.split('.').pop() ?? '';
  if (NUMERIC_SUFFIX_REGEX.test(lastSegment)) {
    return 'number';
  }

  const lhsKeyMatch = /^\s*(?:["'])?([a-zA-Z_][\w$]*)(?:["'])?\s*:/.exec(lineText);
  if (lhsKeyMatch?.[1] && NUMERIC_SUFFIX_REGEX.test(lhsKeyMatch[1])) {
    return 'number';
  }

  return 'string';
}

/**
 * Masks DataWeave comments and string literals with spaces while preserving line breaks and offsets.
 */
function maskDataWeaveCommentsAndStrings(code: string): string {
  return code.replace(
    /\/\*[\s\S]*?(?:\*\/|$)|\/\/[^\r\n]*|"(?:\\[\s\S]|[^"\\\r\n])*"|'(?:\\[\s\S]|[^'\\\r\n])*'/g,
    (segment) => segment.replace(/[^\r\n]/g, ' ')
  );
}

/**
 * Finds the index of the closing '>' for an XML tag starting at tagStart, ignoring quotes.
 */
function findTagEnd(text: string, tagStart: number): number {
  let activeQuote: '"' | "'" | null = null;

  for (let i = tagStart; i < text.length; i++) {
    const ch = text[i];
    if (activeQuote) {
      if (ch === activeQuote) {
        activeQuote = null;
      }
      continue;
    }

    if (ch === '"' || ch === "'") {
      activeQuote = ch;
    } else if (ch === '>') {
      return i;
    }
  }

  return -1;
}

export interface DataWeaveCheckOptions {
  minDepth: number;
  maxPerFile: number;
  isApikitContext?: boolean;
}

function analyzeDataWeaveSlice(
  document: vscode.TextDocument,
  rawSlice: string,
  baseOffset: number,
  options: DataWeaveCheckOptions
): vscode.Diagnostic[] {
  const masked = maskDataWeaveCommentsAndStrings(rawSlice);
  const diagnostics: vscode.Diagnostic[] = [];
  MEMBER_ACCESS_REGEX.lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = MEMBER_ACCESS_REGEX.exec(masked)) !== null) {
    const rootIdent = match[1];
    const chain = match[2];
    const exprStart = match.index;
    const exprEnd = match.index + match[0].length;

    // Skip safe navigation (?.) or forced non-null (!)
    if (chain.includes('?.') || chain.includes('!')) {
      continue;
    }

    const segments = chain.match(/\??\.[A-Za-z_][\w$]*|\[\d+\]/g) ?? [];
    if (segments.length < options.minDepth) {
      continue;
    }

    if (
      options.isApikitContext &&
      rootIdent === 'attributes' &&
      /^\.(headers|queryParams|uriParams)\b/i.test(chain)
    ) {
      continue;
    }

    const lineStart = masked.lastIndexOf('\n', exprStart - 1) + 1;
    const nextNewline = masked.indexOf('\n', exprEnd);
    const lineEnd = nextNewline === -1 ? masked.length : nextNewline;

    const lineText = masked.slice(lineStart, lineEnd);
    const beforeOnLine = masked.slice(lineStart, exprStart);
    const afterOnLine = masked.slice(exprEnd, lineEnd);

    // Skip function invocations, existence checks (?), and forced non-null (!)
    if (/^\s*[?(!]/.test(afterOnLine)) {
      continue;
    }

    // Skip expressions already guarded by default, if, isEmpty(), sizeOf(), or p()
    if (DEFAULT_AFTER_REGEX.test(afterOnLine)) {
      continue;
    }
    if (/\bif\b\s*\(?/i.test(lineText) || SAFE_FOLLOWING_OPERATOR_REGEX.test(afterOnLine)) {
      continue;
    }
    if (/(?:isEmpty|sizeOf|p)\s*\([^)]*$/i.test(beforeOnLine)) {
      continue;
    }

    const severity =
      segments.length >= 3
        ? vscode.DiagnosticSeverity.Warning
        : vscode.DiagnosticSeverity.Information;

    const start = document.positionAt(baseOffset + exprStart);
    const end = document.positionAt(baseOffset + exprEnd);
    const diagnostic = new vscode.Diagnostic(
      new vscode.Range(start, end),
      'Possible NullPointer - Add default',
      severity
    );
    diagnostic.source = DATAWEAVE_SOURCE;
    diagnostic.code = DATAWEAVE_RULE_CODES.NullSafety;
    diagnostics.push(diagnostic);
  }

  return diagnostics;
}

function capDiagnostics(
  document: vscode.TextDocument,
  diagnostics: vscode.Diagnostic[],
  maxPerFile: number
): vscode.Diagnostic[] {
  if (maxPerFile <= 0 || diagnostics.length <= maxPerFile) {
    return diagnostics;
  }

  const capped = diagnostics.slice(0, maxPerFile);
  const suppressedCount = diagnostics.length - maxPerFile;
  const line0End = document.lineCount > 0 ? document.lineAt(0).text.length : 0;
  const summaryDiag = new vscode.Diagnostic(
    new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, Math.min(1, line0End))),
    `MuleGuard: ${suppressedCount} additional MG006 null-safety findings suppressed (cap: ${maxPerFile})`,
    vscode.DiagnosticSeverity.Information
  );
  summaryDiag.source = DATAWEAVE_SOURCE;
  summaryDiag.code = DATAWEAVE_RULE_CODES.NullSafety;
  return [summaryDiag, ...capped];
}

/**
 * Analyzes a standalone .dwl DataWeave document for null-safety issues.
 */
export function analyzeDataWeaveDocument(
  document: vscode.TextDocument,
  isApikitContext = false
): vscode.Diagnostic[] {
  const text = document.getText();
  const cfg = getResolvedConfig(document.uri);
  const rootPath = getWorkspaceRootForUri(document.uri);
  const relPath = rootPath ? path.relative(rootPath, document.fileName) : document.fileName;
  if (!cfg.lintFixtures && isFixtureDwlFile(relPath, text)) {
    return [];
  }

  const diags = analyzeDataWeaveSlice(document, text, 0, {
    minDepth: cfg.nullSafetyMinDepth,
    maxPerFile: cfg.nullSafetyMaxPerFile,
    isApikitContext,
  });
  return capDiagnostics(document, diags, cfg.nullSafetyMaxPerFile);
}

/**
 * Analyzes inline DataWeave scripts inside <ee:transform> blocks in a Mule XML document.
 */
export function analyzeDataWeaveInXml(
  document: vscode.TextDocument,
  maskedXmlText: string,
  isApikitContext = false
): vscode.Diagnostic[] {
  const rawXmlText = document.getText();
  const cfg = getResolvedConfig(document.uri);
  const options: DataWeaveCheckOptions = {
    minDepth: cfg.nullSafetyMinDepth,
    maxPerFile: cfg.nullSafetyMaxPerFile,
    isApikitContext: isApikitContext || /<apikit:router(?=[\s/>])/i.test(maskedXmlText),
  };

  const diagnostics: vscode.Diagnostic[] = [];
  const transformOpenRegex = /<ee:transform(?=[\s>])/gi;

  let transformMatch: RegExpExecArray | null;
  while ((transformMatch = transformOpenRegex.exec(maskedXmlText)) !== null) {
    const transformTagStart = transformMatch.index;
    const transformTagEnd = findTagEnd(maskedXmlText, transformTagStart);
    if (transformTagEnd === -1) {
      break;
    }
    if (maskedXmlText[transformTagEnd - 1] === '/') {
      transformOpenRegex.lastIndex = transformTagEnd + 1;
      continue;
    }

    const transformCloseRegex = /<\/ee:transform\s*>/gi;
    transformCloseRegex.lastIndex = transformTagEnd + 1;
    const transformCloseMatch = transformCloseRegex.exec(maskedXmlText);
    if (!transformCloseMatch) {
      transformOpenRegex.lastIndex = transformTagEnd + 1;
      continue;
    }

    const transformBodyStart = transformTagEnd + 1;
    const transformBodyEnd = transformCloseMatch.index;
    const targetOpenRegex =
      /<ee:(?:set-payload|set-variable|set-attributes)(?=[\s>])/gi;
    targetOpenRegex.lastIndex = transformBodyStart;

    let targetMatch: RegExpExecArray | null;
    while (
      (targetMatch = targetOpenRegex.exec(maskedXmlText)) !== null &&
      targetMatch.index < transformBodyEnd
    ) {
      const targetTagStart = targetMatch.index;
      const targetTagEnd = findTagEnd(maskedXmlText, targetTagStart);
      if (targetTagEnd === -1 || targetTagEnd >= transformBodyEnd) {
        break;
      }
      if (maskedXmlText[targetTagEnd - 1] === '/') {
        targetOpenRegex.lastIndex = targetTagEnd + 1;
        continue;
      }

      const tagNameMatch = /^<(ee:(?:set-payload|set-variable|set-attributes))/i.exec(
        maskedXmlText.slice(targetTagStart, targetTagEnd + 1)
      );
      if (!tagNameMatch) {
        targetOpenRegex.lastIndex = targetTagEnd + 1;
        continue;
      }

      const closeTagRegex = new RegExp(`</${tagNameMatch[1]}\\s*>`, 'gi');
      closeTagRegex.lastIndex = targetTagEnd + 1;
      const closeTargetMatch = closeTagRegex.exec(maskedXmlText);
      if (!closeTargetMatch || closeTargetMatch.index > transformBodyEnd) {
        targetOpenRegex.lastIndex = targetTagEnd + 1;
        continue;
      }

      const innerStart = targetTagEnd + 1;
      const innerEnd = closeTargetMatch.index;
      const maskedInner = maskedXmlText.slice(innerStart, innerEnd);
      const cdataRegex = /<!\[CDATA\[([\s\S]*?)\]\]>/gi;

      let cdataMatch: RegExpExecArray | null;
      let foundCdata = false;
      while ((cdataMatch = cdataRegex.exec(maskedInner)) !== null) {
        foundCdata = true;
        const cdataContentStart = innerStart + cdataMatch.index + '<![CDATA['.length;
        const cdataContentEnd = cdataContentStart + cdataMatch[1].length;
        const rawCdataSlice = rawXmlText.slice(cdataContentStart, cdataContentEnd);
        diagnostics.push(
          ...analyzeDataWeaveSlice(document, rawCdataSlice, cdataContentStart, options)
        );
      }

      if (!foundCdata) {
        diagnostics.push(
          ...analyzeDataWeaveSlice(document, maskedInner, innerStart, options)
        );
      }

      targetOpenRegex.lastIndex = closeTargetMatch.index + closeTargetMatch[0].length;
    }

    transformOpenRegex.lastIndex =
      transformCloseMatch.index + transformCloseMatch[0].length;
  }

  return capDiagnostics(document, diagnostics, cfg.nullSafetyMaxPerFile);
}
