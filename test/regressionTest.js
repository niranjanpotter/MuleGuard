const assert = require('assert');
const fs = require('fs');
const Module = require('module');
const path = require('path');

const fixtureRoot = path.resolve(__dirname, 'fixtures', 'apikit-enterprise');

// Minimal vscode mock for headless regression verification
const vscodeMock = {
  DiagnosticSeverity: { Error: 0, Warning: 1, Information: 2, Hint: 3 },
  TreeItemCollapsibleState: { None: 0, Collapsed: 1, Expanded: 2 },
  ThemeIcon: class { constructor(id) { this.id = id; } },
  EventEmitter: class {
    constructor() { this.event = () => ({ dispose: () => {} }); }
    fire() {}
  },
  TreeItem: class { constructor(label, collapsibleState) { this.label = label; this.collapsibleState = collapsibleState; } },
  Uri: {
    file: (p) => ({ fsPath: p, path: p.replace(/\\/g, '/'), toString: () => `file://${p}` }),
  },
  Position: class { constructor(line, character) { this.line = line; this.character = character; } },
  Range: class { constructor(start, end) { this.start = start; this.end = end; } },
  Diagnostic: class {
    constructor(range, message, severity) {
      this.range = range;
      this.message = message;
      this.severity = severity;
    }
  },
  workspace: {
    workspaceFolders: [{ uri: { fsPath: fixtureRoot, toString: () => `file://${fixtureRoot}` } }],
    getWorkspaceFolder: (uri) => {
      if (uri && uri.fsPath && uri.fsPath.toLowerCase().startsWith(fixtureRoot.toLowerCase())) {
        return { uri: { fsPath: fixtureRoot } };
      }
      return undefined;
    },
    getConfiguration: () => ({
      get: (_key, def) => def,
    }),
    findFiles: async () => [],
  },
};

const origRequire = Module.prototype.require;
Module.prototype.require = function (id) {
  if (id === 'vscode') {
    return vscodeMock;
  }
  return origRequire.apply(this, arguments);
};

function makeTextDocument(filePath) {
  const text = fs.readFileSync(filePath, 'utf8');
  const lines = text.split(/\r?\n/);
  const lineStarts = [0];
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) === 10) {
      lineStarts.push(i + 1);
    }
  }
  const positionAt = (offset) => {
    let line = 0;
    for (let i = 0; i < lineStarts.length; i++) {
      if (lineStarts[i] <= offset) {
        line = i;
      } else {
        break;
      }
    }
    return new vscodeMock.Position(line, offset - lineStarts[line]);
  };
  const offsetAt = (pos) => (lineStarts[pos.line] || 0) + pos.character;
  return {
    fileName: filePath,
    uri: vscodeMock.Uri.file(filePath),
    languageId: filePath.endsWith('.dwl') ? 'dataweave' : 'xml',
    lineCount: lines.length,
    getText: (range) => {
      if (!range) return text;
      return text.slice(offsetAt(range.start), offsetAt(range.end));
    },
    lineAt: (line) => ({ text: lines[line] || '' }),
    positionAt,
    offsetAt,
  };
}

function walkFiles(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkFiles(full, out);
    } else if (entry.name.endsWith('.xml') || entry.name.endsWith('.dwl')) {
      out.push(full);
    }
  }
  return out;
}

(async () => {
  const { buildIndex } = require('../out/workspaceIndex');
  const { analyzeDocument } = require('../out/diagnostics');
  const { renderScoreBadgeSvg } = require('../out/badgeGenerator');

  const index = await buildIndex();
  assert(index.flows.has('enterprise-orders-api-main'), 'Index should contain main flow');
  assert(index.flows.has('get:\\orders:api-config'), 'Index should contain GET route flow');
  assert(index.flows.has('post:\\orders:api-config'), 'Index should contain POST route flow');
  assert(index.flows.has('shared-sub-flow'), 'Index should contain shared-sub-flow');
  assert(index.globalErrorHandlers.has('global-error-handler'), 'Index should contain global-error-handler');

  const mainFiles = walkFiles(path.join(fixtureRoot, 'src', 'main'));
  const counts = {};
  for (const f of mainFiles) {
    const doc = makeTextDocument(f);
    const diags = analyzeDocument(doc, index);
    for (const d of diags) {
      const code = String(d.code);
      counts[code] = (counts[code] || 0) + 1;
    }
  }

  console.log('Regression fixture diagnostic counts:', counts);

  assert.strictEqual(counts['BP-10'] || 0, 0, 'Expected BP-10 = 0');
  assert.strictEqual(counts['BP-01'] || 0, 0, 'Expected BP-01 = 0');
  assert.strictEqual(counts['MG002'] || 0, 0, 'Expected MG002 = 0');
  assert.strictEqual(counts['MG003'] || 0, 0, 'Expected MG003 = 0');
  assert.strictEqual(counts['MG005'] || 0, 1, 'Expected MG005 = 1 (post:\\orders:api-config only)');
  assert.strictEqual(counts['MG006'] || 0, 1, 'Expected MG006 = 1 (unguarded payload.a.b.c only)');

  const svg = renderScoreBadgeSvg(85);
  assert(svg.includes('85/100') && svg.includes('#4c1'), 'Expected green badge SVG for 85/100');

  // Verify config, secretProviders, fixture/env classification, flow docs, score badge, and activity icon
  const os = require('os');
  const { getResolvedConfig, isSafeSecretExpression } = require('../out/config');
  const { isFixtureDwlFile } = require('../out/dataweaveChecker');
  const { detectEnvInPath } = require('../out/flowExplorer');
  const { generateFlowDocsForWorkspace } = require('../out/flowDocGenerator');
  const { generateBadgeForWorkspace } = require('../out/badgeGenerator');

  const cfg = getResolvedConfig(vscodeMock.Uri.file(path.join(fixtureRoot, 'src', 'main', 'mule', 'api.xml')));
  assert.strictEqual(isSafeSecretExpression("#[p('aws-secrets::db.pass')]", cfg.secretProviders), true, 'aws-secrets provider');
  assert.strictEqual(isFixtureDwlFile('src/test/resources/sample.dwl', '{ "id": 1 }'), true, 'fixture classification');
  assert.strictEqual(detectEnvInPath('src/main/resources/dwl/uat/map.dwl', cfg.environments), 'uat', 'env path detection');

  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mg-docs-'));
  fs.cpSync(fixtureRoot, tmpRoot, { recursive: true });
  const docs = await generateFlowDocsForWorkspace(tmpRoot);
  assert(fs.existsSync(path.join(tmpRoot, 'docs', 'flows.md')), 'docs/flows.md generated');
  const flowsMd = fs.readFileSync(path.join(tmpRoot, 'docs', 'flows.md'), 'utf8');
  assert(flowsMd.includes('APIkit Routing Table'), 'APIkit routing table present in docs/flows.md');
  assert(docs.flowCount >= 3 && docs.routeCount === 2, 'Expected >=3 flows and 2 APIkit routes');

  const badge = await generateBadgeForWorkspace(tmpRoot);
  assert(fs.existsSync(badge.badgePath), 'muleguard-score.svg generated');
  assert(badge.score >= 0 && badge.score <= 100, 'Expected valid badge score');
  fs.rmSync(tmpRoot, { recursive: true, force: true });

  const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', 'package.json'), 'utf8'));
  assert.strictEqual(pkg.contributes.viewsContainers.activitybar[0].icon, 'resources/activity-icon.svg');
  assert(fs.existsSync(path.resolve(__dirname, '..', 'resources', 'activity-icon.svg')), 'activity-icon.svg exists');
  assert(fs.existsSync(path.resolve(__dirname, '..', 'docs', 'RULES.md')), 'docs/RULES.md exists');

  console.log('✅ Enterprise APIkit + v1.1.0 feature regression suite PASSED!');
})();
