# StarFlow

> 中文版: [README.md](./README.md)

Turn scattered GitHub stars into a searchable, reviewable knowledge base.

StarFlow is an Electron desktop app for managing the repositories you have starred on your own GitHub account: sync the full star list, let AI classify each repo and write a one-line summary, generate a weekly digest of new stars, clone repositories locally, fork them, and discover similar repositories based on what you already starred. The UI is a local window and the data stays local too — apart from GitHub and an optional AI service, nothing goes through a third-party server. Repository: [Yuminghuang738/StarFlow](https://github.com/Yuminghuang738/StarFlow).

---

## The problem it solves

GitHub's built-in features are of little help once you have collected a lot of repositories:

- **The star list can only be viewed in reverse-chronological order.** After a few dozen or a hundred repos, you cannot filter by language or search by topic; finding "that Rust parser I saw last time" means paging through the list.
- **A star is where things go to die.** You rarely note down why you starred something, so a few weeks later all that is left is a link, and you cannot even recall what problem it solved.
- **There is no built-in answer to "what did I star this week".** GitHub does not offer a weekly roll-up; the only way to see recent additions is to count them off the list yourself.

StarFlow's approach is to move that list onto your own machine and add the layers GitHub does not provide:

- Filter by keyword, language, AI category, and whether a repo is already cloned, turning the list into a searchable library.
- Have AI assign each repo a category (one of 7 fixed values) and a one-line Chinese summary, solving "I starred it but forgot why".
- Roll up new stars by week and generate a language breakdown, a daily trend, and a short written summary.
- Clone repos locally and fork them to your own account, turning "saved" into "usable".
- Recommend new repositories you have not starred yet, based on the profile of your **whole collection** (top languages, frequent topics, dominant category), with the reasoning shown alongside the results.

---

## Dependencies

### Runtime requirements

| Dependency | Requirement | Notes |
| --- | --- | --- |
| Node.js | **20.19+ or 22.12+** | Required by the `engines` field of Vite 7 and electron-vite 5; below this the dev server will not start |
| npm | Ships with Node | Everything uses standard npm scripts; no extra package manager is required |
| git | **Installed and on `PATH`** | Clone / fork go through `simple-git`, which invokes the system git binary |
| OS | Windows / Linux (packaging targets) | The code itself is cross-platform; `electron-builder.yml` only configures these two targets |

### Stack and dependency groups

`dependencies` (bundled with the app, needed at runtime):

| Category | Dependency | Version |
| --- | --- | --- |
| UI | `react` / `react-dom` | `^19.3.0` |
| UI state | `zustand` | `^5.0.15` |
| Charts | `echarts` / `echarts-for-react` | `^6.1.0` / `^3.0.6` |
| GitHub | `octokit` | `^5.0.5` |
| AI | `openai` | `^7.25.0` |
| Local git | `simple-git` | `^4.0.2` |
| Local storage | `lowdb` | `^7.0.1` |
| Scheduling | `node-cron` | `^4.6.0` |
| Concurrency | `p-limit` | `^3.1.0` |
| Config loading | `dotenv` | `^18.0.5` |

`devDependencies` (used only for development and packaging):

| Category | Dependency | Version |
| --- | --- | --- |
| Runtime & packaging | `electron` | `^44.5.1` |
| Build | `electron-vite` / `vite` / `@vitejs/plugin-react` | `^5.0.0` / `^7.3.6` / `^5.2.0` |
| Installer | `electron-builder` | `^26.15.3` |
| Language & types | `typescript` / `@types/node` / `@types/react` / `@types/react-dom` | `^5.9.3` / `^22.20.4` / `^19.3.0` / `^19.3.0` |
| Styling | `tailwindcss` / `postcss` / `autoprefixer` | `^3.4.19` / `^8.5.28` / `^10.6.1` |
| Code quality | `eslint` / `typescript-eslint` / `eslint-plugin-react-hooks` / `prettier` | `^9.39.5` / `^8.71.0` / `^7.1.1` / `^3.6.2` |

### External services

| Service | Purpose | Required? |
| --- | --- | --- |
| GitHub REST API | Read the star list, READMEs, releases, and commits; unstar; fork | Required in real mode (not needed in mock mode) |
| GitHub OAuth Device Flow | "Sign in with GitHub" instead of pasting a PAT | Optional; requires registering your own OAuth App |
| OpenAI-compatible endpoint | AI summaries, classification, weekly-report copy, turning a sentence into search filters | Optional; without it the AI features degrade, everything else works |

All of these are called from the main process; the renderer never talks to the network directly. Device Flow was chosen because it **does not need a `client_secret`**, so the Client ID can live in a public repository instead of necessitating a forwarding backend of your own.

**The AI endpoint is not tied to OpenAI.** Any endpoint that speaks the OpenAI format works; configuration is three fields — Base URL, model name, and API key. The settings page ships presets (DeepSeek / Kimi / Zhipu GLM / Qwen / OpenRouter / SiliconFlow / Ollama / LM Studio) that fill in the URL and model for you, and you can point it at your own relay instead. Two things to watch: the **URL does not always end in `/v1`** (Zhipu uses `/api/paas/v4`), so follow your provider's docs; and **local endpoints (Ollama, LM Studio) need no API key**.

---

## Getting started & building

### Local development

```bash
npm install
cp .env.example .env      # fill in as needed; in mock mode you can leave it empty
npx install-electron --no # required the first time, see note below
npm run dev               # start the Electron + Vite dev environment (hot reload)
```

> ⚠️ **If the first `npm run dev` reports "Electron failed to install correctly"**: `electron@44.5.1` has no `scripts` field in its `package.json`, so it has no `postinstall` hook, and `npm install` does not download the Electron binary. Run `npx install-electron --no` once (equivalent to `node node_modules/electron/install.js`). CI only runs typecheck, lint, and build without launching the GUI, so it is unaffected.

#### Environment variables

`.env` is read by `src/main/config.ts` (`import 'dotenv/config'` at the app entry point). There are 6 keys:

| Variable | Description | Required? |
| --- | --- | --- |
| `MOCK_MODE` | When `true`, all data comes from `mock-data.json` and no network requests are made | Optional, defaults to `false` |
| `GITHUB_TOKEN` | GitHub Personal Access Token. **Not read by the current version** — the token actually in effect comes from signing in inside the app or from the settings page, and lives in the local data file | Not needed (setting it has no effect) |
| `GITHUB_OAUTH_CLIENT_ID` | Client ID of a GitHub OAuth App, for Device Flow sign-in | Optional |
| `OPENAI_API_KEY` | Key used for AI summaries / classification / the weekly report | Optional; AI features degrade if unset. Not needed for local endpoints (Ollama / LM Studio) |
| `OPENAI_BASE_URL` | Base URL of any endpoint that speaks the OpenAI protocol; empty means the official endpoint | Optional |
| `MODEL_NAME` | Model name, e.g. `deepseek-chat`, `glm-4-plus` | **Required** when `OPENAI_BASE_URL` is set; falls back to `gpt-4o-mini` only when both are empty |

These three are only **defaults**: whatever you enter under Settings → AI config takes precedence. For day-to-day changes prefer the settings page — it has presets and a connection test.

`MOCK_MODE` is the development and demo switch: with it set to `true`, the star list, READMEs, releases, commits, AI results, and the weekly report all return fake data from `mock-data.json` (31 demo repositories). No real token is read and your GitHub account is never touched. The other 5 keys are all unnecessary in mock mode.

On GitHub permissions: a hand-pasted PAT needs the `public_repo` scope (unstar and fork are writes) and `read:user` (to read your own star list). Device Flow sign-in uses the same pair of scopes. **Note that unstar is an irreversible destructive operation, and fork really does create a repository under your account** — use mock mode when demoing.

### Packaging a distributable

Packaging is done by electron-builder, configured in `electron-builder.yml`, with artifacts written to `dist/`.

| Command | What it does |
| --- | --- |
| `npm run build` | `tsc --noEmit` typecheck + `electron-vite build`, compiling main / preload / renderer into `out/` |
| `npm run build:win` | Runs `build`, then produces a Windows installer (NSIS) in `dist/` |
| `npm run build:linux` | Runs `build`, then produces a Linux package (AppImage) in `dist/` |
| `npm run dev` | Start in development mode (hot reload) |
| `npm run typecheck` | `tsc --noEmit`, type-check only, no output |
| `npm run lint` | Full ESLint run |
| `npm run format` | Prettier-format `src/**/*.{ts,tsx,css,json}` |

When packaging, `electron-builder.yml` only bundles `out/**` and `package.json` into the app, so `npm run build` must run first (`build:win` / `build:linux` already include it). Only Windows and Linux targets are configured today; there is no macOS packaging script.

### Where data and keys live

Application data lives in Electron's `userData` directory — on Linux, `~/.config/star-flow/`. It holds the repository list (including AI categories and summaries, clone paths, and fork markers), the GitHub token, and the AI configuration. Mock mode uses a separate database file so demo data and real data do not contaminate each other.

How secrets are handled:

- **The GitHub token is encrypted with Electron's `safeStorage` before it is written to disk**, going through the OS keyring; it is never stored in plaintext. When encryption is unavailable (e.g. a Linux box without a keyring), the token is kept only in main-process memory and not a single byte is written to disk — you must re-enter it on the Settings page after a restart. This is a deliberate trade-off: better to make the user re-enter it than to write plaintext to disk.
- **The AI key can be set in `.env` or entered directly in the app's Settings page**, with the Settings-page value taking precedence over `.env` (falling back to the environment variable only when unset). Its storage is designed to follow the same `safeStorage` encryption path as the token (OS keyring, no plaintext on disk), and the key is write-only: the config view type shown in Settings has no `apiKey` field at all, so not echoing the key back to the UI is guaranteed at the type level.
  - Note: this "UI overrides `.env`" flow is fully implemented: the three channels (`store:getAiConfig` / `saveAiConfig` / `clearAiKey`), the preload interface, and the persistence in `src/main/store.ts` (`safeStorage` encryption, with the UI value taking precedence over `.env`).

---

## Architecture

### Three-process layering

The Electron app is split into three layers with hard boundaries:

| Process | Responsibility | What it can touch |
| --- | --- | --- |
| **Main** `src/main/` | All business logic: GitHub reads/writes, AI calls, local git, persistence, weekly report, recommendations, scheduled tracking, OAuth sign-in, and IPC handler registration | The full Node API, the filesystem, the network, Electron main-process APIs |
| **preload** `src/preload/` | The only cross-process bridge: wraps the 43 IPC channels into a typed `window.api` for the renderer | `ipcRenderer` (`invoke` only), `contextBridge` |
| **Renderer** `src/renderer/` | The React UI: list, filters, charts, report page, Settings page, custom title bar | Browser APIs and `window.api` only; **no Node API access whatsoever** |
| **Shared** `src/shared/` | The single definition of data structures (`types.ts`) and IPC channel names (`ipc.ts`) | Pure types and constants, imported by all three sides |

The window is created with `frame: false`, dropping the native title bar and menu; minimize / maximize / close are driven from the renderer's `TitleBar` through channels such as `window:minimize` to the main process.

preload is loaded with `contextIsolation: true` and `nodeIntegration: false`. The renderer cannot `import` main-process code and cannot use `process` / `require` / `fs` / `path`; every cross-process call must go through `window.api`.

### IPC contract

`src/shared/ipc.ts` and `src/shared/types.ts` are the single source of truth for channel names and data shapes, imported by all three sides. Channels are named `module:camelCase`, e.g. `github:fetchStarred`, `local:cloneProgress`.

There are currently **43 channels**:

| Namespace | Count | Channels |
| --- | --- | --- |
| `github:` | 7 | `fetchStarred`, `fetchReadme`, `fetchReleases`, `fetchCommits`, `unstar`, `fork`, `star` |
| `local:` | 7 | `chooseDir`, `clone`, `openDir`, `cloneProgress`, `removeClone`, `pruneClones`, `cancelClone` |
| `ai:` | 6 | `summarize`, `classify`, `enrichRepos`, `generateReport`, `testConnection`, `analyzeCollection` |
| `store:` | 6 | `getRepos`, `saveRepos`, `saveToken`, `hasToken`, `updateLocalState`, `clearToken` |
| `store:` (AI config) | 3 | `getAiConfig`, `saveAiConfig`, `clearAiKey` |
| `report:` | 1 | `generate` |
| `recommend:` | 3 | `similar`, `forQuery`, `forYou` |
| `tracker:` | 2 | `start`, `stop` |
| `auth:` | 4 | `getState`, `startDeviceFlow`, `waitForLogin`, `cancelDeviceFlow` |
| `window:` | 4 | `minimize`, `toggleMaximize`, `close`, `isMaximized` |

On the main-process side, handlers are registered through a single `handle()` wrapper: it wraps the handler's return value into an `IpcResult<T>` (success is `{ ok: true, data }`, failure is `{ ok: false, error }`), so an error thrown by a business function becomes a readable failure result rather than a rejection. On the renderer side, `unwrap()` / `call()` in `src/renderer/src/lib/api.ts` take the result apart uniformly.

**IPC is `invoke`-only; there is no main-to-renderer push.** This is an important design constraint that runs through the whole codebase: the main process cannot push to the renderer at an arbitrary moment, so the renderer can only pull. Two direct consequences:

- **Clone progress is polled.** A clone is a long-running `invoke` that returns nothing until it finishes. So the main process parses git's progress lines and caches them in memory behind a separate `local:cloneProgress` channel; the renderer's `CloneProgressBar` polls it every 300 ms. The progress record is deliberately kept after the clone ends, so the last poll before the `invoke` returns does not read an empty value and flash the bar back.
- **Window maximize state relies on the return value plus a resize fallback.** `window:toggleMaximize` returns the state **after** toggling, for an authoritative icon update; when the window is resized by the window manager, a `window.resize` listener falls back to querying `window:isMaximized`.

### Directory layout

| Path | Description |
| --- | --- |
| `src/main/` | Main process. Business modules (`github.ts` / `ai.ts` / `local.ts` / `store.ts` / `report.ts` / `recommend.ts` / `tracker.ts` / `auth.ts` / `mock.ts` / `config.ts`) plus the IPC handler entry point `index.ts` |
| `src/preload/` | The only cross-process bridge. `index.ts` wraps the 43 channels into `window.api`; `index.d.ts` adds the global types for the renderer |
| `src/renderer/` | The React UI. `src/pages/` (Discover / Overview / Manage / Similar / Report / Settings), `src/components/` (repo / charts / common / layout / auth / settings), `src/store/` (Zustand), `src/lib/` (api / theme / cn) |
| `src/shared/` | `types.ts` defines all data structures, `ipc.ts` defines the channel names. The single contract shared by all three sides |
| `docs/` | Main-process module signatures (`module-signatures.md`) and renderer contracts (`renderer-contracts.md`) |
| `scripts/selfcheck/` | GUI-free self-check scripts (see below) |
| `mock-data.json` | The project's only source of fake data, 31 demo repositories |
| `out/` | Build output (gitignored) |
| `dist/` | electron-builder packaging output (gitignored) |

> Implementation status: `tracker.ts` (scheduled tracking) is still a placeholder in real mode and only has a working branch under mock mode (its real-mode `start` / `stop` throw `NOT_IMPLEMENTED`). Every other module is implemented in both modes — including `recommend.ts` (similar repos / one-line search / for-you recommendations) and `local:cancelClone` (it really does abort a running clone); both used to be listed here as placeholders and have since landed.

### A data flow: syncing starred repositories from GitHub

Take clicking "Sync from GitHub" on the Manage page and follow one call across the three processes and onto disk:

1. The Manage page button triggers `repoStore.refreshFromGitHub()`.
2. The store calls `window.api.github.fetchStarred()`. That is a preload-exposed method which runs `ipcRenderer.invoke('github:fetchStarred')` with no arguments.
3. The main process `handle()` wrapper receives the call, discards the leading `event` argument, and dispatches to `github.fetchStarred()`.
   - Mock mode: returns the data from `mock-data.json` directly.
   - Real mode: uses Octokit to call `GET /user/starred` with `Accept: application/vnd.github.star+json` to get `starred_at`; 100 per page, paging until a short page (capped at 20 pages = 2000 repos), then sorted by `starred_at` descending.
4. The result comes back to the renderer as `IpcResult<Repo[]>`. The store merges it with the existing local data by `full_name` using `mergeRepos()`, **preserving the local `ai_summary` / `ai_category` / `local` (clone path, fork marker)**, otherwise every sync would drop those markers.
5. The merged result is sent back to the main process via `store:saveRepos`; `store.saveRepos()` atomically writes it to the database file under `userData` with lowdb and updates the main-process read cache.
6. The renderer finally calls `set({ repos: merged })`; the list and charts re-render, and the success toast is raised by the store.

Polling interactions (clone progress) are the mirror image of this path: the renderer calls `local:cloneProgress` on a fixed interval, and the main process does a pure in-memory lookup without pushing anything.

### Self-check scripts

`scripts/selfcheck/` holds self-check programs that do not need the Electron GUI. They verify boundaries that are hard to reproduce in the UI (key persistence, the multiple safety gates around deleting a local copy, clone progress, the OAuth state machine, and so on). Most scripts use esbuild at runtime to bundle the main-process TS modules into an ESM bundle and swap in stub files (`electron-stub.mjs`, `simple-git-stub.mjs`) for Electron and `simple-git`, so they run directly under Node; the AI-related scripts read bundles pre-built into `out/selfcheck/`. Build outputs all go to `out/selfcheck/` (gitignored).

```bash
node scripts/selfcheck/store-local.mjs    # store.ts / local.ts: stub self-check, real safeStorage, real clone
node scripts/selfcheck/local-manage.mjs   # deleting a local copy + disk reconciliation
node scripts/selfcheck/clone-progress.mjs # clone progress: generation, propagation, and concurrency isolation
node scripts/selfcheck/auth.mjs           # OAuth Device Flow state machine
node scripts/selfcheck/ai.mjs             # AI category normalization, full mock distribution, concurrency cap (some variants need a real endpoint)
```

The end-to-end variant (`node scripts/selfcheck/store-local.mjs e2e`) boots the **build output** and connects to the renderer over CDP to call `window.api.*` directly, verifying that the preload / IPC wiring is connected. These scripts require `npm run build` first. Self-check scripts are not wired into CI.
