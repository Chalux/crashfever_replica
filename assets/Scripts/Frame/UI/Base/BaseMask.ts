import { EUIAnimState } from '../Def/EUIAnimState';
import { EUIType } from '../Def/EUIType';
import type { UIVo } from '../UIVo';
import { BaseUI } from './BaseUI';
import type { IUILifecycleInvoker } from './IUILifecycleInvoker';

/**
 * 遮罩基类（移植自 kemo_card 的 BaseMask）。
 *
 * 遮罩在 C# 里不从 BaseUI 继承（它只实现 IUILifecycleInvoker + 自带 Binder），
 * 这里改为继承 BaseUI：TS 侧遮罩同样是组件，直接把元信息与订阅作用域
 * 复用同一套实现，避免两份几乎相同的 Binder 代码各自演化。
 *
 * 与窗口的区别：遮罩没有 payload、没有 openOpt、没有导航栈语义，
 * 因此只保留「被打开/被 UI 接管/被关闭」这些由状态机驱动的节点。
 */
export abstract class BaseMask extends BaseUI implements IUILifecycleInvoker {
    /** 绑定数据，由 UIManager 在创建遮罩时赋值。 */
    public uiVo: UIVo | null = null;

    /** 当前动画阶段，由动画控制器维护，业务不要写它。 */
    public animState: EUIAnimState = EUIAnimState.None;

    public get uiType(): EUIType {
        return EUIType.Mask;
    }

    /**
     * 由 UIManager 在创建后调用（C# 的 Init）。
     *
     * 这里顺带兜底赋值 uiVo：C# 是先赋值再调 Init，TS 侧调用方可能只调 Init 不赋值；
     * 两处都做不会有害，漏掉任何一处才会让遮罩拿不到归属信息。
     * 子类若覆写，请调用 super.init(uiVo)。
     */
    public init(uiVo: UIVo): void {
        this.uiVo = uiVo;
    }

    /** 登记事件订阅；调用前框架已 resetBindings 清过账。 */
    public initEvent(): void {
        // 默认无事可做：没有订阅的遮罩不需要写空实现。
    }

    /**
     * 取本界面归属功能的门面。
     * 与 BaseWin 同一套语义，只是错误文案按遮罩措辞，方便从日志直接定位是哪一侧出的问题。
     */
    protected facade<T>(ctor: new (...args: never[]) => T): T {
        const vo = this.uiVo;
        if (vo === null || !vo.ownerModId) {
            throw new Error('遮罩尚未绑定 UIVo，无法解析归属门面。');
        }

        const resolved: unknown = vo.manager.resolveUiFacade(vo.ownerModId);
        if (resolved === null || resolved === undefined) {
            throw new Error(`遮罩取门面失败：功能 '${vo.ownerModId}' 未提供门面。`);
        }

        if (!(resolved instanceof ctor)) {
            const actualName =
                (resolved as unknown as { constructor?: { name?: string } }).constructor?.name ?? typeof resolved;
            const expectedName = (ctor as unknown as { name?: string }).name ?? '未知类型';
            throw new Error(
                `遮罩取门面类型不匹配：功能 '${vo.ownerModId}' 提供的是 ${actualName}，期望 ${expectedName}。`,
            );
        }

        return resolved as T;
    }

    // ---- 遮罩生命周期钩子：给业务覆写，默认实现对应 C# 的同名虚方法 ----

    /** 遮罩开始显示。 */
    protected onOpen(): void {
        // 默认无事可做。
    }

    /** 遮罩随窗口一起出现（窗口内容已就绪）。 */
    protected onUIOpen(): void {
        // 默认无事可做。
    }

    /**
     * 播放遮罩打开动画。
     * 返回值是取消句柄，语义同 BaseWin.onOpenAnim。
     */
    protected onOpenAnim(done: () => void): (() => void) | null {
        done();
        return null;
    }

    /** 遮罩打开动画播完。 */
    protected onOpenAnimDone(): void {
        // 默认无事可做。
    }

    /** 遮罩开始收起（关闭动画阶段，此时窗口节点还在）。 */
    protected onClose(): void {
        // 默认无事可做。
    }

    /** 窗口关闭动画已结束，遮罩即将隐藏。 */
    protected onUIClose(): void {
        // 默认无事可做。
    }

    /** 播放遮罩关闭动画，返回值语义同 onOpenAnim。 */
    protected onCloseAnim(done: () => void): (() => void) | null {
        done();
        return null;
    }

    /** 界面被销毁前的最后一次回调；适合在这里归还从功能门面拿到的临时资源。 */
    protected onUIDestroy(): void {
        // 默认无事可做。
    }

    // ---- 生命周期调用器：给框架调，业务不要覆写 ----

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

    /**
     * 层级可见性变化。
     * 空实现而非转调钩子：遮罩本身就是「不参与可见性刷新」的视觉层，
     * 保留方法是为了让状态机可以对 win/mask 一视同仁地调用。
     */
    public invokeLayerVisibleUpdate(): void {
        // 遮罩不响应层级可见性变化。
    }

    public invokeMaskOpen(): void {
        this.onOpen();
    }

    public invokeMaskUIOpen(): void {
        this.onUIOpen();
    }

    public invokeMaskOpenAnim(done: () => void): (() => void) | null {
        return this.onOpenAnim(done);
    }

    public invokeMaskOpenAnimDone(): void {
        this.onOpenAnimDone();
    }

    public invokeMaskCloseAnim(done: () => void): (() => void) | null {
        return this.onCloseAnim(done);
    }

    public invokeMaskClose(): void {
        this.onClose();
    }

    public invokeMaskUIClose(): void {
        this.onUIClose();
    }

    public invokeMaskUIDestroy(): void {
        this.onUIDestroy();
    }
}
