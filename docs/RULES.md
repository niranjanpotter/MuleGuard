# MuleGuard Rules Reference

Every MuleGuard rule has a unique ID, default severity, and configuration support via `.muleguard.json` or VS Code settings (`muleguard.*`).

## Core Rules (`MG001` – `MG008`)

| ID | Default Severity | What It Checks | How to Configure / Suppress |
| :--- | :--- | :--- | :--- |
| `MG001` | Error | Hardcoded secrets (`password`, `clientSecret`, `clientId`) in XML attributes. Recognizes `secure::`, `aws-secrets::`, `aws-s3::`, and custom `secretProviders`. | Configure `muleguard.secretProviders` or `.muleguard.json` `"secretProviders"`. |
| `MG002` | Warning | Flow without an inline `<error-handler>` or valid global `<error-handler ref="..."/>`. Skips sub-flows, handled APIkit route flows, and flows whose callers are all handled. | Suppress via `<!-- muleguard-disable MG002 -->` or `"MG002": "off"`. |
| `MG002b` | Warning | `<error-handler ref="X"/>` referencing a handler not defined anywhere in the workspace. | Define `<error-handler name="X">` in `global.xml`. |
| `MG003` | Warning | Flow missing a start-of-flow `<logger>` or accepted logging `<flow-ref>`. Skips single-`flow-ref` APIkit route flows. | Configure `muleguard.logging.acceptedFlows` (default: `["mule-logging-utilFlow", "*-logger", "*logging*"]`). |
| `MG004` | Information | `<http:listener>` flow without schema validation or `<apikit:router>`. | Add Validation module or APIkit router. |
| `MG005` | Warning | Flow without MUnit test coverage (checks `flow-ref`, `munit-tools:mock-when`, suite filenames, and transitive callers). | Add MUnit suite under `src/test/munit/`. |
| `MG006` | Warning | Unguarded DataWeave member navigation (`payload.a.b.c` / `vars.a.b.c`). Skips guarded expressions (`default`, `?.`, `!`, `if`, `isEmpty()`, `sizeOf()`, `p()`), APIkit `attributes`, and test fixtures. | Configure `muleguard.dataweave.nullSafety.minDepth` (default `3`) and `maxPerFile` (default `20`). |
| `MG007` | Warning | Remote connector calls inside `<foreach>` loops (N+1 anti-pattern). | Batch or use Bulk operations. |
| `MG008` | Warning | Hardcoded `level="DEBUG"` loggers in Mule flows. | Manage log levels in `log4j2.xml`. |

## Best Practice Rules (`BP-01` – `BP-11`)

| ID | Default Severity | What It Checks | How to Configure / Suppress |
| :--- | :--- | :--- | :--- |
| `BP-01` | Warning | Flow name is not `kebab-case`. Skips APIkit generated routes and `-main` flows by default. | Configure `muleguard.naming.ignorePatterns`. |
| `BP-02` | Warning | Sub-flow name is not `kebab-case`. | `"BP-02": "off"` in `.muleguard.json`. |
| `BP-03` | Warning | Hardcoded numeric `port="..."` attribute. | Externalize to `${http.port}`. |
| `BP-04` | Information | `<http:request-config>` missing `responseTimeout`. | Set `responseTimeout="${http.timeout.response}"`. |
| `BP-05` | Warning | Commented-out XML code blocks inside Mule files. | Remove dead XML comments. |
| `BP-06` | Warning | Flow has more than 15 direct child processors. | Refactor into `<sub-flow>` modules. |
| `BP-07` | Warning | Key processors (`http:request`, `ee:transform`, `db:*`) missing `doc:name`. | Add descriptive `doc:name`. |
| `BP-08` | Warning | Deprecated Mule 3 tags (`set-session-variable`, `expression-component`, etc.). | Migrate to Mule 4 equivalents. |
| `BP-09` | Warning | Empty `<flow>` with no processors. | Remove unused flow or add processors. |
| `BP-10` | Warning | `<flow-ref name="..."/>` target not defined anywhere in workspace `src/main/mule`. | Ensure target flow/sub-flow exists. |
| `BP-11` | Information | Same-named `.dwl` script drifts across environment folders relative to `referenceEnvironment`. | Configure `muleguard.referenceEnvironment` (default `production`). |

## Security Rules (`S-01` – `S-07`)

| ID | Default Severity | What It Checks |
| :--- | :--- | :--- |
| `S-01` | Warning | `<http:listener-config>` using `HTTP` protocol without `<tls:context>`. |
| `S-02` | Error | `<tls:trust-store insecure="true"/>` disabling TLS certificate validation. |
| `S-03` | Warning | Wildcard CORS `Access-Control-Allow-Origin: *`. |
| `S-04` | Error | Hardcoded `authorization`, `bearer`, `accessToken`, or `apiKey` attributes. |
| `S-05` | Error | Deprecated TLS protocols (`SSLv*`, `TLSv1.0`, `TLSv1.1`) in `enabledProtocols`. |
| `S-06` | Warning | Hardcoded `<http:basic-authentication>` `username` or `password`. |
| `S-07` | Warning | `<logger level="TRACE">` potentially leaking sensitive payloads. |

## Configuration via `.muleguard.json`

Place a `.muleguard.json` file at your workspace root:

```json
{
  "rules": {
    "MG006": { "severity": "info", "minDepth": 3, "maxPerFile": 20 },
    "BP-01": "off",
    "MG003": { "acceptedFlows": ["mule-logging-utilFlow"] }
  },
  "exclude": ["**/src/test/**", "**/.tooling-project/**"],
  "secretProviders": ["secure::", "aws-secrets::", "aws-s3::"]
}
```
