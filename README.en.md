# Mist Notes · 雾笺

Local-first desktop sticky notes with resizable windows, precise typography, accessible animated gradients, and optional one-click AI organization.

[简体中文](README.md) · [Architecture](docs/ARCHITECTURE.md) · [Build guide](docs/BUILDING.md) · [Contributing](CONTRIBUTING.md) · [Security](SECURITY.md)

> Version `2.1.0-beta.6`. On 2026-10-26, the owner approved the MIT license and public redistribution of the listed project-owned code, six runtime icons, and synthetic-content screenshot. Repository: [fu379410-cell/mist-notes](https://github.com/fu379410-cell/mist-notes). Check [GitHub Actions](https://github.com/fu379410-cell/mist-notes/actions) for actual CI results.

## Actual client screenshot

![macOS client with synthetic demonstration content](docs/screenshots/macos-demo.png)

Captured from the running candidate on macOS using synthetic text only. This still image does not show color animation; the sharing indicator belongs to the macOS capture environment.

## Purpose and features

Mist Notes provides small, readable windows for personal thoughts and working drafts. Notes remain on the local computer. AI is optional and runs only after an explicit click.

- Resize each note from its edges or corner; preserve window geometry, pin notes, and manage login startup.
- Drag a 1–200 font-size slider for the title, whole body, or selected text, with one undo step per completed gesture.
- Choose from 240 presets or create a two-to-four-stop gradient; search, favorite, and revisit palettes.
- Slowly crossfade full-window linear gradients without localized light blobs. Each transition takes about 12 seconds; reduced-motion preferences slow the cycle.
- Keep versioned JSON locally, import and export backups, archive notes, and export plain text.
- Optionally organize the current note through DeepSeek, apply the result directly, undo or redo it, cancel generation, and discard stale responses after editing.

Default text and background combinations are checked against 4.5:1 contrast. Arbitrary pasted text colors are outside that guarantee. AI output needs human review and becomes plain text; undo restores the original document and formatting.

## Privacy

There is no built-in analytics or cloud-sync module. Only an explicit AI action sends the current title, body, and organization instructions to DeepSeek. API keys are entered inside the application and encrypted through the OS using Electron async `safeStorage`. They are separate from notebook JSON and exports. Stored keys are never returned to the renderer; the password field temporarily holds newly entered text before saving.

## Develop

Use Node.js 24.x, npm, and Git. macOS development/packaging requires Xcode Command Line Tools. macOS release targets require macOS 13+; Windows targets are x64. Linux source checks are configured, but no Linux release or runtime support is claimed.

```sh
cd client
npm ci
npm test
npm run build
MIST_DATA_DIR=/tmp/mist-notes-dev MIST_SKIP_MIGRATION=1 npm run dev
```

On Windows PowerShell, set `$env:MIST_DATA_DIR` and `$env:MIST_SKIP_MIGRATION` before `npm run dev`. Use `npm start` after building. Editing and tests do not require an API key. The main process does not automatically load `.env.example`.

```sh
npm run security:scan
npm run licenses:check
npm run package:mac
npm run package:windows
```

Packaging never publishes automatically. GitHub release automation defaults to build artifacts; an explicitly requested Release is a draft. Remote CI execution and public download links are not claimed before publication.

## Structure and implementation

`client/src` contains React/Tiptap UI and shared types. `client/electron` owns validated IPC, local storage, migration, windows, credentials, and AI requests. `client/tests` contains regression tests. `Sources` and `Tests` preserve the independent legacy Swift implementation. `.github` contains CI/release workflows and collaboration templates.

The renderer uses an isolated, sandboxed Electron context. A typed bridge reaches the main process, which validates the window and frame, writes versioned local JSON, and performs optional HTTPS AI requests. Gradient crossfades share a timeline and do not restart during typing. Dependencies are pinned in the lock file.

## Status and roadmap

See [verification](docs/VERIFICATION.md) and [known limitations](docs/KNOWN_ISSUES.md). Windows and Intel Mac runtime acceptance, trusted code signing, notarization, and automatic updates remain unfinished. The next priorities are save-queue coordination for native-menu exports, real-device regression tests, checklists, search/categories, and recovery/history.

There are no verified public adoption metrics, download counts, stars, or external contributions yet. Contributions should be small and reproducible; see [CONTRIBUTING.md](CONTRIBUTING.md).

## Licensing

Project-owned code, the six approved runtime icons, and project-owned content in the synthetic screenshot are licensed under [MIT](LICENSE), with `Copyright (c) 2026 Mist Notes contributors`. The owner approved this scope on 2026-10-26. Third-party dependencies, marks, and system UI elements retain their own rights: see [notices](THIRD_PARTY_NOTICES.md) and [asset provenance](docs/ASSETS_AND_LICENSES.md). Private notes, credentials, backups, old machine reports, and installer binaries are excluded from source control.
