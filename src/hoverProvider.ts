import * as vscode from 'vscode';
import { CONNECTOR_KNOWLEDGE, ConnectorInfo } from './connectorKnowledge';
import { buildDataWeaveHover } from './dataweaveHoverProvider';

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
      // Check if cursor is hovering over a DataWeave function, context variable, or operator
      const dwHover = buildDataWeaveHover(word, wordRange);
      if (dwHover) {
        return dwHover;
      }
      return undefined;
    }

    // 5. Build a rich MarkdownString tooltip
    const markdownContent = new vscode.MarkdownString();
    markdownContent.supportHtml = true;
    markdownContent.isTrusted = true;

    const symbol = this._getMuleSymbol(tagName.toLowerCase());

    // Header: symbol + displayName (category)
    markdownContent.appendMarkdown(`### ${symbol} ${connectorInfo.displayName} \`${tagName}\`\n\n`);
    markdownContent.appendMarkdown(`*Category:* **${connectorInfo.category}** • *Mule 4 Component*\n\n`);

    // Description
    markdownContent.appendMarkdown(`**What It Does:**  \n${connectorInfo.description}\n\n`);

    // Runtime notes
    markdownContent.appendMarkdown(`⚡ **Runtime Execution Model:**  \n${connectorInfo.runtimeNotes}\n\n`);

    // Inferred Payload Contract
    const payloadContract = this._getPayloadContract(tagName.toLowerCase());
    markdownContent.appendMarkdown(`📦 **Message Payload Contract:**  \n${payloadContract}\n\n`);

    // Common Attributes as a markdown table
    if (connectorInfo.commonAttributes) {
      const entries = Object.entries(connectorInfo.commonAttributes);
      if (entries.length > 0) {
        markdownContent.appendMarkdown(`**Key Configurations & Attributes:**\n\n`);
        markdownContent.appendMarkdown(`| Attribute | Purpose & Best Practice |\n`);
        markdownContent.appendMarkdown(`| :--- | :--- |\n`);
        for (const [attrName, attrDesc] of entries) {
          const escapedDesc = attrDesc.replace(/\|/g, '\\|');
          markdownContent.appendMarkdown(`| \`${attrName}\` | ${escapedDesc} |\n`);
        }
        markdownContent.appendMarkdown(`\n`);
      }
    }

    // Documentation link
    markdownContent.appendMarkdown(`[📖 Official Anypoint Documentation](${connectorInfo.docsUrl})\n`);

    // 6. Return the Hover
    return new vscode.Hover(markdownContent, wordRange);
  }

  private _getMuleSymbol(tag: string): string {
    if (tag.startsWith('http:listener')) return '🌐 [Inbound Endpoint]';
    if (tag.startsWith('http:request')) return '📡 [Outbound REST Client]';
    if (tag.startsWith('db:select')) return '🔍 [SQL Query]';
    if (tag.startsWith('db:insert') || tag.startsWith('db:update') || tag.startsWith('db:delete')) return '💾 [Database DML]';
    if (tag.startsWith('ee:transform')) return '🔄 [DataWeave Engine]';
    if (tag === 'flow') return '⚡ [Execution Flow]';
    if (tag === 'sub-flow') return '↪ [Inline Sub-Flow]';
    if (tag === 'choice') return '🔀 [Conditional Router]';
    if (tag === 'scatter-gather') return '🚀 [Parallel Multicast]';
    if (tag === 'foreach') return '🔁 [Sequential Iterator]';
    if (tag === 'until-successful') return '⏳ [Retry Scope]';
    if (tag.includes('error')) return '🛡️ [Error Handler]';
    if (tag.includes('logger')) return '📝 [Logging Processor]';
    return '⚙️ [Mule Processor]';
  }

  private _getPayloadContract(tag: string): string {
    if (tag.startsWith('http:listener')) return '📥 **Input:** Raw HTTP Body stream (`attributes` contain headers, queryParams, method) ➔ **Output:** Transformed response body.';
    if (tag.startsWith('http:request')) return '📤 **Input:** Current message payload sent as request body ➔ **Output:** HTTP response body replaces payload (`attributes.statusCode` set).';
    if (tag.startsWith('db:select')) return '📥 **Input:** SQL parameters evaluated from current context ➔ **Output:** `Array<Object>` (List of database record Maps).';
    if (tag.startsWith('db:insert') || tag.startsWith('db:update') || tag.startsWith('db:delete')) return '📥 **Input:** Parameterized SQL payload ➔ **Output:** `{ affectedRows: Number, generatedKeys?: Array }`.';
    if (tag.startsWith('ee:transform')) return '🔄 **Input:** Reads `payload`, `vars`, and `attributes` ➔ **Output:** Produces new payload or variables in target MIME format (JSON, XML, Java).';
    if (tag === 'scatter-gather') return '🚀 **Input:** Clones current message to all routes in parallel ➔ **Output:** Composite Map of route results `{ "0": { payload: ... }, "1": { payload: ... } }`.';
    if (tag === 'foreach') return '🔁 **Input:** Collection array ➔ Processes each item in isolation ➔ Original payload restored at end of loop unless modified.';
    if (tag === 'flow-ref') return '↪ Passes current message (`payload`, `vars`, `attributes`) seamlessly into target flow/sub-flow.';
    return 'Message payload flows through processor sequentially.';
  }
}

export const MULE_XML_SELECTOR: vscode.DocumentSelector = [
  { language: 'xml' },
  { pattern: '**/*.xml' }
];
