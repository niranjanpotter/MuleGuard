import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { extractFlows, maskXmlComments } from './diagnostics';

export type FlowTreeItemType = 'CATEGORY' | 'FLOW' | 'SUB_FLOW' | 'DWL' | 'MUNIT' | 'CONFIG';

export class FlowTreeItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly itemType: FlowTreeItemType,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly resourceUri?: vscode.Uri,
    public readonly line?: number
  ) {
    super(label, collapsibleState);

    switch (itemType) {
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
        this.tooltip = `DataWeave: ${label}`;
        if (resourceUri) {
          this.command = { command: 'vscode.open', title: 'Open DWL', arguments: [resourceUri] };
        }
        break;
      case 'MUNIT':
        this.contextValue = 'munit';
        this.iconPath = new vscode.ThemeIcon('beaker');
        this.tooltip = `MUnit Test: ${label}`;
        if (resourceUri) {
          this.command = { command: 'vscode.open', title: 'Open MUnit', arguments: [resourceUri] };
        }
        break;
      case 'CONFIG':
        this.contextValue = 'config';
        this.iconPath = new vscode.ThemeIcon('gear');
        this.tooltip = `Environment Config: ${label}`;
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

    const rootPath = folders[0].uri.fsPath;

    // Root level categories
    if (!element) {
      return [
        new FlowTreeItem('Mule Flows & Sub-Flows', 'CATEGORY', vscode.TreeItemCollapsibleState.Expanded),
        new FlowTreeItem('DataWeave Transformations (.dwl)', 'CATEGORY', vscode.TreeItemCollapsibleState.Collapsed),
        new FlowTreeItem('MUnit Test Suites', 'CATEGORY', vscode.TreeItemCollapsibleState.Collapsed),
        new FlowTreeItem('Environment Configs', 'CATEGORY', vscode.TreeItemCollapsibleState.Collapsed)
      ];
    }

    if (element.label === 'Mule Flows & Sub-Flows') {
      const items: FlowTreeItem[] = [];
      const xmlUris = await vscode.workspace.findFiles('**/*.xml', '**/node_modules/**');

      for (const uri of xmlUris) {
        if (uri.fsPath.includes('src/test/munit') || uri.fsPath.includes('src\\test\\munit')) {
          continue;
        }
        try {
          const content = fs.readFileSync(uri.fsPath, 'utf8');
          const masked = maskXmlComments(content);
          const flows = extractFlows(masked);

          for (const flow of flows) {
            const lines = content.slice(0, flow.openTagStart).split('\n');
            const lineNum = lines.length - 1;
            items.push(new FlowTreeItem(flow.name || 'unnamed-flow', 'FLOW', vscode.TreeItemCollapsibleState.None, uri, lineNum));
          }

          // Also check for sub-flows
          const subFlowRegex = /<sub-flow\s+name=["']([^"']+)["']/gi;
          let subMatch: RegExpExecArray | null;
          while ((subMatch = subFlowRegex.exec(masked)) !== null) {
            const lines = content.slice(0, subMatch.index).split('\n');
            const lineNum = lines.length - 1;
            items.push(new FlowTreeItem(subMatch[1], 'SUB_FLOW', vscode.TreeItemCollapsibleState.None, uri, lineNum));
          }
        } catch {
          // ignore unreadable files
        }
      }
      return items.length > 0 ? items : [new FlowTreeItem('No flows discovered', 'FLOW', vscode.TreeItemCollapsibleState.None)];
    }

    if (element.label === 'DataWeave Transformations (.dwl)') {
      const dwlUris = await vscode.workspace.findFiles('**/*.dwl', '**/node_modules/**');
      if (dwlUris.length === 0) {
        return [new FlowTreeItem('No .dwl files found', 'DWL', vscode.TreeItemCollapsibleState.None)];
      }
      return dwlUris.map(u => new FlowTreeItem(path.basename(u.fsPath), 'DWL', vscode.TreeItemCollapsibleState.None, u));
    }

    if (element.label === 'MUnit Test Suites') {
      const munitUris = await vscode.workspace.findFiles('**/src/test/munit/**/*.xml', '**/node_modules/**');
      if (munitUris.length === 0) {
        return [new FlowTreeItem('No MUnit test suites found', 'MUNIT', vscode.TreeItemCollapsibleState.None)];
      }
      return munitUris.map(u => new FlowTreeItem(path.basename(u.fsPath), 'MUNIT', vscode.TreeItemCollapsibleState.None, u));
    }

    if (element.label === 'Environment Configs') {
      const configUris = await vscode.workspace.findFiles('**/src/main/resources/**/*.yaml', '**/node_modules/**');
      if (configUris.length === 0) {
        return [new FlowTreeItem('No environment YAMLs found', 'CONFIG', vscode.TreeItemCollapsibleState.None)];
      }
      return configUris.map(u => new FlowTreeItem(path.basename(u.fsPath), 'CONFIG', vscode.TreeItemCollapsibleState.None, u));
    }

    return [];
  }
}
