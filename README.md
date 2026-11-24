# MuleGuard Pro

**Guardrails for MuleSoft - Secure, Compliant Mule APIs**

MuleGuard Pro is a static analysis and one-click auto-fix VS Code extension for MuleSoft XML and DataWeave (`.dwl`) files. It catches security, reliability, DataWeave null-safety, CloudHub vCore cost, and MUnit coverage issues in real time and provides Quick Fixes plus batch fixing.

## Rules (Static Analysis)

| Code | Severity | Rule | Message | Auto-Fix |
| --- | --- | --- | --- | --- |
| `MG001` | Error | Hardcoded Secrets | `MuleGuard: Hardcoded secret found - Use secure property ${...}` | Replaces with `${secure::<key>}` & updates `src/main/resources/secure.yaml` |
| `MG002` | Warning | Missing Error Handler | `MuleGuard: Flow has no error handler` | Inserts `<error-handler>` with `<on-error-propagate>` at end of flow |
| `MG003` | Warning | Missing Logger | `MuleGuard: Add logger at start of flow` | Inserts `<logger level="INFO" message="Flow started" />` at start of flow |
| `MG004` | Information | Missing Payload Validation | `MuleGuard: Add validation for incoming payload` | — |
| `MG005` | Warning | Missing MUnit Coverage | `MuleGuard: No MUnit test found` | — |
| `MG006` | Warning | DataWeave Null Safety | `Possible NullPointer - Add default` | Appends ` default ''` (String) or ` default 0` (Number) |
| `MG007` | Error | vCore Cost Guard (`<foreach>`) | `vCore Cost Alert: DB/HTTP inside foreach will 10x cost. Use Batch` | — |
| `MG008` | Warning | CloudHub Log Cost (`DEBUG`) | `Remove DEBUG logger - Increases CloudHub log cost` | Changes `level="DEBUG"` to `INFO` or removes logger |

## Pro Features

- **One-Click Quick Fixes (`CodeActionProvider`):** Click the lightbulb (`Ctrl+.`) on any fixable diagnostic (`MG001`, `MG002`, `MG003`, `MG006`, `MG008`) to apply its targeted fix. Hardcoded secret fixes automatically create or update `src/main/resources/secure.yaml`.
- **DataWeave Null Safety (`.dwl` + `<ee:transform>`):** Scans standalone `.dwl` files and inline `<ee:transform>` scripts for unguarded `payload.*.*`, `vars.*.*`, and `attributes.*.*` accesses missing `default` or `if`. Quick Fixes suggest ` default ''` (String) or ` default 0` (Number) based on field inference.
- **vCore Cost Guard:** Flags `<db:select>` or `<http:request>` inside `<foreach>` (recommending Batch processing) and `<logger level="DEBUG">` statements that inflate CloudHub logging costs.
- **Fix All Auto-Fixable Issues:** Run **`MuleGuard Pro: Fix All Auto-Fixable Issues`** (`muleguard.fixAll`) to apply all safe Quick Fixes across the active file (or entire workspace if no supported editor is active).

## Commands & Settings

- **`MuleGuard Pro: Scan Workspace`** (`muleguard.scanWorkspace`) — Scans all `.xml` and `.dwl` files in the workspace and updates the status bar (`MuleGuard Pro: X Issues`).
- **`MuleGuard Pro: Fix All Auto-Fixable Issues`** (`muleguard.fixAll`) — Applies all safe auto-fixes in the current `.xml`/`.dwl` file (or across the workspace).
- **`muleguard.enable`** (`boolean`, default `true`) — Enable or disable MuleGuard Pro diagnostics.

## Development & Testing (`F5`)

1. Install dependencies and compile:
   ```bash
   npm install
   npm run compile
   ```
2. Open this folder in VS Code and press **`F5`** to launch the **Extension Development Host**.
3. Open [`sample/mule-test-api.xml`](sample/mule-test-api.xml) and [`sample/customer-transform.dwl`](sample/customer-transform.dwl).
4. Open the **Problems** panel (`Ctrl+Shift+M`) to see all rules (`MG001`–`MG008`) and inspect **`MuleGuard Pro: 15 Issues`** in the bottom-left status bar.
5. Use **`Ctrl+.`** on diagnostics for one-click Quick Fixes, or run **`MuleGuard Pro: Fix All Auto-Fixable Issues`** from the Command Palette (`Ctrl+Shift+P`).
