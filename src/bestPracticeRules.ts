import * as vscode from 'vscode';
import { findTagEnd, MuleFlow } from './diagnostics';

export enum BPRuleCode {
  FlowNameNotKebab = 'BP-01',
  SubFlowNameNotKebab = 'BP-02',
  HardcodedPort = 'BP-03',
  CommentedOutCode = 'BP-05',
  TooManyComponents = 'BP-06',
  MissingDocName = 'BP-07',
  Mule3Syntax = 'BP-08',
  EmptyFlow = 'BP-09',
  BrokenFlowRef = 'BP-10',
  HttpWithoutHttps = 'S-01',
  InsecureTrustStore = 'S-02',
  WildcardCors = 'S-03',
  BasicAuthNotSecure = 'S-06',
  TraceLogger = 'S-07',
}

// ── Helpers ──────────────────────────────────────────────────────────

const KEBAB_CASE = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

const PROPERTY_PLACEHOLDER = /^\$\{[^}]+\}$/;
const DATAWEAVE_EXPR = /^#\[[\s\S]+\]$/;

function isExternalised(value: string): boolean {
  return PROPERTY_PLACEHOLDER.test(value) || DATAWEAVE_EXPR.test(value);
}

function makeDiag(
  document: vscode.TextDocument,
  offset: number,
  length: number,
  message: string,
  code: string,
  severity: vscode.DiagnosticSeverity = vscode.DiagnosticSeverity.Warning,
): vscode.Diagnostic {
  const range = new vscode.Range(
    document.positionAt(offset),
    document.positionAt(offset + length),
  );
  const diag = new vscode.Diagnostic(range, message, severity);
  diag.source = 'MuleGuard';
  diag.code = code;
  return diag;
}

/** Count direct XML child elements inside a body string. */
function countDirectChildElements(body: string): number {
  let count = 0;
  let depth = 0;
  const tagRegex = /<\/?([a-zA-Z][\w:.-]*)/g;
  let m: RegExpExecArray | null;

  while ((m = tagRegex.exec(body)) !== null) {
    const isClosing = body[m.index + 1] === '/';

    if (isClosing) {
      depth = Math.max(0, depth - 1);
    } else {
      if (depth === 0) {
        count++;
      }
      // Check for self-closing: scan to the closing '>' and see if preceded by '/'
      const end = findTagEnd(body, m.index);
      if (end !== -1 && body[end - 1] === '/') {
        // self-closing — don't increase depth
      } else if (!isClosing) {
        depth++;
      }
    }
  }
  return count;
}

// ── Main analysis ────────────────────────────────────────────────────

export function analyzeBestPractices(
  document: vscode.TextDocument,
  maskedText: string,
  flows: MuleFlow[],
): vscode.Diagnostic[] {
  const diagnostics: vscode.Diagnostic[] = [];
  const originalText = document.getText();

  checkKebabCaseNames(document, maskedText, diagnostics);
  checkHardcodedPort(document, maskedText, diagnostics);
  checkCommentedOutCode(document, originalText, diagnostics);
  checkTooManyComponents(document, maskedText, flows, diagnostics);
  checkMissingDocName(document, maskedText, diagnostics);
  checkMule3Syntax(document, maskedText, diagnostics);
  checkEmptyFlow(document, maskedText, flows, diagnostics);
  checkBrokenFlowRef(document, maskedText, flows, diagnostics);

  checkHttpWithoutHttps(document, maskedText, diagnostics);
  checkInsecureTrustStore(document, maskedText, diagnostics);
  checkWildcardCors(document, maskedText, diagnostics);
  checkBasicAuthNotSecure(document, maskedText, diagnostics);
  checkTraceLogger(document, maskedText, diagnostics);

  return diagnostics;
}

// ── BP-01 / BP-02: Kebab-case flow and sub-flow names ────────────────

function checkKebabCaseNames(
  document: vscode.TextDocument,
  maskedText: string,
  diagnostics: vscode.Diagnostic[],
): void {
  const patterns: { regex: RegExp; code: BPRuleCode; label: string }[] = [
    { regex: /<flow\s+[^>]*?\bname\s*=\s*"([^"]*)"/gi, code: BPRuleCode.FlowNameNotKebab, label: 'Flow' },
    { regex: /<sub-flow\s+[^>]*?\bname\s*=\s*"([^"]*)"/gi, code: BPRuleCode.SubFlowNameNotKebab, label: 'Sub-flow' },
  ];

  for (const { regex, code, label } of patterns) {
    let m: RegExpExecArray | null;
    while ((m = regex.exec(maskedText)) !== null) {
      const name = m[1];
      if (!KEBAB_CASE.test(name)) {
        diagnostics.push(
          makeDiag(
            document,
            m.index,
            m[0].length,
            `MuleGuard: ${label} name "${name}" is not kebab-case`,
            code,
          ),
        );
      }
    }
  }
}

// ── BP-03: Hardcoded port ────────────────────────────────────────────

function checkHardcodedPort(
  document: vscode.TextDocument,
  maskedText: string,
  diagnostics: vscode.Diagnostic[],
): void {
  const regex = /\bport\s*=\s*"([^"]*)"/gi;
  let m: RegExpExecArray | null;

  while ((m = regex.exec(maskedText)) !== null) {
    const value = m[1];
    if (/^\d+$/.test(value) && !isExternalised(value)) {
      diagnostics.push(
        makeDiag(
          document,
          m.index,
          m[0].length,
          `MuleGuard: Port is hardcoded to "${value}". Use a property placeholder instead`,
          BPRuleCode.HardcodedPort,
        ),
      );
    }
  }
}

// ── BP-05: Commented-out code ────────────────────────────────────────

function checkCommentedOutCode(
  document: vscode.TextDocument,
  originalText: string,
  diagnostics: vscode.Diagnostic[],
): void {
  const commentRegex = /<!--([\s\S]*?)-->/g;
  let m: RegExpExecArray | null;

  while ((m = commentRegex.exec(originalText)) !== null) {
    const body = m[1];
    // Check if the comment body contains what looks like an XML tag
    if (/<[a-zA-Z][\w:.-]*/.test(body)) {
      diagnostics.push(
        makeDiag(
          document,
          m.index,
          m[0].length,
          'MuleGuard: Comment appears to contain commented-out XML code',
          BPRuleCode.CommentedOutCode,
        ),
      );
    }
  }
}

// ── BP-06: Too many components ───────────────────────────────────────

function checkTooManyComponents(
  document: vscode.TextDocument,
  _maskedText: string,
  flows: MuleFlow[],
  diagnostics: vscode.Diagnostic[],
): void {
  const MAX_COMPONENTS = 15;
  for (const flow of flows) {
    const count = countDirectChildElements(flow.body);
    if (count > MAX_COMPONENTS) {
      diagnostics.push(
        makeDiag(
          document,
          flow.openTagStart,
          flow.openTagEnd - flow.openTagStart + 1,
          `MuleGuard: Flow has too many components (${count} > ${MAX_COMPONENTS} max)`,
          BPRuleCode.TooManyComponents,
        ),
      );
    }
  }
}

// ── BP-07: Missing doc:name on key elements ──────────────────────────

function checkMissingDocName(
  document: vscode.TextDocument,
  maskedText: string,
  diagnostics: vscode.Diagnostic[],
): void {
  const tags = ['http:request', 'ee:transform', 'db:select', 'db:insert', 'db:update', 'db:delete'];
  for (const tag of tags) {
    const regex = new RegExp(`<${escapeRegex(tag)}(?=[\\s/>])`, 'gi');
    let m: RegExpExecArray | null;

    while ((m = regex.exec(maskedText)) !== null) {
      const tagEnd = findTagEnd(maskedText, m.index);
      if (tagEnd === -1) { continue; }

      const tagText = maskedText.slice(m.index, tagEnd + 1);
      if (!/\bdoc:name\s*=/.test(tagText)) {
        diagnostics.push(
          makeDiag(
            document,
            m.index,
            tagEnd - m.index + 1,
            `MuleGuard: <${tag}> is missing a doc:name attribute`,
            BPRuleCode.MissingDocName,
          ),
        );
      }
    }
  }
}

// ── BP-08: Mule 3 deprecated syntax ─────────────────────────────────

function checkMule3Syntax(
  document: vscode.TextDocument,
  maskedText: string,
  diagnostics: vscode.Diagnostic[],
): void {
  const deprecatedTags = [
    'message-properties-transformer',
    'set-session-variable',
    'copy-properties',
    'message-filter',
    'expression-component',
  ];

  for (const tag of deprecatedTags) {
    const regex = new RegExp(`<${escapeRegex(tag)}(?=[\\s/>])`, 'gi');
    let m: RegExpExecArray | null;

    while ((m = regex.exec(maskedText)) !== null) {
      const tagEnd = findTagEnd(maskedText, m.index);
      const len = tagEnd !== -1 ? tagEnd - m.index + 1 : m[0].length;
      diagnostics.push(
        makeDiag(
          document,
          m.index,
          len,
          `MuleGuard: <${tag}> is deprecated Mule 3 syntax`,
          BPRuleCode.Mule3Syntax,
        ),
      );
    }
  }
}

// ── BP-09: Empty flow ────────────────────────────────────────────────

function checkEmptyFlow(
  document: vscode.TextDocument,
  _maskedText: string,
  flows: MuleFlow[],
  diagnostics: vscode.Diagnostic[],
): void {
  for (const flow of flows) {
    if (flow.body.trim().length === 0 || !/<[a-zA-Z]/.test(flow.body)) {
      diagnostics.push(
        makeDiag(
          document,
          flow.openTagStart,
          flow.openTagEnd - flow.openTagStart + 1,
          `MuleGuard: Flow "${flow.name}" is empty — it has no components`,
          BPRuleCode.EmptyFlow,
        ),
      );
    }
  }
}

// ── BP-10: Broken flow-ref ───────────────────────────────────────────

function checkBrokenFlowRef(
  document: vscode.TextDocument,
  maskedText: string,
  flows: MuleFlow[],
  diagnostics: vscode.Diagnostic[],
): void {
  // Collect all flow and sub-flow names defined in the file
  const definedNames = new Set<string>();
  for (const f of flows) {
    if (f.name) { definedNames.add(f.name); }
  }
  const subFlowRegex = /<sub-flow\s+[^>]*?\bname\s*=\s*"([^"]*)"/gi;
  let sm: RegExpExecArray | null;
  while ((sm = subFlowRegex.exec(maskedText)) !== null) {
    definedNames.add(sm[1]);
  }

  // Find all flow-ref usages
  const flowRefRegex = /<flow-ref\s+[^>]*?\bname\s*=\s*"([^"]*)"/gi;
  let m: RegExpExecArray | null;
  while ((m = flowRefRegex.exec(maskedText)) !== null) {
    const refName = m[1];
    if (!definedNames.has(refName)) {
      diagnostics.push(
        makeDiag(
          document,
          m.index,
          m[0].length,
          `MuleGuard: flow-ref references "${refName}" which is not defined in this file`,
          BPRuleCode.BrokenFlowRef,
        ),
      );
    }
  }
}

// ── S-01: HTTP without HTTPS ─────────────────────────────────────────

function checkHttpWithoutHttps(
  document: vscode.TextDocument,
  maskedText: string,
  diagnostics: vscode.Diagnostic[],
): void {
  const regex = /<http:listener-config(?=[\s>])/gi;
  let m: RegExpExecArray | null;

  while ((m = regex.exec(maskedText)) !== null) {
    const tagEnd = findTagEnd(maskedText, m.index);
    if (tagEnd === -1) { continue; }

    const isSelfClosing = maskedText[tagEnd - 1] === '/';

    // Look for the connection attributes within the config block
    let searchEnd: number;
    if (isSelfClosing) {
      searchEnd = tagEnd + 1;
    } else {
      const closeIdx = maskedText.indexOf('</http:listener-config', tagEnd);
      searchEnd = closeIdx !== -1 ? closeIdx : tagEnd + 1;
    }

    const block = maskedText.slice(m.index, searchEnd);
    const hasProtocolHttp = /\bprotocol\s*=\s*"HTTP"/i.test(block);
    const hasTlsContext = /<tls:context/i.test(block);

    if (hasProtocolHttp && !hasTlsContext) {
      diagnostics.push(
        makeDiag(
          document,
          m.index,
          tagEnd - m.index + 1,
          'MuleGuard: HTTP listener uses HTTP protocol without TLS — consider using HTTPS',
          BPRuleCode.HttpWithoutHttps,
        ),
      );
    }
  }
}

// ── S-02: Insecure trust store ───────────────────────────────────────

function checkInsecureTrustStore(
  document: vscode.TextDocument,
  maskedText: string,
  diagnostics: vscode.Diagnostic[],
): void {
  const regex = /<tls:trust-store(?=[\s/>])/gi;
  let m: RegExpExecArray | null;

  while ((m = regex.exec(maskedText)) !== null) {
    const tagEnd = findTagEnd(maskedText, m.index);
    if (tagEnd === -1) { continue; }

    const tagText = maskedText.slice(m.index, tagEnd + 1);
    if (/\binsecure\s*=\s*"true"/i.test(tagText)) {
      diagnostics.push(
        makeDiag(
          document,
          m.index,
          tagEnd - m.index + 1,
          'MuleGuard: Trust store is set to insecure — TLS validation is disabled',
          BPRuleCode.InsecureTrustStore,
          vscode.DiagnosticSeverity.Error,
        ),
      );
    }
  }
}

// ── S-03: Wildcard CORS ──────────────────────────────────────────────

function checkWildcardCors(
  document: vscode.TextDocument,
  maskedText: string,
  diagnostics: vscode.Diagnostic[],
): void {
  const regex = /Access-Control-Allow-Origin[^"]*"?\s*\*|Access-Control-Allow-Origin\s*=\s*"\*"/gi;
  let m: RegExpExecArray | null;

  while ((m = regex.exec(maskedText)) !== null) {
    diagnostics.push(
      makeDiag(
        document,
        m.index,
        m[0].length,
        'MuleGuard: Access-Control-Allow-Origin is set to wildcard "*" — restrict to specific origins',
        BPRuleCode.WildcardCors,
      ),
    );
  }
}

// ── S-06: Basic auth credentials not externalised ────────────────────

function checkBasicAuthNotSecure(
  document: vscode.TextDocument,
  maskedText: string,
  diagnostics: vscode.Diagnostic[],
): void {
  const regex = /<http:basic-authentication(?=[\s/>])/gi;
  let m: RegExpExecArray | null;

  while ((m = regex.exec(maskedText)) !== null) {
    const tagEnd = findTagEnd(maskedText, m.index);
    if (tagEnd === -1) { continue; }

    const tagText = maskedText.slice(m.index, tagEnd + 1);
    const credFields = ['username', 'password'];

    for (const field of credFields) {
      const attrMatch = new RegExp(`\\b${field}\\s*=\\s*"([^"]*)"`, 'i').exec(tagText);
      if (attrMatch && !isExternalised(attrMatch[1])) {
        diagnostics.push(
          makeDiag(
            document,
            m.index,
            tagEnd - m.index + 1,
            `MuleGuard: Basic authentication ${field} is hardcoded — use a property placeholder`,
            BPRuleCode.BasicAuthNotSecure,
          ),
        );
      }
    }
  }
}

// ── S-07: TRACE logger ───────────────────────────────────────────────

function checkTraceLogger(
  document: vscode.TextDocument,
  maskedText: string,
  diagnostics: vscode.Diagnostic[],
): void {
  const regex = /<logger\s+[^>]*?\blevel\s*=\s*"TRACE"/gi;
  let m: RegExpExecArray | null;

  while ((m = regex.exec(maskedText)) !== null) {
    const tagEnd = findTagEnd(maskedText, m.index);
    const len = tagEnd !== -1 ? tagEnd - m.index + 1 : m[0].length;
    diagnostics.push(
      makeDiag(
        document,
        m.index,
        len,
        'MuleGuard: TRACE-level logger may expose sensitive data in production',
        BPRuleCode.TraceLogger,
      ),
    );
  }
}

// ── Utilities ────────────────────────────────────────────────────────

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
