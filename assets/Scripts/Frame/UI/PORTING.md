# 移植对照表（Godot / C# → Cocos Creator / TS）

源工程：`kemo_card` 的 `Src/frame/ui`（C#，Godot 4.7 Mono）。
目标：`assets/Scripts/Frame/UI`（TypeScript，Cocos Creator 3.8.8）。
适用版本：本目录下的实现。运行时行为以 `README.md` 为准，这里只记「哪个文件对应哪个文件」与「哪些东西故意没搬」。

## 1. 文件映射

| C# 源 | TS 目标 | 说明 |
| --- | --- | --- |
| `UIManager.cs`（`IUIManager` / `UIManagerInitOpt` / `UIEvent` / `UIStateContext`） | `UIManager.ts` / `UIEvents.ts` | `UIStateContext` 包装类已删：`UIVo` 本身实现 `IUIStateContext`，流转时直接传 `vo` |
| `UIRuntimeRegistry.cs`（含 `UIRuntimeEntry`） | `UIRuntimeRegistry.ts` / `UIRuntimeEntry.ts` | 路由 + 归属 + 父子链；`register` 同时接受 `UIRegistration` 与 `UIRuntimeEntry` |
| `UIRegistration.cs` | `UIRegistration.ts` | 工厂方法 `page/dialog/window/popup` + `withParent` |
| `UIVo.cs` | `UIVo.ts` | 状态机 + 生命周期 + 运行时引用；`isOpen/isClose` 用显式枚举集合，不依赖枚举顺序 |
| `UIVoRegistry.cs` | `UIVoRegistry.ts` | 实例池；额外提供关闭超时看门狗（C# 版没有）与缓存到期回收 |
| `UIRuntimeData.cs` | `UIRuntimeData.ts` | 挂载 / 遮罩排序 / 可见性同步 |
| `UILayer.cs` / `UILayerManager.cs` | `UILayer.ts` / `UILayerManager.ts` | `UILayer` 从 Control 子类改为「普通类 + Node」 |
| `UIOpenCoordinator.cs` | `UIOpenCoordinator.ts` | 串行打开队列 + 加载超时 |
| `UIStack.cs` | `UIStack.ts` | 导航栈 |
| `UILoadContext.cs` | `UILoadContext.ts` | 自增 flag + `cancelled` 取代 `CancellationTokenSource` |
| `UILifecycleState.cs` | `UILifecycleState.ts` | 毫秒时间戳；删掉从未被读取的 `IsOpened/IsClosed` |
| `UIAnimController.cs` | `UIAnimController.ts` | `AnimationSlot` 的 version 账本原样保留 |
| `UIResourceLoader.cs` | `UIResourceLoader.ts` | `resources.load` + Promise 包装（Cocos 本身就是异步，无需再线程化） |
| `BindingScope.cs` / `BindingScopeSignals.cs` | `BindingScope.ts` / `BindingScopeSignals.ts` | 订阅登记 + 控件信号封装 |
| `FitScaleBox.cs` / `FitScaleMath.cs` | `FitScaleBox.ts` / `FitScaleMath.ts` | 等比适配，新增 `cover` 模式 |
| `Base/*.cs`（9 个） | `Base/*.ts`（9 个） | `BaseWin/BaseMask/BaseCmp/Dlg/Pge/Pop` + `IUILifecycleInvoker` + `UIComponentLookup` |
| `States/*.cs`（8 个） | `States/*.ts`（7 个） | `UILoadContext` 不算状态；`DefaultStateHandlers.ts` 负责注册顺序 |
| `Def/*.cs` | `Def/*.ts` | 枚举、`UIOpenOpt`、`DefaultUIOpenOpt`、`UiId`、`UIConsts` … |
| `GodotMainThreadSyncContext.cs` | — | 不移植：Cocos 没有「后台线程回调 UI」的入口，所有生命周期回调都在主线程 |
| `UIManager._Process` | `UIManagerTicker.ts` | 管理器不是 Component，用挂在 root 上的 ticker 组件驱动 |
| `TaskCompletionSource<UIVo?>` | `OpenRequest.ts` | 一次性 promise 凭据 |
| `UIManager.UIEvent` 静态字段 | `UIEvents.ts` | `EventDispatcher` 的 `EventKey` 实例 |

## 2. 行为上刻意保持一致的点

- **串行打开**：同一时刻只允许一个界面处于 `Load/PreLoad`，其余排队；`Pge/Pop` 不进队列。
- **重开流程**：已打开状态下再次 `open` 会重走 `Load → PreLoad → Create → Open`，
  并在 `Open` 里先 `resetBindings` 再 `initEvent`，所以订阅不会叠加。
- **失败收尾**：任何阶段异常/超时都落到 `Destroy`，未完成的打开请求以 `null` 结束，
  且「已交付成功之后」的回调异常不会再把界面销毁。
- **层级可见性**：`hideBelow` 触发的隐藏由 `UILayerManager.updateLayers()` 统一重算，
  业务不要在页面里手动改 `active`；`noCover` 不参与遮挡计算。
- **缓存**：`cacheTime = -1` 永久、`> 0` 毫秒后回收、`0` 关闭即销毁；缓存只摘节点不销毁。

## 3. 刻意没搬的东西

| 项 | 原因 |
| --- | --- |
| `GodotMainThreadSyncContext`（每帧 32 条的泵） | 引擎没有对应的线程模型，留着只会变成一层无意义的队列 |
| `ProcessMode.Always` | Cocos 组件跟随 `director` 的暂停策略，没有等价的「暂停时仍更新」开关；需要时在 ticker 上调 `director` 或自己驱动 |
| `BaseWin.GetScenePath()` | C# 版里的死代码（与真实加载路径不同源），Cocos 版路径统一由注册表的 `prefabPath` 给出 |
| `UIMaskOpt` 的 `alpha/clickClose/closeMinTime/color/hideTipText/payload` | 与 C# 版一致：框架只消费 `runtime`，其余字段留给 `BaseMask` 子类自己实现 |
| Toast / Tip / 主题等业务组件 | 属于 Mod 层，不是框架 |

## 4. 验证

- 类型检查：`npx tsc -p . --noEmit`（只关心 `assets/` 下的报错；引擎 `cc.d.ts` 自带噪声）。
- 冒烟：`tools/uitest`（工程外，不影响 assets）用 `cc` 桩在 Node.js 里跑真实状态机，
  覆盖 `open → hideBelow → back → close → cache → 缓存到期 → 遮罩挂载 → 资源缺失 → 批量关闭`
  共 37 项断言。运行方式见 `tools/uitest/README.md`。

冒烟在移植期抓到并修掉的两个真实缺陷（都已回归）：

| 缺陷 | 症状 | 修复 |
| --- | --- | --- |
| `StateMachine.transitionTo` 把「目标状态未注册处理器」当错误并忽略流转 | 界面永远进不了 `Cache`：关闭后既不清缓存也不销毁，`closeByOwner` 之后残留实例，缓存过期回收整条链路失效 | 改为「未注册也照常改状态、只是不执行 `onEnter`」，与 C# 一致（`Cache` 本就是无处理器的停驻态） |
| 遮罩路径被当成路由 id 走注册表拼接 | 未登记进路由表的遮罩 prefab 静默不加载，界面裸奔 | `mask.runtime` 同时接受「已登记路由 id」和「resources 相对路径」 |
