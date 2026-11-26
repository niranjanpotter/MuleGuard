import * as vscode from 'vscode';
import { CONNECTOR_KNOWLEDGE, ConnectorInfo } from './connectorKnowledge';

export class MuleGuardHoverProvider implements vscode.HoverProvider {
  provideHover(
    document: vscode.TextDocument,
    position: vscode.Position,
    _token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.Hover> {
    // 1. Get the word at cursor position (supports namespace prefixes like http:listener)
    const wordRange = document.getWordRangeAtPosition(
      position,
      /[a-zA-Z_][\w-]*(?::[a-zA-Z_][\w-]*)*/
    );
    if (!wordRange) {
      return undefined;
    }

    let word = document.getText(wordRange);

    // 2. Scan backward from position to find the nearest `<` to extract the full tag name
    const lineText = document.lineAt(position.line).text;
    const charOffset = wordRange.start.character;

    // Look backward from the word start to find the opening `<`
    let tagName = word;
    let searchIdx = charOffset - 1;

    // Skip whitespace between `<` and tag name
    while (searchIdx >= 0 && lineText[searchIdx] === ' ') {
      searchIdx--;
    }

    if (searchIdx >= 0 && (lineText[searchIdx] === '<' || (searchIdx >= 1 && lineText[searchIdx] === '/' && lineText[searchIdx - 1] === '<'))) {
      // We're right after a `<` or `</`, so word is the tag name
      // 3. Handle closing tags - strip the leading `/`
      if (lineText[searchIdx] === '/') {
        tagName = word; // already just the tag name without /
      }
    } else {
      // The word might be part of a tag with a namespace prefix.
      // Scan backward across the line to find `<` or `</` before the current context
      let scanPos = charOffset - 1;
      while (scanPos >= 0 && lineText[scanPos] !== '<' && lineText[scanPos] !== '>') {
        scanPos--;
      }

      if (scanPos >= 0 && lineText[scanPos] === '<') {
        // Extract the full tag name from after `<` or `</`
        const afterBracket = lineText.substring(scanPos + 1, charOffset + word.length).trim();
        const cleanedTag = afterBracket.startsWith('/') ? afterBracket.substring(1).trim() : afterBracket;

        // Match a valid tag name (with optional namespace)
        const tagMatch = cleanedTag.match(/^([a-zA-Z_][\w-]*(?::[a-zA-Z_][\w-]*)*)/);
        if (tagMatch) {
          tagName = tagMatch[1];
        }
      }
    }

    // 4. Look up the tag name (lowercase) in CONNECTOR_KNOWLEDGE
    const connectorInfo: ConnectorInfo | undefined = CONNECTOR_KNOWLEDGE[tagName.toLowerCase()];
    if (!connectorInfo) {
      return undefined;
    }

    // 5. Build a rich MarkdownString tooltip
    const markdownContent = new vscode.MarkdownString();
    markdownContent.supportHtml = true;
    markdownContent.isTrusted = true;

    // Header: displayName (category)
    markdownContent.appendMarkdown(`### ${connectorInfo.displayName} (${connectorInfo.category})\n\n`);

    // Description
    markdownContent.appendMarkdown(`${connectorInfo.description}\n\n`);

    // Runtime notes
    markdownContent.appendMarkdown(`**Runtime:** ${connectorInfo.runtimeNotes}\n\n`);

    // Common Attributes as a markdown table
    if (connectorInfo.commonAttributes) {
      const entries = Object.entries(connectorInfo.commonAttributes);
      if (entries.length > 0) {
        markdownContent.appendMarkdown(`**Common Attributes:**\n\n`);
        markdownContent.appendMarkdown(`| Attribute | Description |\n`);
        markdownContent.appendMarkdown(`|-----------|-------------|\n`);
        for (const [attrName, attrDesc] of entries) {
          // Escape pipe characters in descriptions
          const escapedDesc = attrDesc.replace(/\|/g, '\\|');
          markdownContent.appendMarkdown(`| \`${attrName}\` | ${escapedDesc} |\n`);
        }
        markdownContent.appendMarkdown(`\n`);
      }
    }

    // Documentation link
    markdownContent.appendMarkdown(`[📖 Anypoint Docs](${connectorInfo.docsUrl})\n`);

    // 6. Return the Hover
    return new vscode.Hover(markdownContent, wordRange);
  }
}

export const MULE_XML_SELECTOR: vscode.DocumentSelector = [
  { language: 'xml' },
  { pattern: '**/*.xml' }
];
