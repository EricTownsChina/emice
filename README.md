# emice

`emice` 是一个基于 Tauri 2 的桌面工具应用，当前提供时间转换与 JSON 工具，JSON 工具内含 JSONPath 和 JSON 对比。

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

- JSONPath：在 JSON 面板左上角的下拉列表选择 `JSONPath` 展开查询，支持匹配值 / 路径切换、完整结果复制和语法示例。
  例如 `$.store.book[*].title`、`$..price`、`$.store.book[?(@.price < 10)]`。
- JSONPath 表达式使用 JSONPath Plus 在 Web Worker 中执行；输入停止 300ms 后自动查询，也可按 Enter 立即查询。
  同一份 JSON 复用解析结果，匹配结果每页 50 项；超大结果限制预览长度，复制仍获取全部结果。

#### JSON 对比

- 在 JSON 面板左上角的下拉列表选择 `JSON 对比`，左右粘贴原始与新的 JSON，或点击 `使用当前 JSON` 填入 JSON 工具中的内容。
- 对比模式复用顶部 `文本 / 视图`，分别展示两份输入与结构差异；对比、交换、清空、筛选等操作跟在同一行。在下拉列表选择 `JSON` 返回原始 JSON，两边内容与视图状态各自保留。
- 按字段和值比较，忽略对象字段顺序、缩进与空白；数组保持顺序并对齐相同元素，未匹配片段按位置比较。
- `文本 / 视图` 切换，新增用淡绿、删除用淡红，修改显示左侧旧值 / 右侧新值，相同内容与仅有子项变化的父级保留原色；默认显示全部内容并展开各层；支持仅差异筛选、展开全部、点击 root 收起、交换内容及保留上次输入。
- 文本与差异视图共享可拖动分界线，记住上次比例；双击恢复均分，也可用方向键调整。
- 输入停止 300ms 后自动比较；点击 `对比` 或按 Ctrl+Enter 进入差异视图。计算在 Web Worker 中执行，节点每批加载 100 项。

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
