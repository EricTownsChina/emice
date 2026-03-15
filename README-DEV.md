# 开发模式运行指南

## 代码入口说明（重要）

- 当前项目的 Tauri 2 活跃后端路径是 `src-tauri/`。
- 实际命令处理与应用启动入口在 `src-tauri/src/main.rs`。
- Tauri 配置入口在 `src-tauri/tauri.conf.json`。
- 根目录的 `src/main.rs` 与根 `Cargo.toml` 为历史路径，默认不应修改，除非明确在做 legacy/root crate 相关工作。

## 常见误区

- 误区：直接修改根目录 `src/main.rs` 来调整当前桌面应用行为。
- 正确做法：优先修改 `src-tauri/src/main.rs`，并确保与 `src-tauri/tauri.conf.json` 一致。

## 启动步骤

当前默认流程由 Tauri 自动启动 Vite 开发服务器（端口 1420）。
开发模式资源来自 `devUrl`（`http://localhost:1420`），打包模式资源来自 `frontendDist`（`dist/`）。

### 方式 1：一条命令启动（推荐）

```bash
npm run tauri:dev
```

等价命令：

```bash
cargo tauri dev
```

### 方式 2：手动启动前端（兼容/排障）

如果需要单独验证前端开发服务，再启动 Tauri：

```bash
npm run dev
npm run tauri:dev
```

## 快速质量检查

- 全量基础检查（推荐）：`npm run check`
- 仅检查 Rust 编译：`npm run check:rust`
- 仅检查前端构建：`npm run check:frontend`

`npm run check` 会依次执行：

1. `npm run fmt:check`
2. `npm run lint:rust`
3. `npm run check:rust`
4. `npm run check:frontend`

单个 Rust 测试示例：

```bash
cargo test --manifest-path src-tauri/Cargo.toml datetime_to_timestamp_supports_multiple_formats
```

## 注意事项

- 默认无需手动启动 HTTP 服务器，`tauri:dev` 会触发 `beforeDevCommand` 自动拉起 Vite
- 确保端口 1420 没有被其他程序占用
- 前端构建产物目录为 `dist/`（与 `src-tauri/tauri.conf.json` 的 `frontendDist` 保持一致）
- 时区参数可不传，后端默认使用 `北京`；传空值或非法时区名时也会回退到 `北京`

## 故障排除

如果遇到 "AssetNotFound" 错误：
1. 先执行 `npm run build`，确认 `dist/index.html` 存在
2. 检查 `src-tauri/tauri.conf.json` 中 `frontendDist` 是否为 `../dist`
3. 若为开发模式，检查 `npm run dev` 是否可在 1420 端口正常启动

如果开发模式界面看起来像旧版本：
1. 检查 `src-tauri/tauri.conf.json` 中 `build.devUrl` 是否为 `http://localhost:1420`
2. 重新执行 `npm run tauri:dev`，确认日志里有 Vite dev server 启动信息
3. 确认当前修改的是根目录 `index.html`/`main.js`/`styles.css`，不是 `dist/` 下的文件
