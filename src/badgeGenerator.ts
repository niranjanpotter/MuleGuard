import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { detectMuleAppRoot, runCodeReview } from './codeReviewEngine';

export function getBadgeColor(score: number): string {
  if (score < 60) {
    return '#e05d44'; // red
  }
  if (score < 80) {
    return '#dfb317'; // yellow
  }
  return '#4c1'; // green
}

export function renderScoreBadgeSvg(score: number): string {
  const clamped = Math.max(0, Math.min(100, Math.round(score)));
  const color = getBadgeColor(clamped);
  const label = 'muleguard';
  const value = `${clamped}/100`;
  const leftWidth = 70;
  const rightWidth = 54;
  const totalWidth = leftWidth + rightWidth;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="20" role="img" aria-label="${label}: ${value}">
  <linearGradient id="s" x2="0" y2="100%">
    <stop offset="0" stop-color="#bbb" stop-opacity=".1"/>
    <stop offset="1" stop-opacity=".1"/>
  </linearGradient>
  <clipPath id="r">
    <rect width="${totalWidth}" height="20" rx="3" fill="#fff"/>
  </clipPath>
  <g clip-path="url(#r)">
    <rect width="${leftWidth}" height="20" fill="#555"/>
    <rect x="${leftWidth}" width="${rightWidth}" height="20" fill="${color}"/>
    <rect width="${totalWidth}" height="20" fill="url(#s)"/>
  </g>
  <g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" text-rendering="geometricPrecision" font-size="11">
    <text x="${leftWidth / 2}" y="14" fill="#010101" fill-opacity=".3">${label}</text>
    <text x="${leftWidth / 2}" y="13">${label}</text>
    <text x="${leftWidth + rightWidth / 2}" y="14" fill="#010101" fill-opacity=".3">${value}</text>
    <text x="${leftWidth + rightWidth / 2}" y="13">${value}</text>
  </g>
</svg>
`;
}

export async function generateBadgeForWorkspace(
  rootPath: string
): Promise<{ badgePath: string; score: number; markdownSnippet: string }> {
  const result = await runCodeReview(rootPath);
  const svg = renderScoreBadgeSvg(result.score);
  const badgePath = path.join(rootPath, 'muleguard-score.svg');
  fs.writeFileSync(badgePath, svg, 'utf8');

  const markdownSnippet = `[![MuleGuard Score](./muleguard-score.svg)](./code-review-report.md)`;
  return {
    badgePath,
    score: result.score,
    markdownSnippet,
  };
}

export async function runGenerateBadgeCommand(): Promise<void> {
  const rootPath =
    (await detectMuleAppRoot()) ?? vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!rootPath) {
    void vscode.window.showErrorMessage('MuleGuard: Open a MuleSoft workspace first.');
    return;
  }

  const { badgePath, score, markdownSnippet } = await generateBadgeForWorkspace(rootPath);
  await vscode.env.clipboard.writeText(markdownSnippet);
  void vscode.window.showInformationMessage(
    `MuleGuard: Saved muleguard-score.svg (${score}/100) at ${path.basename(badgePath)} and copied README badge snippet to clipboard.`
  );
}
