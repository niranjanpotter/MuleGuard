# Changelog

All notable changes to **MuleGuard** will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.4] - 2026-11-26
### Added
- **Architect-Grade DataWeave Hover & Logic Explainer:** Hovering over any DataWeave function (`map`, `filter`, `reduce`, `groupBy`, `distinctBy`, `flatMap`, `flatten`, `pluck`, `mapObject`, `filterObject`, `sizeOf`, `isEmpty`, `write`, `read`, `update`, `do`, `p`, etc.) now reveals:
  - 📖 **Core Logic & Purpose**: Exactly what the transformation calculates.
  - 💡 **Plain-English Explanation**: Easy-to-understand summary for junior and senior devs.
  - 🎯 **Why & When To Use (Architect Perspective)**: Clear architectural use-cases.
  - 🚀 **Performance Optimization & Code Quality Advice**: Prevents O(N²) nested loops, preserves streaming, avoids OutOfMemory errors on `sizeOf()`, and provides memory safety tips.
  - 💡 **Pro Patterns & Cleaner Alternatives**: Modern idiomatic alternatives (positional shortcuts `$`, `sum()`, `valuesOf()`, `update`, Elvis patterns).
- **XML DataWeave Hover Integration:** DataWeave hover tooltips now work seamlessly inside Mule XML files (inside `<ee:transform>`, `<ee:set-payload>`, and `#[...]` MEL/DW expressions) as well as standalone `.dwl` files.
- **Context Variables & Operator Intelligence:** Rich hover explanations for `payload` (streaming & memory), `vars` (scoping), `attributes` (metadata preservation), `error`, `correlationId`, `default`, `if/else`, and `as`.

## [1.0.3] - 2026-11-26
### Changed
- **Clean Natural Mule Project Structure:** Reverted Flow Explorer to the clean, familiar 4-category layout (`Mule Flows & Sub-Flows`, `DataWeave Transformations`, `MUnit Test Suites`, `Environment Configs`) that automatically adapts to the project's actual XML files without artificial layers.
- **Strict Deduplication:** Eliminated duplicate configuration files and repeated flows using canonical path hashing and filename deduplication.

## [1.0.2] - 2026-11-26
### Fixed
- **Eliminated Duplicate Explorer Items:** Fixed glob matching in Flow Explorer to ensure environment YAML configs, flows, and test suites are strictly deduplicated with zero repeated entries.

## [1.0.1] - 2026-11-26
### Added
- **API-Led Architecture & Module Hierarchy in Flow Explorer:** Automatically organizes the project by API Modules and MuleSoft API-Led Connectivity layers (Experience APIs `eAPI`, Process APIs `pAPI`, and System APIs `sAPI`).
- **Interactive UI Architecture & Flow Inspector:** Clicking any connector or message processor in the Flow Visualizer (`Ctrl+Shift+V`) displays a live side inspector with full XML attribute properties, threading & runtime model, plain-English summary, and payload code blocks.
- **DataWeave Hover Intelligence & Logic Explainer:** Hovering over any DataWeave function (`map`, `filter`, `reduce`, `groupBy`, `distinctBy`, `pluck`, `sizeOf`, `isEmpty`, `uuid`, etc.) or context variable (`payload`, `vars`, `attributes`, `default`, `if/else`) displays a human-readable explanation, type signature, and live example.
- **Executive Architecture & Delivery Review Dashboard (`muleguard.showExecutiveDashboard`):** Tailored views for Integration Architects (security posture, thread concurrency, NFRs) and Delivery Managers (automated pass rate, release readiness gates, tech debt).
- **Enriched Connector Symbols & In/Out Payload Contracts:** Real-time hover tooltips now feature Anypoint Studio component symbols, technical classifications, and exact Input/Output message payload contracts.
- **Brand New Premium Logo:** High-tech cyber shield with glowing cyan MuleSoft integration circuits and "MuleGuard by Niranjan" branding.

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
