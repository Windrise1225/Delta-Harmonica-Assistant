# v0.1.0 发布候选验收清单

本次只准备本地发布文件，人工确认前不推送 GitHub、不创建标签、不创建 Release。

## 必需文件

- `release/v0.1.0/win-unpacked/`：完整 Windows x64 运行目录。
- `release/v0.1.0/Delta-Harmonica-Assistant-0.1.0-win-x64.zip`：完整便携包，包含 EXE、Electron、资源和原生模块。
- `release/v0.1.0/Delta-Harmonica-Assistant-0.1.0-source.zip`：可供 GitHub 同步的干净源代码快照。
- ZIP 对应 `.sha256`、`SOURCE_MANIFEST.json` 与 `RELEASE-CHECKS.json`。

## 自动检查

```powershell
npm ci
npm run check
npm run build
npm run package
npm run smoke -- --packaged
npm run smoke:ui -- --packaged
node scripts/check-overlay-controls.mjs
node scripts/check-note-labels.mjs
node scripts/check-readability.mjs
node scripts/release-source.mjs
node scripts/verify-release.mjs
```

开发需要 Node.js >=22.12.0。只有制作 ZIP 使用 Windows 自带的 PowerShell；最终应用无需 Node.js、PowerShell 脚本或 Python。Electron 官方运行时下载未完成时，运行 `node scripts/setup-electron.mjs` 下载并检查官方 npm 包内的 SHA-256 校验值，再重新打包。

`verify-release.mjs` 用 Windows 自带解压工具解压便携 ZIP，逐文件核对 SHA-256；在清除 Node.js PATH 的环境中启动解压后的 EXE，验证版本、默认空校准、本地保存与重启、覆盖窗口、原生模块、外部连接拦截，以及源码 ZIP 的全部文件哈希。

不要在正常使用的软件目录中执行打包。electron-builder 会清理构建输出。当前独立发布目录不读取旧版 `release/lavender/win-unpacked/data`。

## 源码与隐私

- 只打包明确列入清单的源码、测试、说明与图标，不复制整个工作区。
- 不包含 node_modules、开发缓存、构建目录、用户曲库、校准数据、运行日志、备份、凭据文件或原始音频。
- fixtures 中的 MIDI / DHScore 是明确标注的合成测试曲谱，不是真实歌曲或实测音高。
- 不存在联网识别或音频临时文件流程；不上传用户文件。默认所有键位和鼠标偏移均未校准。

## 人工签收

按根目录 `KNOWN_ISSUES.md` 完成干净电脑、游戏实机、权限及混合 DPI 验收后，再确认 GitHub 源码同步和 Release 上传。
