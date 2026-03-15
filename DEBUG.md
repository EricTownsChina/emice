# Debug 模式运行指南

## 运行命令

### 方式 1：使用 cargo tauri dev（推荐）

```bash
cd /Users/zhaoyuanlu/dev/emice
cargo tauri dev
```

这个命令会：
- 编译 Rust 代码（debug 模式）
- 启动开发服务器
- 在终端显示所有日志输出（包括 Rust 的 log 和前端 console.log）

### 方式 2：使用 npm

```bash
cd /Users/zhaoyuanlu/dev/emice
npm run tauri:dev
```

### 方式 3：直接使用 cargo run（不推荐，看不到前端日志）

```bash
cd /Users/zhaoyuanlu/dev/emice/src-tauri
cargo run
```

这种方式只能看到 Rust 后端的日志，看不到前端 JavaScript 的 console.log。

## 日志级别

应用使用 `env_logger` 来输出日志。可以通过环境变量控制日志级别：

```bash
# 显示所有 debug 及以上级别的日志（默认）
RUST_LOG=debug cargo tauri dev

# 只显示 info 及以上级别的日志
RUST_LOG=info cargo tauri dev

# 只显示 warn 和 error
RUST_LOG=warn cargo tauri dev

# 只显示 error
RUST_LOG=error cargo tauri dev

# 显示特定模块的日志
RUST_LOG=emice=debug cargo tauri dev
```

## 查看日志

运行 `cargo tauri dev` 后，日志会直接输出到终端，包括：

1. **Rust 后端日志**：
   - `info!` - 一般信息（函数调用等）
   - `debug!` - 调试信息（详细数据）
   - `warn!` - 警告信息
   - `error!` - 错误信息

2. **前端 JavaScript 日志**：
   - `console.log()` - 会在终端显示
   - `console.error()` - 会在终端显示

## 调试技巧

1. **查看函数调用**：所有 Tauri 命令调用都会输出 `info!` 日志
2. **查看数据**：函数返回结果会输出 `debug!` 日志
3. **查看前端日志**：JavaScript 的 `console.log` 也会在终端显示
4. **查看错误**：所有错误都会输出 `error!` 日志

## 示例输出

```
[2024-01-01 12:00:00] INFO emice - 启动 Emice Tools 应用
[2024-01-01 12:00:01] INFO emice - 调用 get_current_time
[2024-01-01 12:00:01] DEBUG emice - get_current_time 结果: CurrentTimeResult { ... }
```

