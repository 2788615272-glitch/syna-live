# Syna Live

[简体中文](README.zh-CN.md)

Syna Live is a local-first, customizable AI companion and livestream avatar.
Users can replace the character art, personality, relationship, model provider,
voice, memory, and livestream settings without editing code.

The bundled Syna character is ready to use and released under CC0. The app has
no account system, analytics, or hosted backend.

![Syna Live control panel](docs/control-panel.png)

## Features

- Editable character name, relationship, personality, style, and boundaries
- Static and talking avatar uploads with a transparent OBS stage
- OpenAI-compatible providers, with Volcengine Ark recommended by default
- Local chat memory and optional long-term notes
- System text-to-speech and supported browser speech input
- Optional Bilibili danmaku connection and automatic character replies
- Electron `safeStorage` encryption for provider keys
- Redacted diagnostics and no telemetry

## Download

Download the installer or portable Windows build from
[GitHub Releases](../../releases/latest). The release artifacts are generated
from tagged commits by GitHub Actions.

## Run from source

Requirements: Node.js 20 or newer.

```bash
npm install
npm start
```

For browser-only development:

```bash
npm run start:web
```

The development server reads `SYNA_PROVIDER_API_KEY` from the environment and
does not persist it. The Electron desktop app stores keys using the operating
system's encrypted credential facility.

## First launch

1. Open **Model Connection** and choose a provider.
2. Enter a model ID and API key, then run the connection test.
3. Edit the character under **Character Persona** or keep the bundled Syna.
4. Copy the stage URL from **Livestream** into an OBS browser source.
5. Optionally enter a Bilibili room ID and enable danmaku replies.

Provider keys and billing belong to the user. Syna Live does not proxy or
resell model access.

## Data and privacy

Application data is stored in Electron's per-user application-data directory,
outside the installation and source folders. It includes configuration, local
memory, encrypted credentials, and user-uploaded images. See [PRIVACY.md](PRIVACY.md).

Never publish an application-data directory. The repository ignores common
secret, memory, log, upload, and runtime paths, and CI runs an additional secret
scan.

## Development

```bash
npm test
npm run check
npm run dist:win
```

Architecture details are in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
Release instructions are in [docs/RELEASING.md](docs/RELEASING.md).

## Licenses

Code is licensed under MIT. Bundled Syna images are CC0. See
[ASSET_LICENSE.md](ASSET_LICENSE.md) for asset terms.
