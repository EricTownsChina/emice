# 快速开始

## 安装依赖

### 1. 安装 Rust

访问 https://www.rust-lang.org/tools/install 安装 Rust。

### 2. 安装 Tauri CLI

```bash
cargo install tauri-cli
```

或者使用 npm（如果已安装 Node.js）：

```bash
npm install
```

### 3. 系统依赖

**macOS:**
```bash
xcode-select --install
```

**Windows:**
- 确保已安装 Microsoft C++ Build Tools
- WebView2 通常已包含在 Windows 10+ 中

## 运行项目

```bash
# 使用 cargo
cargo tauri dev

# 或使用 npm
npm run tauri:dev
```

## 构建项目

```bash
# 使用 cargo
cargo tauri build

# 或使用 npm
npm run tauri:build
```

构建产物位于 `src-tauri/target/release/bundle/`

## 注意事项

1. **图标文件**：首次运行前，需要在 `src-tauri/icons/` 目录下放置图标文件，或暂时从 `tauri.conf.json` 中移除图标配置。

2. **Windows 7 支持**：Tauri 1.5 支持 Windows 7+，但需要确保系统已安装必要的运行时库。

3. **开发模式**：开发模式下，前端文件位于 `dist/` 目录，修改后刷新应用即可看到效果。

