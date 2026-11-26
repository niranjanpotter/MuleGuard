import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { extractFlows, maskXmlComments } from './diagnostics';

export type FlowTreeItemType =
  | 'API_LED_LAYER'
  | 'API_MODULE'
  | 'FLOW'
  | 'SUB_FLOW'
  | 'DWL'
  | 'MUNIT'
  | 'CONFIG'
  | 'CATEGORY';

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
      case 'API_LED_LAYER':
        this.contextValue = 'apiLedLayer';
        if (label.includes('Experience')) {
          this.iconPath = new vscode.ThemeIcon('cloud');
        } else if (label.includes('Process')) {
          this.iconPath = new vscode.ThemeIcon('git-merge');
        } else if (label.includes('System')) {
          this.iconPath = new vscode.ThemeIcon('database');
        } else {
          this.iconPath = new vscode.ThemeIcon('layers');
        }
        break;
      case 'API_MODULE':
        this.contextValue = 'apiModule';
        this.iconPath = new vscode.ThemeIcon('package');
        this.tooltip = `Mule API Module: ${label}`;
        break;
      case 'CATEGORY':
        this.contextValue = 'category';
        this.iconPath = new vscode.ThemeIcon('folder');
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

    // Level 0: Top-Level Architectural Views
    if (!element) {
      // Analyze project API files to group by API / Connectivity name
      const apiModules = await this._buildApiModules();
      const expLayer = new FlowTreeItem('Experience APIs (eAPI)', 'API_LED_LAYER', vscode.TreeItemCollapsibleState.Collapsed, undefined, undefined, 'Client App Ingress & Channels');
      const prcLayer = new FlowTreeItem('Process APIs (pAPI)', 'API_LED_LAYER', vscode.TreeItemCollapsibleState.Collapsed, undefined, undefined, 'Business Logic, Orchestration & Aggregation');
      const sysLayer = new FlowTreeItem('System APIs (sAPI)', 'API_LED_LAYER', vscode.TreeItemCollapsibleState.Collapsed, undefined, undefined, 'Underlying System of Record & Connectors');

      // Partition apiModules into Experience, Process, System or Default
      const expChildren: FlowTreeItem[] = [];
      const prcChildren: FlowTreeItem[] = [];
      const sysChildren: FlowTreeItem[] = [];
      const generalChildren: FlowTreeItem[] = [];

      for (const mod of apiModules) {
        const lower = mod.label.toLowerCase();
        if (lower.includes('exp') || lower.includes('mobile') || lower.includes('web') || lower.includes('channel')) {
          expChildren.push(mod);
        } else if (lower.includes('prc') || lower.includes('process') || lower.includes('order') || lower.includes('sync')) {
          prcChildren.push(mod);
        } else if (lower.includes('sys') || lower.includes('db') || lower.includes('sap') || lower.includes('sf') || lower.includes('salesforce')) {
          sysChildren.push(mod);
        } else {
          generalChildren.push(mod);
        }
      }

      expLayer.children = expChildren.length > 0 ? expChildren : [new FlowTreeItem('No dedicated eAPIs', 'API_MODULE', vscode.TreeItemCollapsibleState.None)];
      prcLayer.children = prcChildren.length > 0 ? prcChildren : [new FlowTreeItem('No dedicated pAPIs', 'API_MODULE', vscode.TreeItemCollapsibleState.None)];
      sysLayer.children = sysChildren.length > 0 ? sysChildren : [new FlowTreeItem('No dedicated sAPIs', 'API_MODULE', vscode.TreeItemCollapsibleState.None)];

      const rootModules = new FlowTreeItem('📦 API Modules & Connectors (Project View)', 'CATEGORY', vscode.TreeItemCollapsibleState.Expanded);
      rootModules.children = apiModules;

      const apiLedRoot = new FlowTreeItem('🌐 API-Led Architecture Layers', 'CATEGORY', vscode.TreeItemCollapsibleState.Expanded);
      apiLedRoot.children = [expLayer, prcLayer, sysLayer];

      const globalConfigs = await this._buildGlobalConfigs();
      const testSuites = await this._buildMUnitSuites();

      return [
        rootModules,
        apiLedRoot,
        globalConfigs,
        testSuites
      ];
    }

    return [];
  }

  /**
   * Builds API Modules by grouping XML flow files into API Packages with their related
   * Flows, Sub-Flows, and DataWeave transformations.
   */
  private async _buildApiModules(): Promise<FlowTreeItem[]> {
    const modules: FlowTreeItem[] = [];
    const xmlUris = await vscode.workspace.findFiles('**/*.xml', '**/node_modules/**');

    // Collect all DWL files
    const dwlUris = await vscode.workspace.findFiles('**/*.dwl', '**/node_modules/**');
    const munitUris = await vscode.workspace.findFiles('**/src/test/munit/**/*.xml', '**/node_modules/**');

    for (const uri of xmlUris) {
      if (uri.fsPath.includes('src/test/munit') || uri.fsPath.includes('src\\test\\munit')) {
        continue;
      }

      const baseName = path.basename(uri.fsPath, path.extname(uri.fsPath));
      if (baseName.toLowerCase() === 'pom') continue;

      try {
        const content = fs.readFileSync(uri.fsPath, 'utf8');
        const masked = maskXmlComments(content);
        const flows = extractFlows(masked);

        const flowItems: FlowTreeItem[] = [];
        const seenFlows = new Set<string>();
        for (const flow of flows) {
          const flowName = flow.name || 'unnamed-flow';
          if (!seenFlows.has(flowName.toLowerCase())) {
            seenFlows.add(flowName.toLowerCase());
            const lines = content.slice(0, flow.openTagStart).split('\n');
            const lineNum = lines.length - 1;
            flowItems.push(new FlowTreeItem(flowName, 'FLOW', vscode.TreeItemCollapsibleState.None, uri, lineNum, '⚡ Flow'));
          }
        }

        // Sub-flows with deduplication
        const subFlowRegex = /<sub-flow\s+name=["']([^"']+)["']/gi;
        let subMatch: RegExpExecArray | null;
        while ((subMatch = subFlowRegex.exec(masked)) !== null) {
          const subName = subMatch[1];
          if (!seenFlows.has(subName.toLowerCase())) {
            seenFlows.add(subName.toLowerCase());
            const lines = content.slice(0, subMatch.index).split('\n');
            const lineNum = lines.length - 1;
            flowItems.push(new FlowTreeItem(subName, 'SUB_FLOW', vscode.TreeItemCollapsibleState.None, uri, lineNum, '↪ Sub-Flow'));
          }
        }

        // Associated DWL files (matching name or referenced inside XML) with deduplication
        const dwlItems: FlowTreeItem[] = [];
        const seenDwl = new Set<string>();
        for (const dwlUri of dwlUris) {
          const dwlName = path.basename(dwlUri.fsPath);
          if (!seenDwl.has(dwlName.toLowerCase()) && (content.includes(dwlName) || dwlName.toLowerCase().includes(baseName.toLowerCase()))) {
            seenDwl.add(dwlName.toLowerCase());
            dwlItems.push(new FlowTreeItem(dwlName, 'DWL', vscode.TreeItemCollapsibleState.None, dwlUri, undefined, 'DataWeave Transform'));
          }
        }

        // Associated MUnit tests
        const testItems: FlowTreeItem[] = [];
        for (const tUri of munitUris) {
          const tName = path.basename(tUri.fsPath);
          if (tName.toLowerCase().includes(baseName.toLowerCase())) {
            testItems.push(new FlowTreeItem(tName, 'MUNIT', vscode.TreeItemCollapsibleState.None, tUri, undefined, 'MUnit Suite'));
          }
        }

        // Create API Module folder
        const moduleItem = new FlowTreeItem(
          `${baseName} API`,
          'API_MODULE',
          vscode.TreeItemCollapsibleState.Expanded,
          uri,
          0,
          `${flowItems.length} flow(s)`
        );

        const flowsCat = new FlowTreeItem(`Flows & Processors (${flowItems.length})`, 'CATEGORY', vscode.TreeItemCollapsibleState.Expanded);
        flowsCat.children = flowItems.length > 0 ? flowItems : [new FlowTreeItem('No flows in this file', 'FLOW', vscode.TreeItemCollapsibleState.None)];

        const dwlCat = new FlowTreeItem(`Transformations (${dwlItems.length})`, 'CATEGORY', vscode.TreeItemCollapsibleState.Collapsed);
        dwlCat.children = dwlItems.length > 0 ? dwlItems : [new FlowTreeItem('Inline transforms only', 'DWL', vscode.TreeItemCollapsibleState.None)];

        const testCat = new FlowTreeItem(`MUnit Coverage (${testItems.length})`, 'CATEGORY', vscode.TreeItemCollapsibleState.Collapsed);
        testCat.children = testItems.length > 0 ? testItems : [new FlowTreeItem('No matching MUnit suite', 'MUNIT', vscode.TreeItemCollapsibleState.None)];

        moduleItem.children = [flowsCat, dwlCat, testCat];
        modules.push(moduleItem);
      } catch {
        // ignore unreadable files
      }
    }

    return modules;
  }

  private async _buildGlobalConfigs(): Promise<FlowTreeItem> {
    const configRoot = new FlowTreeItem('⚙️ Global Configurations & Environments', 'CATEGORY', vscode.TreeItemCollapsibleState.Collapsed);
    const configUris = await vscode.workspace.findFiles('**/*.{yaml,properties}', '{**/node_modules/**,**/target/**,**/.git/**}');
    
    // Strict deduplication by normalized lowercase path and file name
    const seenPaths = new Set<string>();
    const seenNames = new Set<string>();
    const items: FlowTreeItem[] = [];

    for (const u of configUris) {
      const normalizedPath = path.normalize(u.fsPath).toLowerCase();
      const baseName = path.basename(u.fsPath);
      
      // Prevent both physical path and duplicate file name duplication
      if (!seenPaths.has(normalizedPath) && !seenNames.has(baseName.toLowerCase())) {
        seenPaths.add(normalizedPath);
        seenNames.add(baseName.toLowerCase());
        items.push(new FlowTreeItem(baseName, 'CONFIG', vscode.TreeItemCollapsibleState.None, u, undefined, 'Configuration'));
      }
    }

    configRoot.children = items.length > 0 ? items : [new FlowTreeItem('No configuration files', 'CONFIG', vscode.TreeItemCollapsibleState.None)];
    return configRoot;
  }

  private async _buildMUnitSuites(): Promise<FlowTreeItem> {
    const testRoot = new FlowTreeItem('🧪 Test Automation & MUnit Suites', 'CATEGORY', vscode.TreeItemCollapsibleState.Collapsed);
    const munitUris = await vscode.workspace.findFiles('**/src/test/munit/**/*.xml', '{**/node_modules/**,**/target/**,**/.git/**}');
    
    // Strict deduplication
    const seen = new Set<string>();
    const items: FlowTreeItem[] = [];

    for (const u of munitUris) {
      const baseName = path.basename(u.fsPath);
      if (!seen.has(baseName.toLowerCase())) {
        seen.add(baseName.toLowerCase());
        items.push(new FlowTreeItem(baseName, 'MUNIT', vscode.TreeItemCollapsibleState.None, u, undefined, 'Test Suite'));
      }
    }

    testRoot.children = items.length > 0 ? items : [new FlowTreeItem('No MUnit test suites found', 'MUNIT', vscode.TreeItemCollapsibleState.None)];
    return testRoot;
  }
}
