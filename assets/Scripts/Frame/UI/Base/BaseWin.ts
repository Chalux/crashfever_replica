import { Log } from '../../Log/Log';
import { DefaultUIOpenOpt } from '../Def/DefaultUIOpenOpt';
import { EUIAnimState } from '../Def/EUIAnimState';
import { EUIType } from '../Def/EUIType';
import { UIOpenOpt } from '../Def/UIOpenOpt';
import type { UIVo } from '../UIVo';
import { BaseUI } from './BaseUI';
import type { IUILifecycleInvoker } from './IUILifecycleInvoker';

/**
 * 窗口类界面的基类（移植自 kemo_card 的 BaseWin）：Win / Dlg / Pge / Pop 共用这一套生命周期。
 *
 * 为什么把生命周期做成「钩子 + 调用器」两层：钩子是给业务覆写的，调用器是给框架调的。
 * 业务只关心 onOpen/onClose 这些语义点，框架只关心 invokeXxx 的时序；
 * 中间这一层转调让两边互不依赖对方的命名习惯（Godot 用 OnXxx，Cocos 侧框架用 invokeXxx）。
 *
 * 与 Cocos 组件生命周期的关系：本类不驱动任何 Cocos 生命周期回调，
 * 一切由 UIManager 的状态机调用 invokeXxx；onDestroy 只做退订。
 */
export abstract class BaseWin extends BaseUI implements IUILifecycleInvoker {
    /**
     * 绑定数据。由框架在打开前赋值，界面销毁时不清空——
     * 缓存重开时框架会重新赋值，提前清空反而会让 onClose 拿不到最后一次的数据。
     */
    public uiVo: UIVo | null = null;

    /** 打开时传入的业务数据；具体类型由界面用 getTypedPayload 断言。 */
    public payload: unknown = null;

    /** 当前动画阶段，由动画控制器维护，业务不要写它。 */
    public animState: EUIAnimState = EUIAnimState.None;

    /** 窗口的默认种类；Dlg/Pge/Pop 各自覆写。 */
    public get uiType(): EUIType {
        return EUIType.Win;
    }

    /**
     * 该类型界面的默认打开参数（层级/对齐/缓存策略）。
     *
     * 每次调用都返回一个新实例：调用方可以随意改动结果再合并，不会污染全局基线。
     * 子类想改默认值请覆写本属性，不要改 DefaultUIOpenOpt。
     */
    public get baseOpenOpt(): UIOpenOpt | null {
        return DefaultUIOpenOpt.forType(this.uiType);
    }

    /**
     * 取本界面归属功能的门面（业务逻辑入口）。
     *
     * 为什么用抛异常而不是返回 null：门面拿不到意味着功能被整体摘掉了，
     * 界面继续跑下去只会在后续调用处空引用；在入口就炸，堆栈指向明确。
     */
    protected facade<T>(ctor: new (...args: never[]) => T): T {
        const vo = this.uiVo;
        if (vo === null || !vo.ownerModId) {
            throw new Error(`界面<${this.uiId}> 尚未绑定 UIVo，无法解析归属门面。`);
        }

        const resolved: unknown = vo.manager.resolveUiFacade(vo.ownerModId);
        if (resolved === null || resolved === undefined) {
            throw new Error(`界面<${this.uiId}> 取门面失败：功能 '${vo.ownerModId}' 未提供门面。`);
        }

        if (!(resolved instanceof ctor)) {
            const actualName =
                (resolved as unknown as { constructor?: { name?: string } }).constructor?.name ?? typeof resolved;
            const expectedName = (ctor as unknown as { name?: string }).name ?? '未知类型';
            throw new Error(
                `界面<${this.uiId}> 取门面类型不匹配：功能 '${vo.ownerModId}' 提供的是 ${actualName}，` +
                    `期望 ${expectedName}；界面只能访问自己归属功能的门面。`,
            );
        }

        return resolved as T;
    }

    /**
     * 按期望类型取出 payload。
     *
     * 与 C# 的差异：C# 能用 `Payload is T` 做运行期校验，TS 的泛型在编译后被擦除，
     * 除空值外无法再判断类型，因此这里只能对 null 报错、非空时按调用方的断言返回。
     * 调用方要保证 setTypedPayload 与 getTypedPayload 用的是同一个类型。
     */
    protected getTypedPayload<T>(): T {
        const value = this.payload;
        if (value === null || value === undefined) {
            throw new Error(`UI<${this.uiId}> 的 Payload 类型与期望不匹配，实际为 null。`);
        }
        return value as T;
    }

    /** 写入 payload；语义同 C# 的 SetTypedPayload（只收窄类型，不做转换）。 */
    protected setTypedPayload<T>(value: T): void {
        this.payload = value;
    }

    // ---- 生命周期钩子：给业务覆写，默认实现对应 C# 的同名虚方法 ----

    /**
     * 异步预加载（资源、配置、远程数据）。
     * 默认直接 done()：没有异步需求的界面不该被迫写一个空回调，否则打开流程会白白多一帧。
     */
    protected onPreLoad(done: () => void, fail: (err?: unknown) => void): void {
        done();
    }

    /** 节点/控件创建（此处只应取引用，不要依赖布局尺寸）。 */
    protected onCreate(): void {
        // 默认无事可做：控件引用通常已在 onOpen 里按需获取。
    }

    /** 登记事件订阅。每次打开前都先被 resetBindings 清过账，可以放心重复订阅。 */
    protected initEvent(): void {
        // 默认无事可做：没有订阅的界面不需要写空实现。
    }

    /** 界面内容就绪：此时节点已挂载、可读取布局尺寸，适合刷新数据与文案。 */
    protected abstract onOpen(): void;

    /**
     * 刷新显示。
     *
     * 框架不自动调用它——业务在数据变化后自行调用（并覆写成本类的方法），
     * 这样「数据变了就刷 UI」只有一处入口，而不是散落在各个事件回调里。
     */
    protected abstract updateView(): void;

    /**
     * 播放打开动画。
     *
     * 返回值是取消句柄：框架把它存起来，在下一轮动画开始或界面销毁时调用，
     * 用来停掉 tween 并避免 done 被调两次。不需要动画就同步 done() 并返回 null。
     */
    protected onOpenAnim(done: () => void): (() => void) | null {
        done();
        return null;
    }

    /** 打开动画播完；适合放「动画结束才允许交互」的解锁逻辑。 */
    protected onOpenAnimDone(): void {
        // 默认无事可做。
    }

    /** 播放关闭动画，返回值语义同 onOpenAnim。 */
    protected onCloseAnim(done: () => void): (() => void) | null {
        done();
        return null;
    }

    /** 关闭动画结束、界面即将隐藏；此时节点仍在，可以读最后的状态。 */
    protected onClose(): void {
        // 默认无事可做。
    }

    /**
     * 层级可见性变化（本界面被上层遮挡或重新露出）。
     * 可能每帧触发，默认留空，需要时再覆写。
     */
    protected onLayerVisibleUpdate(): void {
        // 默认无事可做。
    }

    // ---- 生命周期调用器：给框架调，业务不要覆写 ----

    public invokePreLoad(done: () => void, fail: (err?: unknown) => void): void {
        this.onPreLoad(done, fail);
    }

    public invokeCreate(): void {
        this.onCreate();
    }

    public invokeResetBindings(): void {
        this.resetBindings();
    }

    public invokeInitEvent(): void {
        this.initEvent();
    }

    public invokeOpen(): void {
        this.onOpen();
    }

    public invokeOpenAnim(done: () => void): (() => void) | null {
        return this.onOpenAnim(done);
    }

    public invokeOpenAnimDone(): void {
        this.onOpenAnimDone();
    }

    public invokeCloseAnim(done: () => void): (() => void) | null {
        return this.onCloseAnim(done);
    }

    public invokeClose(): void {
        this.onClose();
    }

    public invokeLayerVisibleUpdate(): void {
        this.onLayerVisibleUpdate();
    }

    // ---- 对外操作 ----

    /**
     * 关闭自己。
     *
     * 走 UIVo 是为了让管理器统一处理缓存、层级与导航栈；界面自己不知道这些状态。
     * 没有 UIVo 说明它不是在框架流程里打开的（或已被解绑），此时只警告不抛错：
     * 销毁顺序里可能出现「先解绑后关闭」，抛错会把正常的销毁流程打断。
     */
    public close(): void {
        const vo = this.uiVo;
        if (vo !== null) {
            vo.manager.close(vo.id);
            return;
        }
        Log.warn(`界面<${this.uiId}> 未绑定 UIVo，close() 被忽略。`, 'UI');
    }

    /**
     * 自己是不是当前最上层的界面（没有可判定的实例时返回 false）。
     * 不记日志：业务可能在每帧的输入处理里问它，日志会被刷爆。
     */
    public isUITop(): boolean {
        const vo = this.uiVo;
        if (vo === null) return false;
        return vo.manager.isUITop(vo.id);
    }
}
