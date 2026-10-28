# 红点系统设计文档评审：工程接线 / 门面 / 测试工程一致性

- 评审对象：`docs/红点系统设计.md`（667 行，设计稿 v2）
- 评审范围（task-3）：§4 模块划分、§5.2 静态门面、§6 启动时序、§8 业务接入示例、§11 任务拆分与验收，外加 prefab/资源、eslint、单测工程对照
- 对照基准：`assets/Scripts/**`、`tools/**`、`package.json`、`tsconfig.json`、`eslint.config.mjs`、`.gitignore`、`assets/resources/ui/app/MainWin.prefab`、`README.md`、`docs/项目总纲.md`、既有 docs 的验收写法
- 评审方法：逐行静态对照（源码 / 配置 / prefab JSON / 目录约定）。**本环境（沙箱内 pwsh 因工作区 ACL 故障不可用）未执行 `tsc`/`eslint`/`node --test`**，因此所有"会编译失败"的结论均来自配置文件与源码的逐行比对，未做运行验证；建议在正常环境复核下列命令类结论。

统计：**阻断 2 条、重要 7 条、建议 7 条**，另有 12 组"已核对与文档一致"的项（见文末，避免误改）。

---

## 一、阻断（设计落地即出错，必须先改文档再实现）

### 阻断-1｜懒初始化 + Initialize/Dispose 组合会让已订阅的红点"永久失聪"

- **文档位置**：§5.2 第 246、254 行；§3.6 第 118、206 行（`Dispose` 清空监听）；§5.4 第 299-306 行（`onLoad` 订阅）；§10 第 563 行（坑 7：明确承诺"组件自己隐藏后收不到事件"的情况不会发生）；§11 任务 2 第 611 行（"重复 `Initialize` 不会留下旧监听"）
- **问题**：文档同时要求三件互相冲突的事：
  1. 门面内部持有 `RedDotStore` + `EventDispatcher`（第 246 行）；
  2. 门面做懒初始化，忘记调用 `Initialize` 也不报错（第 254 行）；
  3. `Dispose()` 清空注册树和监听（第 118、206 行），且"重复 `Initialize` 不会留下旧监听"（第 611 行）。

  `RedDotBadge` 在 `onLoad` 里只订阅一次（第 300-305 行），退订只发生在 `onDestroy`（第 313-315 行）。一旦 `Dispose()` 清掉了 dispatcher 监听、后续懒初始化又**新建**了一个 store/dispatcher（或 `Initialize` 被第二次调用重建了 dispatcher），badge 闭包里的退订函数指向的是**旧 dispatcher**，而它自己的 `onLoad` 永远不会再执行 —— 红点从此收不到任何变更事件，只剩 `onEnable` 时那一次快照。这正是第 563 行声称已规避的失效模式，但按 §5.2 的三条要求实现必然复现。
- **证据**：
  - `assets/Scripts/Frame/Event/EventDispatcher.ts:82-84`：`clear()` 直接 `listeners.clear()`，没有任何"订阅者存活"保护；
  - `assets/Scripts/Frame/Event/EventDispatcher.ts:43-50`：`off()` 按 handler 函数身份删除，只能退掉"当时登记的那个函数"；
  - `assets/Scripts/Frame/UI/BindingScope.ts:21-24`：`add()` 只保存退订函数，不关心 dispatcher 是否已被替换；
  - `assets/Scripts/Frame/UI/Base/BaseUI.ts:44-52` + `assets/Scripts/Frame/UI/README.md:142、149-150`（缓存重开只重跑 `resetBindings` + `initEvent`，不重跑 `onLoad`；"订阅只登记一次"的写法被清账后无法自愈）——证明该失效模式在本框架里是真问题；
  - 文档第 611 行与第 654 行（"界面缓存重开…不重复订阅"）在语义上互斥，文档没有给出裁决。
- **修复建议（文档层）**：把门面的生命周期写成明确契约，例如：
  - dispatcher 作为**模块级单例，永不重建**；`Initialize()` 幂等（已初始化时只 `Log.warn` 并返回）；
  - `Dispose()` 只 `store.dispose()` + 把 facade 自己登记的转发监听 `off` 掉，**不调用 `dispatcher.clear()`**，以保持 dispatcher 对象身份稳定；
  - 懒初始化路径必须保证"store → dispatcher 的转发只挂一次"（重连而不是重建）；
  - 把第 611 行改成"`Initialize` 幂等；`Dispose` 后可再次 `Initialize`，已订阅视图不会失聪"，并补一条测试点：`Dispose → Initialize → Set → OnChanged 仍能收到`；
  - 在 §5.4 补一句"`Dispose` 之后到达的退订调用必须是 no-op"，因为 `BindingScope.unbindAll()` 会把异常吞成 `Log.error`（`assets/Scripts/Frame/UI/BindingScope.ts:50-56`），顺序不确定时会刷错误日志（`AppEntry.onDestroy` 与场景卸载都可能在对方之前发生，见重要-6）。

### 阻断-2｜`tools/reddottest` 的编译单元没定义清楚，按 `logtest` 的既有写法会编译失败

- **文档位置**：§4 第 132 行；§11 任务 1 第 583-594 行（文件清单 + "`npm run test:reddot` 通过" + "核心文件不 import `cc`"）
- **问题**：文档只写了 `tools/reddottest/`（`tsconfig.json`、测试文件）与 `package.json` 增加 `test:reddot`，没有规定 `tsconfig` 的 `include/rootDir/outDir/lib/types`，也没有规定测试文件 `require` 哪个编译产物。照抄 `logtest` 的最自然写法（`include: Frame/RedDot/**/*.ts`）会把**任务 3 才存在的 `RedDotBadge.ts`（`import { Label } from 'cc'`）**一起编进来，而 `logtest` 的配置是 `"types": []` 且没有 cc 声明（`savetest` 的 `cc.d.ts` 也只声明了 `sys`）→ 直接 `TS2307: Cannot find module 'cc'`，任务 1 的验收标准（第 592 行）永远不通过。
- **证据**：
  - `tools/logtest/tsconfig.json:3-12`：`module: CommonJS`、`rootDir: "../.."`、`outDir: "../../.logtest-out"`、`"types": []`、`lib: ["ES2020","DOM"]`、`include: ["../../assets/Scripts/Frame/Log/**/*.ts"]`（**glob 形式**，正是本次会踩的坑）；
  - `tools/logtest/log.test.mjs:5-6`：测试 `require('../../.logtest-out/assets/Scripts/Frame/Log/index.js')` —— 依赖 `index.ts` 作为编译入口（而文档任务 1 的文件清单里**没有** `Frame/RedDot/index.ts`，任务 2 才加）；
  - `tools/uitest/cc-stub.ts:230-262`：现有 cc 桩的完整导出清单里**没有 `Label`**（也没有 `Sprite`），说明"把 cc 依赖编进 Node 测试"这条路当前只有 `types` 桩（`tools/savetest/cc.d.ts:1-8`，只声明了 `sys`）和 `paths` 映射两种半成品；
  - `package.json:16-17`：既有脚本是 `tsc -p ... && node --test tools/xxx/xxx.test.mjs` 两段式，文档第 592 行只说"`npm run test:reddot` 通过"，没写这条等价关系。
- **修复建议（文档层）**：在 §11 任务 1 给出可直接照抄的配置约定：
  - `include` **显式列出** `RedDotStore.ts`、`RedDotFormat.ts`、`RedDotEvent.ts`（不要用 `Frame/RedDot/**/*.ts` 的 glob，避免把 `RedDotBadge.ts` 卷进来；被 import 的 `Frame/Event/EventDispatcher.ts`、`Frame/Log/*.ts` 会被 tsc 自动纳入，仍落在 `rootDir` 内）；
  - `compilerOptions` 复制 `logtest`：`target ES2020 / module CommonJS / moduleResolution Node / strict true / lib ["ES2020","DOM"] / types [] / rootDir "../.." / outDir "../../.reddottest-out"`（`lib` 必须带 `DOM`，因为 `Log` 用 `console`）；
  - 测试文件名固定 `tools/reddottest/reddot.test.mjs`，`require('../../.reddottest-out/assets/Scripts/Frame/RedDot/RedDotStore.js')`，**不要** `require` `index.js`（原因见重要-5）；
  - `package.json` 增 `"test:reddot": "tsc -p tools/reddottest/tsconfig.json && node --test tools/reddottest/reddot.test.mjs"`；
  - 同步把 `.reddottest-out/` 加进 `.gitignore:19-21` 与 `eslint.config.mjs:14-16` 的忽略清单（现有三个产物目录就是这么登记的）。

---

## 二、重要（不改会返工，或会让既有工程流程失效）

### 重要-1｜`RedDotBadge` 进 `Frame/RedDot` 会打断既有 UI 冒烟驱动的编译

- **文档位置**：§4 第 129 行；§7 第 448-468 行；§11 任务 3 第 613-627 行
- **问题**：`tools/uitest/tsconfig.json` 用 `include: ["../../assets/Scripts/Frame/**/*.ts"]` 全量编译 Frame 层，并把 `cc` 用 `paths` 指到最小桩。新增 `Frame/RedDot/RedDotBadge.ts` 后，`import { ..., Label } from 'cc'` 在桩里不存在 → `npx tsc -p tools/uitest/tsconfig.json`（`tools/uitest/README.md:19` 的既定第一步）报 `TS2305: Module '"cc-stub"' has no exported member 'Label'`，冒烟驱动（`.uitest-out/tools/uitest/smoke.js`）随之无法构建。文档没有任何一处提到这个既有流程。
- **证据**：
  - `tools/uitest/tsconfig.json:13-18`：`paths: { "cc": ["./cc-stub.ts"] }` + `include: ["../../assets/Scripts/Frame/**/*.ts", "*.ts"]`；
  - `tools/uitest/cc-stub.ts:230-262`：桩的导出清单只有 `Vec2/Vec3/Size/Color/Component/UITransform/Widget/Node/isValid/Prefab/instantiate/resources/_decorator/CCInteger/Button/Toggle/Slider/EditBox/EventTouch/NodeEventType`，**无 `Label`**（也无 `Sprite`）；
  - `tools/uitest/README.md:19、26、38`：冒烟流程依赖 `npx tsc -p tools/uitest/tsconfig.json` 成功；
  - `assets/Scripts/Model/App/UI/ConfirmDlg.ts:1` 已经在用 `Label`，但它不在 uitest 的 include 范围内（`Model/**` 不参与），所以现有配置一直没暴露这个缺口。
- **修复建议**：文档 §11 任务 3 增加一条前置项——"`tools/uitest/cc-stub.ts` 需补最小 `Label`（`node: Node`、`string`、`active`）与 `Sprite` 桩，否则 `npx tsc -p tools/uitest/tsconfig.json` 失败"；或者明确"`Frame/RedDot/RedDotBadge.ts` 不参与 uitest 编译，需要在 uitest tsconfig 里 `exclude`"。二者选一并在文档写出，不要让实现者自己猜。

### 重要-2｜`EventDispatcher.on` 不返回退订函数，门面 `OnChanged` 必须自己包装；文档未写实现要点

- **文档位置**：§5.2 第 239-240 行（`static OnChanged(handler): () => void`）、第 246 行；§11 任务 2 第 610 行（"退订后不再收到回调"）
- **问题**：门面签名承诺返回退订函数，但底层 `EventDispatcher.on` 是 `void`。这不是设计错误（可以包装），但文档把它写成"门面内部持有一个 `EventDispatcher`"就结束了，没写必须实现 `on → 记录 handler → 返回 () => dispatcher.off(key, handler)`，实现者极易写出 `return undefined as any` 或"每次订阅都新建 handler 却用原 handler 去 off"的错配版本。另外 `off()` 只删**第一个**匹配项，同一个 handler 订两次只能退一次。
- **证据**：
  - `assets/Scripts/Frame/Event/EventDispatcher.ts:35-37`：`public on<T>(...): void`；
  - `assets/Scripts/Frame/Event/EventDispatcher.ts:43-50`：`off` 按 `record.handler === handler` 匹配，且 `splice` 只删第一个；
  - `assets/Scripts/Frame/Event/EventDispatcher.ts:61-80`：`send` 对监听表做快照（文档第 216 行"和现有 EventDispatcher 的行为一致"这句是对的，可保留）；
  - `assets/Scripts/Frame/Event/EventDispatcher.ts:53-59`：另有 `offCaller(caller)` 可用，门面若用 `caller` 记账会比返回闭包更省事；
  - `assets/Scripts/Frame/UI/BindingScope.ts:21-24`：`add()` 只接受 `() => void`，所以门面必须真的返回函数，`RedDotBadge` 第 301-305 行的写法才成立。
- **修复建议**：在 §5.2 补 3 行实现要点：①`OnChanged` 内部 `const handler = (c) => userHandler(c)`，`dispatcher.on(RedDotEvent.changed, handler)`，返回 `() => dispatcher.off(RedDotEvent.changed, handler)`；②同一 handler 重复订阅不受支持，或改用 `offCaller` 以订阅者为 caller；③`Dispose` 不得 `clear()`（见阻断-1）。同时把 `EventKey` 的归属写清（见建议-2）。

### 重要-3｜§8 的 `MainWin` 示例片段缺 import，照抄编译不过（含实证 `DEV`）

- **文档位置**：§8 第 494-509 行
- **问题**：示例块里出现 `DEV`、`RedDot`、`AppRedDotId` 三个标识符，但没有任何 import 说明。按现有 `MainWin.ts` 的文件头照抄会得到 3 个 `TS2304: Cannot find name ...`。其中 `DEV` 是本次评审要求点名的实证：项目里 `DEV` 必须从 `cc/env` 导入。
- **证据**：
  - `assets/Scripts/Model/App/UI/MainWin.ts:5`：`import { DEV } from 'cc/env';`（第 23 行 `if (this._confirmTestBtn) this._confirmTestBtn.node.active = DEV;` 是唯一用法）；
  - `assets/Scripts/Model/App/UI/MainWin.ts:1-4`：文件头只导入了 `cc`、`Frame/UI`、`ConfirmDlg`、`Frame/Log`，**没有** `RedDot`/`AppRedDotId`；
  - 文档第 475 行的 `AppRedDotTree.ts` 片段同样缺 `import { RedDot } from '.../Frame/RedDot'`，第 249 行的 `RedDotEvent.ts` 片段缺 `import { EventKey } from '../Event/EventDispatcher'` 与 `RedDotChange` 类型导入。
- **修复建议**：给每个示例块补完整 import 头（并写清相对路径深度），例如 `MainWin.ts` 应为：
  `import { RedDot } from '../../../Frame/RedDot';`、`import { AppRedDotId } from '../RedDot/AppRedDotTree';`、`import { DEV } from 'cc/env';`
  `MainWin.prefab` 的按钮回调是代码绑定（见已核对项 9），所以不需要额外 prefab 事件。

### 重要-4｜§8 示例与 `MainWin.ts` 的真实方法重复/冲突，"照抄"会重复定义或覆盖既有逻辑

- **文档位置**：§8 第 495-508 行
- **问题**：示例把 `protected onOpen()` 和 `private _onTeamEditBtnPress()` 写成新方法。真实文件里这两个方法**都已存在**：`onOpen` 已有 `_confirmTestBtn` 的 DEV 显隐逻辑，`_onTeamEditBtnPress` 已有打开 `ConfirmDlg` 的占位逻辑。实现者若按"新增"处理 → `TS2300: Duplicate identifier`；若按"替换"处理 → 丢掉 DEV 开关，而这条行为被另一份文档当成既有验收项。
- **证据**：
  - `assets/Scripts/Model/App/UI/MainWin.ts:22-24`：`protected onOpen(): void { if (this._confirmTestBtn) ... = DEV; }`；
  - `assets/Scripts/Model/App/UI/MainWin.ts:44-49`：`private _onTeamEditBtnPress()` 已实现，且 `initEvent` 已在第 31 行绑定它；
  - `docs/确认弹窗与原包界面对齐.md:23`："主页底部的'确认弹窗测试'仅在 DEV 环境显示" —— 说明那行 DEV 逻辑是有文档承诺的行为，不能丢。
- **修复建议**：把示例标注成"合入既有方法的增量片段"：`onOpen` 里追加 `RedDot.Batch(...)`（保留原 DEV 行），`_onTeamEditBtnPress` 里在原有 `UIManager.instance.open(...)` 之前插入 `RedDot.ClearTree(...)`。同时补一句"不要新建同名方法"。

### 重要-5｜`Frame/RedDot/index.ts` 若导出 `RedDotBadge`，会把 `cc` 依赖泄漏给 Node 侧消费方

- **文档位置**：§4 第 130 行（`index.ts` 模块出口）；§11 任务 2 第 602 行
- **问题**：`RedDotBadge` 与 `RedDotStore/RedDot.ts` 混在同一"纯核心"模块里，只有它是 `import cc` 的。若 `index.ts` 统一 `export *`，则：①单测（任务 1）一旦 require `index.js` 就会 `Cannot find module 'cc'`；②后续任何想在 Node 脚本里复用 `RedDot.Get` 的工具都得再配一次 cc 桩。现有 `Frame/Log/index.ts` 之所以能当测试入口，正因为它导出的全是无 cc 文件。
- **证据**：
  - `assets/Scripts/Frame/Log/index.ts:1-6`：只导出 `Log/LogBus/LogChannel/LogLevel/ConsoleLogSink` 与类型，全部无 cc（`assets/Scripts/Frame/Log/Log.ts:1-5` 只 import 同目录文件）；
  - `assets/Scripts/Frame/UI/index.ts:1-79`：反向例子——UI 出口必然带 cc（`UIManager.ts:1`），所以它从不被 Node 测试直接 require；
  - `assets/Scripts/Model/App/AppEntry.ts:4`：项目已有"深路径导入单个 SDK 文件"的先例（`'../../Frame/Audio/SoundManager'`，而 `Frame/Audio` 根本没有 `index.ts`）；
  - `assets/Scripts/Frame/Event` 目录下只有 `EventDispatcher.ts`、无 `index.ts`（glob 结果），说明"必须有 index.ts"不是硬约定。
- **修复建议**：`Frame/RedDot/index.ts` 只导出 `RedDot`（门面）、`RedDotStore`、`RedDotFormat`、`RedDotEvent`、相关类型；`RedDotBadge` 走深路径 `Frame/RedDot/RedDotBadge`（prefab 挂脚本不受影响）。文档 §4 表格里加"`index.ts` 不导出 `RedDotBadge`"一行，任务 1 的测试也就有了稳定入口。

### 重要-6｜§6.1 的启动/销毁接线只写了顺序，没有落到真实行号与真实约束

- **文档位置**：§6.1 第 375-385 行（第 377 行给出顺序）、§5.2 第 254 行、§11 任务 2 第 608-609 行
- **问题**：顺序本身**可行**（`SettingsService.Initialize()` 在第 31 行，`UIManager.init` 在第 47 行，中间有足够落点），但文档没有指出：
  1. 真实 `AppEntry.start` 在两者之间还有 `UIRuntimeRegistry` 构造 + `registerRange`（第 35-42 行），文档第 377 行把它们整个省略了，实现者容易把红点初始化插到 `new UIRuntimeRegistry()` 之前或 `registerRange` 中间，虽然不影响功能，但会让"顺序验收"无从核对；
  2. `manager.init` 之后才 `throw` 的 `hasErrors` 检查（第 55-57 行）与红点无关，但如果红点在 `manager.init` 之前抛异常，会跳过整个 UI 初始化且被 `async start` 吞成未处理 rejection——文档没要求红点初始化"只记日志不抛"（§5.1 第 217 行只约束了 Store 的注册校验，没约束 `Initialize`）；
  3. `onDestroy` 目前只有 `this._uiManager?.dispose()`（第 86-89 行），文档只说"`Dispose` 放在 `AppEntry.onDestroy`"，没给顺序。`UIManager.dispose()` **不销毁界面节点**（只停 ticker、清单例），所以 badge 的 `onDestroy` 由场景卸载触发，顺序不确定 → 与阻断-1 的"退订必须是 no-op"直接相关。
- **证据**：`assets/Scripts/Model/App/AppEntry.ts:19`（`async start`）、`:31`（`SettingsService.Initialize()`）、`:35-42`（registry 构造）、`:44-53`（`manager.init`）、`:55-61`（错误检查）、`:86-89`（`onDestroy`）；`assets/Scripts/Frame/UI/UIManager.ts:116-147`（init 内部顺序）、`:149-159`（dispose 不销毁界面节点，注释明确"界面节点由场景卸载负责"）；`assets/Scripts/Frame/UI/UIRuntimeRegistry.ts:13-14、27-29`（错误只置 `hasErrors` 不抛）。
- **修复建议**：§6.1 改成带行号的落点表：`AppEntry.ts:31 之后 / :35 之前` 插入 `RedDot.Initialize(); registerAppRedDots();`；`onDestroy` 写成 `this._uiManager?.dispose(); RedDot.Dispose();`，并注明"两条路径都必须幂等、不得抛出"。

### 重要-7｜"核心不 import `cc`"没有任何自动化保证，且新测试产物目录的登记约定没写

- **文档位置**：§4 第 136 行、§11 任务 1 第 593 行（"核心文件不 import `cc`"）
- **问题**：`npm run lint` 覆盖 `assets/Scripts` 与 `tools`，所以新建的 `Frame/RedDot`、`Model/App/RedDot`、`tools/reddottest` 都会被 lint；但 `eslint.config.mjs` 里只有命名规则和 `no-console`，**没有任何 import 限制机制**，因此"不 import cc"只能靠人肉评审，而文档把它列成了任务完成标准。
- **证据**：
  - `package.json:14`：`"lint": "eslint assets/Scripts tools"`；
  - `eslint.config.mjs:20`：`files: ['assets/Scripts/**/*.ts', 'tools/**/*.ts']`（新目录自动纳入）；
  - `eslint.config.mjs:31-75`：全部规则 = `@typescript-eslint/naming-convention` + `no-console`（`assets/Scripts` warn、`ConsoleLogSink.ts` 放行），无 `no-restricted-imports`；
  - `eslint.config.mjs:5-17` 与 `.gitignore:19-21`：三个产物目录（`.uitest-out/.logtest-out/.savetest-out`）是"两处都要登记"的既有约定，文档新增 `.reddottest-out` 时未提。
- **修复建议**：文档二选一写清保证手段：①在 `eslint.config.mjs` 给 `assets/Scripts/Frame/RedDot/{RedDotStore,RedDotFormat,RedDotEvent,RedDot}.ts` 加 `no-restricted-imports: ['error', { patterns: ['cc', 'cc/*'] }]`；②在 `reddot.test.mjs` 里加一条断言读源文件检查不含 `from 'cc'`（零配置，和现有"单测即验收"的风格一致）。同时把 `.reddottest-out/` 的 `.gitignore` + eslint ignores 登记写进任务 1。

---

## 三、建议（能跑但会留隐患 / 与既有文档风格不一致）

### 建议-1｜§5.1/§5.2 的 API 块是"无函数体的方法签名"，落地成 `.ts` 会报 TS2391

- **文档位置**：§5.1 第 159-207 行、§5.2 第 222-243 行
- **问题**：`export class RedDotStore { register(...): boolean; ... }` 这种写法只在 `.d.ts` 或 `abstract` 成员里合法；作为 `.ts` 源码直接保存会报 `TS2391: Function implementation is missing or not immediately following the declaration`。文档没说这是"签名示意"。
- **证据**：同文档 §5.3 第 258-264 行、§5.4 第 272-341 行都是可直接编译的真实实现，与 §5.1/§5.2 的纯签名块风格不一致。
- **修复建议**：在 §5.1/§5.2 标题下加"以下为签名示意，实现时请落地为带实现体的方法或单独 `.d.ts`"。

### 建议-2｜§4 表格把 `EventKey` 写成"定义"，实际它已在 `Frame/Event` 定义，`RedDotEvent.ts` 只该"声明键"

- **文档位置**：§4 第 127 行（`RedDotEvent.ts`｜`EventKey` 定义）
- **问题**：`EventKey` 类已存在于 `Frame/Event/EventDispatcher.ts`，`RedDotEvent.ts` 的职责只是声明 `reddot.changed` 这个键；措辞会让实现者以为要在 `Frame/RedDot` 里再造一个 `EventKey`。
- **证据**：`assets/Scripts/Frame/Event/EventDispatcher.ts:9-16`（`export class EventKey<T>`）；`assets/Scripts/Frame/UI/UIEvents.ts:2`（`import { EventKey } from '../Event/EventDispatcher';`）、`:22-25`（`export const UIEvent = { open: new EventKey<UIOpenPayload>('ui.open'), ... }`）。
- **修复建议**：改为"红点事件键声明（`import { EventKey } from '../Event/EventDispatcher'`）"。

### 建议-3｜§12 第 4 条"用现有实心图染色占位"没有合适的底图（只有蓝色实心图）

- **文档位置**：§12 第 667 行、§7 第 463 行（圆点模式）
- **问题**：项目 `resources` 里唯一的"实心"贴图是蓝色 `solidBlue.png`；`Sprite._color` 是乘算，蓝底乘红色会得到接近黑的暗紫，做出来的红色角标颜色不对，评审/验收时会误判成"美术没做"。
- **证据**：`assets/resources/ui/original/controls/` 下仅 `check/checkbox/sliderProgress/sliderThumb/sliderTrack/solidBlue.png`（glob 结果，无白/红实心图）；`assets/resources/ui/app/MainWin.prefab:1116-1155` 显示 Sprite 用 atlas 子帧（`1a7b21d0-...@f9941`）且 `_color` 为纯白——说明现有界面靠原包图，没有纯色底图可用。
- **修复建议**：先在文档里把占位资源写成任务前置项（"新增一张 24×24 纯白圆角图到 `assets/resources/ui/common/`，染红使用"），或明确"第一版允许用 `Sprite` + 纯色 `_color` 但需要一张白图"。

### 建议-4｜§8 演示数据放在 `MainWin.onOpen`，会与"点编队清红点"的验收互相打脸

- **文档位置**：§8 第 495-502 行；§11 任务 4 第 637-642 行
- **问题**：`MainWin` 默认 `cacheTime = 30000`，关闭后 30s 内重开复用同一个节点并**重跑 `onOpen`**；把演示种子（团队 2 / 关卡 120）放在 `onOpen` 里，会让用户点了编队清红点、退回标题再进主页时红点又亮起来。文档第 642 行要求"演示数据集中在一处、容易删除"，`onOpen` 恰恰是每开一次就执行一次的位置。
- **证据**：`assets/Scripts/Frame/UI/Def/UIOpenOpt.ts:50`（`DefaultCacheTime = 30000`）、`:85`；`assets/Scripts/Frame/UI/README.md:121`（"Open：`resetBindings` → `initEvent` → `onOpen`"）；`assets/Scripts/Frame/UI/States/UIOpenStateHandler.ts:13`（重复 open 不经过离场）。
- **修复建议**：演示种子挪到 `registerAppRedDots()`（启动一次），或加 `private _demoSeeded = false` 只种一次；`onOpen` 里只做"真实数据写入"。

### 建议-5｜§5.4 应补一句"框架的 `resetBindings` 只作用于 `BaseUI.binder`"，否则实现者容易改回 `BaseCmp` 而丢订阅

- **文档位置**：§5.4 第 343-348 行
- **问题**：文档论证"不继承 `BaseCmp` 因为在 `onDisable` 退订"，这一点属实；但真正更隐蔽的坑是"已打开界面再次 `open` 前框架会 `resetBindings()`"，如果 badge 改成继承 `BaseCmp`/`BaseWin`，它的订阅会被框架清掉且 `onLoad` 不重跑。文档没写这层，读者只看到 `onDisable` 一条理由。
- **证据**：`assets/Scripts/Frame/UI/Base/BaseCmp.ts:32-34、50-52`（`onEnable → initEvent`、`onDisable → binder.unbindAll()`）；`assets/Scripts/Frame/UI/Base/BaseUI.ts:44-52`（`resetBindings` 只清 `this.binder`）、`:21`（`binder` 是 BaseUI 的字段）；`assets/Scripts/Frame/UI/States/UIOpenStateHandler.ts:13`（必须先 `resetBindings` 再 `initEvent`）。
- **修复建议**：补一句"`RedDotBadge` 不继承 `BaseUI`，其私有 `BindingScope` 不会被框架 `resetBindings` 触碰；这也是它能放 `onLoad` 的前提"。顺带可引用同目录既有先例 `assets/Scripts/Frame/UI/FitScaleBox.ts:112、161-164`（`Component` + 私有 `_binder` + `onDestroy` 兜底）。

### 建议-6｜`MainWin.prefab` 是脚本生成物，手加红点节点会被 `build-app-ui.py` 覆盖

- **文档位置**：§7 第 448-468 行、§11 任务 3 第 618 行（"先加一个入口做验证"）、任务 4 第 631-635 行（"三个入口的 prefab 节点"）
- **问题**：`MainWin.prefab` 由 `tools/original-assets/build-app-ui.py` 整体重写（`write_text` 整个 JSON）；手在编辑器里加的红点节点，一旦有人重跑脚本就会消失。文档只说"改 prefab / 加节点"，没提这个覆盖风险。
- **证据**：`tools/original-assets/build-app-ui.py:155`（`(OUT / (self.name + '.prefab')).write_text(...)`）、`:174-190`（重建 `MainWin` 及 `_teamEditBtn/_stagePickBtn/_settingBtn/_confirmTestBtn` 绑定）、`:229`；`docs/确认弹窗与原包界面对齐.md:38`（"`build-app-ui.py` 可重建六个 Prefab，但会覆盖手动编辑，后续日常调整优先使用 Cocos 编辑器"）。
- **修复建议**：在 §11 任务 3/4 写一句"优先用 Cocos 编辑器改 `MainWin.prefab`；若必须重跑 `build-app-ui.py`，需同步给脚本补红点节点，否则手工改动会丢失"。另外可顺手给出"改动后 4 个按钮仍在"的核对点（`MainWin.prefab:2765-2776` 的 4 个引用键）。

### 建议-7｜§11 验收部分缺少既有文档的"验证方式 + 边界"写法

- **文档位置**：§11 第 577-660 行
- **问题**：既有两份文档都在末尾有 `## 验证` 段落：给出**可执行的命令**、覆盖了什么、以及"不替代什么"。红点文档的"完成标准/整体验收清单"只有可勾选项，没写跑哪些命令、不覆盖什么（例如"Node 单测不验证节点显隐，需编辑器/浏览器验证"）。
- **证据**：`docs/本地设置存储.md:23-27`（`npm run test:save` + 编辑器手工验证 + "不替代 Cocos 实机验证"）；`docs/确认弹窗与原包界面对齐.md:40-46`（4 条命令 + 类型检查 + 浏览器预览 + 明确"未据此宣称整个第三方插件类型检查通过"）；对照文档第 592、610、622-627 行，只有零散命令与勾选项。
- **修复建议**：§11 末尾补 `## 验证`：`npm run lint`、`npm run test:reddot`、`npx tsc -p tools/uitest/tsconfig.json`（若按重要-1 补桩）、编辑器/浏览器四项手工验证，并写明"单测不替代 prefab 显隐与点击穿透验证"。

---

## 四、已核对与文档一致（无问题，避免误改）

| # | 文档位置 | 结论 | 证据 |
| --- | --- | --- | --- |
| 1 | §5.2 第 222-243 行 静态门面 `RedDot` | 与项目既有静态门面风格一致，可行 | `assets/Scripts/Model/App/AppEntry.ts:30-32`（`Sound.Configure` / `SettingsService.Initialize` 都是静态门面）、`assets/Scripts/Frame/Log/Log.ts:8-30`（`Log.info` 静态）、`MainWin.ts:35`（另有 `UIManager.instance` 单例风格，二者并存） |
| 2 | §5.2 第 249-251 行 `RedDotEvent = { changed: new EventKey(...) }` 命名 | **不需要改成全大写**，现有约定就是"单数常量名 + 小写成员" | `assets/Scripts/Frame/UI/UIEvents.ts:22-25`（`export const UIEvent = { open, close }`）；`eslint.config.mjs:32-69` 的命名规则只约束 variable/parameter/classProperty，不约束对象成员，也不约束模块级 const |
| 3 | §5.2 第 254 行"`Initialize` 在 `AppEntry.start` 里、`UIManager.init` 之前" | 顺序**可行**（落点问题见重要-6） | `AppEntry.ts:31` → `:44-53`，中间无依赖 |
| 4 | §5.4 第 345 行"`BaseCmp` 在 `onDisable` 里统一退订" | 属实 | `assets/Scripts/Frame/UI/Base/BaseCmp.ts:50-52` |
| 5 | §5.4 第 287、301-315 行"私有 `BindingScope` + `onLoad` 订阅 / `onDestroy` 退订" | 项目内有同型先例，模式可行（但见阻断-1、建议-5） | `assets/Scripts/Frame/UI/FitScaleBox.ts:112`（`private readonly _binder = new BindingScope()`）、`:161-164`（`onDestroy` 兜底 `unbindAll`）；`assets/Scripts/Frame/UI/BindingScopeSignals.ts:39-42` 注释即此写法 |
| 6 | §4 第 131 行 `Model/App/RedDot/AppRedDotTree.ts` 放 Model | 符合 `Model/App` 现有子目录习惯（`Save/`、`UI/`），Model 层无 `index.ts` 约定 | `assets/Scripts/Model/FolderDesc.md:1`；`assets/Scripts/Model/App/Save/*.ts`、`Model/App/UI/*.ts`（glob，均无 index.ts） |
| 7 | §4/§8 依赖方向 Model → Frame | 方向正确；Frame 层确实不反向依赖 Model/Core/Utils | `MainWin.ts:2-4`、`AppEntry.ts:2-6`（Model 引 Frame）；全仓 `Frame/**` 内无 `from '../../Model'`/`Core`/`Utils` 的导入（grep 无匹配） |
| 8 | §4 第 129 行 `RedDotBadge` 依赖 `Frame/UI/BindingScope` | 同包内跨模块依赖可接受，有先例 | `assets/Scripts/Frame/FolderDesc.md:1`（只禁跨"包"，Frame 是一个包）；`assets/Scripts/Frame/Audio/SoundManager.ts:3`（`from "../Log"`，Frame 内跨模块走 index）；`Frame/UI/BindingScope.ts:1`（UI → Log） |
| 9 | §8 第 511-517 行三个入口 | prefab 与按钮**真实存在**，且按钮点击是代码绑定，加子节点不需重绑事件 | `assets/resources/ui/app/MainWin.prefab`：`TeamButton`(:1014)、`StageButton`(:1394)、`SettingButton`(:1774)、`ConfirmTestButton`(:2373)；`cc.Button.clickEvents` 为空数组(:1162-1173)；4 个引用键(:2765-2776) |
| 10 | §8 第 476-481 行 `as const` 对象含函数成员 `stageOf` | TS 合法，项目配置下无问题 | `tsconfig.json:6-9`（`moduleResolution: bundler`、`strict: false`）；`eslint.config.mjs:32-69` 不检查对象成员命名；同构写法可参考 `UIEvents.ts:22-25` |
| 11 | §11 第 579 行"任务由你实现，我只做设计、讲解和代码审查" | 与项目协作约定**完全一致** | `README.md:10`（"用户负责实现，助手负责拆任务与指导"）；`docs/项目总纲.md:12`、`:172`（"阶段内任务由助手拆分，用户实现…不预先替用户铺设实现代码"） |
| 12 | §11 第 588 行 `package.json` 增 `test:reddot`、第 592 行 `npm run test:reddot` | 命名与命令风格一致（用 npm，仓库有 `package-lock.json`） | `package.json:13-19`（`test:log`/`test:save`/`test:confirm`）；`package-lock.json` 存在（npm 而非 pnpm）；文档第 591-594 行的"不 import cc"标准见重要-7 |

---

## 五、给设计稿的修改清单（按优先级）

1. §5.2 重写门面生命周期：dispatcher 单例不重建、`Initialize` 幂等、`Dispose` 不清 dispatcher、懒初始化只重连转发；同步修正 §11 任务 2 第 611 行的验收措辞（阻断-1）。
2. §11 任务 1 补完整的 `tools/reddottest/tsconfig.json` 参数、显式文件清单、产物路径、`package.json` 脚本、`.gitignore`/eslint ignores 登记（阻断-2、重要-7）。
3. §11 任务 3 补 "`cc-stub` 补 `Label`/`Sprite`" 或 "uitest exclude" 的前置项（重要-1）。
4. §5.2 补 `OnChanged` 的包装实现要点与 `off` 单次匹配注意（重要-2）；§4 第 127 行改措辞（建议-2）。
5. §8 补 import 头、标注"合入既有方法"，并把演示种子从 `onOpen` 移到启动注册（重要-3、重要-4、建议-4）。
6. §4 第 130 行明确 `index.ts` 不导出 `RedDotBadge`（重要-5、阻断-2 的测试入口）。
7. §6.1 换成"文件:行号落点表"，含 `onDestroy` 顺序与幂等要求（重要-6）。
8. §7/§12 补占位图前置项与 `build-app-ui.py` 覆盖警告（建议-3、建议-6）；§11 补 `## 验证`（建议-7）；§5.1/§5.2 标注"签名示意"（建议-1）。

---

*评审范围仅限工程接线/门面/测试工程一致性；Store 内部算法、格式化规则、UI 视觉细节不在本报告结论内。*
