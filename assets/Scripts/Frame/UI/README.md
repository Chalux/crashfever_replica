# UI 框架（Cocos Creator 版）

移植自 Godot/C# 项目的 `Src/frame/ui`，保持三层职责、状态机生命周期、层级可见性与订阅绑定语义。
纯 TypeScript，不依赖任何第三方库；唯一的引擎依赖是 `cc`。

逐文件对照、以及「哪些东西故意没搬」见 [`PORTING.md`](./PORTING.md)。

## 目录结构

```
Frame/UI/
├── UIManager.ts              # 门面：open / close / back / 查询
├── UIManagerTicker.ts        # 每帧驱动（UIManager 不是 Component，靠它 tick）
├── DefaultStateHandlers.ts   # 默认 7 个状态处理器
├── UIVo.ts                   # 单个界面的运行时实例（状态机 + 生命周期 + 资源）
├── UIVoRegistry.ts           # 实例池：复用缓存、回收过期、关闭超时兜底
├── UIOpenCoordinator.ts      # 串行打开队列（同一时刻只有一个界面在 Load/PreLoad）
├── UILayerManager.ts         # 层级节点创建、可见性重算
├── UILayer.ts                # 单层：节点的持有者 + 本层界面排序
├── UIRuntimeRegistry.ts      # 路由表（Id → prefab 路径 / 默认参数 / 父子关系）
├── UIRegistration.ts         # 路由条目的构造帮助类
├── UIRuntimeEntry.ts         # 路由条目
├── UIRuntimeData.ts          # VO 的运行时引用（节点 / 遮罩 / 层级 / 显隐）
├── UIStack.ts                # 导航栈
├── UIAnimController.ts       # 打开/关闭动画的取消账本
├── UILoadContext.ts          # 加载 flag / 取消
├── UILifecycleState.ts       # 各阶段时间戳
├── BindingScope.ts           # 订阅登记（自动退订）
├── BindingScopeSignals.ts    # 常用控件信号的登记封装
├── FitScaleBox.ts            # 按设计尺寸等比缩放的组件
├── FitScaleMath.ts           # 上面的纯计算部分
├── UIResourceLoader.ts       # prefab 加载
├── UIEvents.ts               # 打开/关闭事件键与载荷
├── OpenRequest.ts            # 一次打开请求的 promise 凭据
├── IUiFacadeProvider.ts      # 归属门面提供者接口
├── Base/                     # 界面基类（业务只继承这几个）
│   ├── BaseUI.ts  BaseWin.ts  BaseMask.ts  BaseCmp.ts
│   ├── BaseDlg.ts BasePge.ts  BasePop.ts
│   └── IUILifecycleInvoker.ts  UIComponentLookup.ts
├── Def/                      # 枚举与参数对象（无逻辑）
└── States/                   # 7 个状态处理器
```

## 快速上手

### 1. 注册路由

```ts
const registry = new UIRuntimeRegistry();
registry.registerRange([
    UIRegistration.window('my_mod', 'MainMenu', 'ui/main'),
    UIRegistration.dialog('my_mod', 'Settings', 'ui/settings'),
    UIRegistration.page('my_mod', 'Shop', 'ui/shop').withParent('MainMenu'),
]);
```

`dir` 是 **resources 相对目录**：上面 `MainMenu` 的 prefab 实际路径是
`assets/resources/ui/main/MainMenu.prefab`（Cocos 的 `resources.load` 不带 `res://` 与扩展名）。
prefab 根节点必须挂一个继承 `BaseWin`（或 `BaseDlg/BasePge/BasePop`）的脚本组件，
框架靠 `instanceof` 找到它——所以基类本身没有 `@ccclass`。

### 2. 初始化

```ts
const manager = new UIManager();
manager.init({
    root: uiRootNode,                            // 普通层级的父节点（通常是 Canvas 下的空节点）
    layers: [EUILayer.Win, EUILayer.Dlg, EUILayer.Loading, EUILayer.Pop], // 由下到上，用到气泡就要带 Pop
    topLayers: [EUILayer.Debug, EUILayer.Notice],// 永远在最上层
    registry,
    facadeProvider,                              // 可选：按 ownerModId 提供门面
    knownOwnerModIds: ['my_mod'],                // 可选：启动期归属校验
});
```

### 3. 声明一个界面

```ts
@ccclass('SettingsDlg')
export class SettingsDlg extends BaseDlg {
    @property(Button) closeButton: Button | null = null;

    protected onOpen(): void {
        this.updateView();
    }

    protected updateView(): void {
        // 只刷数据，不在这里订阅
    }

    protected initEvent(): void {
        // 订阅一律登记到 binder：界面销毁或重开时自动退订
        if (this.closeButton) {
            BindingScopeSignals.onClick(this.binder, this.closeButton, () => this.close());
        }
    }
}
```

打开 / 关闭：

```ts
const vo = await manager.open('Settings', { tab: 'audio' });
manager.close('Settings');
```

`open` 在「被后来的请求取代 / 路由缺失 / 层级不存在 / skipOpenCheck 拦截」时解析为 `null`，
**必须判空**——注册过不代表一定能打开。

## 生命周期与状态机

```
Wait → Load → PreLoad → Create → Open → Close → CloseDone → Cache / Destroy
                  ↑                    │
                  └──── 缓存重开 ───────┘
```

- `Load`：加载 prefab（有缓存实例时跳过，直接回到 PreLoad）。
- `PreLoad`：唯一允许业务挂起流程的钩子 `onPreLoad(done, fail)`；不回调会被 10s 超时兜底。
- `Create`：首次挂到层级上，调用 `onCreate`。
- `Open`：`resetBindings` → `initEvent`（重新登记订阅）→ `onOpen` → 打开动画 → 派发事件。
- `Close`：关闭动画（遮罩与界面都完成才继续），5s 超时兜底。
- `CloseDone`：`onClose` → 离树 → 按 `cacheTime` 决定进缓存还是销毁。
- 任何阶段抛异常都会落到 `Destroy`，并把未完成的打开请求以 `null` 收尾。

`UIVo.isOpen` 只在 `Create/Open` 为真；`isClose` 覆盖 `Close/CloseDone/Cache/Destroy`，
所以「对已关闭界面再 close」天然幂等。

## 层级与可见性

- `layers` 由下到上排列；`topLayers` 永远在普通层之上。
- `hideBelow: true` 的界面打开时，下层的界面会被 `active = false`（层级可见性由
  `UILayerManager.updateLayers()` 统一重算，页面不要在业务里手动 `active`）。
- `noCover: true` 的界面不参与遮挡计算（例如纯提示类气泡）。
- 全屏界面用 `BaseWin`（`DefaultUIOpenOpt.forType(EUIType.Win)` 已经带 `hideBelow`），
  它们会自动进导航栈，`manager.back()` 可以逐级返回。

## 缓存

`UIOpenOpt.cacheTime`：`-1` 永久缓存；`> 0` 关闭后缓存 N 毫秒；`0` 关闭即销毁。
缓存界面关闭时只是 `removeFromParent`，再次打开会复用同一个节点（不重新加载、不闪帧），
但**一定会重新走 `resetBindings` + `initEvent`**，所以订阅写在 `initEvent` 里才是安全的。

## 订阅纪律

- 任何 `node.on(...)` / 按钮回调都必须经 `BindingScope`（`binder.add(() => node.off(...))`
  或 `BindingScopeSignals.onClick(binder, ...)`）。
- 不要覆盖 `onDestroy` 而不调 `super.onDestroy()`——`BaseUI` 在那里统一退订。
- 缓存界面重开时不会触发 `onDestroy`，所以「只订阅一次」的写法（例如写在 `onLoad`）会在重开后失效；
  统一放 `initEvent()`。

## 与 Godot 版的差异

| Godot / C# | Cocos / TS | 原因 |
| --- | --- | --- |
| `Node.Visible` | `node.active` | Cocos 没有单独的可见性开关 |
| 场景树 `GetParent/AddChild` | `node.parent` / `addChild` | 引擎 API |
| `_Process` 虚函数 | `UIManagerTicker.update` | 管理器不是 Component |
| `TaskCompletionSource` | `OpenRequest`（一次性 promise） | TS 无 TCS |
| `CancellationTokenSource` | `UILoadContext` 的 flag + `cancelled` | 引擎/语言无对应物 |
| `res://...tscn` | resources 相对路径（无扩展名） | `resources.load` 的路径约定 |
| `ProcessMode.Always` | 无 | Cocos 组件默认跟随 `director` 暂停策略 |

## 验证

```bash
npx tsc -p . --noEmit                    # 类型检查（只看 assets/ 下的报错）
# 运行时冒烟（Node.js + cc 桩，37 项断言），见 tools/uitest/README.md
```

## 已知边界

- 同一个 id 在极短时间内被并发 `open`：只有最后一次请求会成功，前面的解析为 `null`（与 C# 版一致）。
- `back()` 恢复上一层时不带载荷（`payload` 为 `null`）：导航栈只记录 id，不记录数据。
- `UIOpenOpt.mask.runtime` 接受两种写法：已登记的 UI 路由 id，或直接的 resources 相对路径
  （遮罩通常不该是可打开的界面，所以后者更常用）。除 `runtime` 外的遮罩参数（透明度、点击关闭、
  最短展示时间）框架不消费，需要在 `BaseMask` 子类里自己实现。
