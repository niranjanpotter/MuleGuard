import * as vscode from 'vscode';

export const COST_SOURCE = 'MuleGuard';

export const COST_RULE_CODES = {
  ForeachRemoteCall: 'MG007',
  DebugLogger: 'MG008',
} as const;

const EXPENSIVE_CALL_IN_FOREACH_REGEX = /<(?:db:select|http:request)(?=[\s/>])/gi;
const LOGGER_TAG_REGEX = /<(?:[\w-]+:)?logger(?=[\s/>])/gi;
const DEBUG_LEVEL_REGEX = /\blevel\s*=\s*(?:"DEBUG"|'DEBUG')/i;

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

/**
 * Finds the matching closing </foreach> offset for an opening <foreach> body,
 * tracking nested <foreach> blocks so inner calls are reported only once.
 */
function findMatchingForeachClose(text: string, bodyStart: number): number {
  const tokenRegex = /<foreach(?=[\s>])|<\/foreach\s*>/gi;
  tokenRegex.lastIndex = bodyStart;
  let depth = 1;

  let tokenMatch: RegExpExecArray | null;
  while ((tokenMatch = tokenRegex.exec(text)) !== null) {
    if (tokenMatch[0].startsWith('</')) {
      depth--;
      if (depth === 0) {
        return tokenMatch.index;
      }
      continue;
    }

    const nestedTagEnd = findTagEnd(text, tokenMatch.index);
    if (nestedTagEnd === -1) {
      return -1;
    }
    if (text[nestedTagEnd - 1] !== '/') {
      depth++;
    }
    tokenRegex.lastIndex = nestedTagEnd + 1;
  }

  return -1;
}

/**
 * Analyzes CloudHub vCore / logging cost anti-patterns in Mule XML files.
 */
export function analyzeCostIssues(
  document: vscode.TextDocument,
  maskedXmlText: string
): vscode.Diagnostic[] {
  const diagnostics: vscode.Diagnostic[] = [];

  // Rule MG007: <db:select> or <http:request> inside <foreach>
  const foreachOpenRegex = /<foreach(?=[\s>])/gi;
  let foreachMatch: RegExpExecArray | null;
  while ((foreachMatch = foreachOpenRegex.exec(maskedXmlText)) !== null) {
    const openEnd = findTagEnd(maskedXmlText, foreachMatch.index);
    if (openEnd === -1) {
      break;
    }
    if (maskedXmlText[openEnd - 1] === '/') {
      foreachOpenRegex.lastIndex = openEnd + 1;
      continue;
    }

    const bodyStart = openEnd + 1;
    const bodyEnd = findMatchingForeachClose(maskedXmlText, bodyStart);
    if (bodyEnd === -1) {
      foreachOpenRegex.lastIndex = bodyStart;
      continue;
    }

    const foreachBody = maskedXmlText.slice(bodyStart, bodyEnd);
    EXPENSIVE_CALL_IN_FOREACH_REGEX.lastIndex = 0;

    let callMatch: RegExpExecArray | null;
    while ((callMatch = EXPENSIVE_CALL_IN_FOREACH_REGEX.exec(foreachBody)) !== null) {
      const callStart = bodyStart + callMatch.index;
      const callTagEnd = findTagEnd(maskedXmlText, callStart);
      const callEnd =
        callTagEnd !== -1 ? callTagEnd + 1 : callStart + callMatch[0].length;

      const diagnostic = new vscode.Diagnostic(
        new vscode.Range(
          document.positionAt(callStart),
          document.positionAt(callEnd)
        ),
        'vCore Cost Alert: DB/HTTP inside foreach will 10x cost. Use Batch',
        vscode.DiagnosticSeverity.Error
      );
      diagnostic.source = COST_SOURCE;
      diagnostic.code = COST_RULE_CODES.ForeachRemoteCall;
      diagnostics.push(diagnostic);
    }

    foreachOpenRegex.lastIndex = bodyEnd + '</foreach>'.length;
  }

  // Rule MG008: <logger level="DEBUG">
  LOGGER_TAG_REGEX.lastIndex = 0;
  let loggerMatch: RegExpExecArray | null;
  while ((loggerMatch = LOGGER_TAG_REGEX.exec(maskedXmlText)) !== null) {
    const tagStart = loggerMatch.index;
    const tagEnd = findTagEnd(maskedXmlText, tagStart);
    if (tagEnd === -1) {
      break;
    }

    const tagText = maskedXmlText.slice(tagStart, tagEnd + 1);
    if (!DEBUG_LEVEL_REGEX.test(tagText)) {
      LOGGER_TAG_REGEX.lastIndex = tagEnd + 1;
      continue;
    }

    const diagnostic = new vscode.Diagnostic(
      new vscode.Range(
        document.positionAt(tagStart),
        document.positionAt(tagEnd + 1)
      ),
      'Remove DEBUG logger - Increases CloudHub log cost',
      vscode.DiagnosticSeverity.Warning
    );
    diagnostic.source = COST_SOURCE;
    diagnostic.code = COST_RULE_CODES.DebugLogger;
    diagnostics.push(diagnostic);

    LOGGER_TAG_REGEX.lastIndex = tagEnd + 1;
  }

  return diagnostics;
}
