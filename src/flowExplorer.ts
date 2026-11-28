import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { getResolvedConfig } from './config';
import { isFixtureDwlFile } from './dataweaveChecker';
import { extractFlows, maskXmlComments } from './diagnostics';

export type FlowTreeItemType =
  | 'CATEGORY'
  | 'FILE'
  | 'FLOW'
  | 'SUB_FLOW'
  | 'DWL'
  | 'FIXTURE'
  | 'MUNIT'
  | 'CONFIG';

const EXPLORER_EXCLUDE_GLOB =
  '{**/node_modules/**,**/target/**,**/.git/**,**/.mule/**,**/.tooling-project/**,**/out/**,**/dist/**}';

export interface DwlDriftEntry {
  relativeName: string;
  referenceEnv: string;
  driftedEnvs: string[];
  identicalEnvs: string[];
}

export interface ProjectLayoutSummary {
  flowFileCount: number;
  flowCount: number;
  dwlByEnv: Map<string, number>;
  sharedDwlCount: number;
  fixtureCount: number;
  fixturesUnderMainResources: number;
  munitCount: number;
  configCount: number;
  driftedDwl: DwlDriftEntry[];
}

export function detectEnvInPath(filePath: string, environments: string[]): string | undefined {
  const segments = filePath.replace(/\\/g, '/').split('/');
  const envSet = new Map<string, string>();
  for (const e of environments) {
    envSet.set(e.toLowerCase(), e);
  }
  for (const seg of segments) {
    const matched = envSet.get(seg.toLowerCase());
    if (matched) {
      return matched;
    }
  }
  // Also match filename prefix like `uat_config.yaml` or `production.yaml`
  const base = path.basename(filePath).toLowerCase();
  for (const [lowerEnv, origEnv] of envSet.entries()) {
    if (
      base.startsWith(`${lowerEnv}_`) ||
      base.startsWith(`${lowerEnv}-`) ||
      base.startsWith(`${lowerEnv}.`)
    ) {
      return origEnv;
    }
  }
  return undefined;
}

function sha1Content(text: string): string {
  return crypto.createHash('sha1').update(text.replace(/\r\n/g, '\n')).digest('hex');
}

export class FlowTreeItem extends vscode.TreeItem {
  public children?: FlowTreeItem[];

  constructor(
    public readonly label: string,
    public readonly itemType: FlowTreeItemType,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly resourceUri?: vscode.Uri,
    public readonly line?: number,
    public readonly descriptionText?: string
  ) {
    super(label, collapsibleState);
    if (descriptionText) {
      this.description = descriptionText;
    }

    switch (itemType) {
      case 'CATEGORY':
        this.contextValue = 'category';
        this.iconPath = new vscode.ThemeIcon('folder');
        break;
      case 'FILE':
        this.contextValue = 'file';
        this.iconPath = new vscode.ThemeIcon('file-code');
        if (resourceUri) {
          this.command = { command: 'vscode.open', title: 'Open File', arguments: [resourceUri] };
        }
        break;
      case 'FLOW':
        this.contextValue = 'flow';
        this.iconPath = new vscode.ThemeIcon('symbol-event');
        this.tooltip = `Mule Flow: ${label}`;
        if (resourceUri && line !== undefined) {
          this.command = {
            command: 'vscode.open',
            title: 'Open Flow',
            arguments: [resourceUri, { selection: new vscode.Range(line, 0, line, 0) }],
          };
        }
        break;
      case 'SUB_FLOW':
        this.contextValue = 'subFlow';
        this.iconPath = new vscode.ThemeIcon('symbol-method');
        this.tooltip = `Mule Sub-Flow: ${label}`;
        if (resourceUri && line !== undefined) {
          this.command = {
            command: 'vscode.open',
            title: 'Open Sub-Flow',
            arguments: [resourceUri, { selection: new vscode.Range(line, 0, line, 0) }],
          };
        }
        break;
      case 'DWL':
        this.contextValue = 'dwl';
        this.iconPath = new vscode.ThemeIcon('code');
        this.tooltip = `DataWeave Transformation: ${label}`;
        if (resourceUri) {
          this.command = { command: 'vscode.open', title: 'Open DWL', arguments: [resourceUri] };
        }
        break;
      case 'FIXTURE':
        this.contextValue = 'fixture';
        this.iconPath = new vscode.ThemeIcon('file-text');
        this.tooltip = `Test Fixture / Sample: ${label}`;
        if (resourceUri) {
          this.command = { command: 'vscode.open', title: 'Open Fixture', arguments: [resourceUri] };
        }
        break;
      case 'MUNIT':
        this.contextValue = 'munit';
        this.iconPath = new vscode.ThemeIcon('beaker');
        this.tooltip = `MUnit Test Suite: ${label}`;
        if (resourceUri) {
          this.command = { command: 'vscode.open', title: 'Open MUnit', arguments: [resourceUri] };
        }
        break;
      case 'CONFIG':
        this.contextValue = 'config';
        this.iconPath = new vscode.ThemeIcon('gear');
        this.tooltip = `Environment Configuration: ${label}`;
        if (resourceUri) {
          this.command = { command: 'vscode.open', title: 'Open Config', arguments: [resourceUri] };
        }
        break;
    }
  }
}

export class FlowExplorerProvider implements vscode.TreeDataProvider<FlowTreeItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<FlowTreeItem | undefined | void> =
    new vscode.EventEmitter<FlowTreeItem | undefined | void>();
  readonly onDidChangeTreeData: vscode.Event<FlowTreeItem | undefined | void> =
    this._onDidChangeTreeData.event;

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: FlowTreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: FlowTreeItem): Promise<FlowTreeItem[]> {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) {
      return [];
    }

    if (element && element.children) {
      return element.children;
    }

    if (!element) {
      const flowsSection = await this._buildFlowsSection();
      const { dwlSection, fixturesSection } = await this._buildDwlAndFixtureSections();
      const munitSection = await this._buildMUnitSection();
      const configSection = await this._buildConfigSection();

      return [flowsSection, dwlSection, fixturesSection, munitSection, configSection];
    }

    return [];
  }

  private async _buildFlowsSection(): Promise<FlowTreeItem> {
    const root = new FlowTreeItem(
      'Mule Flows & Sub-Flows',
      'CATEGORY',
      vscode.TreeItemCollapsibleState.Expanded
    );
    const xmlUris = await vscode.workspace.findFiles(
      '**/*.xml',
      `{**/src/test/**,${EXPLORER_EXCLUDE_GLOB.slice(1, -1)}}`
    );

    const seenPaths = new Set<string>();
    const fileItems: FlowTreeItem[] = [];
    let totalFlowCount = 0;

    for (const uri of xmlUris) {
      const normPath = path.normalize(uri.fsPath).toLowerCase();
      if (seenPaths.has(normPath)) {
        continue;
      }
      seenPaths.add(normPath);

      const baseName = path.basename(uri.fsPath);
      if (baseName.toLowerCase() === 'pom.xml' || baseName.toLowerCase() === 'log4j2.xml') {
        continue;
      }

      try {
        const content = fs.readFileSync(uri.fsPath, 'utf8');
        const masked = maskXmlComments(content);
        const flows = extractFlows(masked);

        const flowChildren: FlowTreeItem[] = [];
        const seenFlowNames = new Set<string>();

        for (const flow of flows) {
          const flowName = flow.name || 'unnamed-flow';
          if (!seenFlowNames.has(flowName)) {
            seenFlowNames.add(flowName);
            const lineNum = content.slice(0, flow.openTagStart).split('\n').length - 1;
            flowChildren.push(
              new FlowTreeItem(flowName, 'FLOW', vscode.TreeItemCollapsibleState.None, uri, lineNum, 'Flow')
            );
          }
        }

        const subFlowRegex = /<sub-flow\s+[^>]*?(?<![\w:-])name\s*=\s*["']([^"']+)["']/gi;
        let subMatch: RegExpExecArray | null;
        while ((subMatch = subFlowRegex.exec(masked)) !== null) {
          const subName = subMatch[1];
          if (!seenFlowNames.has(subName)) {
            seenFlowNames.add(subName);
            const lineNum = content.slice(0, subMatch.index).split('\n').length - 1;
            flowChildren.push(
              new FlowTreeItem(subName, 'SUB_FLOW', vscode.TreeItemCollapsibleState.None, uri, lineNum, 'Sub-Flow')
            );
          }
        }

        if (flowChildren.length > 0) {
          totalFlowCount += flowChildren.length;
          const fileFolder = new FlowTreeItem(
            baseName,
            'FILE',
            vscode.TreeItemCollapsibleState.Expanded,
            uri,
            0,
            `(${flowChildren.length})`
          );
          fileFolder.children = flowChildren;
          fileItems.push(fileFolder);
        }
      } catch {
        // ignore unreadable files
      }
    }

    if (fileItems.length === 1 && fileItems[0].children) {
      root.children = fileItems[0].children;
    } else {
      root.children =
        fileItems.length > 0
          ? fileItems
          : [new FlowTreeItem('No flows discovered', 'FLOW', vscode.TreeItemCollapsibleState.None)];
    }

    root.description = `(${totalFlowCount})`;
    return root;
  }

  private async _buildDwlAndFixtureSections(): Promise<{
    dwlSection: FlowTreeItem;
    fixturesSection: FlowTreeItem;
  }> {
    const cfg = getResolvedConfig();
    const dwlRoot = new FlowTreeItem(
      'DataWeave Transformations (.dwl)',
      'CATEGORY',
      vscode.TreeItemCollapsibleState.Collapsed
    );
    const fixturesRoot = new FlowTreeItem(
      'Test Fixtures & Samples',
      'CATEGORY',
      vscode.TreeItemCollapsibleState.Collapsed
    );

    const dwlUris = await vscode.workspace.findFiles('**/*.dwl', EXPLORER_EXCLUDE_GLOB);
    const munitUris = await vscode.workspace.findFiles('**/src/test/munit/**/*.xml', EXPLORER_EXCLUDE_GLOB);

    // Build map of fixture filename -> MUnit suite filename
    const fixtureToSuite = new Map<string, string>();
    for (const mUri of munitUris) {
      try {
        const mContent = fs.readFileSync(mUri.fsPath, 'utf8');
        const suiteName = path.basename(mUri.fsPath);
        const refMatches = mContent.match(/[A-Za-z0-9_.-]+\.dwl/gi) ?? [];
        for (const ref of refMatches) {
          if (!fixtureToSuite.has(ref.toLowerCase())) {
            fixtureToSuite.set(ref.toLowerCase(), suiteName);
          }
        }
      } catch {
        // ignore
      }
    }

    const seen = new Set<string>();
    const envBuckets = new Map<string, FlowTreeItem[]>();
    const sharedDwl: FlowTreeItem[] = [];
    const fixtureBySuite = new Map<string, FlowTreeItem[]>();
    const unreferencedFixtures: FlowTreeItem[] = [];
    let realDwlCount = 0;
    let fixtureCount = 0;

    for (const u of dwlUris) {
      const norm = path.normalize(u.fsPath).toLowerCase();
      if (seen.has(norm)) {
        continue;
      }
      seen.add(norm);

      let content = '';
      try {
        content = fs.readFileSync(u.fsPath, 'utf8');
      } catch {
        // ignore
      }

      const baseName = path.basename(u.fsPath);
      if (isFixtureDwlFile(u.fsPath, content)) {
        fixtureCount++;
        const suiteName = fixtureToSuite.get(baseName.toLowerCase());
        const item = new FlowTreeItem(
          baseName,
          'FIXTURE',
          vscode.TreeItemCollapsibleState.None,
          u,
          undefined,
          'fixture'
        );
        if (suiteName) {
          const list = fixtureBySuite.get(suiteName) ?? [];
          list.push(item);
          fixtureBySuite.set(suiteName, list);
        } else {
          unreferencedFixtures.push(item);
        }
        continue;
      }

      realDwlCount++;
      const env = detectEnvInPath(u.fsPath, cfg.environments);
      if (env) {
        const list = envBuckets.get(env) ?? [];
        list.push(
          new FlowTreeItem(
            baseName,
            'DWL',
            vscode.TreeItemCollapsibleState.None,
            u,
            undefined,
            `env: ${env}`
          )
        );
        envBuckets.set(env, list);
      } else {
        sharedDwl.push(
          new FlowTreeItem(
            baseName,
            'DWL',
            vscode.TreeItemCollapsibleState.None,
            u,
            undefined,
            'shared'
          )
        );
      }
    }

    if (envBuckets.size > 0) {
      const envFolders: FlowTreeItem[] = [];
      const sortedEnvs = Array.from(envBuckets.keys()).sort((a, b) => {
        const idxA = cfg.environments.findIndex((e) => e.toLowerCase() === a.toLowerCase());
        const idxB = cfg.environments.findIndex((e) => e.toLowerCase() === b.toLowerCase());
        return (idxA === -1 ? 999 : idxA) - (idxB === -1 ? 999 : idxB);
      });
      for (const env of sortedEnvs) {
        const children = envBuckets.get(env)!;
        const folder = new FlowTreeItem(
          env,
          'CATEGORY',
          vscode.TreeItemCollapsibleState.Collapsed,
          undefined,
          undefined,
          `(${children.length})`
        );
        folder.children = children;
        envFolders.push(folder);
      }
      if (sharedDwl.length > 0) {
        const sharedFolder = new FlowTreeItem(
          'shared',
          'CATEGORY',
          vscode.TreeItemCollapsibleState.Collapsed,
          undefined,
          undefined,
          `(${sharedDwl.length})`
        );
        sharedFolder.children = sharedDwl;
        envFolders.push(sharedFolder);
      }
      dwlRoot.children = envFolders;
    } else {
      dwlRoot.children =
        sharedDwl.length > 0
          ? sharedDwl
          : [new FlowTreeItem('No .dwl files found', 'DWL', vscode.TreeItemCollapsibleState.None)];
    }
    dwlRoot.description = `(${realDwlCount})`;

    const fixtureChildren: FlowTreeItem[] = [];
    for (const [suite, items] of fixtureBySuite.entries()) {
      const folder = new FlowTreeItem(
        suite,
        'CATEGORY',
        vscode.TreeItemCollapsibleState.Collapsed,
        undefined,
        undefined,
        `(${items.length})`
      );
      folder.children = items;
      fixtureChildren.push(folder);
    }
    fixtureChildren.push(...unreferencedFixtures);

    fixturesRoot.children =
      fixtureChildren.length > 0
        ? fixtureChildren
        : [new FlowTreeItem('No test fixtures found', 'FIXTURE', vscode.TreeItemCollapsibleState.None)];
    fixturesRoot.description = `(${fixtureCount})`;

    return { dwlSection: dwlRoot, fixturesSection: fixturesRoot };
  }

  private async _buildMUnitSection(): Promise<FlowTreeItem> {
    const root = new FlowTreeItem(
      'MUnit Test Suites',
      'CATEGORY',
      vscode.TreeItemCollapsibleState.Collapsed
    );
    const munitUris = await vscode.workspace.findFiles(
      '**/src/test/munit/**/*.xml',
      EXPLORER_EXCLUDE_GLOB
    );

    const seen = new Set<string>();
    const items: FlowTreeItem[] = [];

    for (const u of munitUris) {
      const norm = path.normalize(u.fsPath).toLowerCase();
      if (!seen.has(norm)) {
        seen.add(norm);
        items.push(
          new FlowTreeItem(path.basename(u.fsPath), 'MUNIT', vscode.TreeItemCollapsibleState.None, u)
        );
      }
    }

    root.children =
      items.length > 0
        ? items
        : [new FlowTreeItem('No MUnit test suites found', 'MUNIT', vscode.TreeItemCollapsibleState.None)];
    root.description = `(${items.length})`;
    return root;
  }

  private async _buildConfigSection(): Promise<FlowTreeItem> {
    const cfg = getResolvedConfig();
    const root = new FlowTreeItem(
      'Environment Configs',
      'CATEGORY',
      vscode.TreeItemCollapsibleState.Collapsed
    );
    const configUris = await vscode.workspace.findFiles(
      '**/*.{yaml,properties}',
      EXPLORER_EXCLUDE_GLOB
    );

    const seenPaths = new Set<string>();
    const seenFileNames = new Set<string>();
    const items: FlowTreeItem[] = [];

    for (const u of configUris) {
      const normPath = path.normalize(u.fsPath).toLowerCase();
      const baseName = path.basename(u.fsPath);

      if (!seenPaths.has(normPath) && !seenFileNames.has(baseName.toLowerCase())) {
        seenPaths.add(normPath);
        seenFileNames.add(baseName.toLowerCase());
        const env = detectEnvInPath(u.fsPath, cfg.environments);
        items.push(
          new FlowTreeItem(
            baseName,
            'CONFIG',
            vscode.TreeItemCollapsibleState.None,
            u,
            undefined,
            env ? `env: ${env}` : undefined
          )
        );
      }
    }

    items.sort((a, b) => {
      const envA = detectEnvInPath(a.resourceUri?.fsPath ?? a.label, cfg.environments);
      const envB = detectEnvInPath(b.resourceUri?.fsPath ?? b.label, cfg.environments);
      const idxA = envA ? cfg.environments.findIndex((e) => e.toLowerCase() === envA.toLowerCase()) : 999;
      const idxB = envB ? cfg.environments.findIndex((e) => e.toLowerCase() === envB.toLowerCase()) : 999;
      if (idxA !== idxB) {
        return idxA - idxB;
      }
      return a.label.localeCompare(b.label);
    });

    root.children =
      items.length > 0
        ? items
        : [new FlowTreeItem('No environment YAMLs found', 'CONFIG', vscode.TreeItemCollapsibleState.None)];
    root.description = `(${items.length})`;
    return root;
  }
}

/**
 * Analyzes workspace DWL layout and cross-environment drift (BP-11).
 */
export async function scanProjectLayout(): Promise<ProjectLayoutSummary> {
  const cfg = getResolvedConfig();
  const dwlUris = await vscode.workspace.findFiles('**/*.dwl', EXPLORER_EXCLUDE_GLOB);

  const dwlByEnv = new Map<string, number>();
  const byFileName = new Map<string, Array<{ env: string; hash: string; uri: vscode.Uri }>>();
  let sharedDwlCount = 0;
  let fixtureCount = 0;
  let fixturesUnderMainResources = 0;

  const seen = new Set<string>();
  for (const u of dwlUris) {
    const norm = path.normalize(u.fsPath).toLowerCase();
    if (seen.has(norm)) {
      continue;
    }
    seen.add(norm);

    let content = '';
    try {
      content = fs.readFileSync(u.fsPath, 'utf8');
    } catch {
      continue;
    }

    if (isFixtureDwlFile(u.fsPath, content)) {
      fixtureCount++;
      if (/src[/\\]main[/\\]resources/i.test(u.fsPath)) {
        fixturesUnderMainResources++;
      }
      continue;
    }

    const env = detectEnvInPath(u.fsPath, cfg.environments);
    if (env) {
      dwlByEnv.set(env, (dwlByEnv.get(env) ?? 0) + 1);
      const key = path.basename(u.fsPath);
      const list = byFileName.get(key) ?? [];
      list.push({ env, hash: sha1Content(content), uri: u });
      byFileName.set(key, list);
    } else {
      sharedDwlCount++;
    }
  }

  const driftedDwl: DwlDriftEntry[] = [];
  for (const [relativeName, copies] of byFileName.entries()) {
    if (copies.length < 2) {
      continue;
    }
    const refCopy =
      copies.find((c) => c.env.toLowerCase() === cfg.referenceEnvironment.toLowerCase()) ??
      copies[0];
    const driftedEnvs: string[] = [];
    const identicalEnvs: string[] = [];

    for (const copy of copies) {
      if (copy.env === refCopy.env) {
        continue;
      }
      if (copy.hash === refCopy.hash) {
        identicalEnvs.push(copy.env);
      } else {
        driftedEnvs.push(copy.env);
      }
    }

    if (driftedEnvs.length > 0) {
      driftedDwl.push({
        relativeName,
        referenceEnv: refCopy.env,
        driftedEnvs,
        identicalEnvs,
      });
    }
  }

  return {
    flowFileCount: 0,
    flowCount: 0,
    dwlByEnv,
    sharedDwlCount,
    fixtureCount,
    fixturesUnderMainResources,
    munitCount: 0,
    configCount: 0,
    driftedDwl,
  };
}

/**
 * Command: Compare a DataWeave script across all detected environment folders.
 */
export async function compareDwlAcrossEnvironments(item?: FlowTreeItem): Promise<void> {
  const cfg = getResolvedConfig();
  const targetPath = item?.resourceUri?.fsPath ?? vscode.window.activeTextEditor?.document.fileName;
  if (!targetPath || !targetPath.toLowerCase().endsWith('.dwl')) {
    void vscode.window.showInformationMessage('Select or open a .dwl file to compare across environments.');
    return;
  }

  const targetName = path.basename(targetPath);
  const allDwl = await vscode.workspace.findFiles(`**/${targetName}`, EXPLORER_EXCLUDE_GLOB);
  if (allDwl.length < 2) {
    void vscode.window.showInformationMessage(`Only 1 copy of ${targetName} found in workspace.`);
    return;
  }

  const copies: Array<{ env: string; hash: string; uri: vscode.Uri }> = [];
  for (const u of allDwl) {
    try {
      const content = fs.readFileSync(u.fsPath, 'utf8');
      const env = detectEnvInPath(u.fsPath, cfg.environments) ?? path.dirname(u.fsPath);
      copies.push({ env, hash: sha1Content(content), uri: u });
    } catch {
      // ignore
    }
  }

  const refCopy =
    copies.find((c) => c.env.toLowerCase() === cfg.referenceEnvironment.toLowerCase()) ??
    copies[0];

  const picks = copies
    .filter((c) => c.uri.fsPath !== refCopy.uri.fsPath)
    .map((c) => ({
      label: `${c.hash === refCopy.hash ? '✅ Identical' : '⚠️ Drifted'} — ${c.env}`,
      description: c.uri.fsPath,
      uri: c.uri,
    }));

  const selected = await vscode.window.showQuickPick(picks, {
    placeHolder: `Compare ${targetName} against reference (${refCopy.env})`,
  });
  if (selected) {
    await vscode.commands.executeCommand(
      'vscode.diff',
      refCopy.uri,
      selected.uri,
      `${targetName}: ${refCopy.env} ↔ ${selected.label}`
    );
  }
}
