import type { IStateHandler } from '../StateMachine/StateMachine';
import { StateMachine } from '../StateMachine/StateMachine';
import type { BaseMask } from './Base/BaseMask';
import type { BaseWin } from './Base/BaseWin';
import { DefaultUIOpenOpt } from './Def/DefaultUIOpenOpt';
import { EUIState } from './Def/EUIState';
import type { EUIType } from './Def/EUIType';
import type { IUIVoHandle } from './Def/IUIVoHandle';
import type { UIOpenOpt } from './Def/UIOpenOpt';
import type { IUIStateContext } from './IUIStateContext';
import type { OpenRequest } from './OpenRequest';
import { UIAnimController } from './UIAnimController';
import { UILoadContext } from './UILoadContext';
import { UILifecycleState } from './UILifecycleState';
import type { UILayer } from './UILayer';
import type { UIManager } from './UIManager';
import { UIRuntimeData } from './UIRuntimeData';

/**
 * 界面数据（移植自 UIVo.cs）：一个界面从打开到销毁的全部可变状态。
 *
 * 它是组合容器而不是巨型类：生命周期时间戳、运行时节点引用、加载上下文、动画控制
 * 分别放在 Lifecycle / Runtime / Load / Anim 四个子对象里。
 *
 * 同时实现 IUIStateContext，所以状态机流转时直接把 vo 当上下文传即可。
 */
export class UIVo implements IUIStateContext, IUIVoHandle {
    /** 界面状态机（状态处理器在构造时注册）。 */
    public readonly stateMachine: StateMachine<EUIState, IUIStateContext> = new StateMachine<EUIState, IUIStateContext>();

    /** 界面 id（路由 id）。 */
    public readonly id: string;

    /** 归属功能 Mod 的 id：界面只允许通过它取自己功能的门面（ui-mod-binding 规格 §5.4）。 */
    public readonly ownerModId: string;

    /** 界面类型。 */
    public readonly type: EUIType;

    /** 打开时传入的载荷。 */
    public payload: unknown;

    /** 本轮打开参数；UIManager 合并完成后会写回这里，状态处理器统一读它。 */
    public openOpt: UIOpenOpt;

    /** 所属管理器。 */
    public readonly manager: UIManager;

    /** 生命周期时间戳。 */
    public readonly lifecycle: UILifecycleState = new UILifecycleState();

    /** 运行时引用（界面节点、遮罩、层级）。 */
    public readonly runtime: UIRuntimeData;

    /** 异步加载上下文。 */
    public readonly load: UILoadContext = new UILoadContext();

    /** 动画管理。 */
    public readonly anim: UIAnimController = new UIAnimController();

    /**
     * 本次打开的等待凭据。
     *
     * 对应 C# 的 TaskCompletionSource：被后续请求取代 / 失败 / 销毁时都会 CompleteOpen(null)。
     */
    public openTaskSource: OpenRequest | null = null;

    constructor(
        id: string,
        type: EUIType,
        ownerModId: string,
        payload: unknown,
        manager: UIManager,
        handlers: ReadonlyArray<IStateHandler<EUIState, IUIStateContext>>,
        openOpt?: UIOpenOpt | null,
    ) {
        // 对应 C# 的 ArgumentException.ThrowIfNullOrWhiteSpace：归属是必填项，
        // 缺失时允许界面打开会让「按功能关闭 / 门面解析」全部失效，必须在构造时就失败。
        if (!ownerModId || ownerModId.trim().length === 0) {
            throw new Error(`UI<${id}> 创建失败：ownerModId 不能为空，每个界面必须声明归属功能 Mod`);
        }

        this.id = id;
        this.ownerModId = ownerModId;
        this.type = type;
        this.payload = payload;
        this.manager = manager;

        // 必须克隆：UIOpenOpt 是可变对象，直接持有调用点实例会让后续 merge 污染调用方，
        // 也会让 DefaultUIOpenOpt.value 这个静态共享基线被就地改写。
        this.openOpt = openOpt ? openOpt.clone() : DefaultUIOpenOpt.value.clone();

        this.runtime = new UIRuntimeData(this);

        // registerHandlers 内部会包一层箭头函数，避免 handler 作为裸方法传递时丢失 this。
        this.stateMachine.registerHandlers(handlers);
    }

    /** 界面节点（委托到 runtime）。 */
    public get ui(): BaseWin | null {
        return this.runtime.ui;
    }

    public set ui(value: BaseWin | null) {
        this.runtime.ui = value;
    }

    /** 遮罩（委托到 runtime）。 */
    public get mask(): BaseMask | null {
        return this.runtime.mask;
    }

    public set mask(value: BaseMask | null) {
        this.runtime.mask = value;
    }

    /** 所在层级（委托到 runtime）。 */
    public get layer(): UILayer | null {
        return this.runtime.layer;
    }

    public set layer(value: UILayer | null) {
        this.runtime.layer = value;
    }

    /** 当前状态机的 VO 本体（IUIStateContext 要求）。 */
    public get vo(): UIVo {
        return this;
    }

    /**
     * 是否处于「已打开」状态（Create / Open）。
     *
     * 显式枚举而非枚举区间：区间依赖 EUIState 的声明顺序，插值即静默改语义。
     */
    public get isOpen(): boolean {
        const state = this.stateMachine.currentState;
        return state === EUIState.Create || state === EUIState.Open;
    }

    /**
     * 是否已进入关闭流程（Close / CloseDone / Cache / Destroy），
     * 即幂等的「不再视为打开」。
     */
    public get isClose(): boolean {
        const state = this.stateMachine.currentState;
        return state === EUIState.Close
            || state === EUIState.CloseDone
            || state === EUIState.Cache
            || state === EUIState.Destroy;
    }

    /**
     * 结束本次打开的等待。
     *
     * @param result 成功时为 vo，失败 / 被取代 / 销毁时为 null。
     * @param source 指定要结束的凭据；缺省用当前 openTaskSource。
     *
     * 只有「当前凭据」被结束时才清空 openTaskSource：旧凭据延迟收尾不能把新请求的凭据抹掉。
     * OpenRequest 自身保证重复 resolve 只生效一次。
     */
    public completeOpen(result: UIVo | null, source?: OpenRequest | null): void {
        const request = source ?? this.openTaskSource;
        if (this.openTaskSource === request) {
            this.openTaskSource = null;
        }
        request?.resolve(result);
    }

    /** 让协调器推进到队列里的下一个界面。 */
    public openNext(): void {
        this.manager.openNext();
    }
}
