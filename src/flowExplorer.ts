import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { extractFlows, maskXmlComments } from './diagnostics';

export type FlowTreeItemType =
  | 'CATEGORY'
  | 'FILE'
  | 'FLOW'
  | 'SUB_FLOW'
  | 'DWL'
  | 'MUNIT'
  | 'CONFIG';

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
            arguments: [resourceUri, { selection: new vscode.Range(line, 0, line, 0) }]
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
            arguments: [resourceUri, { selection: new vscode.Range(line, 0, line, 0) }]
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
  private _onDidChangeTreeData: vscode.EventEmitter<FlowTreeItem | undefined | void> = new vscode.EventEmitter<FlowTreeItem | undefined | void>();
  readonly onDidChangeTreeData: vscode.Event<FlowTreeItem | undefined | void> = this._onDidChangeTreeData.event;

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

    // Top-Level: Natural MuleSoft Project Structure
    if (!element) {
      const flowsSection = await this._buildFlowsSection();
      const dwlSection = await this._buildDwlSection();
      const munitSection = await this._buildMUnitSection();
      const configSection = await this._buildConfigSection();

      return [
        flowsSection,
        dwlSection,
        munitSection,
        configSection
      ];
    }

    return [];
  }

  /**
   * Section 1: Mule Flows & Sub-Flows
   * Groups flows by their natural source XML file (e.g. main.xml, global.xml, implementation.xml)
   * If there is only one file, it directly lists the flows.
   */
  private async _buildFlowsSection(): Promise<FlowTreeItem> {
    const root = new FlowTreeItem('Mule Flows & Sub-Flows', 'CATEGORY', vscode.TreeItemCollapsibleState.Expanded);
    const xmlUris = await vscode.workspace.findFiles('**/*.xml', '{**/node_modules/**,**/target/**,**/.git/**,**/src/test/**}');

    // Strict deduplication of XML files
    const seenPaths = new Set<string>();
    const fileItems: FlowTreeItem[] = [];
    let totalFlowCount = 0;

    for (const uri of xmlUris) {
      const normPath = path.normalize(uri.fsPath).toLowerCase();
      if (seenPaths.has(normPath)) continue;
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

        // Top-level Flows
        for (const flow of flows) {
          const flowName = flow.name || 'unnamed-flow';
          if (!seenFlowNames.has(flowName)) {
            seenFlowNames.add(flowName);
            const lineNum = content.slice(0, flow.openTagStart).split('\n').length - 1;
            flowChildren.push(new FlowTreeItem(flowName, 'FLOW', vscode.TreeItemCollapsibleState.None, uri, lineNum, 'Flow'));
          }
        }

        // Sub-flows
        const subFlowRegex = /<sub-flow\s+name=["']([^"']+)["']/gi;
        let subMatch: RegExpExecArray | null;
        while ((subMatch = subFlowRegex.exec(masked)) !== null) {
          const subName = subMatch[1];
          if (!seenFlowNames.has(subName)) {
            seenFlowNames.add(subName);
            const lineNum = content.slice(0, subMatch.index).split('\n').length - 1;
            flowChildren.push(new FlowTreeItem(subName, 'SUB_FLOW', vscode.TreeItemCollapsibleState.None, uri, lineNum, 'Sub-Flow'));
          }
        }

        if (flowChildren.length > 0) {
          totalFlowCount += flowChildren.length;
          const fileFolder = new FlowTreeItem(baseName, 'FILE', vscode.TreeItemCollapsibleState.Expanded, uri, 0, `(${flowChildren.length})`);
          fileFolder.children = flowChildren;
          fileItems.push(fileFolder);
        }
      } catch {
        // ignore unreadable files
      }
    }

    // If single file in project, show flows directly under root; otherwise show files with their flows
    if (fileItems.length === 1 && fileItems[0].children) {
      root.children = fileItems[0].children;
    } else {
      root.children = fileItems.length > 0 ? fileItems : [new FlowTreeItem('No flows discovered', 'FLOW', vscode.TreeItemCollapsibleState.None)];
    }

    root.description = `(${totalFlowCount})`;
    return root;
  }

  /**
   * Section 2: DataWeave Transformations (.dwl)
   * Strictly lists all real project .dwl files (from src/main/resources/dwl or workspace) without duplicates.
   */
  private async _buildDwlSection(): Promise<FlowTreeItem> {
    const root = new FlowTreeItem('DataWeave Transformations (.dwl)', 'CATEGORY', vscode.TreeItemCollapsibleState.Collapsed);
    const dwlUris = await vscode.workspace.findFiles('**/*.dwl', '{**/node_modules/**,**/target/**,**/.git/**}');

    const seen = new Set<string>();
    const items: FlowTreeItem[] = [];

    for (const u of dwlUris) {
      const norm = path.normalize(u.fsPath).toLowerCase();
      if (!seen.has(norm)) {
        seen.add(norm);
        items.push(new FlowTreeItem(path.basename(u.fsPath), 'DWL', vscode.TreeItemCollapsibleState.None, u));
      }
    }

    root.children = items.length > 0 ? items : [new FlowTreeItem('No .dwl files found', 'DWL', vscode.TreeItemCollapsibleState.None)];
    root.description = `(${items.length})`;
    return root;
  }

  /**
   * Section 3: MUnit Test Suites
   * Strictly lists MUnit XML files from src/test/munit without duplicates.
   */
  private async _buildMUnitSection(): Promise<FlowTreeItem> {
    const root = new FlowTreeItem('MUnit Test Suites', 'CATEGORY', vscode.TreeItemCollapsibleState.Collapsed);
    const munitUris = await vscode.workspace.findFiles('**/src/test/munit/**/*.xml', '{**/node_modules/**,**/target/**,**/.git/**}');

    const seen = new Set<string>();
    const items: FlowTreeItem[] = [];

    for (const u of munitUris) {
      const norm = path.normalize(u.fsPath).toLowerCase();
      if (!seen.has(norm)) {
        seen.add(norm);
        items.push(new FlowTreeItem(path.basename(u.fsPath), 'MUNIT', vscode.TreeItemCollapsibleState.None, u));
      }
    }

    root.children = items.length > 0 ? items : [new FlowTreeItem('No MUnit test suites found', 'MUNIT', vscode.TreeItemCollapsibleState.None)];
    root.description = `(${items.length})`;
    return root;
  }

  /**
   * Section 4: Environment Configs
   * Strictly lists real configuration files from src/main/resources (e.g. dev.yaml, prod.yaml) with ZERO duplicates.
   */
  private async _buildConfigSection(): Promise<FlowTreeItem> {
    const root = new FlowTreeItem('Environment Configs', 'CATEGORY', vscode.TreeItemCollapsibleState.Collapsed);
    const configUris = await vscode.workspace.findFiles('**/*.{yaml,properties}', '{**/node_modules/**,**/target/**,**/.git/**}');

    const seenPaths = new Set<string>();
    const seenFileNames = new Set<string>();
    const items: FlowTreeItem[] = [];

    for (const u of configUris) {
      const normPath = path.normalize(u.fsPath).toLowerCase();
      const baseName = path.basename(u.fsPath);

      // Deduplicate both by absolute path and by filename to ensure zero repeats
      if (!seenPaths.has(normPath) && !seenFileNames.has(baseName.toLowerCase())) {
        seenPaths.add(normPath);
        seenFileNames.add(baseName.toLowerCase());
        items.push(new FlowTreeItem(baseName, 'CONFIG', vscode.TreeItemCollapsibleState.None, u));
      }
    }

    root.children = items.length > 0 ? items : [new FlowTreeItem('No environment YAMLs found', 'CONFIG', vscode.TreeItemCollapsibleState.None)];
    root.description = `(${items.length})`;
    return root;
  }
}
