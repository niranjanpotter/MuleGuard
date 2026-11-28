import * as path from 'path';
import * as vscode from 'vscode';
import { runGenerateBadgeCommand } from './badgeGenerator';
import { createBaseline, invalidateBaselineCache } from './baseline';
import { executeCodeReviewWorkflow } from './codeReviewEngine';
import { invalidateConfigCache } from './config';
import {
  isEnabled,
  isScannableDocument,
  scanDocument,
  scanWorkspace,
} from './diagnostics';
import { MuleGuardFixProvider, fixAllInDocument } from './fixProvider';
import { runGenerateFlowDocsCommand } from './flowDocGenerator';
import { compareDwlAcrossEnvironments, FlowExplorerProvider } from './flowExplorer';
import { FlowVisualizerPanel } from './flowVisualizer';
import { MuleGuardHoverProvider, MULE_XML_SELECTOR } from './hoverProvider';
import { DataWeaveHoverProvider, DATAWEAVE_SELECTOR } from './dataweaveHoverProvider';
import { explainDataWeaveFile } from './dataweaveExplainer';
import { ExecutiveReviewPanel } from './executiveReview';
import { calculateComplexityMetrics, compareEnvConfigs, runSecretScanner } from './tooling';
import { scheduleIndexRebuild } from './workspaceIndex';

const CHANGE_DEBOUNCE_MS = 250;
const WORKSPACE_EXCLUDE_GLOB =
  '{**/node_modules/**,**/target/**,**/out/**,**/dist/**,**/.git/**}';

interface IssueSummary {
  total: number;
  errors: number;
  warnings: number;
  infos: number;
}

function summarizeIssues(collection: vscode.DiagnosticCollection): IssueSummary {
  const summary: IssueSummary = {
    total: 0,
    errors: 0,
    warnings: 0,
    infos: 0,
  };

  collection.forEach((_uri, diagnostics) => {
    for (const diag of diagnostics) {
      summary.total++;
      if (diag.severity === vscode.DiagnosticSeverity.Error) {
        summary.errors++;
      } else if (diag.severity === vscode.DiagnosticSeverity.Warning) {
        summary.warnings++;
      } else if (diag.severity === vscode.DiagnosticSeverity.Information) {
        summary.infos++;
      }
    }
  });

  return summary;
}

export function activate(context: vscode.ExtensionContext): void {
  const diagnosticCollection =
    vscode.languages.createDiagnosticCollection('muleguard');

  const statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    100
  );
  statusBarItem.command = 'muleguard.scanWorkspace';

  const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();

  const clearPendingTimer = (uri: vscode.Uri): void => {
    const key = uri.toString();
    const existing = debounceTimers.get(key);
    if (existing !== undefined) {
      clearTimeout(existing);
      debounceTimers.delete(key);
    }
  };

  const clearAllTimers = (): void => {
    for (const timer of debounceTimers.values()) {
      clearTimeout(timer);
    }
    debounceTimers.clear();
  };

  const updateStatusBar = (): void => {
    if (!isEnabled()) {
      statusBarItem.text = '$(shield) MuleGuard Pro: Disabled';
      statusBarItem.tooltip =
        'MuleGuard Pro is disabled. Enable "muleguard.enable" in settings to scan.';
      return;
    }

    const summary = summarizeIssues(diagnosticCollection);
    statusBarItem.text = `$(shield) MuleGuard: ${summary.errors}E / ${summary.warnings}W / ${summary.infos}I`;
    statusBarItem.tooltip = [
      `MuleGuard Static Analysis (${summary.total} issues)`,
      `Errors: ${summary.errors} | Warnings: ${summary.warnings} | Info: ${summary.infos}`,
      'Click to scan workspace',
    ].join('\n');
  };

  const scanAndRefresh = (document: vscode.TextDocument): void => {
    scanDocument(document, diagnosticCollection);
    updateStatusBar();
  };

  const scanOpenDocuments = (): void => {
    for (const document of vscode.workspace.textDocuments) {
      scanDocument(document, diagnosticCollection);
    }
  };

  const runWorkspaceScan = async (): Promise<{
    filesScanned: number;
    totalIssues: number;
  }> => {
    const result = await scanWorkspace(diagnosticCollection);
    updateStatusBar();
    return result;
  };

  const onOpenDisposable = vscode.workspace.onDidOpenTextDocument((document) => {
    scanAndRefresh(document);
  });

  const onSaveDisposable = vscode.workspace.onDidSaveTextDocument((document) => {
    clearPendingTimer(document.uri);
    if (document.fileName.toLowerCase().endsWith('.xml')) {
      scheduleIndexRebuild(() => {
        scanOpenDocuments();
        updateStatusBar();
      });
    }
    scanAndRefresh(document);
  });

  const onChangeDisposable = vscode.workspace.onDidChangeTextDocument((event) => {
    if (event.contentChanges.length === 0 || !isScannableDocument(event.document)) {
      return;
    }

    clearPendingTimer(event.document.uri);
    const key = event.document.uri.toString();
    const timer = setTimeout(() => {
      debounceTimers.delete(key);
      scanAndRefresh(event.document);
    }, CHANGE_DEBOUNCE_MS);
    debounceTimers.set(key, timer);
  });

  const onDeleteDisposable = vscode.workspace.onDidDeleteFiles((event) => {
    for (const uri of event.files) {
      clearPendingTimer(uri);
      diagnosticCollection.delete(uri);
    }
    updateStatusBar();
  });

  const onConfigDisposable = vscode.workspace.onDidChangeConfiguration((event) => {
    if (!event.affectsConfiguration('muleguard')) {
      return;
    }

    invalidateConfigCache();
    invalidateBaselineCache();

    if (!isEnabled()) {
      clearAllTimers();
      diagnosticCollection.clear();
      updateStatusBar();
      return;
    }

    scanOpenDocuments();
    updateStatusBar();
    void runWorkspaceScan().catch((error) => {
      console.error('[MuleGuard Pro] Workspace scan after config change failed:', error);
    });
  });

  const configWatcher = vscode.workspace.createFileSystemWatcher('**/{.muleguard.json,.muleguard-baseline.json}');
  const handleMetaChange = (): void => {
    invalidateConfigCache();
    invalidateBaselineCache();
    if (isEnabled()) {
      void runWorkspaceScan().catch((error) => {
        console.error('[MuleGuard Pro] Rescan after config/baseline change failed:', error);
      });
    }
  };
  configWatcher.onDidChange(handleMetaChange);
  configWatcher.onDidCreate(handleMetaChange);
  configWatcher.onDidDelete(handleMetaChange);

  const codeActionsDisposable = vscode.languages.registerCodeActionsProvider(
    [
      { language: 'xml' },
      { pattern: '**/*.xml' },
      { language: 'dataweave' },
      { language: 'dwl' },
      { pattern: '**/*.dwl' },
    ],
    new MuleGuardFixProvider(),
    { providedCodeActionKinds: MuleGuardFixProvider.providedCodeActionKinds }
  );

  const scanCommandDisposable = vscode.commands.registerCommand(
    'muleguard.scanWorkspace',
    async () => {
      if (!isEnabled()) {
        clearAllTimers();
        diagnosticCollection.clear();
        updateStatusBar();
        void vscode.window.showInformationMessage(
          "MuleGuard Pro is disabled. Enable 'muleguard.enable' in settings to scan."
        );
        return;
      }

      const { filesScanned, totalIssues } = await runWorkspaceScan();
      void vscode.window.showInformationMessage(
        `MuleGuard Pro: Scanned ${filesScanned} file(s) — ${totalIssues} issue(s) found.`
      );
    }
  );

  const fixAllCommandDisposable = vscode.commands.registerCommand(
    'muleguard.fixAll',
    async () => {
      if (!isEnabled()) {
        clearAllTimers();
        diagnosticCollection.clear();
        updateStatusBar();
        void vscode.window.showInformationMessage(
          "MuleGuard Pro is disabled. Enable 'muleguard.enable' in settings to run fixes."
        );
        return;
      }

      const activeDoc = vscode.window.activeTextEditor?.document;
      if (activeDoc && isScannableDocument(activeDoc)) {
        const { fixesApplied, secureYamlUpdated } =
          await fixAllInDocument(activeDoc, true);
        scanAndRefresh(activeDoc);

        if (fixesApplied === 0) {
          void vscode.window.showInformationMessage(
            `MuleGuard Pro: No auto-fixable issues found in ${path.basename(activeDoc.fileName)}.`
          );
          return;
        }

        const yamlNote = secureYamlUpdated
          ? ' Updated src/main/resources/secure.yaml.'
          : '';
        void vscode.window.showInformationMessage(
          `MuleGuard Pro: Applied ${fixesApplied} fix(es) in ${path.basename(activeDoc.fileName)}.${yamlNote}`
        );
        return;
      }

      const uris = await vscode.workspace.findFiles(
        '**/*.{xml,dwl}',
        WORKSPACE_EXCLUDE_GLOB
      );
      let totalFixes = 0;
      let filesFixed = 0;
      let anySecureYaml = false;

      for (const uri of uris) {
        try {
          const doc = await vscode.workspace.openTextDocument(uri);
          if (!isScannableDocument(doc)) {
            continue;
          }
          const result = await fixAllInDocument(doc);
          if (result.fixesApplied > 0) {
            totalFixes += result.fixesApplied;
            filesFixed++;
            if (result.secureYamlUpdated) {
              anySecureYaml = true;
            }
          }
        } catch {
          // Skip files that cannot be opened or updated.
        }
      }

      await runWorkspaceScan();

      if (totalFixes === 0) {
        void vscode.window.showInformationMessage(
          'MuleGuard Pro: No auto-fixable issues found in workspace.'
        );
        return;
      }

      const yamlNote = anySecureYaml
        ? ' Updated src/main/resources/secure.yaml.'
        : '';
      void vscode.window.showInformationMessage(
        `MuleGuard Pro: Applied ${totalFixes} fix(es) across ${filesFixed} file(s).${yamlNote}`
      );
    }
  );

  const hoverDisposable = vscode.languages.registerHoverProvider(
    MULE_XML_SELECTOR,
    new MuleGuardHoverProvider()
  );

  const dwHoverDisposable = vscode.languages.registerHoverProvider(
    DATAWEAVE_SELECTOR,
    new DataWeaveHoverProvider()
  );

  // Register Flow Explorer Tree View
  const flowExplorerProvider = new FlowExplorerProvider();
  const treeViewDisposable = vscode.window.registerTreeDataProvider(
    'muleguardFlowExplorer',
    flowExplorerProvider
  );
  const refreshExplorerDisposable = vscode.commands.registerCommand(
    'muleguard.refreshFlowExplorer',
    () => flowExplorerProvider.refresh()
  );

  // Feature 2: 7-Step Code Review Command
  const codeReviewDisposable = vscode.commands.registerCommand(
    'muleguard.runCodeReview',
    async () => {
      await executeCodeReviewWorkflow();
    }
  );

  // Feature 27: Flow Visualizer
  const visualizeFlowDisposable = vscode.commands.registerCommand(
    'muleguard.visualizeFlow',
    () => {
      const activeDoc = vscode.window.activeTextEditor?.document;
      FlowVisualizerPanel.createOrShow(context.extensionUri, activeDoc);
    }
  );

  // Feature 11: Env Config Diff
  const envDiffDisposable = vscode.commands.registerCommand(
    'muleguard.diffEnvConfigs',
    async () => {
      await compareEnvConfigs();
    }
  );

  // Feature 12: Secret Scanner
  const secretScannerDisposable = vscode.commands.registerCommand(
    'muleguard.scanSecrets',
    async () => {
      await runSecretScanner();
    }
  );

  // Feature 15: Flow Complexity Metrics
  const complexityMetricsDisposable = vscode.commands.registerCommand(
    'muleguard.showComplexityMetrics',
    async () => {
      await calculateComplexityMetrics();
    }
  );

  // Executive Architecture & Delivery Review
  const executiveReviewDisposable = vscode.commands.registerCommand(
    'muleguard.showExecutiveDashboard',
    async () => {
      await ExecutiveReviewPanel.createOrShow(context.extensionUri);
    }
  );

  // DataWeave Logic Explainer
  const explainDwlDisposable = vscode.commands.registerCommand(
    'muleguard.explainDataWeave',
    async () => {
      await explainDataWeaveFile();
    }
  );

  // Baseline Creation
  const createBaselineDisposable = vscode.commands.registerCommand(
    'muleguard.createBaseline',
    async () => {
      await runWorkspaceScan();
      const { entriesCount, filePath } = await createBaseline(diagnosticCollection);
      await runWorkspaceScan();
      void vscode.window.showInformationMessage(
        `MuleGuard: Baseline saved (${entriesCount} finding(s)) to ${filePath ?? '.muleguard-baseline.json'}.`
      );
    }
  );

  // Compare DWL across environments
  const compareDwlDisposable = vscode.commands.registerCommand(
    'muleguard.compareDwlAcrossEnvs',
    async (item) => {
      await compareDwlAcrossEnvironments(item);
    }
  );

  // Flow Documentation Generator
  const generateFlowDocsDisposable = vscode.commands.registerCommand(
    'muleguard.generateFlowDocs',
    async () => {
      await runGenerateFlowDocsCommand();
    }
  );

  // Score Badge Generator
  const generateBadgeDisposable = vscode.commands.registerCommand(
    'muleguard.generateBadge',
    async () => {
      await runGenerateBadgeCommand();
    }
  );

  const timerCleanupDisposable = new vscode.Disposable(() => {
    clearAllTimers();
  });

  statusBarItem.show();
  updateStatusBar();

  if (isEnabled()) {
    scanOpenDocuments();
    updateStatusBar();
    void runWorkspaceScan().catch((error) => {
      console.error('[MuleGuard Pro] Initial workspace scan failed:', error);
    });
  }

  context.subscriptions.push(
    diagnosticCollection,
    statusBarItem,
    onOpenDisposable,
    onSaveDisposable,
    onChangeDisposable,
    onDeleteDisposable,
    onConfigDisposable,
    configWatcher,
    codeActionsDisposable,
    hoverDisposable,
    dwHoverDisposable,
    treeViewDisposable,
    refreshExplorerDisposable,
    codeReviewDisposable,
    visualizeFlowDisposable,
    envDiffDisposable,
    secretScannerDisposable,
    complexityMetricsDisposable,
    executiveReviewDisposable,
    explainDwlDisposable,
    createBaselineDisposable,
    compareDwlDisposable,
    generateFlowDocsDisposable,
    generateBadgeDisposable,
    scanCommandDisposable,
    fixAllCommandDisposable,
    timerCleanupDisposable
  );
}

export function deactivate(): void {
  // All subscriptions and pending timers are cleaned up via context.subscriptions.
}
