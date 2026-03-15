# 图标文件说明

请在此目录下放置以下图标文件：

- `32x32.png` - 32x32 像素 PNG 图标
- `128x128.png` - 128x128 像素 PNG 图标
- `128x128@2x.png` - 256x256 像素 PNG 图标（Retina）
- `icon.icns` - macOS 图标文件
- `icon.ico` - Windows 图标文件

## 生成图标

你可以使用在线工具或命令行工具生成这些图标：

### macOS
```bash
# 使用 sips 命令（macOS 自带）
sips -z 32 32 icon.png --out 32x32.png
sips -z 128 128 icon.png --out 128x128.png
sips -z 256 256 icon.png --out 128x128@2x.png

# 生成 .icns 文件（需要安装 iconutil）
iconutil -c icns icon.iconset
```

### Windows
可以使用在线工具如 https://convertio.co/png-ico/ 将 PNG 转换为 ICO

### 临时方案
如果暂时没有图标，可以创建一个简单的占位图标，或者从 Tauri 配置中移除图标配置。

