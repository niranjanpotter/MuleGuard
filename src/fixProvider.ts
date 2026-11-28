import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { inferDataWeaveDefaultType } from './dataweaveChecker';
import {
  MULEGUARD_SOURCE,
  MuleFlow,
  RuleCode,
  analyzeDocument,
  extractFlows,
  findTagEnd,
  maskXmlComments,
} from './diagnostics';

export interface SecretPropertyEntry {
  key: string;
  value: string;
}

const SECRET_ATTR_VALUE_REGEX = /^([a-zA-Z_][\w-]*)\s*=\s*(["'])([\s\S]*)\2$/;
const EVENT_SOURCE_TAG_REGEX =
  /^(?:http:listener|scheduler|jms:listener|vm:listener|file:listener|sftp:listener|ftp:listener|salesforce:subscribe-topic-listener)$/i;
const DEBUG_LEVEL_ATTR_REGEX = /\blevel\s*=\s*(["'])DEBUG\1/i;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Resolves the target src/main/resources/secure.yaml path for a given Mule document.
 */
export function resolveSecureYamlPath(document: vscode.TextDocument): string {
  const filePath = document.fileName;
  const muleMainMatch = /^(.*?)[/\\]src[/\\]main[/\\]mule(?:[/\\]|$)/i.exec(filePath);
  if (muleMainMatch?.[1]) {
    return path.resolve(muleMainMatch[1], 'src', 'main', 'resources', 'secure.yaml');
  }

  const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
  if (workspaceFolder) {
    return path.resolve(
      workspaceFolder.uri.fsPath,
      'src',
      'main',
      'resources',
      'secure.yaml'
    );
  }

  return path.resolve(path.dirname(filePath), 'src', 'main', 'resources', 'secure.yaml');
}

/**
 * Normalizes XML attribute names (e.g. client_secret, client-secret) into canonical property keys.
 */
export function normalizeSecretKey(attrName: string): string {
  const normalized = attrName.trim().toLowerCase();
  if (normalized === 'password') {
    return 'password';
  }
  if (
    normalized === 'clientsecret' ||
    normalized === 'client_secret' ||
    normalized === 'client-secret'
  ) {
    return 'clientSecret';
  }
  if (
    normalized === 'clientid' ||
    normalized === 'client_id' ||
    normalized === 'client-id'
  ) {
    return 'clientId';
  }
  return attrName.trim();
}

function formatYamlDoubleQuotedValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

/**
 * Inserts or updates key/value entries in a Mule secure.yaml file string.
 */
export function upsertSecureYamlContent(
  existingContent: string,
  entries: SecretPropertyEntry[]
): string {
  const hasContent = existingContent.trim().length > 0;
  const lines = hasContent
    ? existingContent.replace(/\r\n/g, '\n').split('\n')
    : ['# MuleGuard Secure Properties (encrypt values before committing)'];

  // Trim trailing empty line so appended keys don't introduce extra blank lines.
  while (lines.length > 0 && lines[lines.length - 1] === '') {
    lines.pop();
  }

  for (const entry of entries) {
    const escapedValue = formatYamlDoubleQuotedValue(entry.value);
    const replacementLine = `${entry.key}: "${escapedValue}" # TODO: encrypt with Mule Secure Properties Tool`;
    const keyRegex = new RegExp(`^\\s*${escapeRegExp(entry.key)}\\s*:`);

    const existingIndex = lines.findIndex((line) => keyRegex.test(line));
    if (existingIndex !== -1) {
      lines[existingIndex] = replacementLine;
    } else {
      lines.push(replacementLine);
    }
  }

  return `${lines.join('\n')}\n`;
}

function addSecureYamlEdits(
  edit: vscode.WorkspaceEdit,
  yamlPath: string,
  entries: SecretPropertyEntry[]
): void {
  if (entries.length === 0) {
    return;
  }

  const yamlUri = vscode.Uri.file(yamlPath);
  const openDoc = vscode.workspace.textDocuments?.find(
    (doc) => doc.uri.fsPath.toLowerCase() === yamlPath.toLowerCase()
  );

  if (!openDoc && !fs.existsSync(yamlPath)) {
    const content = upsertSecureYamlContent('', entries);
    edit.createFile(yamlUri, {
      ignoreIfExists: true,
      contents: Buffer.from(content, 'utf8'),
    });
    return;
  }

  const existing = openDoc ? openDoc.getText() : fs.readFileSync(yamlPath, 'utf8');
  const updated = upsertSecureYamlContent(existing, entries);
  const existingLines = existing.split(/\r?\n/);
  const endLine = Math.max(0, existingLines.length - 1);
  const endChar = existingLines[endLine]?.length ?? 0;

  edit.replace(
    yamlUri,
    new vscode.Range(new vscode.Position(0, 0), new vscode.Position(endLine, endChar)),
    updated
  );
}

function getLineIndent(document: vscode.TextDocument, offset: number): string {
  const pos = document.positionAt(offset);
  const lineText = document.lineAt(pos.line).text;
  return /^(\s*)/.exec(lineText)?.[1] ?? '';
}

function findFlowForDiagnostic(
  document: vscode.TextDocument,
  diagnostic: vscode.Diagnostic,
  flows: MuleFlow[]
): MuleFlow | undefined {
  const diagStartOffset = document.offsetAt(diagnostic.range.start);
  return flows.find(
    (flow) =>
      diagStartOffset >= flow.openTagStart && diagStartOffset <= flow.openTagEnd + 1
  );
}

function buildErrorHandlerInsertion(
  document: vscode.TextDocument,
  flow: MuleFlow
): { position: vscode.Position; text: string } {
  const flowIndent = getLineIndent(document, flow.openTagStart);
  const childIndent = `${flowIndent}  `;
  const closePos = document.positionAt(flow.bodyEnd);
  const closeLinePrefix = document
    .lineAt(closePos.line)
    .text.slice(0, closePos.character);

  const blockLines = [
    `${childIndent}<error-handler>`,
    `${childIndent}  <on-error-propagate enableNotifications="true" logException="true">`,
    `${childIndent}    <logger level="ERROR" message='#["Error in flow: " ++ (error.description default "Unknown error")]' />`,
    `${childIndent}  </on-error-propagate>`,
    `${childIndent}</error-handler>`,
  ];

  if (/^\s*$/.test(closeLinePrefix)) {
    return {
      position: new vscode.Position(closePos.line, 0),
      text: `${blockLines.join('\n')}\n`,
    };
  }

  return {
    position: closePos,
    text: `\n${blockLines.join('\n')}\n${flowIndent}`,
  };
}

function buildLoggerInsertion(
  document: vscode.TextDocument,
  flow: MuleFlow,
  maskedText: string
): { position: vscode.Position; text: string } {
  const flowIndent = getLineIndent(document, flow.openTagStart);
  const childIndent = `${flowIndent}  `;
  const loggerSnippet = `\n${childIndent}<logger level="INFO" message="Flow started" />`;

  const firstTagMatch = /^\s*<([a-zA-Z_][\w:-]*)(?=[\s/>])/i.exec(flow.body);
  if (firstTagMatch && EVENT_SOURCE_TAG_REGEX.test(firstTagMatch[1])) {
    const tagName = firstTagMatch[1];
    const eventSourceStart = flow.bodyStart + flow.body.indexOf('<');
    const eventSourceTagEnd = findTagEnd(maskedText, eventSourceStart);

    if (eventSourceTagEnd !== -1) {
      let insertOffset = eventSourceTagEnd + 1;

      if (maskedText[eventSourceTagEnd - 1] !== '/') {
        const closeTagRegex = new RegExp(`</${escapeRegExp(tagName)}\\s*>`, 'i');
        const remainingBody = maskedText.slice(eventSourceTagEnd + 1, flow.bodyEnd);
        const closeMatch = closeTagRegex.exec(remainingBody);
        if (closeMatch) {
          insertOffset =
            eventSourceTagEnd + 1 + closeMatch.index + closeMatch[0].length;
        }
      }

      return {
        position: document.positionAt(insertOffset),
        text: loggerSnippet,
      };
    }
  }

  return {
    position: document.positionAt(flow.openTagEnd + 1),
    text: loggerSnippet,
  };
}

function createSecretFixAction(
  document: vscode.TextDocument,
  diagnostic: vscode.Diagnostic
): vscode.CodeAction | undefined {
  const rawAttr = document.getText(diagnostic.range);
  const match = SECRET_ATTR_VALUE_REGEX.exec(rawAttr);
  if (!match) {
    return undefined;
  }

  const attrName = match[1];
  const quote = match[2];
  const secretValue = match[3];
  const key = normalizeSecretKey(attrName);

  const action = new vscode.CodeAction(
    `MuleGuard: Replace with \${secure::${key}} and update secure.yaml`,
    vscode.CodeActionKind.QuickFix
  );
  action.isPreferred = true;
  action.diagnostics = [diagnostic];

  const edit = new vscode.WorkspaceEdit();
  edit.replace(
    document.uri,
    diagnostic.range,
    `${attrName}=${quote}\${secure::${key}}${quote}`
  );
  addSecureYamlEdits(edit, resolveSecureYamlPath(document), [
    { key, value: secretValue },
  ]);
  action.edit = edit;
  return action;
}

function createDataWeaveNullSafetyActions(
  document: vscode.TextDocument,
  diagnostic: vscode.Diagnostic
): vscode.CodeAction[] {
  const expr = document.getText(diagnostic.range);
  const lineText = document.lineAt(diagnostic.range.start.line).text;
  const inferredType = inferDataWeaveDefaultType(expr, lineText);

  const stringAction = new vscode.CodeAction(
    `MuleGuard: Add " default ''" (String)`,
    vscode.CodeActionKind.QuickFix
  );
  stringAction.isPreferred = inferredType === 'string';
  stringAction.diagnostics = [diagnostic];
  const stringEdit = new vscode.WorkspaceEdit();
  stringEdit.insert(document.uri, diagnostic.range.end, " default ''");
  stringAction.edit = stringEdit;

  const numberAction = new vscode.CodeAction(
    'MuleGuard: Add " default 0" (Number)',
    vscode.CodeActionKind.QuickFix
  );
  numberAction.isPreferred = inferredType === 'number';
  numberAction.diagnostics = [diagnostic];
  const numberEdit = new vscode.WorkspaceEdit();
  numberEdit.insert(document.uri, diagnostic.range.end, ' default 0');
  numberAction.edit = numberEdit;

  return inferredType === 'number'
    ? [numberAction, stringAction]
    : [stringAction, numberAction];
}

function createDebugLoggerActions(
  document: vscode.TextDocument,
  diagnostic: vscode.Diagnostic
): vscode.CodeAction[] {
  const actions: vscode.CodeAction[] = [];
  const tagText = document.getText(diagnostic.range);
  const levelMatch = DEBUG_LEVEL_ATTR_REGEX.exec(tagText);

  if (levelMatch) {
    const levelStartOffset =
      document.offsetAt(diagnostic.range.start) + levelMatch.index;
    const levelEndOffset = levelStartOffset + levelMatch[0].length;
    const quote = levelMatch[1];

    const changeAction = new vscode.CodeAction(
      'MuleGuard: Change logger level from DEBUG to INFO',
      vscode.CodeActionKind.QuickFix
    );
    changeAction.isPreferred = true;
    changeAction.diagnostics = [diagnostic];
    const changeEdit = new vscode.WorkspaceEdit();
    changeEdit.replace(
      document.uri,
      new vscode.Range(
        document.positionAt(levelStartOffset),
        document.positionAt(levelEndOffset)
      ),
      `level=${quote}INFO${quote}`
    );
    changeAction.edit = changeEdit;
    actions.push(changeAction);
  }

  const removeAction = new vscode.CodeAction(
    'MuleGuard: Remove DEBUG logger',
    vscode.CodeActionKind.QuickFix
  );
  removeAction.diagnostics = [diagnostic];
  const removeEdit = new vscode.WorkspaceEdit();
  const startLine = document.lineAt(diagnostic.range.start.line);
  if (
    diagnostic.range.start.line === diagnostic.range.end.line &&
    startLine.text.trim() === tagText.trim()
  ) {
    removeEdit.delete(document.uri, startLine.rangeIncludingLineBreak);
  } else {
    removeEdit.delete(document.uri, diagnostic.range);
  }
  removeAction.edit = removeEdit;
  actions.push(removeAction);

  return actions;
}

/**
 * Provides one-click Quick Fixes for MuleGuard security, reliability, DataWeave, and cost diagnostics.
 */
export class MuleGuardFixProvider implements vscode.CodeActionProvider {
  public static readonly providedCodeActionKinds = [
    vscode.CodeActionKind.QuickFix,
  ];

  public provideCodeActions(
    document: vscode.TextDocument,
    _range: vscode.Range | vscode.Selection,
    context: vscode.CodeActionContext
  ): vscode.CodeAction[] {
    const muleGuardDiagnostics = context.diagnostics.filter(
      (diag) => diag.source === MULEGUARD_SOURCE
    );
    if (muleGuardDiagnostics.length === 0) {
      return [];
    }

    const needsFlowLookup = muleGuardDiagnostics.some(
      (diag) =>
        diag.code === RuleCode.MissingErrorHandler ||
        diag.code === RuleCode.MissingLogger
    );

    const maskedText = needsFlowLookup
      ? maskXmlComments(document.getText())
      : '';
    const flows = needsFlowLookup ? extractFlows(maskedText) : [];
    const actions: vscode.CodeAction[] = [];

    for (const diagnostic of muleGuardDiagnostics) {
      switch (diagnostic.code) {
        case RuleCode.HardcodedSecret: {
          const action = createSecretFixAction(document, diagnostic);
          if (action) {
            actions.push(action);
          }
          break;
        }
        case RuleCode.MissingErrorHandler: {
          const flow = findFlowForDiagnostic(document, diagnostic, flows);
          if (flow) {
            const action = new vscode.CodeAction(
              'MuleGuard: Insert <error-handler> at end of flow',
              vscode.CodeActionKind.QuickFix
            );
            action.isPreferred = true;
            action.diagnostics = [diagnostic];
            const insertion = buildErrorHandlerInsertion(document, flow);
            const edit = new vscode.WorkspaceEdit();
            edit.insert(document.uri, insertion.position, insertion.text);
            action.edit = edit;
            actions.push(action);
          }
          break;
        }
        case RuleCode.MissingLogger: {
          const flow = findFlowForDiagnostic(document, diagnostic, flows);
          if (flow) {
            const action = new vscode.CodeAction(
              'MuleGuard: Insert <logger> at start of flow',
              vscode.CodeActionKind.QuickFix
            );
            action.isPreferred = true;
            action.diagnostics = [diagnostic];
            const insertion = buildLoggerInsertion(document, flow, maskedText);
            const edit = new vscode.WorkspaceEdit();
            edit.insert(document.uri, insertion.position, insertion.text);
            action.edit = edit;
            actions.push(action);
          }
          break;
        }
        case RuleCode.DataWeaveNullSafety: {
          actions.push(...createDataWeaveNullSafetyActions(document, diagnostic));
          break;
        }
        case RuleCode.DebugLogger: {
          actions.push(...createDebugLoggerActions(document, diagnostic));
          break;
        }
        default:
          break;
      }
    }

    return actions;
  }
}

function isApikitRouteFlowName(flowName: string): boolean {
  return /^(get|post|put|patch|delete|head|options):\\/i.test(flowName);
}

/**
 * Applies all safe auto-fixes across a single .xml or .dwl document in one atomic WorkspaceEdit.
 */
export async function fixAllInDocument(
  document: vscode.TextDocument,
  previewAndConfirm = false
): Promise<{ fixesApplied: number; secureYamlUpdated: boolean }> {
  const diagnostics = analyzeDocument(document);
  if (diagnostics.length === 0) {
    return { fixesApplied: 0, secureYamlUpdated: false };
  }

  const edit = new vscode.WorkspaceEdit();
  const secretEntries: SecretPropertyEntry[] = [];
  const fixedErrorHandlerFlows = new Set<number>();
  const fixedLoggerFlows = new Set<number>();

  const needsFlowLookup = diagnostics.some(
    (diag) =>
      diag.code === RuleCode.MissingErrorHandler ||
      diag.code === RuleCode.MissingLogger
  );
  const rawText = document.getText();
  const maskedText = needsFlowLookup ? maskXmlComments(rawText) : '';
  const flows = needsFlowLookup ? extractFlows(maskedText) : [];

  let fixesApplied = 0;

  for (const diagnostic of diagnostics) {
    switch (diagnostic.code) {
      case RuleCode.HardcodedSecret: {
        const rawAttr = document.getText(diagnostic.range);
        const match = SECRET_ATTR_VALUE_REGEX.exec(rawAttr);
        if (match) {
          const attrName = match[1];
          const quote = match[2];
          const secretValue = match[3];
          const key = normalizeSecretKey(attrName);

          edit.replace(
            document.uri,
            diagnostic.range,
            `${attrName}=${quote}\${secure::${key}}${quote}`
          );
          secretEntries.push({ key, value: secretValue });
          fixesApplied++;
        }
        break;
      }
      case RuleCode.MissingErrorHandler: {
        const flow = findFlowForDiagnostic(document, diagnostic, flows);
        if (flow && !isApikitRouteFlowName(flow.name) && !fixedErrorHandlerFlows.has(flow.openTagStart)) {
          fixedErrorHandlerFlows.add(flow.openTagStart);
          const insertion = buildErrorHandlerInsertion(document, flow);
          edit.insert(document.uri, insertion.position, insertion.text);
          fixesApplied++;
        }
        break;
      }
      case RuleCode.MissingLogger: {
        const flow = findFlowForDiagnostic(document, diagnostic, flows);
        if (flow && !isApikitRouteFlowName(flow.name) && !fixedLoggerFlows.has(flow.openTagStart)) {
          fixedLoggerFlows.add(flow.openTagStart);
          const insertion = buildLoggerInsertion(document, flow, maskedText);
          edit.insert(document.uri, insertion.position, insertion.text);
          fixesApplied++;
        }
        break;
      }
      case RuleCode.DataWeaveNullSafety: {
        const expr = document.getText(diagnostic.range);
        const lineText = document.lineAt(diagnostic.range.start.line).text;
        const inferred = inferDataWeaveDefaultType(expr, lineText);
        const suffix = inferred === 'number' ? ' default 0' : " default ''";
        edit.insert(document.uri, diagnostic.range.end, suffix);
        fixesApplied++;
        break;
      }
      case RuleCode.DebugLogger: {
        const tagText = document.getText(diagnostic.range);
        const levelMatch = DEBUG_LEVEL_ATTR_REGEX.exec(tagText);
        if (levelMatch) {
          const levelStartOffset =
            document.offsetAt(diagnostic.range.start) + levelMatch.index;
          const levelEndOffset = levelStartOffset + levelMatch[0].length;
          const quote = levelMatch[1];
          edit.replace(
            document.uri,
            new vscode.Range(
              document.positionAt(levelStartOffset),
              document.positionAt(levelEndOffset)
            ),
            `level=${quote}INFO${quote}`
          );
          fixesApplied++;
        }
        break;
      }
      default:
        break;
    }
  }

  if (fixesApplied === 0) {
    return { fixesApplied: 0, secureYamlUpdated: false };
  }

  if (previewAndConfirm) {
    const docEdits = edit.get(document.uri);
    let previewText = rawText;
    const sortedTextEdits = [...docEdits].sort(
      (a, b) => document.offsetAt(b.range.start) - document.offsetAt(a.range.start)
    );
    for (const te of sortedTextEdits) {
      const startOff = document.offsetAt(te.range.start);
      const endOff = document.offsetAt(te.range.end);
      previewText = previewText.slice(0, startOff) + te.newText + previewText.slice(endOff);
    }

    const previewDoc = await vscode.workspace.openTextDocument({
      content: previewText,
      language: document.languageId,
    });
    await vscode.commands.executeCommand(
      'vscode.diff',
      document.uri,
      previewDoc.uri,
      `MuleGuard Fix All Preview: ${path.basename(document.fileName)} (${fixesApplied} fixes)`
    );
    const choice = await vscode.window.showInformationMessage(
      `Apply ${fixesApplied} MuleGuard auto-fix(es) to ${path.basename(document.fileName)}?`,
      { modal: false },
      'Apply Fixes'
    );
    if (choice !== 'Apply Fixes') {
      return { fixesApplied: 0, secureYamlUpdated: false };
    }
  }

  const secureYamlUpdated = secretEntries.length > 0;
  if (secureYamlUpdated) {
    addSecureYamlEdits(edit, resolveSecureYamlPath(document), secretEntries);
  }

  const applied = await vscode.workspace.applyEdit(edit);
  if (!applied) {
    return { fixesApplied: 0, secureYamlUpdated: false };
  }

  return { fixesApplied, secureYamlUpdated };
}
