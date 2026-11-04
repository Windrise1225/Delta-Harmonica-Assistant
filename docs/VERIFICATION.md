# 轻量版验证记录

验证日期：2026-11-04（Asia/Shanghai）。环境：Windows 11 x64，Electron 40.10.6，Node.js 26.13.0（仅开发工具，便携版自带运行时）。未运行三角洲游戏。

## 构建与单元测试

`npm run package`：TypeScript 检查、Vite 生产构建、Electron 主进程和 preload 构建、Windows x64 便携目录打包成功。Lavender 升级新增封面与 WebP 测试，Vitest **41/41 全部通过**。最终 `npm run smoke -- --packaged` 和 `npm run smoke:ui -- --packaged` 均通过。

- MIDI：真实二进制 Type 1、多轨推荐、排除打击乐、变速、拍号变化、延后首速度事件前的标准 120 BPM、短音、长音和连续同键。
- 单音化：和弦高声部、重复 onset、重叠截断及恢复，不过滤 MIDI 短音。
- 映射：未校准不输出、单鼠标操作、真实时长、只在开启后折叠到已确认的同音名、连续鼠标保持不合并键盘音符。
- 时间轴：长空白压缩、原曲时间与演奏时间互换、暂停冻结、统一下落速度与真实条长、结束帧冻结。
- 数据：DHScore v1、旧设置迁移、参数校验、原子写入、损坏文件保护、中文异常提示。

## 桌面回归

开发构建和 `npm run smoke -- --packaged` 均通过，直接启动便携 EXE，使用隔离的 `artifacts/smoke-data-*` 数据目录：

- 实际主界面、MIDI 原生文件选择入口、解析与多轨选择、空映射阻止保存。
- 测试专用虚构映射下保存带测试标记的曲谱；不修改用户默认映射。
- 3 秒倒计时、演奏开始、暂停 / 继续 / 立即跳转。
- 独立置顶覆盖窗口、无主子窗口关系；首帧完成后实际捕获图像包含透明 Alpha 像素和已绘制像素。
- 主程序最小化后覆盖窗口仍显示。
- DHScore 导出不包含源路径标识或可选音高；再导入可成功保存同名副本。
- 删除取消保留记录；重命名、确认删除、完整备份恢复，以及恢复前自动保留原数据。
- English 切换、设置和曲谱写盘持久化。
- Chromium 用户目录和缓存目录均位于指定便携数据目录。
- 没有 renderer 未捕获错误。截图见 `artifacts/library.png`、`midi-import.png`、`performance.png`、`overlay.png`、`settings.png`。

## 尚待游戏与硬件实测

8 键准确 MIDI 音高和鼠标偏移、游戏实际连续保持 / 释放规则、真实游戏无边框覆盖及失焦 / 退出行为、游戏权限差异、1080p / 2K / 4K 多屏混合 DPI、游戏内实际帧率与资源占用。

这些项目没有被桌面回归替代，也没有宣称已实测。软件默认音高校准保持空白。测试曲谱明确标记，随包附带，不作为真实歌曲识别结果。

## Lavender 视觉与封面回归

`npm run smoke:ui`：旧曲库不带封面元数据时补图且保持曲谱内容；三首明确标记的测试曲谱拥有不同种子。真实 UI 验证搜索、更多菜单、PNG 上传、正方形裁剪缩放 / 平移、保存、恢复原自动封面、显式重新生成、带图片备份恢复。JPEG 与 WebP 也经过本地读取与 Chromium 解码验证。

覆盖 1040×720、1440×960、1920×1080 窗口，未发现横向溢出；关闭并重新启动后，用 150% / 200% 设备缩放校验图片仍能加载、种子及自定义封面身份一致、曲谱无改变。这里是 Electron 设备缩放检查，不替代实际多屏混合 DPI 硬件测试。

新版输出在 `release/lavender/win-unpacked`，原 `release/win-unpacked/data` 保留。截图见 `artifacts/lavender-library.png`、`cover-editor.png`、`cover-crop.png`、`layout-1040.png`、`dpi-1.5.png`、`dpi-2.png`。
