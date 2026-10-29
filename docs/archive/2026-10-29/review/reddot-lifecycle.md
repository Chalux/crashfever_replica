# 红点文档评审：视图生命周期与组件实现核查

- 评审对象：`docs/红点系统设计.md`（667 行，设计稿 v2）
- 评审范围（task-1）：§5.4 视图组件、§6 数据流与时序（第 3 步）、§7 UI 结构与 Cocos 设置、§10 边界与常见坑中与「组件生命周期 / 订阅 / 显隐 / 缓存重开」相关的条目
- 对照基准（唯一事实来源）：`assets/Scripts/Frame/UI/**`（BaseCmp / BaseUI / BaseWin / BaseMask / BindingScope / BindingScopeSignals / UIManager / UIVo / UIVoRegistry / UIRuntimeData / UILayer / UILayerManager / States/*）、`assets/Scripts/Frame/Event/EventDispatcher.ts`、`assets/Scripts/Model/App/AppEntry.ts`、`assets/Scripts/Model/App/UI/MainWin.ts`、`assets/resources/ui/app/MainWin.prefab`、`tools/uitest/cc-stub.ts`、`tools/original-assets/build-app-ui.py`
- 评审方法：逐行静态对照（文档断言 → 框架代码行为 → 行号证据）。
  **本环境的 pwsh 因工作区 ACL 故障不可用（`SetNamedSecurityInfoW failed (Win32 5)`），未执行 `tsc` / 编辑器预览 / 真机验证**；凡依赖引擎运行表现的结论均标注「需实测」，不作为阻断依据。
- 统计：**阻断 1 条、重要 4 条、建议 6 条**；另有 **17 组已核对与文档一致** 的断言（见第四节，避免误改），以及 7 条「需实测」清单（第五节）。
- 重叠说明：`docs/review/reddot-integration.md` 已覆盖「门面/接线/测试工程」角度；本报告对重叠点（resetBindings、缺 import、演示数据放 onOpen 等）只补充**生命周期视角**的证据，不重复展开。

---

## 零、任务提出的五个问题：直接回答

| # | 问题 | 结论 | 关键证据 |
| --- | --- | --- | --- |
| 1 | 「BaseCmp 在 onDisable 里统一退订」是否准确？ | **属实**，但只对 BaseCmp 自己成立；BaseWin/BaseMask 是「每次 Open 前 resetBindings + onDestroy 退订」，三套语义不同 | `BaseCmp.ts:32-34、50-52`；`BaseUI.ts:44-52、63-75`；`UIOpenStateHandler.ts:67-68` |
| 2 | 「订阅放 onLoad、退订放 onDestroy、onEnable 补刷新」是否成立？ | **分对象**：对窗口/遮罩自身（BaseWin/BaseMask 子类）**不成立**（Open 阶段 `resetBindings` 会清掉 onLoad 订阅且永不重登记）；对 BaseCmp **不成立**（框架不 reset 子组件，清账来自它自己的 `onDisable→unbindAll`，自隐藏/隐藏窗口/摘树都会触发，且 onLoad 不再重跑）；只对「不继承 BaseUI 的普通 Component」**有条件成立**（私有 binder 不归框架管），且存在阻断-1 的丢失路径 | `README.md:144-150`；`BaseWin.ts:113-116、174-180`；`BaseCmp.ts:32-34、43-48、50-52`；`BaseUI.ts:44-52`；`UIOpenStateHandler.ts:61-68` |
| 3 | 缓存窗口重开（不销毁）时 badge 的订阅会不会翻倍/丢失？ | **不会翻倍**：`onLoad` 每个节点实例只执行一次，缓存重开复用同一节点，框架的 `resetBindings` 只作用于窗口与遮罩、不会碰 badge 的私有 binder；**会丢失**：①节点销毁（默认缓存 30s 到期 → Destroy → `node.destroy()` → onDestroy 退订，再次打开是全新实例，仍只登记一次）②阻断-1 的「首次激活前被 setter 隐藏」 | `UILoadStateHandler.ts:22-31`（缓存复用不重新实例化）、`UIVoRegistry.ts:47-58`（复用同一 VO）、`UIOpenStateHandler.ts:67-68`（只 reset win/mask）、`UIOpenOpt.ts:50`（默认 30000ms）、`UIVoRegistry.ts:106-117`、`UIDestroyStateHandler.ts:46-47` |
| 4 | 「红点节点 prefab 默认 active=true」与 UIManager 实际实例化/激活时机是否一致？ | **基本一致但不充分**：`instantiate` 发生在 Load 且**不等同于激活**（此时 onLoad 不执行），真正挂树在 Create（`addToNode`），所以「prefab 默认 active」只保证首次挂树时会触发 onLoad；文档漏掉的不变量是「首次挂树前没有任何代码把 badge 自身 active 置 false」——文档自己的 setter 就能违反它 | `UILoadStateHandler.ts:73`；`UICreateStateHandler.ts:23-25`；文档 293-297、299-306、347 |
| 5 | §6 第 3 步「MainWin 打开，各红点组件 onLoad 订阅，onEnable 立即按当前计数显隐」是否与实际流程一致？ | **顺序描述不精确**：onLoad/onEnable 发生在 **Create 挂树时**，早于窗口的 `initEvent`/`onOpen`（所以「MainWin 打开」这一步内部其实是 Create→Open 两拍）；而 onLoad 与 onOpen 的先后还取决于引擎是否同步激活（**需实测**）。即便引擎延迟激活，onEnable 快照也能兜住状态，但这也说明「onOpen 里的 Set 一定被订阅收到」不是文档可以依赖的事实 | `UICreateStateHandler.ts:23-25、30`；`UIOpenStateHandler.ts:67-77`；`UILoadStateHandler.ts:22-31`；文档 379、495-502 |

---

## 一、阻断（按文档字面实现会出现永久静默失效）

### 阻断-1｜「单节点自显隐 + onLoad 订阅」在首次激活前被 setter 隐藏时永久丢失订阅

- **文档位置**：§5.4 第 289-297 行（`set redDotId` → `_refresh`）、第 299-306 行（订阅放 onLoad）、第 337-339 行（`_setVisible` 直接写 `node.active`）、第 347 行（只把「prefab 默认 active」当成唯一前提）；§3.6 第 119 行（`数据项创建 → Register → 设置组件 redDotId`）；§8 第 526-527 行（`列表项实例化后 badge.redDotId = id`）；§10 第 562、627 行
- **问题**：文档把「订阅时机」绑在 `onLoad` 上，而 `onLoad` 只在节点**首次进入激活状态**时执行；同一份示例代码又把「显隐开关」也绑在同一个节点的 `active` 上，并且 `redDotId` 的 setter 会立刻 `_refresh()`。于是下面这条最自然的接入写法会永久失效：

  1. 列表项 `instantiate` 后、挂到激活节点之前执行 `badge.redDotId = id`（§3.6 第 119 行与 §8 第 527 行推荐的「创建后立即赋值」顺序）；
  2. 该数据项初始未领取数为 0（红点系统的常态：先无红点，之后才变亮），`_refresh()` 走到 `_setVisible(false)` → `this.node.active = false`；
  3. 之后才 `addChild` 到激活的窗口/列表 → 因为节点自身 `active === false`，**`onLoad` 永不执行** → 订阅从未登记；
  4. 之后计数从 0 变为正数时没有任何监听者，`_refresh` 不会被调用，红点**永久不出现**，且控制台无任何报错。

  这不是 Cocos 冷知识，而是本项目已经专门规避过的坑：`BaseCmp` 的注释明确写了「订阅不能挂在只触发一次的钩子上，否则缓存复用/重新挂载后订阅永久丢失」，因此它选了 `onEnable`（`BaseCmp.ts:10-15、32-34`）；`FitScaleBox` 作为「普通 Component + 私有 BindingScope」的既有先例，也是 `onEnable` 里**先 `unbindAll()` 再订阅**、`onDisable` 退订、`onDestroy` 兜底（`FitScaleBox.ts:111-112、143-145、157-164`），注释直接点名「防止 onDisable 因节点未激活等原因没有执行时重复订阅」——项目对「订阅时机 ≠ 激活时机」的风险是有明确认识的。文档只把 `prefab 默认 active=true` 写成硬性要求（第 347、466、562、627、666 行），完全没有覆盖「运行时在首次激活前把 active 置 false」这条路径，而这条路径正是文档自己的 setter 制造的。

- **证据**：
  - 文档自身：`红点系统设计.md:293-297`（setter 立刻 `_refresh`）、`:337-339`（`_setVisible` 写 `node.active`）、`:347`（「初始 inactive，onLoad 不会执行，组件不会订阅」——文档已承认机制，只是没意识到自己的 setter 会触发它）、`:119`、`:526-527`；
  - `assets/Scripts/Frame/UI/Base/BaseCmp.ts:10-15`（订阅不能挂只触发一次的钩子，选 onEnable 的理由）、`:32-34`（onEnable → initEvent）、`:50-52`（onDisable → unbindAll）；
  - `assets/Scripts/Frame/UI/FitScaleBox.ts:143-145`（onEnable 内先清账再订阅）、`:157-164`（onDisable/onDestroy 双退订）——项目对同类风险的标准解法；
  - `assets/Scripts/Model/App/UI/ButtonSound.ts:10-16`（普通 Component 的 onLoad/onDestroy 先例，但它的宿主按钮永远 active，不会自我隐藏）；
  - `assets/Scripts/Frame/UI/States/UILoadStateHandler.ts:73`（`instantiate` 在 Load，此时未挂树）、`UICreateStateHandler.ts:23-25`（挂树在 Create）——证明「实例化 ≠ 激活」，`onLoad` 与「设置 redDotId」的先后完全由业务代码顺序决定，文档没有任何约束。

- **修复建议（文档层，二选一，推荐 A）**：
  - **A（改为文档第 348 行自己提的「常驻节点 + Visual 子节点」并作为主方案）**：`RedDotBadge` 挂在**始终 active** 的宿主节点上，显隐只切一个 `Visual` 子节点（`_visual.active = visible`），组件节点本身永不被隐藏。这样 `onLoad`/`onEnable` 时机完全可控，阻断-1 与重要-1 一并消失；用 `BaseCmp` 实现时，订阅写 `initEvent()`（由 BaseCmp 自己的 `onEnable` 调用，`BaseCmp.ts:32-34`），并在 `onEnable` 里 `super.onEnable()` 之后补一次 `_refresh()`（BaseCmp 的 onEnable 只做订阅，不做刷新，`BaseCmp.ts:26-34`）。文档第 348 行只写了一句话，应补成可直接照抄的骨架。
  - **B（保留单节点方案）**：必须补三条硬约束并改代码示例：①`_setVisible` 增加 `_loaded` 守卫，`onLoad` 之前只记录目标状态、不改 `node.active`，在 `onLoad` 末尾补一次 `_refresh()`；②`onLoad` 里若发现 `this.node.active === false`（说明已被前置逻辑隐藏）要主动纠正/记 `Log.error`；③在 §8 明确「列表项必须**先挂树、后设 `redDotId`**」。
  - 另外建议在 §11 任务 3 验收里增加「列表项初始 0 → 后变 2，红点能出现」这条用例（现有第 622、641 行只验证「手动 Set 后出现」，覆盖不到本阻断）。
- **严重度说明（保持诚实）**：本条的成立前提是「首次激活前节点自身 `active` 已被置 false」。若实现时保证「先 `addChild` 到激活树、后再设 `redDotId`」，则降为**重要**；但文档 §3.6 第 119 行与 §8 第 526-527 行的写法并未约束该顺序，且「初始计数 0 的列表项」正是红点最常见的起点，故按阻断处理。「prefab 初始 inactive → onLoad 不执行」这一引擎行为由文档自己声明（第 347 行），精确表现列入第五节需实测。

---

## 二、重要（不改会返工或被误导）

### 重要-1｜§10 第 15 条「界面隐藏期间的事件会丢」与 §5.4 的机制互相矛盾，且 `onEnable 补刷新` 无法唤醒「自己隐藏自己」的节点

- **文档位置**：§5.4 第 308-311 行（onEnable 补刷新）、第 337-339 行（自隐藏）；§10 第 563 行（坑 7）、第 571 行（坑 15）
- **问题**：坑 15 写「红点只在数据变化时推送；界面隐藏期间的事件会丢，所以重新激活时必须从当前状态重建」。这句话对**在 onDisable 里退订的组件**（BaseCmp）成立，但对本文档自己的 `RedDotBadge` **不成立**：badge 只在 `onDestroy` 退订，`hideBelow` 隐藏窗口只是把根节点 `active=false`，订阅仍然活着，事件照常送达 `_refresh`。更关键的是反向推论：如果「隐藏期间事件真的会丢」，那么「badge 先把自己隐藏 → 缓存重开/窗口恢复时 onEnable 再补刷新」这条路**走不通**——节点自身 `active===false` 时，祖先恢复激活不会触发它的 `onEnable`，恢复只能依赖「隐藏期间仍收到了事件并把 active 置回 true」。文档一边说事件会丢、一边把 onEnable 当兜底，逻辑上自相矛盾；实现者若按坑 15 的字面意思再加一层「onEnable 里重订阅」的兜底，反而可能造成**重复订阅**（`BindingScope.add` 不去重，`BindingScope.ts:21-24`）。

- **证据**：
  - `assets/Scripts/Frame/UI/UIRuntimeData.ts:116-134`（`hideBelow` 只改 `ui.node.active`，并回调 `invokeLayerVisibleUpdate`，**不碰订阅**）；
  - `assets/Scripts/Frame/UI/UILayer.ts:55-57`（层隐藏同样只是 `node.active`）；
  - `assets/Scripts/Frame/UI/Base/BaseCmp.ts:43-48`（「代价是隐藏期间收不到事件」——这句话的主语是**在 onDisable 退订的 BaseCmp**，文档把结论外推到了不适用它的 badge 上）；
  - 文档 `:308-311`、`:337-339`、`:345`、`:563`、`:571` 对比可复现矛盾。

- **修复建议**：把坑 15 改写成按对象区分的两句话：「BaseCmp 系组件在 onDisable 退订，隐藏期间事件会丢，所以重新激活时由 `initEvent` + 一次快照刷新重建；`RedDotBadge` 的订阅在 onLoad→onDestroy 区间内始终有效，隐藏/缓存重开期间事件不会丢。但 `onEnable` 只在节点本身被激活时触发，**不能作为自隐藏节点的恢复路径**——恢复靠保留的订阅。」并明确「不要在 onEnable 里补订阅，否则会翻倍」。

### 重要-2｜文档没写清「普通 Component 的私有 binder 由自己负责、框架不管」这个前提，也没写它的另一半代价

- **文档位置**：§5.4 第 343-348 行；§10 第 563 行
- **问题**：文档给了两条路（普通 Component 自管订阅 / 常驻节点 + Visual 子节点沿用 BaseCmp），但只写了「BaseCmp 在 onDisable 退订」一条理由，没有写清三种组件在本框架里的订阅生命周期差异，也没写「为什么这个 badge 可以放 onLoad」的前提与代价。

  **前提**：`RedDotBadge` 不继承 `BaseUI`，框架的 `resetBindings()` 只对**窗口与遮罩实例自身**调用，而且不会递归到子节点里的组件——`UIOpenStateHandler.ts:61-68` 是逐实例调 `mask.invokeResetBindings()/invokeInitEvent()` 与 `win.invokeResetBindings()/invokeInitEvent()`，`BaseUI.resetBindings()` 也只清 `this.binder`（`BaseUI.ts:44-52`）。所以 badge 的私有 `BindingScope`「不归框架管」，`onLoad` 登记的订阅才不会被 Open 阶段清掉。

  **另一半代价（文档完全没写）**：既然框架不替它清账，badge 就**必须自己保证 onDestroy 退订**，不能依赖框架的 `resetBindings`/生命周期兜底；一旦漏掉，订阅会一直挂在 `EventDispatcher` 上，节点销毁后仍会被回调（EventDispatcher 只按 handler 身份删除，`EventDispatcher.ts:43-50`）。另外它也拿不到 `BaseUI.onDestroy` 那条「先离场清理再退订」的顺序保证（`BaseUI.ts:63-75`）。

  **若按第 348 行改继承 BaseCmp（误踩路径）**：BaseCmp 的真实约束是 `onEnable → initEvent` / `onDisable → binder.unbindAll()`（`BaseCmp.ts:32-34、50-52`），**不是**框架 resetBindings。照抄 §5.4 把订阅写在 `onLoad`，会在**第一次 onDisable** 就被 `unbindAll()` 清掉，而 `onLoad` 不会重跑 → 不会重登记，永久失聪。触发 onDisable 的路径不止「badge 自己隐藏」：层级 `hideBelow` 隐藏窗口、缓存关闭时 `removeFromNode()` 摘节点都会触发（`UIRuntimeData.ts:140-148`、`UICloseDoneStateHandler.ts:27`）。正确写法是订阅放 `initEvent()`（由 BaseCmp 的 `onEnable` 调用）并让宿主节点常驻（方案 A 的 Visual 子节点）。

  **若把红点逻辑写进窗口/遮罩类本身（BaseWin/BaseMask 子类）**：框架每次 Open 会先 `win.invokeResetBindings()`（`UIOpenStateHandler.ts:67-68`），`onLoad` 订阅被清、`onLoad` 不再执行 → 永久失聪（这正是 README 第 149-150 行警告的那条）。

  需要纠正一个容易写错的因果：**「改成 BaseCmp 后框架会在 Open 前 resetBindings 清掉它的 onLoad 订阅」这个说法不成立**——框架只 reset win/mask 自身；真正清账的是 BaseCmp 自己的 `onDisable`。文档应把这两条路径分开写，避免实现者用错防御手段。

- **证据**：
  - `assets/Scripts/Frame/UI/States/UIOpenStateHandler.ts:61-68`（只对 `mask` 与 `win` 实例调 resetBindings/initEvent，无递归）、`:13-15`（注释：必须先 reset 再 initEvent，否则重复打开会叠加）；
  - `assets/Scripts/Frame/UI/Base/BaseUI.ts:21`（`binder` 字段）、`:44-52`（`resetBindings` 只清 `this.binder`）、`:63-75`（onDestroy 才兜底退订、且顺序固定）；
  - `assets/Scripts/Frame/UI/Base/BaseCmp.ts:32-34`（onEnable → initEvent）、`:43-48`（注释：在 onDisable 退订后隐藏期间收不到事件）、`:50-52`（onDisable → `binder.unbindAll()`）；
  - `assets/Scripts/Frame/UI/UIRuntimeData.ts:140-148`（缓存/销毁时 `removeFromNode()` → `removeFromParent()`，会触发 onDisable）、`States/UICloseDoneStateHandler.ts:27`（关闭完成即离树）；
  - `assets/Scripts/Frame/UI/README.md:121`（Open：`resetBindings → initEvent → onOpen`）、`:138-142`（缓存重开重走 resetBindings + initEvent）、`:144-150`（订阅统一放 initEvent）；
  - `assets/Scripts/Frame/Event/EventDispatcher.ts:43-50`（`off` 按 handler 身份删除，只删第一个匹配）；
  - `assets/Scripts/Frame/UI/BindingScope.ts:6-7`（项目约定：界面里所有订阅必须经 BindingScope 登记）；
  - `assets/Scripts/Frame/UI/BindingScopeSignals.ts:39-42`（文档注释给出的「`_binder` + onDisable/onDestroy 退订」写法）；
  - `assets/Scripts/Frame/UI/FitScaleBox.ts:143-164`（项目内「普通 Component + 私有 binder」的完整标准写法：onEnable 先 unbind 再订阅、onDisable 退订、onDestroy 兜底）。

- **修复建议**：在 §5.4 增补一段「方案选择表」，逐项写清：①`RedDotBadge` 是 `Component` 而非 `BaseUI`，私有 binder **不受**框架 `resetBindings` 管理——这是 onLoad 订阅能成立的前提，代价是它必须自己保证 onDestroy 退订、不能依赖框架兜底；②若写进 `BaseWin/BaseMask`，订阅**必须**写 `initEvent()`（框架每次 Open 前 reset），并把「onLoad 订阅」标成禁用写法；③若改 `BaseCmp`，订阅也写 `initEvent()`（BaseCmp.onEnable 调）、宿主节点不得自我隐藏（否则第一次 onDisable 就退订且不再重登记）；④按 `FitScaleBox.ts:143-145` 的「onEnable 先 `unbindAll()` 再订阅」作为防重复模板；⑤把第 348 行的一句话替代方案补全成 `initEvent` + `onEnable(super + refresh)` + `Visual` 子节点的完整骨架。

### 重要-3｜§6 第 3 步把「Create 挂树」合并进了「MainWin 打开」，时序表述不精确，且掩盖了「订阅是否先于 onOpen 的 Set」这一不确定点

- **文档位置**：§6 第 375-385 行（第 3 步在第 379 行）；配合 §8 第 495-502 行（计数写在 `MainWin.onOpen`）
- **问题**：实际流程是 `Load(instantiate) → PreLoad → Create(addToNode + invokeCreate) → Open(resetBindings/initEvent → onOpen → 动画)`，红点组件的 `onLoad/onEnable` 发生在 **Create 的挂树**那一刻，早于窗口自己的 `initEvent/onOpen`；文档把它们笼统写成「MainWin 打开」这一步，读者无法判断「onLoad 订阅」与「onOpen 里 `RedDot.Set`」的先后。而这两者的先后恰恰是不确定的：`instantiate` 不触发 onLoad，onLoad 发生在 `addChild` 时，引擎在激活过程中是同步还是延迟触发组件回调**需实测**。若延迟，§8 把种子计数写在 `onOpen` 里时，badge 的 onLoad 还没订阅，这一批 Set 会漏——最终靠 onEnable 快照才对上，而不是文档暗示的「订阅已就绪所以能收到」。这又与坑 15 的「事件会丢」说法打架（见重要-1）。

- **证据**：
  - `assets/Scripts/Frame/UI/States/UILoadStateHandler.ts:22-31`（缓存复用：addToNode → 直接 PreLoad）、`:73`（首次 `instantiate`）、`:96-97`（转 PreLoad）；
  - `assets/Scripts/Frame/UI/States/UIPreLoadStateHandler.ts:65-74`（PreLoad done 后转 Create/Open）；
  - `assets/Scripts/Frame/UI/States/UICreateStateHandler.ts:23-25`（`addToNode` → `invokeCreate`）、`:30`（转 Open）；
  - `assets/Scripts/Frame/UI/States/UIOpenStateHandler.ts:67-68`（resetBindings/initEvent）、`:77`（`win.invokeOpen()` → `onOpen`）、`:50-52`（兜底挂载）；
  - `assets/Scripts/Model/App/UI/MainWin.ts:22-24、30-42`（现有 onOpen/initEvent 结构，演示数据将写进 onOpen）。

- **修复建议**：把第 3 步拆成两拍并标注时序：「Create 阶段：窗口挂树，子节点 onLoad 订阅、onEnable 快照（此时 `onOpen` 尚未执行）；Open 阶段：窗口 `initEvent` → `onOpen`（演示 Set 在此）→ 动画」。同时注明「onLoad 与 onOpen 的先后取决于引擎激活时机（**需实测**）；由于 onEnable 会补一次快照，状态最终正确，但不要把『onOpen 的 Set 一定被订阅收到』当成设计前提」；种子数据位置问题另见 `docs/review/reddot-integration.md` 建议-4。

### 重要-4｜在 `onEnable` 里把自身 `active` 置 false 是项目内没有先例的写法，文档把未验证的行为当成设计结论

- **文档位置**：§5.4 第 308-311 行（onEnable → `_refresh`）、第 337-339 行（`_setVisible` 在 onEnable 同步路径里写 `node.active`）；§11 第 627 行（验收项依赖该行为）
- **问题**：首次激活时 `onLoad` → `onEnable`，`onEnable` 里 `_refresh` 直接把自己 `node.active=false`，等于在引擎的激活回调内部改激活状态。Cocos 3.8 对这种重入的处理（是否重复回调 onDisable/onEnable、是否有告警、Widget 是否会在下一帧才对齐出现一帧跳位）**需要实测**。项目现有代码里没有任何「在 onEnable 内改自身 active」的先例：`FitScaleBox.onEnable` 只做布局与订阅（`FitScaleBox.ts:143-155`），`BaseCmp.onEnable` 只订阅（`BaseCmp.ts:32-34`），`BaseMask/BaseWin` 的显隐统一由 `UIRuntimeData.updateVisible()` 在状态机里做（`UIRuntimeData.ts:116-134`）。文档没有标注这一不确定点，也没给替代（常驻节点 + Visual 子节点天然规避）。

- **证据**：`BaseCmp.ts:32-34`、`FitScaleBox.ts:143-155`、`UIRuntimeData.ts:116-134`（项目内显隐写入点都在状态机/显式的 updateVisible 中，不在 onEnable 内）；`Frame/UI/README.md:132-133`（「页面不要在业务里手动 `active`」——badge 是刻意的例外，文档应声明这一点）。

- **修复建议**：在 §5.4 顶部加「需实测」标注：①onEnable 内切自身 active 的回调顺序与告警；②Widget 对齐是否导致首次显示跳一帧（若存在，推荐 A 方案的 Visual 子节点写法，因为宿主节点始终激活、Widget 只挂在 Visual 上）。同时补一句「badge 自行写 `node.active` 是对 README『业务不要手动改 active』的受控例外，理由是它只隐藏视觉节点、且不参与层级可见性计算」。

---

## 三、建议（能跑但会留隐患 / 与仓库既有风格不一致）

### 建议-1｜§5.4 示例缺全部 import，`formatRedDotCount` 的引用路径与模块位置没有写

- **文档位置**：§5.4 第 272-341 行（整段示例）；§5.3 第 256-266 行、§4 第 126 行（`RedDotFormat.ts`）
- **问题**：示例块里 `@ccclass`/`Component`/`Label`/`RedDot`/`BindingScope`/`formatRedDotCount` 六个标识符全部没有 import。按文档照抄会得到成串 `TS2304/TS2307`。其中 `formatRedDotCount` 定义在 `assets/Scripts/Frame/RedDot/RedDotFormat.ts`（文档第 126、266 行），badge 同目录应写 `import { formatRedDotCount } from './RedDotFormat';`；`BindingScope` 有现成出口 `assets/Scripts/Frame/UI/index.ts:34`（或深路径 `../UI/BindingScope`），文档也没写。
- **证据**：`assets/Scripts/Frame/UI/index.ts:34`（`export { BindingScope }`）、`assets/Scripts/Frame/UI/BindingScopeSignals.ts:39-42`（标准用法示例带 `_binder` 初始化）；`assets/Scripts/Model/App/UI/BaseDlgFrame.ts:1-4`（同包业务组件的完整 import 头写法）。
- **修复建议**：给 §5.4 补完整文件头，并写明 `formatRedDotCount` 与 `RedDot` 的模块位置；或在 §11 任务 3 的文件清单里固定 import 路径。

### 建议-2｜`@property({ tooltip }) private _redDotId = ''` 合法，但序列化会绕过 setter，其行为文档未说明

- **文档位置**：§5.4 第 275-276、289-297 行
- **问题**：仓库已有「`@property({ min, tooltip })` 装饰私有字段」的先例，写法本身没问题（`BaseDlgFrame.ts:54-59`）。但 `_redDotId` 是序列化字段、`redDotId` 是访问器，Cocos 反序列化时直接写 `_redDotId`，**不会走 setter**，所以「在编辑器里改值」或「prefab 覆盖值」都不会触发 `_refresh()`，只能等 onEnable/事件。文档把它当成 setter 驱动的设计，容易让实现者以为改 id 会立即生效。
- **证据**：`assets/Scripts/Model/App/UI/BaseDlgFrame.ts:27-59`（仓库内的 `@property` 字段都是私有字段**直接读取**，没有「`@property` 字段 + 同名访问器」的先例，例如 `_closeBtn` 在 `:122` 直接使用）；`assets/Scripts/Frame/UI/Base/BaseWin.ts:113-116`（框架的「每次打开重建」语义与之无关，仅说明生命周期刷新点）。「反序列化是否走 setter」属引擎行为，需在编辑器里实测确认（见第五节）。
- **修复建议**：注明「prefab/编辑器改 `_redDotId` 不会立刻刷新，需要等一次 onEnable 或事件；运行时改 id 请走 `redDotId` setter」；另外按仓库风格补 `visible: true`（BaseDlgFrame 的 @property 均带 `visible: true`）。

### 建议-3｜§7 的 Widget.AlignMode 建议与仓库现有做法不一致，且没写全对齐所需开关

- **文档位置**：§7 第 460-461 行
- **问题**：文档建议「固定按钮用 `ON_WINDOW_RESIZE`；列表项/动态布局用 `ALWAYS`」。仓库目前**所有 Widget 都是 ALWAYS**：框架层建层节点/全屏根节点显式设 `ALWAYS`（`UILayerManager.ts:155-165`、`UIManager.ts:583-604`），prefab 里手工对齐的 Widget 序列化值也都是 2（`SettingDlg.prefab:282/577/751`、`ConfirmDlg.prefab:282/577/751`、`BaseDlgFrame.prefab:376/550`；按仓库自建 cc 桩 `tools/uitest/cc-stub.ts:68` 的枚举映射 `ALWAYS=2`，与显式设置一致）。而 `ON_WINDOW_RESIZE` 只在**窗口尺寸变化**时重算，不跟随父按钮的 Layout/动画改尺寸，比 ALWAYS 更容易角标错位。另外文档只写了「对齐父节点右上，`top=-4`、`right=-4`」，没写需要 `isAlignTop/isAlignRight = true` 才生效。
- **证据**：`UILayerManager.ts:155-165`、`UIManager.ts:601`、`SettingDlg.prefab:282` 等（ALWAYS 用法）；`tools/uitest/cc-stub.ts:67-79`（枚举值与默认值 `ON_WINDOW_RESIZE`）；负值方向本身**正确**：`tools/original-assets/build-app-ui.py:134`（标题条 `_top=30` 为正 = 从父顶向内偏 30），故 `top=-4/right=-4` 确实向外压出边缘；`cc-stub.ts:78` 的 `alignMode` 默认值也说明「不写就是 ON_WINDOW_RESIZE」。
- **修复建议**：统一写成「角标一律 `ALWAYS`（与仓库既有 Widget 一致，成本可忽略）；`ON_WINDOW_RESIZE` 只适合 Canvas 级全屏节点」，并补 `isAlignTop/isAlignRight` 与负值方向说明。

### 建议-4｜§7「`Label.Overflow.SHRINK` + 固定宽度保证 99+」在仓库无先例，需实测

- **文档位置**：§7 第 462 行、§10 第 567 行
- **问题**：仓库现有 Label 的 `_overflow` 全是 1（按 Cocos `Label.Overflow` 枚举 = CLAMP）或 3（RESIZE_HEIGHT），**没有任何 SHRINK（2）**（`MainWin.prefab:526/819/977/1357/1737/2336/2716`、`ConfirmDlg.prefab:2756` 等）。SHRINK 会在 40×28 的角标里把 20 号字压到很小，三字符 `99+` 的可读性无法靠静态代码判断。
- **证据**：`MainWin.prefab:526` 等 `_overflow: 1`；`ConfirmDlg.prefab:2756` `_overflow: 3`；`tools/original-assets/build-app-ui.py:95-98`（生成脚本固定 `_overflow=1`，说明现有 UI 一律 CLAMP）。
- **修复建议**：标注「需实测」；给出备选（`99+` 用 `RESIZE_HEIGHT` + 足够宽的底图，或 `_maxCount=9` 之类短文本策略），并要求在 §11 验收里加一条「120 → `99+` 不出框、不糊」的真机检查。

### 建议-5｜§7 推荐的挂点没有避开 MainWin 已有的 Mask 裁剪容器

- **文档位置**：§7 第 452-456、464 行
- **问题**：文档只要求「放在按钮子节点的最后」。但 MainWin 的 `SettingButton` 下有一个 `IconViewport` 子节点带 `cc.Mask`，如果红点被放进这个被裁剪的容器（视觉上很像「图标右上角」），就会被裁掉；只有作为 `SettingButton` 的**直接子节点、排在最后**才安全。
- **证据**：`MainWin.prefab:1774`（SettingButton）、`:1780-1787`（其 children：IconViewport + SettingsText）、`:1874`（IconViewport 节点）、`:1971`（该节点上的 `cc.Mask`）；`MainWin.prefab:1014-1024`（TeamButton 目前只有一个 Label 子节点，红点应是第 2 个子节点，即「最后」）；`UILayer.ts:14`（同层后加入者渲染在上）。
- **修复建议**：在 §7 节点结构图旁加一句「红点必须是按钮的直接子节点（最后一个），不要放进 IconViewport/ScrollView 等带 Mask 的容器，否则会被裁剪」。

### 建议-6｜§11 任务 3 的「回调不翻倍」验收缺少可观测判据；「只登记一次」应改为「每个节点实例一次」

- **文档位置**：§11 第 620-627 行（尤其 626-627）；§1 第 15 行
- **问题**：①「关闭再打开主界面……回调不翻倍」没有给出怎么观测；项目里现成有 `BindingScope.count`/`hasBindings`（`BindingScope.ts:12-18`），可以一行断言。②「整个生命周期只登记一次」不准确：默认 `cacheTime=30000ms`，超过 30s 缓存到期会 `Cache → Destroy`、节点销毁后再打开是全新实例，会再登记一次（总数仍为 1，但「只登记一次」无法作为验收判据）；应写成「每个节点实例至多登记一次；缓存重开复用节点不新增，缓存过期销毁重建会重新登记」。
- **证据**：`BindingScope.ts:12-18`（`count` / `hasBindings`）；`UIOpenOpt.ts:50`（`DefaultCacheTime = 30000`）、`:84-86`；`UIVoRegistry.ts:106-117`（缓存到期转 Destroy）；`UICloseDoneStateHandler.ts:29-39`（`cacheTime` 三分支）；`UIDestroyStateHandler.ts:46-47`（`node.destroy()`）；`UILoadStateHandler.ts:22-31`（只有实例仍有效才走缓存复用）。
- **修复建议**：给出可执行验收：DEV 下 `Log.info('reddot binder=' + badge.binderCount)`（或在 RedDotBadge 暴露只读 getter 转发 `_binder.count`），断言「重开前后均为 1」；并把「缓存到期销毁后重开」加入用例（可把某窗 `cacheTime` 临时设 0 验证）。

---

## 四、已核对与文档一致（属实，避免误改）

| # | 文档断言 / 位置 | 结论 | 证据 |
| --- | --- | --- | --- |
| 1 | §5.4 第 345 行「BaseCmp 在 onDisable 里统一退订」 | **属实** | `BaseCmp.ts:50-52`（`this.binder.unbindAll()`） |
| 2 | §5.4 第 345 行「BaseCmp 组件自己隐藏后收不到事件、红点无法重新出现」 | **属实**（仅限 BaseCmp 自身的退订语义） | `BaseCmp.ts:43-48`（注释明确「代价是隐藏期间收不到事件」）、`:50-52` |
| 3 | §5.4 第 346 行「缓存窗口重开不销毁节点」 | **属实** | `UILoadStateHandler.ts:13、22-31`；`UICloseDoneStateHandler.ts:27-39`（Cache 只 removeFromParent）；`PORTING.md:43` |
| 4 | §5.4 第 346 行「订阅放 onLoad 在缓存重开时不会重复登记」 | **属实**（独立 Component，且节点未销毁） | `onLoad` 每实例一次；框架 reset 只作用于 `win.invokeResetBindings()`（`UIOpenStateHandler.ts:67-68`）；私有 binder 不在 BaseUI 上 |
| 5 | §5.4 第 347 行「节点初始 inactive → onLoad 不执行 → 不会订阅」 | **属实**（机制成立，风险由阻断-1 补充） | 文档自身声明 + `BaseCmp.ts:10-15`（同类机制的项目认知）；**具体引擎行为需实测** |
| 6 | §5.4 第 348 行「另一条路是常驻节点 + Visual 子节点」 | **方向正确**，且比主方案更稳（见阻断-1/重要-4） | `BaseCmp.ts:32-52`；`FitScaleBox.ts:143-164`（普通 Component 的 onEnable/onDisable 模板） |
| 7 | §6 第 377 行「`RedDot.Initialize` 在 `UIManager.init` 之前调用」 | **落点存在且结构可行** | `AppEntry.ts:31`（`SettingsService.Initialize()`）→ `:35-42`（注册路由）→ `:44-53`（`manager.init`） |
| 8 | §6 第 383 行「`AppEntry.onDestroy` 里 `RedDot.Dispose()`」 | **落点存在**（两者顺序文档未规定，见 `reddot-integration.md` 重要-6） | `AppEntry.ts:86-89` |
| 9 | §7 第 460 行「`top=-4`、`right=-4` 让角标压出按钮边缘」 | **方向正确** | `build-app-ui.py:134`（正 `_top=30` = 向内）；Widget 负偏移 = 向父节点外部 |
| 10 | §7 第 464 行「RedDot 放按钮子节点的最后，画在最上」 | **属实** | `UILayer.ts:14`（后加入者渲染在上）；`UIManager.ts:137-141`（同父按 siblingIndex 决定渲染/命中顺序）；`MainWin.prefab:1014-1024`（TeamButton 现有 1 个 Label 子节点） |
| 11 | §7 第 465 行「角标不挂 Button/BlockInputEvents、不挂触摸监听就不挡点击」 | **方向正确**（BlockInputEvents 是显式组件，项目仅在弹窗根节点使用） | `SettingDlg.prefab:291`、`ConfirmDlg.prefab:291`（显式挂 BlockInputEvents 才拦截）；`MainWin.prefab:1162-1173`（`cc.Button`，`clickEvents` 为空、代码绑定）+ `MainWin.prefab:1215-1233`（按钮上的 `ButtonSound` 压缩类实例，可按 `_soundPath` 辨识）→ `ButtonSound.ts:10-12` 监听按钮自身节点，徽标子节点无监听不参与命中；**真机需实测** |
| 12 | §7 第 466 行「节点默认激活是硬性要求」 | **本方案下成立**，但前提不完整（见阻断-1/问题 4） | `UILoadStateHandler.ts:73`（instantiate 不激活）→ `UICreateStateHandler.ts:23-25`（Create 才挂树） |
| 13 | §7 第 462 行「Label 用 LabelOutline 提高可读性」 | **与仓库既有 UI 风格一致** | `build-app-ui.py:95-98`（`_enableOutline=True`、`_outlineColor`、`_outlineWidth=3`）；`MainWin.prefab:1747-1755` |
| 14 | §7 第 461 行「列表项/动态布局用 ALWAYS」 | **正确的一半**（动态场景确实该用 ALWAYS） | `UILayerManager.ts:155-165`、`UIManager.ts:601`；争议点见建议-3 |
| 15 | §10 第 562 行「红点节点初始 inactive → 后面不会自己出现」 | **属实**（在 onLoad 订阅方案下） | 同上；项目内 `BaseCmp.ts:10-15` 的取舍说明可作为佐证 |
| 16 | §10 第 565 行「静态数据会跨场景保留，重开流程记得 Reset/Dispose」 | **属实** | `UIManager.ts:66-71`（静态单例）、`:116-123`（`init` 时重建实例）、`:149-159`（`dispose` 清静态）；模块级静态量不会随场景卸载自动清理 |
| 17 | §5.4 第 338 行「`if (this.node.active !== visible)` 才写 active」 | **写法正确**（避免无意义切换/重入） | `Node.active` 是本地开关；项目内同类守卫见 `UIRuntimeData.ts:116-134`（只在 hideBool 变化时写一次） |

---

## 五、需实测清单（静态代码无法判定，文档应标注）

1. **首次挂树时 onLoad/onEnable 是同步还是延迟触发**：决定「onLoad 订阅」与 `onOpen` 里 `Set` 的先后（§6 第 3 步）。
2. **在 `onEnable` 内把自身 `node.active` 置 false** 的回调顺序、是否重复触发 onDisable/onEnable、是否有引擎告警（§5.4 主方案）。
3. **父节点已 deactivate 时子节点 `active=true` 的行为**：预期只是改本节点的 active 标记，`onLoad/onEnable` 要等祖先链恢复激活才触发。对 badge 来说这是安全的——事件回调已把 `active` 置 true 并写好 Label，窗口恢复时 `onEnable` 再刷一次快照（幂等）；但需实测确认「祖先隐藏期间置 true、恢复后确实会触发 onEnable」且 `Widget` 不会停在旧位置（见第 4 条）。
4. **Widget 对齐与角标首次显示**：`active` 从 false 切 true 的当帧是否先按旧位置渲染一帧（建议-3/重要-4）。
5. **`Label.Overflow.SHRINK` 在 40×28 角标里显示 `99+`** 的实际字号与可读性（建议-4）。
6. **角标不挡点击**：真机/浏览器验证按钮边缘仍可命中（文档第 566 行自己也要求了）。
7. **缓存到期销毁→重建** 后 badge 订阅数与显示是否正确（默认 30s，建议-6）。

---

## 六、给设计稿的修改清单（按优先级）

1. **阻断-1**：把「常驻节点 + Visual 子节点」升级为主方案并给完整骨架；若保留单节点方案，补 `_loaded` 守卫 + 「先挂树后设 id」硬约束 + 列表项「0 → 正数」验收用例（§5.4、§3.6、§8、§11）。
2. **重要-1**：重写 §10 坑 15，按「BaseCmp 系 / RedDotBadge」区分事件是否丢失，明确「onEnable 唤不醒自隐藏节点，恢复靠保留的订阅」。
3. **重要-2**：§5.4 增补方案选择表：普通 Component（私有 binder 不归框架管 → 前提成立，但必须自己保证 onDestroy 退订）vs BaseWin/BaseMask（框架每次 Open resetBindings → 必须 initEvent）vs BaseCmp（自身 onDisable 退订 → initEvent + 宿主常驻，不能自我隐藏）；补 `FitScaleBox` 式「onEnable 先 unbindAll」防重复模板，并明确「框架不会 reset 子组件」。
4. **重要-3**：§6 第 3 步拆成「Create 挂树（onLoad/onEnable）」与「Open（initEvent/onOpen）」两拍，并标注引擎激活时机需实测。
5. **重要-4**：§5.4 标注「onEnable 内切 active」需实测，给出 Visual 子节点替代。
6. **建议 1-6**：补 import 头与 `formatRedDotCount` 路径；补 @property 序列化说明；Widget 统一 ALWAYS + 对齐开关；SHRINK 需实测与备选；红点避开 Mask 容器；验收改为「每节点实例一次」并给 `binder.count` 断言。

---

*本报告只以仓库现有代码/配置/prefab 为依据，未修改任何生产代码与 `docs/红点系统设计.md`；因沙箱 ACL 故障未运行 `tsc`/编辑器/真机，运行期结论已全部标注「需实测」。*
