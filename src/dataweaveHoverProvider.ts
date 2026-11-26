import * as vscode from 'vscode';
import { DATAWEAVE_FUNCTIONS, DataWeaveFunctionInfo } from './dataweaveKnowledge';

export function buildDataWeaveHover(
  word: string,
  wordRange?: vscode.Range
): vscode.Hover | undefined {
  // 1. Check if hovered word is a known DataWeave function
  const fnInfo = DATAWEAVE_FUNCTIONS[word];
  if (fnInfo) {
    const markdown = new vscode.MarkdownString();
    markdown.isTrusted = true;
    markdown.supportHtml = true;

    markdown.appendMarkdown(`### ⚡ DataWeave Function: \`${fnInfo.name}\` (${fnInfo.category})\n\n`);
    markdown.appendCodeblock(fnInfo.signature, 'dataweave');
    
    markdown.appendMarkdown(`**📖 Logic & Purpose:**  \n${fnInfo.description}\n\n`);
    markdown.appendMarkdown(`💡 **Plain-English Explanation:**  \n*${fnInfo.plainEnglishExplanation}*\n\n`);
    
    markdown.appendMarkdown(`🎯 **Why & When To Use (Architect Insight):**  \n${fnInfo.whyUseThis}\n\n`);
    
    markdown.appendMarkdown(`${fnInfo.performanceAndQualityTips}\n\n`);

    if (fnInfo.bestAlternativeOrProPattern) {
      markdown.appendMarkdown(`💡 **Pro Pattern / Modern Alternative:**  \n${fnInfo.bestAlternativeOrProPattern}\n\n`);
    }

    markdown.appendMarkdown(`**Example Usage:**\n`);
    markdown.appendCodeblock(fnInfo.example, 'dataweave');

    markdown.appendMarkdown(`[📖 Official MuleSoft Docs](${fnInfo.docsUrl})\n`);

    return new vscode.Hover(markdown, wordRange);
  }

  // 2. Check if hovering over Mule context variables
  if (['payload', 'vars', 'attributes', 'error', 'correlationId', 'message'].includes(word)) {
    const markdown = new vscode.MarkdownString();
    markdown.isTrusted = true;
    markdown.supportHtml = true;

    interface VarDetail {
      title: string;
      role: string;
      plainEnglish: string;
      whyUseThis: string;
      performanceTip: string;
      example: string;
    }

    const varDetails: Record<string, VarDetail> = {
      payload: {
        title: 'Mule Message Payload (`payload`)',
        role: 'The primary business data / content carried across message processors.',
        plainEnglish: 'The actual data being transferred (e.g. JSON response from an API, database row list, or CSV file).',
        whyUseThis: 'Carries your core business domain payload through flows and transformations.',
        performanceTip: '⚡ **Streaming & Memory:** In Mule 4, payloads can be non-repeatable or repeatable streams. Avoid reading a raw stream multiple times or holding 100MB+ payloads in memory. Use repeatable file store streams for large files.',
        example: 'payload.customer.orders map (order) -> order.total'
      },
      vars: {
        title: 'Flow Variables Dictionary (`vars`)',
        role: 'Map of temporary variables created via `<set-variable>` or `target="vars.name"`.',
        plainEnglish: 'Your personal scratchpad storage for holding intermediate data (like an ID or an auth token) while the flow executes.',
        whyUseThis: 'Preserving state across connectors without overwriting the current main `payload`.',
        performanceTip: '⚡ **Scope & Memory:** Variables persist across `<flow-ref>` sub-flows, but are NOT sent across HTTP or JMS transport boundaries. Avoid storing huge payload copies in `vars` as it doubles heap memory consumption.',
        example: 'vars.orderId default attributes.queryParams.id'
      },
      attributes: {
        title: 'Mule Inbound Metadata (`attributes`)',
        role: 'Transport-specific header and metadata bundle received from source connectors.',
        plainEnglish: 'The envelope metadata: HTTP headers, query params, status codes, file names, or JMS priority.',
        whyUseThis: 'Reading client input parameters, authorization headers, and routing decisions without modifying the body.',
        performanceTip: '⚡ Replaced whenever an outbound request (like `<http:request>`) returns a new response. Store important inbound attributes in `vars` before invoking outbound calls.',
        example: 'attributes.headers["Authorization"] or attributes.queryParams.region'
      },
      error: {
        title: 'Mule Error Object (`error`)',
        role: 'Populated automatically inside `<error-handler>` scopes when an exception occurs.',
        plainEnglish: 'The incident report object containing what went wrong, why, and which component failed.',
        whyUseThis: 'Building standardized, enterprise error response payloads and logging failure root causes.',
        performanceTip: '⚡ Always inspect `error.errorType.identifier` and `error.description`. In DataWeave: `{ message: error.description, code: error.errorType.identifier }`.',
        example: '{\n  status: "ERROR",\n  errorType: error.errorType.asString,\n  message: error.description\n}'
      },
      correlationId: {
        title: 'Global Correlation ID (`correlationId`)',
        role: 'Unique tracing identifier assigned to the transaction for end-to-end distributed observability.',
        plainEnglish: 'The tracking number for the entire request across all APIs, microservices, and log aggregators.',
        whyUseThis: 'Enables instant cross-API log tracing in Splunk, ELK, Anypoint Monitoring, and CloudHub.',
        performanceTip: '⚡ Propagate this ID in outbound HTTP headers: `headers: { "X-Correlation-ID": correlationId }`.',
        example: 'correlationId: correlationId default uuid()'
      },
      message: {
        title: 'Mule Message (`message`)',
        role: 'Envelope containing both `message.payload` and `message.attributes`.',
        plainEnglish: 'The complete container carrying both the letter (payload) and the envelope (attributes).',
        whyUseThis: 'Referencing both payload and metadata in a single structured object.',
        performanceTip: '⚡ Access `payload` directly for cleaner, faster expressions.',
        example: 'message.payload'
      }
    };

    const detail = varDetails[word];
    if (detail) {
      markdown.appendMarkdown(`### 📦 ${detail.title}\n\n`);
      markdown.appendMarkdown(`**Role:** ${detail.role}\n\n`);
      markdown.appendMarkdown(`💡 **Plain-English:** *${detail.plainEnglish}*\n\n`);
      markdown.appendMarkdown(`🎯 **Why We Use It:** ${detail.whyUseThis}\n\n`);
      markdown.appendMarkdown(`${detail.performanceTip}\n\n`);
      markdown.appendMarkdown(`**Access Example:**\n`);
      markdown.appendCodeblock(detail.example, 'dataweave');
      return new vscode.Hover(markdown, wordRange);
    }
  }

  // 3. Explain common DataWeave keywords & operators
  if (word === 'default') {
    const markdown = new vscode.MarkdownString();
    markdown.isTrusted = true;
    markdown.appendMarkdown(`### 🛡️ DataWeave Operator: \`default\`\n\n`);
    markdown.appendMarkdown(`**📖 Logic:** Evaluates the left expression; if the result is **null**, returns the right-hand fallback expression.\n\n`);
    markdown.appendMarkdown(`💡 **Plain-English:** "Use this value, but if it is missing or null, use this fallback instead."\n\n`);
    markdown.appendMarkdown(`🎯 **Why We Use It:** Prevents NullPointerExceptions and runtime transformation failures across missing fields.\n\n`);
    markdown.appendMarkdown(`⚡ **Quality Best Practice:** Provide sensible domain defaults (`default ""` for strings, `default 0` for numbers, `default []` for arrays) to ensure predictable downstream mapping.\n\n`);
    markdown.appendCodeblock(`payload.customer.name default "Guest"`, 'dataweave');
    return new vscode.Hover(markdown, wordRange);
  }

  if (word === 'if' || word === 'else') {
    const markdown = new vscode.MarkdownString();
    markdown.isTrusted = true;
    markdown.appendMarkdown(`### 🔀 DataWeave Conditional: \`if ... else\`\n\n`);
    markdown.appendMarkdown(`**📖 Logic:** Conditional ternary expression. Evaluates boolean condition and executes either the `if` branch or `else` branch.\n\n`);
    markdown.appendMarkdown(`💡 **Plain-English:** "If condition is met, return Option A, otherwise return Option B."\n\n`);
    markdown.appendMarkdown(`🎯 **Why We Use It:** Dynamic field values, conditional formatting, and branching data structures.\n\n`);
    markdown.appendMarkdown(`⚡ **Quality Tip:** In DataWeave, `if` is an expression that must always have a matching `else` branch so that a value is always produced. If you want to omit fields when a condition is false, use conditional key syntax instead: `(status: "ACTIVE") if payload.isActive`.\n\n`);
    markdown.appendCodeblock(`if (payload.status == "ACTIVE") "Approved" else "Pending"`, 'dataweave');
    return new vscode.Hover(markdown, wordRange);
  }

  if (word === 'as') {
    const markdown = new vscode.MarkdownString();
    markdown.isTrusted = true;
    markdown.appendMarkdown(`### 🔄 DataWeave Type Coercion: \`as\`\n\n`);
    markdown.appendMarkdown(`**📖 Logic:** Explicitly casts/coerces a value from one data type to another (e.g. String to Number, DateTime formatting).\n\n`);
    markdown.appendMarkdown(`💡 **Plain-English:** "Convert this data into this specific data type."\n\n`);
    markdown.appendMarkdown(`🎯 **Why We Use It:** Ensuring strictly typed interfaces and formatting dates/numbers according to external system specs.\n\n`);
    markdown.appendMarkdown(`⚡ **Performance & Quality:**\n• Always guard against unparseable values with `default`: `(payload.amount as Number default 0)`.\n• For dates: `now() as String {format: "yyyy-MM-dd"}`.\n\n`);
    markdown.appendCodeblock(`payload.age as Number default 0\nnow() as String {format: "yyyy-MM-dd"}`, 'dataweave');
    return new vscode.Hover(markdown, wordRange);
  }

  return undefined;
}

export class DataWeaveHoverProvider implements vscode.HoverProvider {
  provideHover(
    document: vscode.TextDocument,
    position: vscode.Position,
    _token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.Hover> {
    const wordRange = document.getWordRangeAtPosition(position, /[a-zA-Z_][\w$]*/);
    if (!wordRange) {
      return undefined;
    }

    const word = document.getText(wordRange);
    return buildDataWeaveHover(word, wordRange);
  }
}

export const DATAWEAVE_SELECTOR: vscode.DocumentSelector = [
  { language: 'dataweave' },
  { language: 'dwl' },
  { pattern: '**/*.dwl' }
];
