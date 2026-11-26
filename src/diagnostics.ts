import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { analyzeBestPractices } from './bestPracticeRules';
import { analyzeCostIssues } from './costAnalyzer';
import {
  analyzeDataWeaveDocument,
  analyzeDataWeaveInXml,
} from './dataweaveChecker';
import { filterSuppressedDiagnostics } from './suppressions';

export const MULEGUARD_SOURCE = 'MuleGuard';

export enum RuleCode {
  HardcodedSecret = 'MG001',
  MissingErrorHandler = 'MG002',
  MissingLogger = 'MG003',
  MissingValidation = 'MG004',
  MissingMUnit = 'MG005',
  DataWeaveNullSafety = 'MG006',
  ForeachRemoteCall = 'MG007',
  DebugLogger = 'MG008',
}

export interface MuleFlow {
  name: string;
  openTagStart: number;
  openTagEnd: number;
  bodyStart: number;
  bodyEnd: number;
  body: string;
}

interface MUnitTestFile {
  fileName: string;
  content: string;
}

const IGNORED_PATH_SEGMENTS = /(?:^|[/\\])(node_modules|target|out|dist|\.git)(?:[/\\]|$)/i;
const WORKSPACE_EXCLUDE_GLOB = '{**/node_modules/**,**/target/**,**/out/**,**/dist/**,**/.git/**}';

const SECRET_ATTRIBUTE_REGEX =
  /\b(password|clientSecret|clientId|client_secret|client_id|client-secret|client-id)\s*=\s*(["'])([^"']*)\2/gi;

const PROPERTY_PLACEHOLDER_REGEX = /^\$\{[^}]+\}$/;
const DATAWEAVE_EXPRESSION_REGEX = /^#\[[\s\S]+\]$/;

const MUNIT_PATH_REGEX = /[/\\]src[/\\]test[/\\]munit[/\\]/i;
const MUNIT_TAG_REGEX = /<munit:(?:config|test)(?=[\s/>])/i;

const ERROR_HANDLER_REGEX =
  /<error-handler(?=[\s/>])|<on-error-propagate(?=[\s/>])|<on-error-continue(?=[\s/>])/i;
const LOGGER_REGEX = /<(?:[\w-]+:)?logger(?=[\s/>])/i;
const HTTP_LISTENER_REGEX = /<http:listener(?=[\s/>])/i;
const VALIDATION_REGEX =
  /<(?:validation:[\w-]+|json:validate-schema|xml-module:validate-schema|apikit:router)(?=[\s/>])/i;

/**
 * Returns whether MuleGuard static diagnostics are enabled in user/workspace settings.
 */
export function isEnabled(): boolean {
  return vscode.workspace.getConfiguration('muleguard').get<boolean>('enable', true);
}

/**
 * Returns true if the document is an XML file eligible for MuleGuard scanning.
 */
export function isScannableXmlDocument(document: vscode.TextDocument): boolean {
  const isXml =
    document.languageId === 'xml' || document.fileName.toLowerCase().endsWith('.xml');
  if (!isXml) {
    return false;
  }

  return !IGNORED_PATH_SEGMENTS.test(document.fileName);
}

/**
 * Returns true if the document is a DataWeave (.dwl) file eligible for MuleGuard scanning.
 */
export function isScannableDwlDocument(document: vscode.TextDocument): boolean {
  const isDwl =
    document.languageId === 'dataweave' ||
    document.languageId === 'dwl' ||
    document.fileName.toLowerCase().endsWith('.dwl');
  if (!isDwl) {
    return false;
  }

  return !IGNORED_PATH_SEGMENTS.test(document.fileName);
}

/**
 * Returns true if the document is any MuleGuard-supported file (.xml or .dwl).
 */
export function isScannableDocument(document: vscode.TextDocument): boolean {
  return isScannableXmlDocument(document) || isScannableDwlDocument(document);
}

/**
 * Replaces XML comments with spaces while preserving line breaks and exact character offsets.
 */
export function maskXmlComments(text: string): string {
  return text.replace(/<!--[\s\S]*?(?:-->|$)/g, (comment) =>
    comment.replace(/[^\r\n]/g, ' ')
  );
}

/**
 * Finds the index of the closing '>' for an XML tag starting at tagStart, ignoring quotes.
 */
export function findTagEnd(text: string, tagStart: number): number {
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
 * Extracts non-self-closing <flow>...</flow> blocks with exact offsets.
 * Uses a lookahead instead of \b so hyphenated tags like <flow-ref> are never matched.
 */
export function extractFlows(maskedText: string): MuleFlow[] {
  const flows: MuleFlow[] = [];
  const openTagRegex = /<flow(?=[\s>])/gi;

  let match: RegExpExecArray | null;
  while ((match = openTagRegex.exec(maskedText)) !== null) {
    const openTagStart = match.index;
    const openTagEnd = findTagEnd(maskedText, openTagStart);
    if (openTagEnd === -1) {
      break;
    }

    // Skip self-closing <flow .../> tags.
    if (maskedText[openTagEnd - 1] === '/') {
      openTagRegex.lastIndex = openTagEnd + 1;
      continue;
    }

    const openTagText = maskedText.slice(openTagStart, openTagEnd + 1);
    const nameMatch = /\bname\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(openTagText);
    const flowName = (nameMatch?.[1] ?? nameMatch?.[2] ?? '').trim();

    const bodyStart = openTagEnd + 1;
    const closeTagRegex = /<\/flow\s*>/gi;
    closeTagRegex.lastIndex = bodyStart;
    const closeMatch = closeTagRegex.exec(maskedText);
    if (!closeMatch) {
      openTagRegex.lastIndex = bodyStart;
      continue;
    }

    const bodyEnd = closeMatch.index;
    flows.push({
      name: flowName,
      openTagStart,
      openTagEnd,
      bodyStart,
      bodyEnd,
      body: maskedText.slice(bodyStart, bodyEnd),
    });

    openTagRegex.lastIndex = closeMatch.index + closeMatch[0].length;
  }

  return flows;
}

function createDiagnostic(
  range: vscode.Range,
  message: string,
  severity: vscode.DiagnosticSeverity,
  code: RuleCode
): vscode.Diagnostic {
  const diagnostic = new vscode.Diagnostic(range, message, severity);
  diagnostic.source = MULEGUARD_SOURCE;
  diagnostic.code = code;
  return diagnostic;
}

function isDynamicExpression(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return true;
  }
  return (
    PROPERTY_PLACEHOLDER_REGEX.test(trimmed) || DATAWEAVE_EXPRESSION_REGEX.test(trimmed)
  );
}

/**
 * Rule 1 (MG001): Detects hardcoded secrets in XML attributes.
 */
function checkHardcodedSecrets(
  document: vscode.TextDocument,
  maskedText: string
): vscode.Diagnostic[] {
  const diagnostics: vscode.Diagnostic[] = [];
  SECRET_ATTRIBUTE_REGEX.lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = SECRET_ATTRIBUTE_REGEX.exec(maskedText)) !== null) {
    const rawValue = match[3] ?? '';
    if (isDynamicExpression(rawValue)) {
      continue;
    }

    const start = document.positionAt(match.index);
    const end = document.positionAt(match.index + match[0].length);
    diagnostics.push(
      createDiagnostic(
        new vscode.Range(start, end),
        'MuleGuard: Hardcoded secret found - Use secure property ${...}',
        vscode.DiagnosticSeverity.Error,
        RuleCode.HardcodedSecret
      )
    );
  }

  return diagnostics;
}

function isMUnitDocument(document: vscode.TextDocument, maskedText: string): boolean {
  return MUNIT_PATH_REGEX.test(document.fileName) || MUNIT_TAG_REGEX.test(maskedText);
}

function getCandidateMUnitDirs(document: vscode.TextDocument): string[] {
  const candidates = new Set<string>();
  const filePath = document.fileName;

  const muleMainMatch = /^(.*?)[/\\]src[/\\]main[/\\]mule(?:[/\\]|$)/i.exec(filePath);
  if (muleMainMatch?.[1]) {
    candidates.add(path.resolve(muleMainMatch[1], 'src', 'test', 'munit'));
  }

  const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
  if (workspaceFolder) {
    candidates.add(path.resolve(workspaceFolder.uri.fsPath, 'src', 'test', 'munit'));
  }

  return Array.from(candidates);
}

function collectXmlFilesRecursively(dirPath: string, results: MUnitTestFile[]): void {
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
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      collectXmlFilesRecursively(fullPath, results);
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.xml')) {
      try {
        const content = fs.readFileSync(fullPath, 'utf8');
        results.push({ fileName: entry.name, content });
      } catch {
        // Ignore unreadable test files during static scan.
      }
    }
  }
}

function loadMUnitTestFiles(document: vscode.TextDocument): MUnitTestFile[] {
  const files: MUnitTestFile[] = [];
  for (const dir of getCandidateMUnitDirs(document)) {
    collectXmlFilesRecursively(dir, files);
  }
  return files;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function hasMUnitCoverageForFlow(
  flowName: string,
  sourceBaseName: string,
  munitFiles: MUnitTestFile[]
): boolean {
  if (munitFiles.length === 0) {
    return false;
  }

  const targetName = flowName || sourceBaseName;
  if (!targetName) {
    return false;
  }

  const lowerTarget = targetName.toLowerCase();
  const quotedNameRegex = flowName
    ? new RegExp(`name\\s*=\\s*["']${escapeRegExp(flowName)}["']`, 'i')
    : null;

  return munitFiles.some((file) => {
    if (file.fileName.toLowerCase().includes(lowerTarget)) {
      return true;
    }
    return quotedNameRegex ? quotedNameRegex.test(file.content) : false;
  });
}

/**
 * Analyzes a single TextDocument (.xml or .dwl) and returns all MuleGuard diagnostics.
 */
export function analyzeDocument(document: vscode.TextDocument): vscode.Diagnostic[] {
  if (isScannableDwlDocument(document)) {
    const rawDiagnostics = analyzeDataWeaveDocument(document);
    return filterSuppressedDiagnostics(rawDiagnostics, document.getText(), true);
  }

  const rawText = document.getText();
  const maskedText = maskXmlComments(rawText);
  const diagnostics: vscode.Diagnostic[] = [];

  // Rule 1 applies to all XML files, including MUnit configs.
  diagnostics.push(...checkHardcodedSecrets(document, maskedText));

  // Rules 2-8 apply to Mule application XML, not MUnit test suites themselves.
  if (isMUnitDocument(document, maskedText)) {
    return filterSuppressedDiagnostics(diagnostics, rawText, false);
  }

  const flows = extractFlows(maskedText);
  if (flows.length > 0) {
    const munitFiles = loadMUnitTestFiles(document);
    const sourceBaseName = path.basename(
      document.fileName,
      path.extname(document.fileName)
    );

    for (const flow of flows) {
      const flowHeaderRange = new vscode.Range(
        document.positionAt(flow.openTagStart),
        document.positionAt(flow.openTagEnd + 1)
      );

      // Rule 2 (MG002): Missing error handler
      if (!ERROR_HANDLER_REGEX.test(flow.body)) {
        diagnostics.push(
          createDiagnostic(
            flowHeaderRange,
            'MuleGuard: Flow has no error handler',
            vscode.DiagnosticSeverity.Warning,
            RuleCode.MissingErrorHandler
          )
        );
      }

      // Rule 3 (MG003): Missing logger
      if (!LOGGER_REGEX.test(flow.body)) {
        diagnostics.push(
          createDiagnostic(
            flowHeaderRange,
            'MuleGuard: Add logger at start of flow',
            vscode.DiagnosticSeverity.Warning,
            RuleCode.MissingLogger
          )
        );
      }

      // Rule 4 (MG004): HTTP listener without payload validation
      const listenerMatch = HTTP_LISTENER_REGEX.exec(flow.body);
      if (listenerMatch && !VALIDATION_REGEX.test(flow.body)) {
        const listenerStart = flow.bodyStart + listenerMatch.index;
        const listenerTagEnd = findTagEnd(maskedText, listenerStart);
        const listenerEnd =
          listenerTagEnd !== -1
            ? listenerTagEnd + 1
            : listenerStart + listenerMatch[0].length;

        diagnostics.push(
          createDiagnostic(
            new vscode.Range(
              document.positionAt(listenerStart),
              document.positionAt(listenerEnd)
            ),
            'MuleGuard: Add validation for incoming payload',
            vscode.DiagnosticSeverity.Information,
            RuleCode.MissingValidation
          )
        );
      }

      // Rule 5 (MG005): Missing MUnit test coverage
      if (!hasMUnitCoverageForFlow(flow.name, sourceBaseName, munitFiles)) {
        diagnostics.push(
          createDiagnostic(
            flowHeaderRange,
            'MuleGuard: No MUnit test found',
            vscode.DiagnosticSeverity.Warning,
            RuleCode.MissingMUnit
          )
        );
      }
    }
  }

  // Pro rules: DataWeave null safety inside <ee:transform> & CloudHub vCore cost guards.
  diagnostics.push(...analyzeDataWeaveInXml(document, maskedText));
  diagnostics.push(...analyzeCostIssues(document, maskedText));

  // Expanded Best Practice (BP) and Security (S) rules
  diagnostics.push(...analyzeBestPractices(document, maskedText, flows));

  return filterSuppressedDiagnostics(diagnostics, rawText, false);
}

/**
 * Scans a document and updates its entry in the diagnostic collection.
 */
export function scanDocument(
  document: vscode.TextDocument,
  collection: vscode.DiagnosticCollection
): void {
  if (!isEnabled()) {
    collection.delete(document.uri);
    return;
  }

  if (!isScannableDocument(document)) {
    return;
  }

  const diagnostics = analyzeDocument(document);
  collection.set(document.uri, diagnostics);
}

/**
 * Counts the total number of diagnostics currently stored in the collection.
 */
export function countTotalIssues(collection: vscode.DiagnosticCollection): number {
  let total = 0;
  collection.forEach((_uri, diagnostics) => {
    total += diagnostics.length;
  });
  return total;
}

/**
 * Scans all XML and DWL files in the current workspace and populates the diagnostic collection.
 */
export async function scanWorkspace(
  collection: vscode.DiagnosticCollection
): Promise<{ filesScanned: number; totalIssues: number }> {
  if (!isEnabled()) {
    collection.clear();
    return { filesScanned: 0, totalIssues: 0 };
  }

  collection.clear();

  const uris = await vscode.workspace.findFiles(
    '**/*.{xml,dwl}',
    WORKSPACE_EXCLUDE_GLOB
  );

  let filesScanned = 0;
  for (const uri of uris) {
    try {
      const document = await vscode.workspace.openTextDocument(uri);
      if (isScannableDocument(document)) {
        const diagnostics = analyzeDocument(document);
        collection.set(document.uri, diagnostics);
        filesScanned++;
      }
    } catch {
      // Skip files that cannot be opened as text documents.
    }
  }

  return {
    filesScanned,
    totalIssues: countTotalIssues(collection),
  };
}
