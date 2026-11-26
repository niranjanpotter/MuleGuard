import * as vscode from 'vscode';
import { DATAWEAVE_FUNCTIONS, DataWeaveFunctionInfo } from './dataweaveKnowledge';

export class DataWeaveHoverProvider implements vscode.HoverProvider {
  provideHover(
    document: vscode.TextDocument,
    position: vscode.Position,
    _token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.Hover> {
    // 1. Get the hovered word
    const wordRange = document.getWordRangeAtPosition(position, /[a-zA-Z_][\w$]*/);
    if (!wordRange) {
      return undefined;
    }

    const word = document.getText(wordRange);
    const lineText = document.lineAt(position.line).text;

    // Check if hovered word is a known DataWeave 2.0 core function
    const fnInfo = DATAWEAVE_FUNCTIONS[word];
    if (fnInfo) {
      const markdown = new vscode.MarkdownString();
      markdown.isTrusted = true;
      markdown.supportHtml = true;

      markdown.appendMarkdown(`### ⚡ DataWeave Function: \`${fnInfo.name}\` (${fnInfo.category})\n\n`);
      markdown.appendCodeblock(fnInfo.signature, 'dataweave');
      markdown.appendMarkdown(`**What It Does:** ${fnInfo.description}\n\n`);
      markdown.appendMarkdown(`💡 **Plain-English Explanation:**  \n*${fnInfo.plainEnglishExplanation}*\n\n`);

      markdown.appendMarkdown(`**Example Usage:**\n`);
      markdown.appendCodeblock(fnInfo.example, 'dataweave');

      markdown.appendMarkdown(`[📖 DataWeave Documentation](${fnInfo.docsUrl})\n`);

      return new vscode.Hover(markdown, wordRange);
    }

    // Check if hovering over keywords or common symbols
    if (word === 'payload' || word === 'vars' || word === 'attributes' || word === 'error') {
      const markdown = new vscode.MarkdownString();
      markdown.isTrusted = true;

      const descriptions: Record<string, string> = {
        payload: 'The main data body carried by the current Mule message (JSON, XML, Java, or stream).',
        vars: 'Flow variables dictionary created using `<set-variable>` or `target="vars.name"`.',
        attributes: 'Inbound metadata from the source connector (e.g. HTTP headers, query params, status code, file names).',
        error: 'The current Mule error object containing `error.description`, `error.errorType`, and `error.detailedDescription`.'
      };

      markdown.appendMarkdown(`### 📦 Mule Context Variable: \`${word}\`\n\n`);
      markdown.appendMarkdown(`${descriptions[word]}\n\n`);
      markdown.appendMarkdown(`*Access fields using dot notation (e.g. \`${word}.fieldName\`)*`);

      return new vscode.Hover(markdown, wordRange);
    }

    // Explain conditional and default keywords
    if (word === 'default') {
      const markdown = new vscode.MarkdownString();
      markdown.isTrusted = true;
      markdown.appendMarkdown(`### 🛡️ DataWeave Operator: \`default\`\n\n`);
      markdown.appendMarkdown(`Provides a fallback value if the preceding expression evaluates to **null**.\n\n`);
      markdown.appendMarkdown(`💡 **Plain-English:** "Use this value, but if it is null or missing, use the default instead." Prevents NullPointerExceptions.\n\n`);
      markdown.appendCodeblock(`payload.customer.name default "Guest"`, 'dataweave');
      return new vscode.Hover(markdown, wordRange);
    }

    if (word === 'if' || word === 'else') {
      const markdown = new vscode.MarkdownString();
      markdown.isTrusted = true;
      markdown.appendMarkdown(`### 🔀 DataWeave Conditional: \`if ... else\`\n\n`);
      markdown.appendMarkdown(`Ternary-style conditional logic: evaluates the condition and returns the first branch if true, otherwise the else branch.\n\n`);
      markdown.appendCodeblock(`if (payload.status == "ACTIVE") "Approved" else "Pending"`, 'dataweave');
      return new vscode.Hover(markdown, wordRange);
    }

    return undefined;
  }
}

export const DATAWEAVE_SELECTOR: vscode.DocumentSelector = [
  { language: 'dataweave' },
  { language: 'dwl' },
  { pattern: '**/*.dwl' }
];
