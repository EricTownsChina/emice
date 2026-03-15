# AGENTS.md

Operational guide for coding agents working in this repository.

## 1) Project Snapshot
- App type: desktop utility app built with Tauri + Rust backend + Vite frontend.
- Current features: timezone-based timestamp conversion + JSON formatter UI.
- Frontend stack: plain HTML/CSS/JavaScript (no React runtime code in `main.js`).
- Backend stack: Rust + Tauri commands in `src-tauri/src/main.rs`.
- Languages in use: Rust, JavaScript, HTML, CSS.
- Primary runtime path: Tauri 2 config under `src-tauri/`.

## 2) Important Paths
- `src-tauri/src/main.rs` -> active Tauri command handlers and app bootstrap.
- `src-tauri/tauri.conf.json` -> Tauri 2 application/build configuration.
- `dist/` -> frontend build output consumed by Tauri (`frontendDist`).
- `main.js` -> frontend app logic and Tauri invoke calls.
- `styles.css` -> global styling and responsive layout rules.
- `index.html` -> app shell and tool tabs.
- `vite.config.js` -> Vite dev/build settings.
- `README.md`, `README-DEV.md`, `QUICKSTART.md`, `DEBUG.md` -> operational docs.

## 3) Build / Dev Commands

### JavaScript / Vite
- Install deps: `npm install`
- Start Vite dev server: `npm run dev`
- Build frontend assets: `npm run build`
- Preview build output: `npm run preview`

### Tauri (recommended entrypoints)
- Start desktop app in dev mode: `npm run tauri:dev`
- Build desktop bundles: `npm run tauri:build`
- Direct CLI passthrough: `npm run tauri -- <args>`

### Frontend/Tauri linkage
- `src-tauri/tauri.conf.json` should keep `build.frontendDist` aligned with Vite output (`dist/`).
- Dev mode uses `build.beforeDevCommand` to start `npm run dev` automatically.
- Dev mode should set `build.devUrl` to Vite server (`http://localhost:1420`).
- Build mode uses `build.beforeBuildCommand` to produce `dist/` before packaging.

### Cargo equivalents
- Dev run: `cargo tauri dev`
- Release build: `cargo tauri build`

## 4) Lint / Format / Static Checks

### Rust
- Format check: `cargo fmt --all -- --check`
- Apply formatting: `cargo fmt --all`
- Lint with clippy: `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings`
- Type/check compile: `cargo check --manifest-path src-tauri/Cargo.toml`

### Frontend
- No ESLint or Prettier config is currently present.
- Use `npm run build` as the baseline JS/CSS/HTML sanity check.
- Keep style consistent with existing formatting in `main.js` and `styles.css`.

### Unified quality gate (recommended)
- Preferred one-command validation: `npm run check`.
- It runs rustfmt check, clippy (warnings denied), Rust compile check, and frontend build.
- Use targeted checks when iterating quickly; use `npm run check` before handoff.

## 5) Test Commands (including single-test patterns)

### Current status
- No first-party frontend test framework is configured.
- A baseline Rust unit test module exists in `src-tauri/src/main.rs` for timestamp/timezone conversion logic.
- Use command patterns below when adding tests.

### Rust full test run
- All tests for active backend crate: `cargo test --manifest-path src-tauri/Cargo.toml`

### Rust single test (important)
- Run one test by name substring:
  `cargo test --manifest-path src-tauri/Cargo.toml <test_name_substring>`
- Run one exact test path:
  `cargo test --manifest-path src-tauri/Cargo.toml module::submodule::test_name`
- Run single integration test file:
  `cargo test --manifest-path src-tauri/Cargo.toml --test <integration_test_file>`
- Show logs while running a single test:
  `cargo test --manifest-path src-tauri/Cargo.toml <test_name> -- --nocapture`

### Targeted checks for rapid iteration
- Check only backend compile: `cargo check --manifest-path src-tauri/Cargo.toml`
- Check frontend build validity: `npm run build`

## 6) Logging and Debugging
- Default Rust logging uses `env_logger` in backend main.
- Set log level with `RUST_LOG`.
- Example: `RUST_LOG=debug cargo tauri dev`
- Useful levels: `error`, `warn`, `info`, `debug`.

## 7) Source of Truth and Legacy Notes
- Treat `src-tauri/` as the active Tauri backend for development.
- Root-level `Cargo.toml` and `src/main.rs` also exist; verify before editing both.
- Prefer changing code paths that are actually used by `src-tauri/tauri.conf.json`.

### Active-path decision rules (must follow)
- Tauri command handlers, app bootstrap, logging, and backend behavior: edit `src-tauri/src/main.rs`.
- Tauri window/build/bundle settings: edit `src-tauri/tauri.conf.json`.
- Packaging/dev entrypoints should target `src-tauri/` commands and manifest paths.
- Do not modify root-level `src/main.rs` or root `Cargo.toml` unless the task explicitly asks for legacy/root crate work.
- If a change appears to require touching both paths, document why and confirm the runtime path from `src-tauri/tauri.conf.json` first.

## 8) Code Style Guidelines (Cross-cutting)
- Keep changes small and localized; do not rewrite unrelated code.
- Preserve existing public behavior unless task explicitly requests behavior changes.
- Prefer explicit, readable logic over micro-optimizations.
- Avoid adding new dependencies unless clearly justified.
- Keep user-facing strings consistent in language and tone.
- When changing command interfaces, update frontend invoke payload keys accordingly.

## 9) Rust Style Rules

### Imports
- Group imports by crate, then standard library, matching current file style.
- Prefer explicit imports over glob imports.
- Remove unused imports before finalizing.

### Formatting
- Enforce rustfmt defaults; do not hand-format against rustfmt.
- Keep long expressions wrapped idiomatically (builder chains, match arms).
- Keep one responsibility per function where practical.

### Types and Data Modeling
- Prefer concrete structs for command inputs/outputs over loose tuples.
- Use `i64` for timestamps and keep millis/seconds conversion explicit.
- Use `Option<T>` only for truly optional values.
- Add `Serialize`/`Deserialize` only when crossing Tauri boundary.

### Naming
- Functions/variables: `snake_case`.
- Types/traits/enums: `CamelCase`.
- Constants: `SCREAMING_SNAKE_CASE`.
- Command function names should be descriptive and action-oriented.

### Error Handling
- Prefer `Result<T, String>` only at Tauri command boundaries.
- In internal logic, prefer richer errors where practical, then map to user-safe messages.
- Use `ok_or_else`/`map_err` with actionable error messages.
- Avoid `unwrap()` and `expect()` in non-test runtime paths.

### Time/Timezone Handling
- Be explicit about seconds vs milliseconds.
- Validate timezone offsets before constructing `FixedOffset`.
- Treat missing/empty/invalid timezone names as default `北京` at command boundary.
- Keep formatting strings centralized or reused when repeated.

## 10) JavaScript / HTML / CSS Style Rules

### JavaScript
- Use `const` by default; use `let` only when reassignment is required.
- Keep async flows explicit with `try/catch` around `invoke` calls.
- Validate user input before calling backend commands.
- Keep DOM queries stable; null-check optional elements.
- Use clear, descriptive function names in `camelCase`.
- Avoid hidden side effects in utility functions.

### HTML
- Keep semantic structure (`header`, `nav`, `main`, `section`) consistent.
- IDs should stay unique and aligned with JS selectors.
- Keep button text and placeholders user-friendly and consistent.

### CSS
- Preserve existing warm-color design language unless a redesign is requested.
- Reuse class patterns; avoid unnecessary selector specificity.
- Keep responsive behavior intact for mobile (`@media max-width: 768px`).
- Avoid duplicated style blocks when touching related classes.

## 11) Agent Workflow Expectations
- Before edits, inspect related frontend and backend paths to keep interfaces synced.
- After edits, run the smallest meaningful verification command first.
- For backend-only edits: run `cargo check --manifest-path src-tauri/Cargo.toml`.
- For frontend-only edits: run `npm run build`.
- For cross-stack edits: run both checks.
- Before final handoff, prefer running `npm run check` as the unified baseline.

## 12) Repository-specific Rules Discovery
- Cursor rules checked: no `.cursor/rules/` and no `.cursorrules` found.
- Copilot rules checked: no `.github/copilot-instructions.md` found.
- If any of these files are added later, treat them as high-priority instructions.

## 13) Common Pitfalls in This Repo
- Do not assume React usage just because `@vitejs/plugin-react` exists.
- Do not edit generated content inside `target/`, `dist/`, or `node_modules/` manually.
- Ensure Tauri command names and JS invoke names stay exactly aligned.
- Confirm whether root Rust crate files are active before relying on them.
- Do not point `frontendDist` at repo root; use `../dist` to avoid incorrect asset resolution.
- If dev UI appears stale, verify `build.devUrl` is configured and not falling back to static `dist/` assets.
- Avoid duplicate CSS selector blocks; merge updates into the existing selector definition.

## 14) Preferred Commit Scope (when asked to commit)
- Keep commits focused by feature or fix area.
- Include both frontend and backend updates when interface contracts change.
- Mention behavioral impact in commit messages (especially conversion logic).
