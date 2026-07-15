# Architecture

Syna Live has one main runtime module. Its interface is intentionally small:

- `chat(message, source)`
- `status()`
- `connectLive()`
- `disconnectLive()`

The runtime hides prompt construction, memory updates, model calls, stage
state, and livestream event handling. Callers and tests use the same interface.

Model and livestream integrations sit at internal seams:

- `OpenAICompatibleAdapter` handles OpenAI-compatible chat completion requests.
- `BilibiliAdapter` handles optional danmaku connectivity.
- `SecretVault` handles encrypted credentials without exposing values to the UI.
- `LocalStore` owns validated configuration, bounded memory, uploads, and stage state.

The local HTTP server binds only to `127.0.0.1`. Dashboard requests require a
random bearer token. The OBS stage receives a separate random token and only
has read access to public stage state.

The renderer never receives provider keys. Diagnostics contain booleans and
feature status, not prompts, messages, paths, usernames, or credentials.
