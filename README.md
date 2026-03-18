# emice

`emice` 是一个基于 Tauri 2 的桌面工具应用，当前提供 `timestamp` 与 `json` 两个模块。

## 当前功能

### 1) timestamp

- 当前时间戳实时刷新（毫秒级）
- 时间戳 -> 时间（支持秒/毫秒时间戳）
- 时间 -> 时间戳（支持 `yyyy-MM-dd HH:mm:ss`、`yyyy-MM-dd HH:mm`、`yyyy-MM-dd`）
- 每个转换行独立时区选择
- 缺失/空/非法时区会回退到 `北京`
- 后端采用 IANA 时区库，自动处理夏令时/冬令时

### 2) json

- 使用 [`jsoneditor`](https://github.com/josdejong/jsoneditor) 替代手写 JSON 渲染
- 支持 `tree`、`code`、`text`、`preview` 多视图
- 自定义统一搜索栏：支持上一个/下一个、回车导航、匹配计数

## 技术栈

- 后端：Rust + Tauri 2
- 前端：Vite + 原生 HTML/CSS/JavaScript
- 时间处理：chrono + chrono-tz
- JSON 编辑：jsoneditor

## 快速开始

```bash
npm install
npm run tauri:dev
```

## 常用命令

```bash
# 前端开发
npm run dev

# 桌面开发（推荐）
npm run tauri:dev

# 前端构建
npm run build

# 桌面打包（默认）
npm run tauri:build

# macOS 仅生成 dmg
npm run tauri -- build --bundles dmg

# Windows 不生成 msi（仅构建，不打包）
npm run tauri -- build --bundles none

# 一键质量检查
npm run check
```

## 项目结构

```text
emice/
├── src-tauri/
│   ├── src/main.rs          # Tauri 命令与后端逻辑（活跃路径）
│   ├── Cargo.toml
│   └── tauri.conf.json
├── index.html               # 前端页面结构
├── main.js                  # 前端交互逻辑
├── styles.css               # 全局样式
├── AGENTS.md                # 供 agent 使用的开发规范
└── README-DEV.md            # 开发说明
```

## 开发说明

详细开发流程、调试与排障请参考 `README-DEV.md`。

## License

Apache-2.0，详见 `LICENSE`。
