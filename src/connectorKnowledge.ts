export interface ConnectorInfo {
  displayName: string;
  description: string;
  category: 'Core' | 'Connector' | 'Scope' | 'Router' | 'Transform' | 'Error Handling' | 'Module';
  runtimeNotes: string;
  commonAttributes: Record<string, string>;
  docsUrl: string;
}

export const CONNECTOR_KNOWLEDGE: Record<string, ConnectorInfo> = {
  // ── Core (13) ───────────────────────────────────────────────────────
  'flow': {
    displayName: 'Flow',
    description: 'A top-level message processing block triggered by a source (e.g. HTTP listener, scheduler). Each flow has its own processing strategy and error handling scope.',
    category: 'Core',
    runtimeNotes: 'Each flow runs on its own processing strategy thread. By default flows use a non-blocking processing model.',
    commonAttributes: {
      'name': 'Unique identifier for the flow',
      'initialState': 'Whether the flow starts automatically (started/stopped)',
      'maxConcurrency': 'Maximum number of concurrent messages processed'
    },
    docsUrl: 'https://docs.mulesoft.com/mule-runtime/latest/about-flows'
  },
  'sub-flow': {
    displayName: 'Sub-Flow',
    description: 'A reusable sequence of processors that runs in the caller\'s thread and inherits the caller\'s error handling.',
    category: 'Core',
    runtimeNotes: 'Executes synchronously in the calling flow\'s thread. Does not have its own error handling scope.',
    commonAttributes: {
      'name': 'Unique identifier for the sub-flow'
    },
    docsUrl: 'https://docs.mulesoft.com/mule-runtime/latest/about-flows'
  },
  'flow-ref': {
    displayName: 'Flow Reference',
    description: 'Invokes another flow or sub-flow by name, enabling reuse and modular design.',
    category: 'Core',
    runtimeNotes: 'When referencing a sub-flow, executes inline. When referencing a flow, dispatches to that flow\'s processing strategy.',
    commonAttributes: {
      'name': 'Name of the target flow or sub-flow to invoke',
      'doc:name': 'Display name shown in Anypoint Studio',
      'target': 'Variable name to store the result instead of replacing the payload',
      'targetValue': 'Expression to extract a value from the result'
    },
    docsUrl: 'https://docs.mulesoft.com/mule-runtime/latest/flowref-about'
  },
  'set-payload': {
    displayName: 'Set Payload',
    description: 'Sets the payload of the current Mule message to a specified value or DataWeave expression.',
    category: 'Core',
    runtimeNotes: 'Replaces the entire message payload. The previous payload is discarded unless stored in a variable.',
    commonAttributes: {
      'value': 'The value or DataWeave expression to set as payload',
      'mimeType': 'MIME type of the payload (e.g. application/json)',
      'encoding': 'Character encoding (e.g. UTF-8)',
      'doc:name': 'Display name shown in Anypoint Studio'
    },
    docsUrl: 'https://docs.mulesoft.com/mule-runtime/latest/set-payload-transformer-reference'
  },
  'set-variable': {
    displayName: 'Set Variable',
    description: 'Creates or updates a Mule flow variable accessible via vars.<variableName> in DataWeave expressions.',
    category: 'Core',
    runtimeNotes: 'Variables persist for the lifetime of the flow execution. They are accessible within the flow and any sub-flows invoked via flow-ref.',
    commonAttributes: {
      'variableName': 'Name of the variable to set',
      'value': 'The value or DataWeave expression',
      'mimeType': 'MIME type of the variable value',
      'doc:name': 'Display name shown in Anypoint Studio'
    },
    docsUrl: 'https://docs.mulesoft.com/mule-runtime/latest/variable-transformer-reference'
  },
  'remove-variable': {
    displayName: 'Remove Variable',
    description: 'Removes a previously set flow variable from the current Mule event.',
    category: 'Core',
    runtimeNotes: 'The variable is immediately removed and no longer accessible via vars. in subsequent processors.',
    commonAttributes: {
      'variableName': 'Name of the variable to remove',
      'doc:name': 'Display name shown in Anypoint Studio'
    },
    docsUrl: 'https://docs.mulesoft.com/mule-runtime/latest/variable-transformer-reference'
  },
  'choice': {
    displayName: 'Choice Router',
    description: 'Routes messages to one of multiple paths based on DataWeave boolean expressions evaluated in order.',
    category: 'Router',
    runtimeNotes: 'Evaluates when conditions top-to-bottom, executing the first matching route. Falls through to otherwise if no match.',
    commonAttributes: {
      'doc:name': 'Display name shown in Anypoint Studio',
      'expression': 'DataWeave expression (on when elements)',
      'tracking:enable-default-events': 'Enable default business event tracking'
    },
    docsUrl: 'https://docs.mulesoft.com/mule-runtime/latest/choice-router-concept'
  },
  'when': {
    displayName: 'Choice When',
    description: 'A conditional branch within a Choice router that executes when its expression evaluates to true.',
    category: 'Router',
    runtimeNotes: 'Evaluated in declaration order within the Choice. Only the first matching when branch executes.',
    commonAttributes: {
      'expression': 'DataWeave boolean expression that determines if this route is taken',
      'doc:name': 'Display name shown in Anypoint Studio'
    },
    docsUrl: 'https://docs.mulesoft.com/mule-runtime/latest/choice-router-concept'
  },
  'otherwise': {
    displayName: 'Choice Otherwise',
    description: 'The default branch within a Choice router that executes when no when conditions match.',
    category: 'Router',
    runtimeNotes: 'Acts as a fallback; executes only when all when expressions evaluate to false.',
    commonAttributes: {
      'doc:name': 'Display name shown in Anypoint Studio'
    },
    docsUrl: 'https://docs.mulesoft.com/mule-runtime/latest/choice-router-concept'
  },
  'scatter-gather': {
    displayName: 'Scatter-Gather Router',
    description: 'Sends a message to multiple processing routes concurrently and aggregates all results into a single message.',
    category: 'Router',
    runtimeNotes: 'Routes execute in parallel. All routes must complete before aggregation. Fails if any route fails (unless collectList error handling is configured).',
    commonAttributes: {
      'doc:name': 'Display name shown in Anypoint Studio',
      'timeout': 'Maximum time in milliseconds to wait for all routes',
      'maxConcurrency': 'Maximum number of routes that execute in parallel',
      'target': 'Variable to store the aggregated result'
    },
    docsUrl: 'https://docs.mulesoft.com/mule-runtime/latest/scatter-gather-concept'
  },
  'route': {
    displayName: 'Route',
    description: 'An individual processing branch within a Scatter-Gather router.',
    category: 'Router',
    runtimeNotes: 'Each route receives a copy of the original message and processes independently in its own thread.',
    commonAttributes: {
      'doc:name': 'Display name shown in Anypoint Studio'
    },
    docsUrl: 'https://docs.mulesoft.com/mule-runtime/latest/scatter-gather-concept'
  },
  'foreach': {
    displayName: 'For Each Scope',
    description: 'Iterates over a collection, executing the enclosed processors once for each element sequentially.',
    category: 'Scope',
    runtimeNotes: 'Processes each element sequentially. The payload inside the scope is set to the current element. The original payload is restored after completion.',
    commonAttributes: {
      'collection': 'DataWeave expression returning the collection to iterate over',
      'batchSize': 'Number of elements to process per batch',
      'rootMessageVariableName': 'Variable name to store the original root message',
      'doc:name': 'Display name shown in Anypoint Studio'
    },
    docsUrl: 'https://docs.mulesoft.com/mule-runtime/latest/for-each-scope-concept'
  },
  'until-successful': {
    displayName: 'Until Successful Scope',
    description: 'Retries the enclosed processors until they succeed or the maximum number of retries is exhausted.',
    category: 'Scope',
    runtimeNotes: 'Retries on any exception. Between retries the thread is released. Throws RETRY_EXHAUSTED error when max retries reached.',
    commonAttributes: {
      'maxRetries': 'Maximum number of retry attempts (default 5)',
      'millisBetweenRetries': 'Wait time between retries in milliseconds (default 60000)',
      'doc:name': 'Display name shown in Anypoint Studio'
    },
    docsUrl: 'https://docs.mulesoft.com/mule-runtime/latest/until-successful-scope'
  },
  'try': {
    displayName: 'Try Scope',
    description: 'Wraps processors in an error handling scope, enabling localized error handling within a flow.',
    category: 'Scope',
    runtimeNotes: 'Creates a new error handling context. Optionally starts a transaction. Errors can be caught by nested on-error-propagate or on-error-continue.',
    commonAttributes: {
      'transactionalAction': 'Transaction behavior: INDIFFERENT, ALWAYS_BEGIN, or BEGIN_OR_JOIN',
      'transactionType': 'Transaction type: LOCAL or XA',
      'doc:name': 'Display name shown in Anypoint Studio'
    },
    docsUrl: 'https://docs.mulesoft.com/mule-runtime/latest/try-scope-concept'
  },
  'raise-error': {
    displayName: 'Raise Error',
    description: 'Throws a Mule error with a specified type and description, triggering error handling.',
    category: 'Core',
    runtimeNotes: 'Immediately halts normal processing and triggers the nearest error handler. Custom error types must use a namespace (e.g. APP:MY_ERROR).',
    commonAttributes: {
      'type': 'The error type to raise (e.g. APP:NOT_FOUND)',
      'description': 'Human-readable error description',
      'doc:name': 'Display name shown in Anypoint Studio'
    },
    docsUrl: 'https://docs.mulesoft.com/mule-runtime/latest/raise-error-component-reference'
  },
  'logger': {
    displayName: 'Logger',
    description: 'Logs a message at a specified level, useful for debugging and monitoring flow execution.',
    category: 'Core',
    runtimeNotes: 'Non-blocking operation. Supports DataWeave expressions in the message. Output goes to the configured logging framework (log4j2).',
    commonAttributes: {
      'message': 'The message or DataWeave expression to log',
      'level': 'Log level: DEBUG, INFO, WARN, ERROR, TRACE',
      'category': 'Logger category for filtering in log configuration',
      'doc:name': 'Display name shown in Anypoint Studio'
    },
    docsUrl: 'https://docs.mulesoft.com/mule-runtime/latest/logger-component-reference'
  },
  'async': {
    displayName: 'Async Scope',
    description: 'Executes enclosed processors asynchronously in a separate thread, without blocking the main flow.',
    category: 'Scope',
    runtimeNotes: 'Receives a copy of the event. The main flow continues immediately. Errors inside async do not propagate to the caller.',
    commonAttributes: {
      'maxConcurrency': 'Maximum concurrent executions of this async block',
      'name': 'Name for the async scope',
      'doc:name': 'Display name shown in Anypoint Studio'
    },
    docsUrl: 'https://docs.mulesoft.com/mule-runtime/latest/async-scope-reference'
  },

  // ── Error Handling (3) ──────────────────────────────────────────────
  'error-handler': {
    displayName: 'Error Handler',
    description: 'Container for on-error strategies that defines how errors are handled within a flow or try scope.',
    category: 'Error Handling',
    runtimeNotes: 'Evaluated when an error occurs. Contains one or more on-error-propagate or on-error-continue blocks matched by error type.',
    commonAttributes: {
      'doc:name': 'Display name shown in Anypoint Studio',
      'ref': 'Reference to a global error handler defined elsewhere'
    },
    docsUrl: 'https://docs.mulesoft.com/mule-runtime/latest/error-handling'
  },
  'on-error-propagate': {
    displayName: 'On Error Propagate',
    description: 'Handles matched errors, executes its processors, then re-throws the error to the parent scope.',
    category: 'Error Handling',
    runtimeNotes: 'Rolls back any transaction. The error propagates up after the handler completes. The HTTP listener returns a 500 status by default.',
    commonAttributes: {
      'type': 'Comma-separated error types to match (e.g. HTTP:CONNECTIVITY, ANY)',
      'when': 'DataWeave expression for conditional error matching',
      'enableNotifications': 'Whether to fire error notifications (default true)',
      'doc:name': 'Display name shown in Anypoint Studio'
    },
    docsUrl: 'https://docs.mulesoft.com/mule-runtime/latest/on-error-scope-concept'
  },
  'on-error-continue': {
    displayName: 'On Error Continue',
    description: 'Handles matched errors and continues flow execution as if the error did not occur.',
    category: 'Error Handling',
    runtimeNotes: 'Commits any transaction. The result of the error handler processors becomes the output of the failed scope. HTTP listener returns 200 by default.',
    commonAttributes: {
      'type': 'Comma-separated error types to match (e.g. VALIDATION:INVALID_VALUE)',
      'when': 'DataWeave expression for conditional error matching',
      'enableNotifications': 'Whether to fire error notifications (default true)',
      'doc:name': 'Display name shown in Anypoint Studio'
    },
    docsUrl: 'https://docs.mulesoft.com/mule-runtime/latest/on-error-scope-concept'
  },

  // ── HTTP (4) ────────────────────────────────────────────────────────
  'http:listener': {
    displayName: 'HTTP Listener',
    description: 'Receives inbound HTTP requests on a configured path and method, acting as a flow source.',
    category: 'Connector',
    runtimeNotes: 'Non-blocking source. Each request spawns an event. Supports request streaming. Runs on the shared HTTP listener thread pool.',
    commonAttributes: {
      'config-ref': 'Reference to an http:listener-config',
      'path': 'URL path or path pattern (e.g. /api/users/*)',
      'allowedMethods': 'Comma-separated HTTP methods (GET, POST, etc.)',
      'doc:name': 'Display name shown in Anypoint Studio'
    },
    docsUrl: 'https://docs.mulesoft.com/http-connector/latest/http-listener-ref'
  },
  'http:listener-config': {
    displayName: 'HTTP Listener Configuration',
    description: 'Global configuration for HTTP listeners defining host, port, base path, and optional TLS.',
    category: 'Connector',
    runtimeNotes: 'Shared across multiple listeners. Creates a single server socket on the configured host:port.',
    commonAttributes: {
      'name': 'Configuration name referenced by listeners',
      'host': 'Hostname or IP to bind to (default 0.0.0.0)',
      'port': 'Port to listen on (e.g. 8081)',
      'basePath': 'Base URL path prepended to all listener paths'
    },
    docsUrl: 'https://docs.mulesoft.com/http-connector/latest/http-listener-ref'
  },
  'http:request': {
    displayName: 'HTTP Request',
    description: 'Sends an outbound HTTP request to an external service and returns the response.',
    category: 'Connector',
    runtimeNotes: 'Non-blocking operation using an async HTTP client. Supports streaming of request and response bodies.',
    commonAttributes: {
      'config-ref': 'Reference to an http:request-config',
      'method': 'HTTP method (GET, POST, PUT, DELETE, PATCH, etc.)',
      'path': 'Request path appended to the base URL',
      'doc:name': 'Display name shown in Anypoint Studio'
    },
    docsUrl: 'https://docs.mulesoft.com/http-connector/latest/http-request-ref'
  },
  'http:request-config': {
    displayName: 'HTTP Request Configuration',
    description: 'Global configuration for outbound HTTP requests defining the target host, port, protocol, and authentication.',
    category: 'Connector',
    runtimeNotes: 'Manages a connection pool to the target host. Shared across multiple request operations.',
    commonAttributes: {
      'name': 'Configuration name referenced by request operations',
      'host': 'Target hostname or IP address',
      'port': 'Target port number',
      'basePath': 'Base path prepended to all request paths'
    },
    docsUrl: 'https://docs.mulesoft.com/http-connector/latest/http-request-ref'
  },

  // ── Database (7) ───────────────────────────────────────────────────
  'db:select': {
    displayName: 'Database Select',
    description: 'Executes a SQL SELECT query and returns the result set as a list of records.',
    category: 'Connector',
    runtimeNotes: 'Returns a list of maps. Supports parameterized queries to prevent SQL injection. Result set is streamed by default.',
    commonAttributes: {
      'config-ref': 'Reference to a db:config',
      'doc:name': 'Display name shown in Anypoint Studio',
      'fetchSize': 'Number of rows fetched per database round-trip',
      'maxRows': 'Maximum number of rows to return'
    },
    docsUrl: 'https://docs.mulesoft.com/db-connector/latest/database-connector-select'
  },
  'db:insert': {
    displayName: 'Database Insert',
    description: 'Executes a SQL INSERT statement to add one or more rows to a database table.',
    category: 'Connector',
    runtimeNotes: 'Returns a statement result with the affected row count. Supports auto-generated keys retrieval.',
    commonAttributes: {
      'config-ref': 'Reference to a db:config',
      'doc:name': 'Display name shown in Anypoint Studio',
      'autoGenerateKeys': 'Whether to return auto-generated keys (default false)',
      'target': 'Variable to store the result'
    },
    docsUrl: 'https://docs.mulesoft.com/db-connector/latest/database-connector-insert'
  },
  'db:update': {
    displayName: 'Database Update',
    description: 'Executes a SQL UPDATE statement to modify existing rows in a database table.',
    category: 'Connector',
    runtimeNotes: 'Returns the number of affected rows. Supports parameterized queries for safe value binding.',
    commonAttributes: {
      'config-ref': 'Reference to a db:config',
      'doc:name': 'Display name shown in Anypoint Studio',
      'target': 'Variable to store the result',
      'transactionalAction': 'Transaction behavior: JOIN_IF_POSSIBLE, ALWAYS_JOIN, or NOT_SUPPORTED'
    },
    docsUrl: 'https://docs.mulesoft.com/db-connector/latest/database-connector-update'
  },
  'db:delete': {
    displayName: 'Database Delete',
    description: 'Executes a SQL DELETE statement to remove rows from a database table.',
    category: 'Connector',
    runtimeNotes: 'Returns the number of deleted rows. Use parameterized queries to prevent SQL injection.',
    commonAttributes: {
      'config-ref': 'Reference to a db:config',
      'doc:name': 'Display name shown in Anypoint Studio',
      'target': 'Variable to store the result',
      'transactionalAction': 'Transaction behavior: JOIN_IF_POSSIBLE, ALWAYS_JOIN, or NOT_SUPPORTED'
    },
    docsUrl: 'https://docs.mulesoft.com/db-connector/latest/database-connector-delete'
  },
  'db:bulk-insert': {
    displayName: 'Database Bulk Insert',
    description: 'Inserts multiple rows into a database table in a single batch operation for improved performance.',
    category: 'Connector',
    runtimeNotes: 'Accepts a collection as input. Executes as a single JDBC batch for better throughput than iterating with db:insert.',
    commonAttributes: {
      'config-ref': 'Reference to a db:config',
      'doc:name': 'Display name shown in Anypoint Studio',
      'target': 'Variable to store the result',
      'transactionalAction': 'Transaction behavior for the bulk operation'
    },
    docsUrl: 'https://docs.mulesoft.com/db-connector/latest/database-connector-insert'
  },
  'db:stored-procedure': {
    displayName: 'Database Stored Procedure',
    description: 'Calls a stored procedure or function in the database, supporting IN, OUT, and INOUT parameters.',
    category: 'Connector',
    runtimeNotes: 'Can return multiple result sets. OUT and INOUT parameters are included in the output payload.',
    commonAttributes: {
      'config-ref': 'Reference to a db:config',
      'doc:name': 'Display name shown in Anypoint Studio',
      'target': 'Variable to store the result',
      'transactionalAction': 'Transaction behavior for the procedure call'
    },
    docsUrl: 'https://docs.mulesoft.com/db-connector/latest/database-connector-stored-procedure'
  },
  'db:config': {
    displayName: 'Database Configuration',
    description: 'Global configuration for database connections defining the connection provider, URL, driver, and pooling.',
    category: 'Connector',
    runtimeNotes: 'Manages a JDBC connection pool. Supports MySQL, PostgreSQL, Oracle, SQL Server, Derby, and generic JDBC.',
    commonAttributes: {
      'name': 'Configuration name referenced by database operations',
      'host': 'Database server hostname',
      'port': 'Database server port',
      'database': 'Database or schema name'
    },
    docsUrl: 'https://docs.mulesoft.com/db-connector/latest/database-connector-connection'
  },

  // ── Transform (4) ──────────────────────────────────────────────────
  'ee:transform': {
    displayName: 'Transform Message',
    description: 'Transforms the message payload, attributes, or variables using DataWeave expressions.',
    category: 'Transform',
    runtimeNotes: 'Executes DataWeave scripts. Can set multiple outputs (payload, variables, attributes) in a single component.',
    commonAttributes: {
      'doc:name': 'Display name shown in Anypoint Studio',
      'doc:id': 'Unique component identifier',
      'xsi:schemaLocation': 'XML schema location for EE namespace'
    },
    docsUrl: 'https://docs.mulesoft.com/mule-runtime/latest/transform-component-about'
  },
  'ee:set-payload': {
    displayName: 'Transform Set Payload',
    description: 'Sets the message payload using a DataWeave script within an ee:transform component.',
    category: 'Transform',
    runtimeNotes: 'Replaces the payload with the DataWeave output. Supports output directives for MIME type and writer properties.',
    commonAttributes: {
      'resource': 'Path to an external .dwl DataWeave file',
      'doc:name': 'Display name shown in Anypoint Studio'
    },
    docsUrl: 'https://docs.mulesoft.com/mule-runtime/latest/transform-component-about'
  },
  'ee:set-variable': {
    displayName: 'Transform Set Variable',
    description: 'Sets a flow variable using a DataWeave script within an ee:transform component.',
    category: 'Transform',
    runtimeNotes: 'The variable is accessible via vars.<variableName> in subsequent processors.',
    commonAttributes: {
      'variableName': 'Name of the variable to set',
      'resource': 'Path to an external .dwl DataWeave file',
      'doc:name': 'Display name shown in Anypoint Studio'
    },
    docsUrl: 'https://docs.mulesoft.com/mule-runtime/latest/transform-component-about'
  },
  'ee:set-attributes': {
    displayName: 'Transform Set Attributes',
    description: 'Sets the message attributes using a DataWeave script within an ee:transform component.',
    category: 'Transform',
    runtimeNotes: 'Replaces message attributes (metadata such as HTTP headers, query params). Used less frequently than set-payload.',
    commonAttributes: {
      'resource': 'Path to an external .dwl DataWeave file',
      'doc:name': 'Display name shown in Anypoint Studio'
    },
    docsUrl: 'https://docs.mulesoft.com/mule-runtime/latest/transform-component-about'
  },

  // ── Validation (3) ─────────────────────────────────────────────────
  'validation:is-not-null': {
    displayName: 'Validate Is Not Null',
    description: 'Validates that a value is not null, throwing a VALIDATION:NULL error if validation fails.',
    category: 'Module',
    runtimeNotes: 'Throws VALIDATION:NULL error type on failure. Can be caught by error handlers matching that type.',
    commonAttributes: {
      'value': 'The value or expression to validate',
      'message': 'Custom error message on validation failure',
      'config-ref': 'Reference to a validation configuration',
      'doc:name': 'Display name shown in Anypoint Studio'
    },
    docsUrl: 'https://docs.mulesoft.com/validation-module/latest/'
  },
  'validation:is-not-blank-string': {
    displayName: 'Validate Is Not Blank String',
    description: 'Validates that a string value is not null, empty, or blank, throwing a VALIDATION:BLANK_STRING error on failure.',
    category: 'Module',
    runtimeNotes: 'Throws VALIDATION:BLANK_STRING error type on failure. Trims whitespace before checking.',
    commonAttributes: {
      'value': 'The string value or expression to validate',
      'message': 'Custom error message on validation failure',
      'config-ref': 'Reference to a validation configuration',
      'doc:name': 'Display name shown in Anypoint Studio'
    },
    docsUrl: 'https://docs.mulesoft.com/validation-module/latest/'
  },
  'validation:validates-with-schema': {
    displayName: 'Validate With Schema',
    description: 'Validates the payload against a JSON or XML schema, throwing a VALIDATION:INVALID_SCHEMA error on failure.',
    category: 'Module',
    runtimeNotes: 'Supports JSON Schema and XSD validation. Throws VALIDATION:INVALID_SCHEMA error type on failure.',
    commonAttributes: {
      'config-ref': 'Reference to a validation configuration',
      'schemas': 'Comma-separated paths to schema files',
      'schemaLanguage': 'Schema language: JSON or XSD',
      'doc:name': 'Display name shown in Anypoint Studio'
    },
    docsUrl: 'https://docs.mulesoft.com/validation-module/latest/'
  },

  // ── APIKit (2) ─────────────────────────────────────────────────────
  'apikit:router': {
    displayName: 'APIkit Router',
    description: 'Routes incoming HTTP requests to the correct flow based on the RAML or OAS API specification.',
    category: 'Module',
    runtimeNotes: 'Validates requests against the API spec (headers, query params, body). Routes by resource path and HTTP method to auto-generated flows.',
    commonAttributes: {
      'config-ref': 'Reference to an apikit:config',
      'doc:name': 'Display name shown in Anypoint Studio',
      'doc:id': 'Unique component identifier'
    },
    docsUrl: 'https://docs.mulesoft.com/apikit/latest/'
  },
  'apikit:console': {
    displayName: 'APIkit Console',
    description: 'Exposes an interactive API console that renders the RAML or OAS specification for developers to explore.',
    category: 'Module',
    runtimeNotes: 'Serves a web UI at the configured path. Only available during development; typically disabled in production.',
    commonAttributes: {
      'config-ref': 'Reference to an apikit:config',
      'doc:name': 'Display name shown in Anypoint Studio',
      'doc:id': 'Unique component identifier'
    },
    docsUrl: 'https://docs.mulesoft.com/apikit/latest/'
  },

  // ── File / SFTP (4) ────────────────────────────────────────────────
  'file:read': {
    displayName: 'File Read',
    description: 'Reads the content of a file from the local file system and returns it as the message payload.',
    category: 'Connector',
    runtimeNotes: 'Returns file content as payload and file attributes (size, timestamp, etc.) as message attributes. Supports streaming.',
    commonAttributes: {
      'config-ref': 'Reference to a file:config',
      'path': 'Path to the file to read',
      'outputMimeType': 'MIME type to assign to the output (e.g. application/json)',
      'doc:name': 'Display name shown in Anypoint Studio'
    },
    docsUrl: 'https://docs.mulesoft.com/file-connector/latest/file-read'
  },
  'file:write': {
    displayName: 'File Write',
    description: 'Writes content to a file on the local file system, creating or overwriting as configured.',
    category: 'Connector',
    runtimeNotes: 'Supports OVERWRITE, APPEND, and CREATE_NEW write modes. Creates parent directories automatically.',
    commonAttributes: {
      'config-ref': 'Reference to a file:config',
      'path': 'Path of the file to write',
      'mode': 'Write mode: OVERWRITE, APPEND, or CREATE_NEW',
      'doc:name': 'Display name shown in Anypoint Studio'
    },
    docsUrl: 'https://docs.mulesoft.com/file-connector/latest/file-write'
  },
  'sftp:read': {
    displayName: 'SFTP Read',
    description: 'Reads a file from a remote SFTP server and returns its content as the message payload.',
    category: 'Connector',
    runtimeNotes: 'Establishes an SFTP connection, reads the file, and returns content with file attributes. Supports streaming.',
    commonAttributes: {
      'config-ref': 'Reference to an sftp:config',
      'path': 'Remote path to the file to read',
      'outputMimeType': 'MIME type to assign to the output',
      'doc:name': 'Display name shown in Anypoint Studio'
    },
    docsUrl: 'https://docs.mulesoft.com/sftp-connector/latest/sftp-read'
  },
  'sftp:write': {
    displayName: 'SFTP Write',
    description: 'Writes content to a file on a remote SFTP server, creating or overwriting as configured.',
    category: 'Connector',
    runtimeNotes: 'Supports OVERWRITE, APPEND, and CREATE_NEW write modes. Creates remote directories if they do not exist.',
    commonAttributes: {
      'config-ref': 'Reference to an sftp:config',
      'path': 'Remote path of the file to write',
      'mode': 'Write mode: OVERWRITE, APPEND, or CREATE_NEW',
      'doc:name': 'Display name shown in Anypoint Studio'
    },
    docsUrl: 'https://docs.mulesoft.com/sftp-connector/latest/sftp-write'
  },

  // ── VM (3) ─────────────────────────────────────────────────────────
  'vm:publish': {
    displayName: 'VM Publish',
    description: 'Publishes a message to an in-memory VM queue for asynchronous processing by a VM listener.',
    category: 'Connector',
    runtimeNotes: 'Fire-and-forget operation. The message is placed on the queue and the flow continues immediately.',
    commonAttributes: {
      'config-ref': 'Reference to a vm:config',
      'queueName': 'Name of the VM queue to publish to',
      'doc:name': 'Display name shown in Anypoint Studio',
      'sendCorrelationId': 'Whether to propagate the correlation ID (ALWAYS, NEVER, AUTO)'
    },
    docsUrl: 'https://docs.mulesoft.com/vm-connector/latest/vm-publish'
  },
  'vm:listener': {
    displayName: 'VM Listener',
    description: 'Listens for messages on an in-memory VM queue and triggers a flow for each received message.',
    category: 'Connector',
    runtimeNotes: 'Acts as a flow source. Dequeues messages from the specified VM queue and creates a Mule event for each.',
    commonAttributes: {
      'config-ref': 'Reference to a vm:config',
      'queueName': 'Name of the VM queue to listen on',
      'doc:name': 'Display name shown in Anypoint Studio',
      'numberOfConsumers': 'Number of concurrent consumers on the queue'
    },
    docsUrl: 'https://docs.mulesoft.com/vm-connector/latest/vm-listener'
  },
  'vm:consume': {
    displayName: 'VM Consume',
    description: 'Consumes a single message from a VM queue synchronously, waiting until a message is available or timeout.',
    category: 'Connector',
    runtimeNotes: 'Blocking operation that waits for a message. Use vm:listener for event-driven consumption instead.',
    commonAttributes: {
      'config-ref': 'Reference to a vm:config',
      'queueName': 'Name of the VM queue to consume from',
      'timeout': 'Maximum time to wait for a message in milliseconds',
      'doc:name': 'Display name shown in Anypoint Studio'
    },
    docsUrl: 'https://docs.mulesoft.com/vm-connector/latest/vm-consume'
  },

  // ── JMS (3) ────────────────────────────────────────────────────────
  'jms:publish': {
    displayName: 'JMS Publish',
    description: 'Publishes a message to a JMS queue or topic for consumption by JMS subscribers.',
    category: 'Connector',
    runtimeNotes: 'Fire-and-forget by default. Supports persistent and non-persistent delivery modes and message priority.',
    commonAttributes: {
      'config-ref': 'Reference to a jms:config',
      'destination': 'Name of the JMS queue or topic',
      'doc:name': 'Display name shown in Anypoint Studio',
      'deliveryMode': 'PERSISTENT or NON_PERSISTENT message delivery'
    },
    docsUrl: 'https://docs.mulesoft.com/jms-connector/latest/jms-publish'
  },
  'jms:listener': {
    displayName: 'JMS Listener',
    description: 'Listens for messages on a JMS queue or topic and triggers a flow for each received message.',
    category: 'Connector',
    runtimeNotes: 'Acts as a flow source. Supports durable and non-durable subscriptions for topics. Acknowledges messages automatically or manually.',
    commonAttributes: {
      'config-ref': 'Reference to a jms:config',
      'destination': 'Name of the JMS queue or topic to listen on',
      'ackMode': 'Acknowledgement mode: AUTO, MANUAL, IMMEDIATE, or DUPS_OK',
      'doc:name': 'Display name shown in Anypoint Studio'
    },
    docsUrl: 'https://docs.mulesoft.com/jms-connector/latest/jms-listener'
  },
  'jms:consume': {
    displayName: 'JMS Consume',
    description: 'Consumes a single message from a JMS queue synchronously, waiting until a message is available or timeout.',
    category: 'Connector',
    runtimeNotes: 'Blocking operation. For event-driven consumption, use jms:listener instead.',
    commonAttributes: {
      'config-ref': 'Reference to a jms:config',
      'destination': 'Name of the JMS queue or topic to consume from',
      'maximumWait': 'Maximum time to wait for a message in milliseconds',
      'doc:name': 'Display name shown in Anypoint Studio'
    },
    docsUrl: 'https://docs.mulesoft.com/jms-connector/latest/jms-consume'
  },

  // ── Salesforce (3) ─────────────────────────────────────────────────
  'salesforce:query': {
    displayName: 'Salesforce Query',
    description: 'Executes a SOQL query against a Salesforce org and returns the matching records.',
    category: 'Connector',
    runtimeNotes: 'Returns a list of Salesforce records. Supports streaming for large result sets. Uses the Salesforce REST API.',
    commonAttributes: {
      'config-ref': 'Reference to a salesforce:config',
      'doc:name': 'Display name shown in Anypoint Studio',
      'fetchSize': 'Number of records per page (batch size)',
      'target': 'Variable to store the query results'
    },
    docsUrl: 'https://docs.mulesoft.com/salesforce-connector/latest/salesforce-connector-query'
  },
  'salesforce:create': {
    displayName: 'Salesforce Create',
    description: 'Creates one or more new records in a Salesforce object (sObject).',
    category: 'Connector',
    runtimeNotes: 'Accepts a list of records. Returns a list of SaveResult objects with success status and IDs.',
    commonAttributes: {
      'config-ref': 'Reference to a salesforce:config',
      'type': 'The Salesforce object type (e.g. Account, Contact, Lead)',
      'doc:name': 'Display name shown in Anypoint Studio',
      'target': 'Variable to store the creation results'
    },
    docsUrl: 'https://docs.mulesoft.com/salesforce-connector/latest/salesforce-connector-create'
  },
  'salesforce:update': {
    displayName: 'Salesforce Update',
    description: 'Updates one or more existing records in a Salesforce object by their ID.',
    category: 'Connector',
    runtimeNotes: 'Accepts a list of records with Id field. Returns SaveResult objects indicating success or failure per record.',
    commonAttributes: {
      'config-ref': 'Reference to a salesforce:config',
      'type': 'The Salesforce object type (e.g. Account, Contact)',
      'doc:name': 'Display name shown in Anypoint Studio',
      'target': 'Variable to store the update results'
    },
    docsUrl: 'https://docs.mulesoft.com/salesforce-connector/latest/salesforce-connector-update'
  },

  // ── ObjectStore (4) ────────────────────────────────────────────────
  'os:store': {
    displayName: 'ObjectStore Store',
    description: 'Stores a key-value pair in the Mule ObjectStore, optionally with a time-to-live.',
    category: 'Connector',
    runtimeNotes: 'If the key already exists, the value is overwritten unless failIfPresent is set. Supports persistent and in-memory stores.',
    commonAttributes: {
      'key': 'The key under which to store the value',
      'objectStore': 'Reference to a named object store definition',
      'failIfPresent': 'Whether to fail if the key already exists (default false)',
      'doc:name': 'Display name shown in Anypoint Studio'
    },
    docsUrl: 'https://docs.mulesoft.com/object-store-connector/latest/object-store-to-store-and-retrieve'
  },
  'os:retrieve': {
    displayName: 'ObjectStore Retrieve',
    description: 'Retrieves a value from the ObjectStore by key, optionally providing a default if the key is not found.',
    category: 'Connector',
    runtimeNotes: 'Throws OS:KEY_NOT_FOUND if key does not exist and no default is provided.',
    commonAttributes: {
      'key': 'The key to retrieve',
      'objectStore': 'Reference to a named object store definition',
      'defaultValue': 'Default value if the key is not found',
      'doc:name': 'Display name shown in Anypoint Studio'
    },
    docsUrl: 'https://docs.mulesoft.com/object-store-connector/latest/object-store-to-store-and-retrieve'
  },
  'os:contains': {
    displayName: 'ObjectStore Contains',
    description: 'Checks whether a key exists in the ObjectStore, returning true or false.',
    category: 'Connector',
    runtimeNotes: 'Returns a boolean payload. Does not retrieve the value, only checks existence.',
    commonAttributes: {
      'key': 'The key to check for existence',
      'objectStore': 'Reference to a named object store definition',
      'doc:name': 'Display name shown in Anypoint Studio',
      'target': 'Variable to store the boolean result'
    },
    docsUrl: 'https://docs.mulesoft.com/object-store-connector/latest/object-store-to-store-and-retrieve'
  },
  'os:remove': {
    displayName: 'ObjectStore Remove',
    description: 'Removes a key-value pair from the ObjectStore by key.',
    category: 'Connector',
    runtimeNotes: 'Throws OS:KEY_NOT_FOUND if the key does not exist. The value is permanently deleted.',
    commonAttributes: {
      'key': 'The key to remove',
      'objectStore': 'Reference to a named object store definition',
      'doc:name': 'Display name shown in Anypoint Studio',
      'target': 'Variable to store the removed value'
    },
    docsUrl: 'https://docs.mulesoft.com/object-store-connector/latest/object-store-to-store-and-retrieve'
  },

  // ── Scheduler (1) ──────────────────────────────────────────────────
  'scheduler': {
    displayName: 'Scheduler',
    description: 'Triggers a flow at fixed intervals or on a cron schedule, acting as a time-based flow source.',
    category: 'Core',
    runtimeNotes: 'Acts as a flow source. Supports fixed-frequency and cron-based scheduling strategies. Disabling the flow stops the scheduler.',
    commonAttributes: {
      'doc:name': 'Display name shown in Anypoint Studio',
      'frequency': 'Interval between triggers (for fixed-frequency)',
      'timeUnit': 'Time unit for frequency: MILLISECONDS, SECONDS, MINUTES, HOURS, DAYS',
      'startDelay': 'Initial delay before the first trigger'
    },
    docsUrl: 'https://docs.mulesoft.com/mule-runtime/latest/scheduler-concept'
  }
};
