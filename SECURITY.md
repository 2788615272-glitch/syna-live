# Security Policy

## Report a vulnerability

Do not open a public issue for vulnerabilities that expose credentials or
private data. Contact the repository owner through GitHub Security Advisories.

## Local data model

Syna Live binds its control server to `127.0.0.1`, validates a random session
token, and stores application data outside the source directory. Provider keys
are encrypted with Electron `safeStorage` when the desktop app is used.

Never commit API keys, cookies, memory databases, conversations, screenshots,
voice samples, generated logs, or files copied from an application-data folder.
