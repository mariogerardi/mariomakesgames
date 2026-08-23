# Security

Please report security concerns privately through this repository's GitHub
Security Advisories rather than opening a public issue.

The browser application calls a small number of externally hosted game
services. Their URLs are public by design and must not be treated as secrets;
authentication, input validation, throttling, quotas, and abuse controls belong
at the service boundary.

Do not include credentials, personal data, or exploit details in public issues.
