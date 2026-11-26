export type ChecklistType = 'CODE' | 'PARTIAL' | 'MANUAL';
export type Severity = 'HIGH' | 'MEDIUM' | 'LOW' | 'PASSED' | 'NA';

export interface ChecklistRow {
  id: number;
  section: string;
  sectionRoman: string;
  title: string;
  type: ChecklistType;
  severity: Severity;
  description: string;
}

export const QUALITY_CHECKLIST_45: ChecklistRow[] = [
  // Section I — Documentation (Rows 1–5) [MANUAL]
  { id: 1, sectionRoman: 'I', section: 'Documentation', title: 'API specification exists and is up to date', type: 'MANUAL', severity: 'MEDIUM', description: 'API RAML/OAS specification is present, versioned, and reflects current endpoints' },
  { id: 2, sectionRoman: 'I', section: 'Documentation', title: 'README or project documentation is present', type: 'MANUAL', severity: 'LOW', description: 'Project README contains build, test, and deployment instructions' },
  { id: 3, sectionRoman: 'I', section: 'Documentation', title: 'Flow-level doc:description added to all flows', type: 'MANUAL', severity: 'LOW', description: 'Key flows include descriptive documentation for maintainability' },
  { id: 4, sectionRoman: 'I', section: 'Documentation', title: 'DataWeave files have header comments', type: 'MANUAL', severity: 'LOW', description: 'DataWeave transformations document input/output structures and intent' },
  { id: 5, sectionRoman: 'I', section: 'Documentation', title: 'Postman collection or test evidence provided', type: 'MANUAL', severity: 'MEDIUM', description: 'Test assets or automated integration collections exist in the repository' },

  // Section II — Project Structure (Rows 6–12) [CODE]
  { id: 6, sectionRoman: 'II', section: 'Project Structure', title: 'pom.xml present and well-formed', type: 'CODE', severity: 'HIGH', description: 'Maven build file pom.xml is located in project root and is valid' },
  { id: 7, sectionRoman: 'II', section: 'Project Structure', title: 'mule-artifact.json present with correct runtime version', type: 'CODE', severity: 'HIGH', description: 'Mule deployment descriptor mule-artifact.json exists' },
  { id: 8, sectionRoman: 'II', section: 'Project Structure', title: 'src/main/mule contains at least one flow XML', type: 'CODE', severity: 'HIGH', description: 'Mule application source directory contains flow definitions' },
  { id: 9, sectionRoman: 'II', section: 'Project Structure', title: 'src/main/resources/config contains environment property files', type: 'CODE', severity: 'MEDIUM', description: 'Configuration properties are separated by environment' },
  { id: 10, sectionRoman: 'II', section: 'Project Structure', title: 'src/test/munit contains at least one MUnit test suite', type: 'CODE', severity: 'HIGH', description: 'Automated MUnit testing directory has test suites' },
  { id: 11, sectionRoman: 'II', section: 'Project Structure', title: 'Project name follows kebab-case naming convention', type: 'CODE', severity: 'LOW', description: 'Maven artifactId and workspace project naming use kebab-case' },
  { id: 12, sectionRoman: 'II', section: 'Project Structure', title: 'No backup files committed (*.bak, *_backup*, backup/)', type: 'CODE', severity: 'LOW', description: 'Temporary, editor backup, or scrap files are eliminated' },

  // Section III — Functionality (Rows 13–17) [MANUAL]
  { id: 13, sectionRoman: 'III', section: 'Functionality', title: 'Flows implement the agreed API contract', type: 'MANUAL', severity: 'HIGH', description: 'Message structures conform to API specification schema models' },
  { id: 14, sectionRoman: 'III', section: 'Functionality', title: 'All RAML/OAS endpoints have corresponding APIKit routes', type: 'MANUAL', severity: 'HIGH', description: 'Every declared resource path is handled by an APIKit flow' },
  { id: 15, sectionRoman: 'III', section: 'Functionality', title: 'Peer review completed by another developer', type: 'MANUAL', severity: 'MEDIUM', description: 'Code review sign-off recorded before release' },
  { id: 16, sectionRoman: 'III', section: 'Functionality', title: 'Test evidence provided for happy path', type: 'MANUAL', severity: 'MEDIUM', description: 'Successful execution logs or test runs documented' },
  { id: 17, sectionRoman: 'III', section: 'Functionality', title: 'Test evidence provided for error scenarios', type: 'MANUAL', severity: 'MEDIUM', description: '4xx/5xx handling scenarios verified' },

  // Section IV — Logging & Monitoring (Rows 18–22) [PARTIAL]
  { id: 18, sectionRoman: 'IV', section: 'Logging & Monitoring', title: 'log4j2.xml is present and not default', type: 'PARTIAL', severity: 'MEDIUM', description: 'Custom logging configuration log4j2.xml tuned for environment' },
  { id: 19, sectionRoman: 'IV', section: 'Logging & Monitoring', title: 'Correlation ID is logged in at least one flow', type: 'PARTIAL', severity: 'HIGH', description: 'Traceability maintained with correlationId or correlationId variable' },
  { id: 20, sectionRoman: 'IV', section: 'Logging & Monitoring', title: 'No sensitive data in Logger body', type: 'PARTIAL', severity: 'HIGH', description: 'No passwords, tokens, or PII exposed in log messages' },
  { id: 21, sectionRoman: 'IV', section: 'Logging & Monitoring', title: 'Monitoring/logging dashboard configured', type: 'MANUAL', severity: 'MEDIUM', description: 'Anypoint Monitoring or external APM telemetry active' },
  { id: 22, sectionRoman: 'IV', section: 'Logging & Monitoring', title: 'Log levels appropriate -- no DEBUG in production config', type: 'PARTIAL', severity: 'HIGH', description: 'No active DEBUG loggers inflating CloudHub log overhead' },

  // Section V — Error Handling (Rows 23–28) [CODE]
  { id: 23, sectionRoman: 'V', section: 'Error Handling', title: 'Every flow has an error handler', type: 'CODE', severity: 'HIGH', description: 'Every top-level flow defines or references an error handler scope' },
  { id: 24, sectionRoman: 'V', section: 'Error Handling', title: 'Global error handler defined in global.xml', type: 'CODE', severity: 'HIGH', description: 'A shared fallback error handler config is present' },
  { id: 25, sectionRoman: 'V', section: 'Error Handling', title: 'on-error-propagate or on-error-continue used', type: 'CODE', severity: 'HIGH', description: 'Explicit error routing used instead of unhandled crashes' },
  { id: 26, sectionRoman: 'V', section: 'Error Handling', title: 'HTTP status codes set correctly in error handlers', type: 'CODE', severity: 'MEDIUM', description: 'httpStatus variable set appropriately (400, 404, 500, etc.)' },
  { id: 27, sectionRoman: 'V', section: 'Error Handling', title: 'Consistent error response format used', type: 'CODE', severity: 'MEDIUM', description: 'Error payload matches standard error schema' },
  { id: 28, sectionRoman: 'V', section: 'Error Handling', title: 'Reprocessing/retry strategy agreed with source system', type: 'CODE', severity: 'LOW', description: 'until-successful or Dead Letter Queue strategy configured' },

  // Section VI — Security (Rows 29–38) [CODE + PARTIAL]
  { id: 29, sectionRoman: 'VI', section: 'Security', title: 'No hardcoded credentials in any XML or DWL file', type: 'CODE', severity: 'HIGH', description: 'No plaintext passwords, client secrets, or private keys in code' },
  { id: 30, sectionRoman: 'VI', section: 'Security', title: 'Secure properties used for all sensitive config values', type: 'CODE', severity: 'HIGH', description: 'Sensitive tokens wrapped with ${secure::...}' },
  { id: 31, sectionRoman: 'VI', section: 'Security', title: 'Mule Secure Properties uses AES-CBC algorithm', type: 'CODE', severity: 'HIGH', description: 'Encryption algorithm configured securely' },
  { id: 32, sectionRoman: 'VI', section: 'Security', title: 'Credentials Vault does not use a hardcoded encryption key', type: 'CODE', severity: 'HIGH', description: 'Mule encryption key passed as runtime param (-Dmule.key)' },
  { id: 33, sectionRoman: 'VI', section: 'Security', title: 'Encryption key is not logged', type: 'CODE', severity: 'HIGH', description: 'Log messages do not print mule.key or decrypted values' },
  { id: 34, sectionRoman: 'VI', section: 'Security', title: 'API versioning present in RAML/OAS and pom.xml', type: 'CODE', severity: 'MEDIUM', description: 'Version identifiers aligned across pom and API definition' },
  { id: 35, sectionRoman: 'VI', section: 'Security', title: 'HTTP Listener uses HTTPS (not HTTP)', type: 'CODE', severity: 'HIGH', description: 'TLS/HTTPS configured for incoming endpoints' },
  { id: 36, sectionRoman: 'VI', section: 'Security', title: 'TLS configuration present on HTTP Listener', type: 'CODE', severity: 'HIGH', description: 'tls:context referenced by HTTP listener config' },
  { id: 37, sectionRoman: 'VI', section: 'Security', title: 'Trust Store does not have insecure="true"', type: 'CODE', severity: 'HIGH', description: 'Certificate validation is not disabled' },
  { id: 38, sectionRoman: 'VI', section: 'Security', title: 'No secrets committed in git history', type: 'PARTIAL', severity: 'HIGH', description: 'Git repository history free of plaintext credentials' },

  // Section VII — Performance (Rows 39–43) [PARTIAL]
  { id: 39, sectionRoman: 'VII', section: 'Performance', title: 'HTTP Request timeout is configured', type: 'PARTIAL', severity: 'MEDIUM', description: 'Outbound request configs define responseTimeout' },
  { id: 40, sectionRoman: 'VII', section: 'Performance', title: 'Reconnection strategy count is configurable', type: 'PARTIAL', severity: 'LOW', description: 'Reconnection count externalized via property' },
  { id: 41, sectionRoman: 'VII', section: 'Performance', title: 'Reconnection strategy frequency is configurable', type: 'PARTIAL', severity: 'LOW', description: 'Reconnection frequency externalized via property' },
  { id: 42, sectionRoman: 'VII', section: 'Performance', title: 'Connection pool configured for DB connectors', type: 'PARTIAL', severity: 'MEDIUM', description: 'Database pooled data sources configured' },
  { id: 43, sectionRoman: 'VII', section: 'Performance', title: 'Performance testing completed and results documented', type: 'MANUAL', severity: 'MEDIUM', description: 'Load testing benchmarks recorded' },

  // Section VIII — NFR (Rows 44–48) [MANUAL]
  { id: 44, sectionRoman: 'VIII', section: 'NFR', title: 'Non-functional requirements reviewed and met', type: 'MANUAL', severity: 'MEDIUM', description: 'Review against enterprise architectural standards' },
  { id: 45, sectionRoman: 'VIII', section: 'NFR', title: 'SLA for response times agreed and documented', type: 'MANUAL', severity: 'MEDIUM', description: 'Response latency expectations defined' },
  { id: 46, sectionRoman: 'VIII', section: 'NFR', title: 'Scalability requirements reviewed', type: 'MANUAL', severity: 'MEDIUM', description: 'Worker sizing, horizontal scaling, or clustering evaluated' },
  { id: 47, sectionRoman: 'VIII', section: 'NFR', title: 'Availability/uptime requirements met', type: 'MANUAL', severity: 'MEDIUM', description: 'HA/multi-region requirements validated' },
  { id: 48, sectionRoman: 'VIII', section: 'NFR', title: 'API versioning consistent across pom.xml and RAML/OAS', type: 'MANUAL', severity: 'LOW', description: 'Lifecycle versioning aligned' },

  // Section IX — Connectors & Config (Rows 49–60) [CODE]
  { id: 49, sectionRoman: 'IX', section: 'Connectors & Config', title: 'All connector configs stored in global.xml', type: 'CODE', severity: 'MEDIUM', description: 'Shared connector configs centralized in global file' },
  { id: 50, sectionRoman: 'IX', section: 'Connectors & Config', title: 'No duplicate connector configurations', type: 'CODE', severity: 'MEDIUM', description: 'No redundant connection configs' },
  { id: 51, sectionRoman: 'IX', section: 'Connectors & Config', title: 'AutoDiscovery configured to register app in API Manager', type: 'CODE', severity: 'HIGH', description: 'api-gateway:autodiscovery element present' },
  { id: 52, sectionRoman: 'IX', section: 'Connectors & Config', title: 'AutoDiscovery API ID uses a property (not hardcoded)', type: 'CODE', severity: 'HIGH', description: 'apiId="${api.id}" externalized' },
  { id: 53, sectionRoman: 'IX', section: 'Connectors & Config', title: 'HTTP Listener port uses a property', type: 'CODE', severity: 'LOW', description: 'port="${http.port}" externalized' },
  { id: 54, sectionRoman: 'IX', section: 'Connectors & Config', title: 'HTTP Request Configuration has response timeout set', type: 'CODE', severity: 'MEDIUM', description: 'responseTimeout set on http:request-config' },
  { id: 55, sectionRoman: 'IX', section: 'Connectors & Config', title: 'HTTP Requestor references a TLS Configuration', type: 'CODE', severity: 'MEDIUM', description: 'tls:context referenced by outbound HTTPS requests' },
  { id: 56, sectionRoman: 'IX', section: 'Connectors & Config', title: 'HTTP Requestor does not use dynamic default headers/params', type: 'CODE', severity: 'LOW', description: 'Static configuration avoids unnecessary thread contention' },
  { id: 57, sectionRoman: 'IX', section: 'Connectors & Config', title: 'Key Store path is configurable', type: 'CODE', severity: 'MEDIUM', description: 'key-store path uses ${...} property' },
  { id: 58, sectionRoman: 'IX', section: 'Connectors & Config', title: 'Trust Store path is configurable', type: 'CODE', severity: 'MEDIUM', description: 'trust-store path uses ${...} property' },
  { id: 59, sectionRoman: 'IX', section: 'Connectors & Config', title: 'MSSQL DB hostname is not hardcoded', type: 'CODE', severity: 'MEDIUM', description: 'Database host uses externalized property' },
  { id: 60, sectionRoman: 'IX', section: 'Connectors & Config', title: 'Oracle DB has connection pool configured', type: 'CODE', severity: 'MEDIUM', description: 'PoolingProfile defined on Oracle DB connections' },

  // Section X — Alerts & Configurations (Rows 61–65) [MANUAL]
  { id: 61, sectionRoman: 'X', section: 'Alerts & Configurations', title: 'Alerts configured in Anypoint Monitoring', type: 'MANUAL', severity: 'MEDIUM', description: 'Threshold alerts configured for errors and CPU/memory' },
  { id: 62, sectionRoman: 'X', section: 'Alerts & Configurations', title: 'Anypoint MQ dead-letter queues configured (if applicable)', type: 'MANUAL', severity: 'MEDIUM', description: 'Poison message recovery defined for message queues' },
  { id: 63, sectionRoman: 'X', section: 'Alerts & Configurations', title: 'API policies applied in API Manager', type: 'MANUAL', severity: 'HIGH', description: 'Client ID enforcement, Rate Limiting, or JWT validation active' },
  { id: 64, sectionRoman: 'X', section: 'Alerts & Configurations', title: 'Firewall rules submitted and approved (if applicable)', type: 'MANUAL', severity: 'MEDIUM', description: 'VPC/DLB or CloudHub dedicated balancer network rules set' },
  { id: 65, sectionRoman: 'X', section: 'Alerts & Configurations', title: 'VIP/load balancer config requested (if applicable)', type: 'MANUAL', severity: 'LOW', description: 'External ingress routes established' },

  // Section XI — Code Quality (Rows 66–76) [CODE]
  { id: 66, sectionRoman: 'XI', section: 'Code Quality', title: 'Flow names follow kebab-case naming convention', type: 'CODE', severity: 'LOW', description: 'Consistent naming like get-customer-flow' },
  { id: 67, sectionRoman: 'XI', section: 'Code Quality', title: 'Sub-flow names follow kebab-case naming convention', type: 'CODE', severity: 'LOW', description: 'Consistent naming like transform-order-sub-flow' },
  { id: 68, sectionRoman: 'XI', section: 'Code Quality', title: 'No commented-out code blocks in XML files', type: 'CODE', severity: 'LOW', description: 'Unused XML components removed rather than left in comments' },
  { id: 69, sectionRoman: 'XI', section: 'Code Quality', title: 'DataWeave transformations in external .dwl files', type: 'CODE', severity: 'MEDIUM', description: 'Large transforms stored in src/main/resources/dwl/' },
  { id: 70, sectionRoman: 'XI', section: 'Code Quality', title: 'No single DWL file exceeds recommended size limit', type: 'CODE', severity: 'LOW', description: 'DataWeave files kept under 200 lines for modularity' },
  { id: 71, sectionRoman: 'XI', section: 'Code Quality', title: 'DataWeave variables use camelCase naming', type: 'CODE', severity: 'LOW', description: 'DataWeave var/fun identifiers use camelCase' },
  { id: 72, sectionRoman: 'XI', section: 'Code Quality', title: 'Null-safety checks present for optional fields in DWL', type: 'CODE', severity: 'LOW', description: 'Default fallback values or ?/if checks present' },
  { id: 73, sectionRoman: 'XI', section: 'Code Quality', title: 'APIKit Global exception strategy present', type: 'CODE', severity: 'MEDIUM', description: 'Standard APIKit error handler mapping 400/404/405/415/500' },
  { id: 74, sectionRoman: 'XI', section: 'Code Quality', title: 'APIKit used to auto-generate implementation interface', type: 'CODE', severity: 'MEDIUM', description: 'Interface scaffolding generated from API specification' },
  { id: 75, sectionRoman: 'XI', section: 'Code Quality', title: 'Configuration files do not contain too many flows', type: 'CODE', severity: 'LOW', description: 'XML files keep under 10 flows per file' },
  { id: 76, sectionRoman: 'XI', section: 'Code Quality', title: 'No Mule 3 syntax or components detected', type: 'CODE', severity: 'LOW', description: 'No legacy Mule 3 tags' },

  // Section XII — DevOps / CI/CD (Rows 77–84) [CODE + PARTIAL]
  { id: 77, sectionRoman: 'XII', section: 'DevOps / CI/CD', title: 'CI/CD pipeline file present', type: 'CODE', severity: 'MEDIUM', description: 'GitHub Actions, Jenkinsfile, or GitLab CI configuration exists' },
  { id: 78, sectionRoman: 'XII', section: 'DevOps / CI/CD', title: 'Pipeline deploys to at least one non-production environment', type: 'PARTIAL', severity: 'MEDIUM', description: 'Automated deployment to dev/test configured' },
  { id: 79, sectionRoman: 'XII', section: 'DevOps / CI/CD', title: 'Connector/plugin versions pinned in pom.xml', type: 'CODE', severity: 'HIGH', description: 'No LATEST or RELEASE version strings in pom.xml' },
  { id: 80, sectionRoman: 'XII', section: 'DevOps / CI/CD', title: 'maven.compiler.source matches target Java version', type: 'CODE', severity: 'MEDIUM', description: 'Java 8/11/17 compatibility set properly in pom.xml' },
  { id: 81, sectionRoman: 'XII', section: 'DevOps / CI/CD', title: 'mule-artifact.json secureProperties lists all secure keys', type: 'CODE', severity: 'HIGH', description: 'secureProperties array lists encrypted property keys' },
  { id: 82, sectionRoman: 'XII', section: 'DevOps / CI/CD', title: 'No SNAPSHOT versions in production pom.xml', type: 'CODE', severity: 'HIGH', description: 'Production releases avoid SNAPSHOT dependencies' },
  { id: 83, sectionRoman: 'XII', section: 'DevOps / CI/CD', title: 'All target environments have corresponding config files', type: 'CODE', severity: 'MEDIUM', description: 'Properties present for dev, test, staging, prod' },
  { id: 84, sectionRoman: 'XII', section: 'DevOps / CI/CD', title: 'MUnit test coverage present for all main flows', type: 'CODE', severity: 'HIGH', description: 'MUnit test coverage covers core API flows' },

  // Section XIII — Platform (Rows 85–91) [PARTIAL]
  { id: 85, sectionRoman: 'XIII', section: 'Platform', title: 'API registered in API Manager', type: 'PARTIAL', severity: 'HIGH', description: 'API instance linked to Anypoint API Manager' },
  { id: 86, sectionRoman: 'XIII', section: 'Platform', title: 'API policies applied and active', type: 'MANUAL', severity: 'HIGH', description: 'Security and governance policies active' },
  { id: 87, sectionRoman: 'XIII', section: 'Platform', title: 'Application deployed and running in target environment', type: 'MANUAL', severity: 'HIGH', description: 'CloudHub / RTF deployment healthy' },
  { id: 88, sectionRoman: 'XIII', section: 'Platform', title: 'Exchange asset published for RAML/OAS spec', type: 'MANUAL', severity: 'MEDIUM', description: 'Contract asset published to Anypoint Exchange' },
  { id: 89, sectionRoman: 'XIII', section: 'Platform', title: 'Anypoint MQ queues provisioned (if applicable)', type: 'MANUAL', severity: 'MEDIUM', description: 'Queues and exchanges created in MQ manager' },
  { id: 90, sectionRoman: 'XIII', section: 'Platform', title: 'Object Store v2 enabled for the environment (if applicable)', type: 'MANUAL', severity: 'LOW', description: 'OSv2 enabled for stateful microservices' },
  { id: 91, sectionRoman: 'XIII', section: 'Platform', title: 'Anypoint Monitoring alerts active', type: 'MANUAL', severity: 'MEDIUM', description: 'Health alerts operational' },
];
