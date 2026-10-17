# Security Policy

## Supported Versions

Security updates and patches are provided exclusively for the latest stable release on the `main` branch of **Chenpilot Client (`gear5labs/chenpilot-client`)**.

| Version | Supported          |
| :---    | :---               |
| `main`  | :white_check_mark: |
| `< 1.0` | :x:                |

---

## Reporting a Vulnerability

If you discover a security vulnerability within Chenpilot Client, please **do not open a public GitHub issue**. Public disclosures can put users and wallet assets at risk before a patch is available.

- **Private Reporting Channel**: Please report vulnerabilities via [GitHub Security Advisories (Private Vulnerability Reporting)](https://github.com/gear5labs/chenpilot-client/security/advisories/new) or by emailing our security team at `security@gear5labs.example` (replace with official contact).
- **Expected Response Time**: We acknowledge receipt of vulnerability reports within **24 to 48 hours**, and provide an initial remediation assessment within **5 business days**.

---

## Secret-Handling & Development Rules

To maintain the security of credentials, API keys, and user assets, all contributors must adhere to the following rules:

1. **`.env` File Handling**:
   - Never commit `.env`, `.env.local`, or any file containing actual secrets to version control.
   - Always use `.env.example` as the canonical template containing safe placeholder values.
2. **Issue-Publishing & Release Tokens**:
   - The automated release and publishing script reads `GITHUB_TOKEN` locally from your un-tracked `.env` or `.env.local`.
   - Never hardcode personal access tokens or API keys into source files or commit histories.
3. **Log Redaction**:
   - Ensure that logging utilities never output sensitive data such as authentication headers, bearer tokens, private keys, session cookies, or user PII.

---

## Client Browser Storage & Security Implications

Because Chenpilot Client operates as a web-based client workspace and wallet application:
- **Storage Profile**: Sensitive authentication tokens and session states are stored in browser storage mechanisms (`localStorage` / encrypted cookies).
- **Security Implications**: Stored tokens are susceptible to theft if the client environment is compromised via Cross-Site Scripting (XSS). Contributors must maintain rigorous Content Security Policies (CSP), sanitize all user inputs, and keep third-party dependencies updated.