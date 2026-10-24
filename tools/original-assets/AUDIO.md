# 原包音频提取

运行：`python tools/original-assets/extract-audio.py`（Python 标准库，无第三方依赖）。

输入为 `reverse/original-apk/unpacked/assets/BGM/`：

- `00_System.cks`：1 首 BGM。
- `effect.ckb`：257 条音效，包含 PCM16、PCM8 和 Cricket ADPCM。
- `cloud.ckb`：空音频银行；lookup 中的其他银行不在 base APK 内。

输出：

- `reverse/original-apk/audio/bgm/`、`sfx/`：完整的单次播放 PCM16 WAV。
- `reverse/original-apk/audio/listen.html`：可筛选的本地试听页。
- `reverse/original-apk/audio/manifest.json`：源文件及输出 SHA-256、采样率、声道、帧数、原始循环字段、导入清单。
- `assets/resources/audio/bgm/00_System.wav`：供播放测试；未改变“不提供背景音乐”的产品需求。
- `assets/resources/audio/sfx/candidates/`：六条短音效试听候选，保留原名，**尚未确认按钮用途**。

候选仅按短时长挑选，不代表全部或特定按钮音效。包内 CCBl 文件可见部分 `sounds/sse_009.m4a`、`sounds/sse_021.m4a` 名称引用，但不据此推断按钮事件。当前 base APK 未包含可用于核实原生调用的 `.so`，尚未观察运行行为。

解析参考 vgmstream 的 [CK 容器实现](https://github.com/vgmstream/vgmstream/blob/master/src/meta/ck.c) 与 [Cricket ADPCM 实现](https://github.com/vgmstream/vgmstream/blob/master/src/coding/msadpcm_decoder.c)。脚本校验容器范围、块大小、样本数、WAV 回读 PCM 字节；尚未进行听觉或第二解码器比对。不归一化、不裁剪、不重复循环，循环信息留在清单。资源由 Cocos 编辑器生成 `.meta`。

原 APK SHA-256：`295a40799271d65f38acb7dbbfc5d200be3955acc1101809d354b21764b73497`。已通过 REA 打开核实身份，提取直接读取本地解包资源。额外下载的 vgmstream JS 未参与最终转换；Windows/WASM 下载失败，最终使用本脚本解码。

重跑时不会覆盖内容不一致的输出。`ClearCache` 与本工具无关。
