# UI 框架冒烟驱动

在 Node.js 里用一份最小 `cc` 桩跑 `assets/Scripts/Frame/UI` 的真实状态机，
不需要打开编辑器、不需要场景、不需要渲染。

覆盖：`open → hideBelow → back → close → cache → 缓存到期 → 遮罩挂载 → 资源缺失 → 批量关闭`，
共 37 项断言；有任何一项不符就以退出码 1 结束。

## 为什么要有它

`npx tsc` 只能证明「类型对得上」，证明不了「状态流转对得上」。
移植期它抓到过两个真实缺陷（缓存态进不去、遮罩路径解析错），
两者都能通过类型检查、都只会在运行时让界面静默失效。

## 运行

```bash
# 1) 编译到 .uitest-out（CommonJS，`cc` 由 paths 指向 cc-stub.ts）
npx tsc -p tools/uitest/tsconfig.json

# 2) 让运行期的 require('cc') 落到桩上（只需一次）
mkdir -p .uitest-out/node_modules/cc
echo "module.exports = require('../../tools/uitest/cc-stub.js');" > .uitest-out/node_modules/cc/index.js

# 3) 跑
node .uitest-out/tools/uitest/smoke.js
```

Windows PowerShell 等价写法：

```powershell
npx tsc -p tools/uitest/tsconfig.json
New-Item -ItemType Directory -Force -Path .uitest-out\node_modules\cc | Out-Null
Set-Content .uitest-out\node_modules\cc\index.js "module.exports = require('../../tools/uitest/cc-stub.js');" -Encoding ascii
node .uitest-out\tools\uitest\smoke.js
```

期望输出最后一行：`SMOKE_RESULT failed=0`。
过程里出现 `[UI] UI 资源加载失败：ui/test/NoSuchPrefab` 是**预期**的——那是「资源缺失」用例故意为之。

## 文件

| 文件 | 作用 |
| --- | --- |
| `cc-stub.ts` | 最小 `cc` 桩：节点树、组件挂载、`Widget`、`resources.load`、`instantiate`、装饰器空实现 |
| `smoke.ts` | 被测界面（继承 `BaseWin`/`BaseDlg`/`BaseMask`）+ 断言场景 |
| `tsconfig.json` | 独立编译配置：`paths.cc → cc-stub.ts`，输出到 `.uitest-out` |
| `globals.d.ts` | 驱动用到的 `console`/`process`/`setTimeout` 声明（工程没装 `@types/node`） |

## 边界

- 桩不实现渲染、输入、Tween：框架若依赖它们，冒烟会直接炸——这正是想要的信号。
- `.uitest-out/` 是编译产物，已在 `.gitignore` 里忽略。
- 新增界面时不需要改桩；要在冒烟里验证新行为，往 `smoke.ts` 加场景即可。
