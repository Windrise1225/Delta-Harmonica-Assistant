# DHScore v1 与轻量版兼容性

继续使用 JSON `.dhscore`，版本号保持 `1`。既有字段 `version/id/name/createdAt/lastUsed/duration/sourceDuration/segment/sourceId/bpm/test/notes` 沿用；既有曲谱无需重建。轻量版不提供截取编辑器，但保留 `segment` 用于读取旧曲谱并显示原始时间。

每个音符保存 `key`、`start`（秒）、`duration`（秒）、`mouse`（`none/left/middle/right`），本地曲库可额外记录可选 `midi`。结束时间为 `start + duration`。导出移除源文件路径标识 `sourceId` 及可选音高，保留可分享的按键时间数据；绝不包含 MIDI 二进制、音频或文件路径。

为准确显示 MIDI 的变速和节拍，新增**可选**的 `timing` 元数据，旧曲谱没有此字段也可正常读取：

```json
{
  "ppq": 480,
  "tempos": [{ "ticks": 0, "time": 0, "bpm": 120 }],
  "meters": [{ "ticks": 0, "numerator": 4, "denominator": 4 }]
}
```

导入时验证版本、时间有限值、单音不重叠、合法键位及鼠标操作、音符数量和文件大小。限制为 8 MB MIDI / 25 MB DHScore / 200 MB 含封面备份；自定义封面原始字节总量最多 128 MB。曲谱最多 50,000 个音符、最长 24 小时。支持标准 MIDI Type 0/1 和 PPQ；Type 2、SMPTE 有明确提示。弯音和延音踏板事件显示提示，时长按 Note Off 计算。

备份结构继续使用版本 1：`{ "format": "dhbackup", "version": 1, "library": { "settings": {}, "scores": [], "covers": {} }, "images": {} }`。`covers` 和 `images` 为可选的兼容性扩展，旧备份缺省为空；自动封面记录固定 `seed/version/kind`，自定义封面记录本地摘要文件名。`images` 包含自定义 PNG 的 Base64 字节，恢复检查摘要和尺寸。恢复前确认，并在数据目录写入包含封面的 `before-restore.json`。封面不进入 DHScore，音乐字段及版本号不变。

设置沿用原有属性；新增可选、默认空的 `noteColor` 可覆盖轨道音符颜色。读取旧设置时只移除已弃用的 `inferenceBackend`，其余设置和曲谱保留。
