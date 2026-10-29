# 原作弹窗资源提取

本工具仅处理用户提供 APK 中已解包的 10 张通用弹窗资源，不参与游戏运行。

## 重现

在项目根目录运行：

```powershell
node tools/original-assets/decode-dialog-assets.mjs
python tools/original-assets/preview_dialog_assets.py
```

预览脚本需要 Pillow。解码脚本只使用 Node.js 内置模块。

- 输入：`reverse/original-apk/unpacked/assets/00_common/`
- 标准 PNG 输出：`assets/resources/ui/common/dialog/art/`
- 校验清单：`reverse/original-apk/dialog-assets-manifest.json`
- 原尺寸对照预览：`reverse/original-apk/dialog-assets-preview.png`

`Common_UI_Dialog.ccbi` 内可观察到对底板、标题条、蓝/绿/红按钮和关闭图标的资源路径引用。两个 `02` 按钮、`_100` 底板和 `_L` 标题条作为候选变体一并导出；这不意味着已经确认其运行时用途。

## 校验与范围

根据 PNG 已知结构恢复出 33 字节循环异或序列，并通过所有候选文件独立验证，处理长度为文件前 1280 字节（短文件处理全长）。这是对资源字节的分析结论，不代表已经找到原程序中的解码函数。

输出前验证 PNG 签名、所有分块 CRC、IEND、IDAT zlib 数据及扫描行长度；Pillow 再独立解码并生成预览。保留原文件名称、尺寸与像素，不重画、不缩放原图。不覆盖与预期字节不同的现有输出。

原 APK SHA-256：`295a40799271d65f38acb7dbbfc5d200be3955acc1101809d354b21764b73497`。每张输入与输出的 SHA-256 见校验清单。

九宫格边距、原作布局尺寸、按钮颜色所对应的行为和状态尚未确认。不要将整张图直接拉伸，也不要把候选变体自动认作按下或禁用状态。资源导入后由 Cocos 编辑器生成 `.meta`，本工具不手工创建。

## 界面维护

应用 Prefab 已生成完成，现以 Cocos 编辑器中维护的资源为准。`build-app-ui.py` 及专用组件模板已按用户要求删除，后续一次性界面生成脚本使用后即删除，避免覆盖手工修改。原包解码、提取和预览工具继续保留。
