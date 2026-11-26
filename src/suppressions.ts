import * as vscode from 'vscode';

/**
 * Parses comma-separated rule codes from a suppression comment.
 * Returns null if no codes are specified (meaning ALL rules).
 * Returns an array of trimmed, uppercase codes otherwise.
 */
function parseRuleCodes(text: string): string[] | null {
  const trimmed = text.trim();
  if (!trimmed) {
    return null;
  }
  return trimmed.split(',').map(code => code.trim()).filter(code => code.length > 0);
}

/**
 * Filters out diagnostics that are suppressed by inline comments.
 *
 * Supported comment directives:
 *
 * XML files:
 *   <!-- muleguard-disable RULES -->
 *   <!-- muleguard-disable-next-line RULES -->
 *   <!-- muleguard-disable-file -->
 *   <!-- muleguard-enable RULES -->
 *
 * DataWeave (.dwl) files:
 *   // muleguard-disable RULES
 *   // muleguard-disable-next-line RULES
 *   // muleguard-disable-file
 *   // muleguard-enable RULES
 *
 * RULES is a comma-separated list of rule codes (e.g. MG001, BP-01).
 * Omitting RULES disables/enables ALL rules.
 */
export function filterSuppressedDiagnostics(
  diagnostics: vscode.Diagnostic[],
  text: string,
  isDwl: boolean
): vscode.Diagnostic[] {
  const lines = text.split(/\r?\n/);

  // Regex patterns for XML and DWL comment directives
  const disableFilePattern = isDwl
    ? /\/\/\s*muleguard-disable-file/
    : /<!--\s*muleguard-disable-file\s*-->/;

  const disableNextLinePattern = isDwl
    ? /\/\/\s*muleguard-disable-next-line(?:\s+(.+))?$/
    : /<!--\s*muleguard-disable-next-line(?:\s+(.+?))?\s*-->/;

  const disablePattern = isDwl
    ? /\/\/\s*muleguard-disable(?:\s+(.+))?$/
    : /<!--\s*muleguard-disable(?:\s+(.+?))?\s*-->/;

  const enablePattern = isDwl
    ? /\/\/\s*muleguard-enable(?:\s+(.+))?$/
    : /<!--\s*muleguard-enable(?:\s+(.+?))?\s*-->/;

  // Check for file-level suppression first
  for (const line of lines) {
    if (disableFilePattern.test(line)) {
      return [];
    }
  }

  // Build a per-line suppression map
  // For each line, track which rules are suppressed.
  // null in the set means ALL rules are suppressed.
  const disabledRules = new Set<string>();
  let allDisabled = false;

  // nextLineRules: rules to suppress on the next non-comment line
  // null means ALL rules on the next line
  let nextLineRules: string[] | null | undefined = undefined; // undefined = no pending next-line directive

  // Map from line number -> set of suppressed rule codes (or 'ALL' sentinel)
  const suppressionMap = new Map<number, Set<string> | 'ALL'>();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Check for disable-next-line (must check before disable, since disable pattern could match)
    const nextLineMatch = disableNextLinePattern.exec(line);
    if (nextLineMatch) {
      const codes = parseRuleCodes(nextLineMatch[1] || '');
      nextLineRules = codes;
      // Record current line's suppression state
      recordSuppression(suppressionMap, i, disabledRules, allDisabled);
      continue;
    }

    // Check for enable
    const enableMatch = enablePattern.exec(line);
    if (enableMatch) {
      const codes = parseRuleCodes(enableMatch[1] || '');
      if (codes === null) {
        // Re-enable all
        disabledRules.clear();
        allDisabled = false;
      } else {
        for (const code of codes) {
          disabledRules.delete(code);
        }
      }
      recordSuppression(suppressionMap, i, disabledRules, allDisabled);
      continue;
    }

    // Check for disable
    const disableMatch = disablePattern.exec(line);
    if (disableMatch) {
      const codes = parseRuleCodes(disableMatch[1] || '');
      if (codes === null) {
        // Disable all rules
        allDisabled = true;
      } else {
        for (const code of codes) {
          disabledRules.add(code);
        }
      }
      recordSuppression(suppressionMap, i, disabledRules, allDisabled);
      continue;
    }

    // Non-directive line: apply any pending next-line suppression
    if (nextLineRules !== undefined) {
      if (nextLineRules === null) {
        // All rules suppressed for this line
        suppressionMap.set(i, 'ALL');
      } else {
        const merged = new Set(disabledRules);
        for (const code of nextLineRules) {
          merged.add(code);
        }
        if (allDisabled) {
          suppressionMap.set(i, 'ALL');
        } else if (merged.size > 0) {
          suppressionMap.set(i, merged);
        }
      }
      nextLineRules = undefined;
    } else {
      recordSuppression(suppressionMap, i, disabledRules, allDisabled);
    }
  }

  // Filter diagnostics
  return diagnostics.filter(diagnostic => {
    const line = diagnostic.range.start.line;
    const suppression = suppressionMap.get(line);

    if (!suppression) {
      return true;
    }

    if (suppression === 'ALL') {
      return false;
    }

    const code = getDiagnosticCode(diagnostic);
    return !suppression.has(code);
  });
}

/**
 * Records the current suppression state for a given line.
 */
function recordSuppression(
  map: Map<number, Set<string> | 'ALL'>,
  line: number,
  disabledRules: Set<string>,
  allDisabled: boolean
): void {
  if (allDisabled) {
    map.set(line, 'ALL');
  } else if (disabledRules.size > 0) {
    map.set(line, new Set(disabledRules));
  }
}

/**
 * Extracts the diagnostic code as a string.
 */
function getDiagnosticCode(diagnostic: vscode.Diagnostic): string {
  if (typeof diagnostic.code === 'string') {
    return diagnostic.code;
  }
  if (typeof diagnostic.code === 'number') {
    return String(diagnostic.code);
  }
  if (diagnostic.code && typeof diagnostic.code === 'object' && 'value' in diagnostic.code) {
    return String(diagnostic.code.value);
  }
  return '';
}
