# Changelog

All notable changes to **MuleGuard Pro** will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.2.0] - 2026-11-26
### Added
- **API-Led Architecture & Module Hierarchy in Flow Explorer:** Automatically groups the project by API Name and MuleSoft API-Led Connectivity layers (Experience APIs `eAPI`, Process APIs `pAPI`, and System APIs `sAPI`).
- **Enriched Connector Symbols & In/Out Payload Contracts:** Real-time hover tooltips now feature Anypoint Studio component symbols, technical classifications, and exact Input/Output message payload contracts (headers, variables, response data).

## [1.1.0] - 2026-11-26
### Added
- **Interactive UI Architecture & Flow Inspector:** Clicking any connector or message processor in the Flow Visualizer (`Ctrl+Shift+V`) displays a live side inspector with full XML attribute properties, threading & runtime model, plain-English summary, and payload code blocks.
- **Executive Architecture & Delivery Review Dashboard (`muleguard.showExecutiveDashboard`):** Tailored views for Integration Architects (security posture, thread concurrency, NFRs) and Delivery Managers (automated pass rate, release readiness gates, tech debt).
- **DataWeave File Logic Explainer (`muleguard.explainDataWeave`):** Structural AST breakdown of `.dwl` transformations showing declared variables, helper functions, and business transformation pipeline.

## [1.0.2] - 2026-11-26
### Added
- **DataWeave Hover Intelligence & Plain-English Explainer:** Hovering over any DataWeave function (`map`, `filter`, `reduce`, `groupBy`, `distinctBy`, `pluck`, `sizeOf`, `isEmpty`, `uuid`, etc.) or context variable (`payload`, `vars`, `attributes`, `default`, `if/else`) inside `.dwl` or `<ee:transform>` displays a human-readable explanation, type signature, and live example.

## [1.0.1] - 2026-11-26
### Changed
- Brand new ultra-premium high-tech cyber shield logo featuring "MuleGuard by Niranjan" branding with 3D glassmorphism and cyan MuleSoft integration nodes.

## [1.0.0] - 2026-11-26
### Added
- Enterprise 7-step Code Review engine and 45-row quality checklist (`code-review-report.md`).
- Offline Connector Intelligence and rich hover tooltips for 58 Mule connectors.
- Interactive Flow Visualizer WebView panel (`Ctrl+Shift+V`).
- Mule Project Explorer TreeView sidebar.
- 22 `mg-` Mule 4 XML snippets and 8 DataWeave snippets.
- DataWeave 2.0 TextMate syntax highlighting.
- Environment YAML Config Diff (`muleguard.diffEnvConfigs`).
- Workspace Secret Scanner (`muleguard.scanSecrets`).
- Flow Complexity and Maintainability Metrics (`muleguard.showComplexityMetrics`).

## [0.2.0] - 2026-11-24

### Added
- **One-Click Quick Fixes (`CodeActionProvider`):**
  - Replace hardcoded secrets (`MG001`) with `${secure::<key>}` and automatically create/update `src/main/resources/secure.yaml`.
  - Insert `<error-handler>` with `<on-error-propagate>` at the end of flows missing error handling (`MG002`).
  - Insert `<logger level="INFO" message="Flow started" />` at the start of flows missing loggers (`MG003`).
  - Append ` default ''` (String) or ` default 0` (Number) to unguarded DataWeave expressions (`MG006`) with field-type inference.
  - Convert `<logger level="DEBUG">` (`MG008`) to `INFO` or remove the logger line.
- **DataWeave Null Safety (`MG006`):** Scan standalone `.dwl` files and inline DataWeave inside `<ee:transform>` blocks for unguarded `payload.*.*`, `vars.*.*`, and `attributes.*.*` accesses without `default` or `if`.
- **vCore Cost Guard:**
  - Flag `<db:select>` or `<http:request>` inside `<foreach>` (`MG007`) as an Error recommending Batch processing.
  - Flag `<logger level="DEBUG">` (`MG008`) as a Warning due to increased CloudHub log cost.
- **Batch Fixing Command:** Added `MuleGuard Pro: Fix All Auto-Fixable Issues` (`muleguard.fixAll`).
- **Marketplace Metadata:** Added `LICENSE`, `CHANGELOG.md`, `icon.png`, and repository links.

## [0.1.0] - 2026-11-24

### Added
- Initial **MuleGuard** MVP static analysis engine for MuleSoft XML files:
  - `MG001`: Hardcoded secrets check (`password`, `clientSecret`, `clientId`).
  - `MG002`: Missing `<error-handler>` / `<on-error-propagate>` / `<on-error-continue>` check.
  - `MG003`: Missing `<logger>` check.
  - `MG004`: Missing validation on `<http:listener>` flows.
  - `MG005`: Missing MUnit test coverage in `src/test/munit/`.
- Live status bar indicator (`MuleGuard: X Issues`), `muleguard.scanWorkspace` command, and `muleguard.enable` configuration toggle.
