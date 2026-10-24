import { EUIAnimState } from '../Def/EUIAnimState';

/**
 * 界面生命周期调用器（移植自 kemo_card 的 IUILifecycleInvoker）。
 *
 * 为什么需要它：状态机只认识「生命周期步骤」，不认识具体是窗口还是遮罩；
 * 把调用点收敛到一个接口，状态机就不必按 win / mask 各写一份分支。
 *
 * 关于「全部可选」：C# 里 BaseWin / BaseMask 用显式接口实现（`void IUILifecycleInvoker.InvokeXxx()`）
 * 把方法藏起来，TS 没有这个语法。因此这里把方法声明为可选：
 * BaseWin 只实现窗口那一组，BaseMask 只实现遮罩那一组，两边不必为对方的方法写空实现。
 * 调用方统一写成 `invoker.invokeXxx?.(...)`，缺哪个方法就跳过哪个步骤。
 */
export interface IUILifecycleInvoker {
    /**
     * 当前动画阶段，由动画控制器读写。
     * 框架靠它判断「上一轮动画是否还在跑」，从而决定是打断还是排队。
     */
    animState: EUIAnimState;

    /**
     * 异步预加载：done / fail 必须二选一调用。
     * 少调任何一个，打开流程都会永久停在预加载状态（没有超时兜底）。
     */
    invokePreLoad?(done: () => void, fail: (err?: unknown) => void): void;

    /** 预加载通过后创建节点与控件（C# 的 OnCreate）。 */
    invokeCreate?(): void;

    /**
     * 清空上一次的订阅。
     * 已打开的界面被再次 Open 时不会走离场流程，不先清账就会重复订阅。
     */
    invokeResetBindings?(): void;

    /** 登记订阅；状态机保证它紧跟在 invokeResetBindings 之后。 */
    invokeInitEvent?(): void;

    /** 界面内容就绪（C# 的 OnOpen）。 */
    invokeOpen?(): void;

    /**
     * 播放打开动画。
     * 返回值是「取消句柄」：动画被下一轮打断或界面销毁时由框架调用，用来停掉 tween。
     */
    invokeOpenAnim?(done: () => void): (() => void) | null;

    /** 打开动画正常播完。 */
    invokeOpenAnimDone?(): void;

    /** 播放关闭动画，返回值语义同 invokeOpenAnim。 */
    invokeCloseAnim?(done: () => void): (() => void) | null;

    /** 关闭动画结束、界面即将隐藏（C# 的 OnClose）。 */
    invokeClose?(): void;

    /**
     * 层级可见性变化。
     * 可能每帧被调用（下层界面被遮挡/恢复），实现里不要做重活，更不要刷日志。
     */
    invokeLayerVisibleUpdate?(): void;

    // ---- 遮罩专属步骤：只有 BaseMask 实现 ----

    invokeMaskOpen?(): void;

    invokeMaskUIOpen?(): void;

    invokeMaskOpenAnim?(done: () => void): (() => void) | null;

    invokeMaskOpenAnimDone?(): void;

    invokeMaskCloseAnim?(done: () => void): (() => void) | null;

    invokeMaskClose?(): void;

    invokeMaskUIClose?(): void;

    invokeMaskUIDestroy?(): void;
}
