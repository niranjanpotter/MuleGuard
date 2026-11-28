import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

export type RuleSeveritySetting = 'off' | 'info' | 'warning' | 'error';

export interface RuleOverride {
  severity?: RuleSeveritySetting;
  [key: string]: unknown;
}

export interface MuleGuardJsonConfig {
  rules?: Record<string, RuleSeveritySetting | RuleOverride>;
  exclude?: string[];
  secretProviders?: string[];
}

export interface ResolvedMuleGuardConfig {
  enable: boolean;
  exclude: string[];
  secretProviders: string[];
  namingIgnorePatterns: string[];
  acceptedLoggingFlows: string[];
  nullSafetyMinDepth: number;
  nullSafetyMaxPerFile: number;
  environments: string[];
  referenceEnvironment: string;
  lintFixtures: boolean;
  baselineEnabled: boolean;
  rules: Record<string, RuleOverride>;
}

export const DEFAULT_EXCLUDES = [
  '**/src/test/**',
  '**/target/**',
  '**/.mule/**',
  '**/.tooling-project/**',
  '**/node_modules/**',
  '**/out/**',
  '**/dist/**',
  '**/.git/**',
];

export const DEFAULT_SECRET_PROVIDERS = ['secure::', 'aws-secrets::', 'aws-s3::'];
export const DEFAULT_NAMING_IGNORE_PATTERNS = [
  '^(get|post|put|patch|delete|head|options):\\\\',
  '-main$',
];
export const DEFAULT_ACCEPTED_LOGGING_FLOWS = [
  'mule-logging-utilFlow',
  '*-logger',
  '*logging*',
];
export const DEFAULT_ENVIRONMENTS = [
  'dev',
  'development',
  'test',
  'qa',
  'sit',
  'uat',
  'tlb',
  'sandbox',
  'stage',
  'staging',
  'prod',
  'production',
  'local',
];

const jsonConfigCache = new Map<string, MuleGuardJsonConfig | null>();

export function invalidateConfigCache(): void {
  jsonConfigCache.clear();
}

function loadMuleGuardJson(rootPath: string): MuleGuardJsonConfig | null {
  if (jsonConfigCache.has(rootPath)) {
    return jsonConfigCache.get(rootPath) ?? null;
  }

  const configPath = path.join(rootPath, '.muleguard.json');
  try {
    if (fs.existsSync(configPath)) {
      const raw = fs.readFileSync(configPath, 'utf8');
      const parsed = JSON.parse(raw) as MuleGuardJsonConfig;
      jsonConfigCache.set(rootPath, parsed);
      return parsed;
    }
  } catch {
    // Ignore malformed .muleguard.json and fall back to VS Code settings.
  }
  jsonConfigCache.set(rootPath, null);
  return null;
}

export function getWorkspaceRootForUri(uri?: vscode.Uri): string | undefined {
  if (uri) {
    const folder = vscode.workspace.getWorkspaceFolder(uri);
    if (folder) {
      return folder.uri.fsPath;
    }
  }
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}

export function getResolvedConfig(uri?: vscode.Uri): ResolvedMuleGuardConfig {
  const vsCfg = vscode.workspace.getConfiguration('muleguard', uri);
  const rootPath = getWorkspaceRootForUri(uri);
  const fileCfg = rootPath ? loadMuleGuardJson(rootPath) : null;

  const rules: Record<string, RuleOverride> = {};
  if (fileCfg?.rules) {
    for (const [ruleId, val] of Object.entries(fileCfg.rules)) {
      if (typeof val === 'string') {
        rules[ruleId.toUpperCase()] = { severity: val };
      } else if (val && typeof val === 'object') {
        rules[ruleId.toUpperCase()] = { ...val };
      }
    }
  }

  const mg006Rule = rules['MG006'];
  const mg003Rule = rules['MG003'];

  return {
    enable: vsCfg.get<boolean>('enable', true),
    exclude:
      fileCfg?.exclude && Array.isArray(fileCfg.exclude)
        ? fileCfg.exclude
        : vsCfg.get<string[]>('exclude', DEFAULT_EXCLUDES),
    secretProviders:
      fileCfg?.secretProviders && Array.isArray(fileCfg.secretProviders)
        ? fileCfg.secretProviders
        : vsCfg.get<string[]>('secretProviders', DEFAULT_SECRET_PROVIDERS),
    namingIgnorePatterns: vsCfg.get<string[]>(
      'naming.ignorePatterns',
      DEFAULT_NAMING_IGNORE_PATTERNS
    ),
    acceptedLoggingFlows:
      Array.isArray(mg003Rule?.acceptedFlows)
        ? (mg003Rule.acceptedFlows as string[])
        : vsCfg.get<string[]>('logging.acceptedFlows', DEFAULT_ACCEPTED_LOGGING_FLOWS),
    nullSafetyMinDepth:
      typeof mg006Rule?.minDepth === 'number'
        ? mg006Rule.minDepth
        : vsCfg.get<number>('dataweave.nullSafety.minDepth', 3),
    nullSafetyMaxPerFile:
      typeof mg006Rule?.maxPerFile === 'number'
        ? mg006Rule.maxPerFile
        : vsCfg.get<number>('dataweave.nullSafety.maxPerFile', 20),
    environments: vsCfg.get<string[]>('environments', DEFAULT_ENVIRONMENTS),
    referenceEnvironment: vsCfg.get<string>('referenceEnvironment', 'production'),
    lintFixtures: vsCfg.get<boolean>('lint.fixtures', false),
    baselineEnabled: vsCfg.get<boolean>('baseline.enabled', true),
    rules,
  };
}

/**
 * Converts a simple glob pattern like `**\/.tooling-project/**` or `*-logger` into a RegExp.
 */
export function globToRegExp(glob: string): RegExp {
  const escaped = glob
    .replace(/\\/g, '/')
    .replace(/[.+^${}()|[\]]/g, '\\$&')
    .replace(/\*\*\//g, '(?:.+/)?')
    .replace(/\*\*/g, '.*')
    .replace(/\*/g, '[^/]*')
    .replace(/\?/g, '[^/]');
  return new RegExp(`^${escaped}$`, 'i');
}

export function matchesAnyGlob(value: string, patterns: string[]): boolean {
  const normalized = value.replace(/\\/g, '/');
  for (const pat of patterns) {
    if (globToRegExp(pat).test(normalized)) {
      return true;
    }
    // Also support matching just the relative segment if pattern starts with **/
    if (pat.startsWith('**/')) {
      const sub = pat.slice(3);
      if (globToRegExp(sub).test(normalized)) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Checks whether a file path is excluded by default cache/build dirs or `muleguard.exclude`.
 */
export function isExcludedFilePath(filePath: string, excludeGlobs: string[]): boolean {
  const normalized = filePath.replace(/\\/g, '/');
  if (
    /(?:^|\/)(node_modules|target|out|dist|\.git|\.mule|\.tooling-project)(?:\/|$)/i.test(
      normalized
    )
  ) {
    return true;
  }

  for (const glob of excludeGlobs) {
    const clean = glob.replace(/\\/g, '/');
    // Fast substring check for common `**/dir/**` globs
    const dirMatch = /^\*\*\/([^/*]+)\/\*\*$/.exec(clean);
    if (dirMatch) {
      const seg = dirMatch[1].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (new RegExp(`(?:^|/)${seg}(?:/|$)`, 'i').test(normalized)) {
        return true;
      }
      continue;
    }
    if (clean === '**/src/test/**' && /(?:^|\/)src\/test(?:\/|$)/i.test(normalized)) {
      return true;
    }
    if (globToRegExp(clean).test(normalized)) {
      return true;
    }
  }
  return false;
}

export function buildWorkspaceExcludeGlob(excludeGlobs: string[]): string {
  const combined = Array.from(new Set([...DEFAULT_EXCLUDES, ...excludeGlobs]));
  return `{${combined.join(',')}}`;
}

/**
 * Applies `.muleguard.json` rule severity overrides (`off`, `info`, `warning`, `error`).
 */
export function applyRuleOverrides(
  diagnostics: vscode.Diagnostic[],
  config: ResolvedMuleGuardConfig
): vscode.Diagnostic[] {
  if (!config.rules || Object.keys(config.rules).length === 0) {
    return diagnostics;
  }

  const out: vscode.Diagnostic[] = [];
  for (const diag of diagnostics) {
    const code = String(diag.code ?? '').toUpperCase();
    const override = config.rules[code];
    if (!override?.severity) {
      out.push(diag);
      continue;
    }
    if (override.severity === 'off') {
      continue;
    }
    const sevMap: Record<Exclude<RuleSeveritySetting, 'off'>, vscode.DiagnosticSeverity> = {
      info: vscode.DiagnosticSeverity.Information,
      warning: vscode.DiagnosticSeverity.Warning,
      error: vscode.DiagnosticSeverity.Error,
    };
    diag.severity = sevMap[override.severity];
    out.push(diag);
  }
  return out;
}

/**
 * Checks if a credential attribute value uses a known-safe secret provider expression.
 */
export function isSafeSecretExpression(value: string, secretProviders: string[]): boolean {
  const trimmed = value.trim();
  if (!trimmed) {
    return true;
  }
  if (/^\$\{[^}]+\}$/.test(trimmed) || /^#\[[\s\S]+\]$/.test(trimmed)) {
    return true;
  }
  for (const provider of secretProviders) {
    const esc = provider.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (
      new RegExp(`^\\$\\{${esc}`, 'i').test(trimmed) ||
      new RegExp(`^#\\[\\s*p\\(\\s*['"]${esc}`, 'i').test(trimmed)
    ) {
      return true;
    }
  }
  return false;
}
