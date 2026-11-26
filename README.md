# MuleGuard -- MuleSoft Code Review, Best Practices & Security Guardrails

**VS Code Extension for MuleSoft Mule 4 & DataWeave 2.0**

MuleGuard is an all-in-one quality and security workbench for MuleSoft developers, architects, and DevOps engineers. It provides real-time linting, inline Quick Fixes, offline connector intelligence tooltips, visual flow diagrams, and a structured 7-step enterprise code review checklist directly in VS Code.

---

## 🌟 Key Features

### 1. 🛡️ Real-Time Linting & Quality Diagnostics
- **Hardcoded Secret Detection (`MG001`):** Flags unencrypted passwords, client secrets, and keys. One-click Quick Fix externalizes to `${secure::...}` and creates `secure.yaml`.
- **Reliability & Error Handling (`MG002`):** Warns on missing error handling scopes and scaffolds `<on-error-propagate>`.
- **Flow Observability (`MG003`, `S-07`):** Enforces flow start loggers and flags sensitive `TRACE`/`DEBUG` logging.
- **DataWeave 2.0 Null Safety (`MG006`):** Scans standalone `.dwl` and inline `<ee:transform>` for unguarded nested navigations, suggesting typed `default ''` or `default 0`.
- **vCore Cost Guard (`MG007`, `MG008`):** Flags DB/HTTP calls inside `<foreach>` and CloudHub log-inflating `DEBUG` statements.
- **Expanded Best Practices (`BP-01` to `BP-10`):** Kebab-case naming, hardcoded ports, flow complexity limits, missing `doc:name`, Mule 3 legacy syntax, and broken `flow-ref` targets.
- **Security Guardrails (`S-01` to `S-07`):** Non-HTTPS HTTP listeners, `insecure="true"` trust stores, wildcard CORS headers, and plaintext credentials.

### 2. 💡 Offline Connector Intelligence & Hover Tooltips
Hover over any Mule XML element (`<http:request>`, `<db:select>`, `<ee:transform>`, `<choice>`, `<scatter-gather>`, etc.) to see:
- Plain-English explanation of the processor
- Runtime threading and execution model
- Common attributes reference table
- Direct link to official Anypoint documentation

### 3. 📋 7-Step Enterprise Code Review (`Ctrl+Shift+M`)
Run **`MuleGuard: Run 7-Step Code Review Audit`** to audit your Mule repository against a 45-row quality checklist across 13 dimensions:
1. Detect Mule project root (`src/main/mule`)
2. Load 45-row quality checklist
3. Inventory project artifacts (`pom.xml`, `mule-artifact.json`, XML flows, configs, MUnits)
4. Evaluate automated compliance rules
5. Generate findings with severity indicators (`[HIGH]`, `[MEDIUM]`, `[LOW]`)
6. Export structured `code-review-report.md` with executive summary and health score
7. Identify manual verification sign-offs

### 4. 🗂️ Flow Explorer Sidebar
Dedicated activity bar view showing:
- Mule Flows & Sub-Flows (click to navigate to line)
- DataWeave Transformations (`.dwl`)
- MUnit Test Suites
- Environment YAML Configurations

### 5. ⚡ Flow Visualizer (`Ctrl+Shift+V`)
Open any Mule XML file and run **`MuleGuard: Visualize Mule Flow`** to inspect a visual interactive pipeline diagram showing message processor flow.

### 6. ⚙️ Additional Developer Tools
- **Environment Config Diff (`muleguard.diffEnvConfigs`):** Side-by-side YAML key comparison between environments (e.g., `dev.yaml` vs. `prod.yaml`).
- **Workspace Secret Scanner (`muleguard.scanSecrets`):** High-entropy token and private key scanner.
- **Flow Complexity Metrics (`muleguard.showComplexityMetrics`):** Maintainability index calculating processor counts and nested scope depth.
- **Inline Rule Suppression:** Suppress diagnostics with XML comments (`<!-- muleguard-disable BP-01 -->`) or DWL comments (`// muleguard-disable MG006`).
- **22 `mg-` Mule XML Snippets & 8 DataWeave Snippets.**
- **Complete DataWeave 2.0 TextMate Syntax Highlighting.**

---

## ⌨️ Commands & Shortcuts

| Command | Title | Shortcut |
| :--- | :--- | :--- |
| `muleguard.runCodeReview` | Run 7-Step Code Review Audit | `Ctrl+Shift+M` |
| `muleguard.scanWorkspace` | Scan Workspace | `Ctrl+Shift+G` |
| `muleguard.visualizeFlow` | Visualize Mule Flow | `Ctrl+Shift+V` |
| `muleguard.fixAll` | Fix All Auto-Fixable Issues | — |
| `muleguard.diffEnvConfigs` | Compare Environment Configs (YAML Diff) | — |
| `muleguard.scanSecrets` | Scan Workspace for Hardcoded Secrets | — |
| `muleguard.showComplexityMetrics` | Calculate Flow Complexity Metrics | — |
| `muleguard.refreshFlowExplorer` | Refresh Flow Explorer | — |

---

## 🛠️ Testing Locally (`F5`)

1. Open this repository in VS Code.
2. Press **`F5`** to launch the **Extension Development Host**.
3. Open `sample/mule-test-api.xml` or `sample/customer-transform.dwl`.
4. Inspect the **Problems** panel (`Ctrl+Shift+M`), hover over XML elements, open the MuleGuard activity bar view, or run `MuleGuard: Run 7-Step Code Review Audit`.

---

## 📄 License
MIT © Niranjan Potter
