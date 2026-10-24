/**
 * 状态处理器。
 *
 * 与 C# 版一致：OnEnter 收到「来源状态」与上下文，OnExit 只收到目标状态。
 * 处理器通常实现为无状态单例，真正可变的运行时数据放在上下文（如 UIVo）里。
 */
export interface IStateHandler<S, C> {
    readonly state: S;

    onEnter(from: S | null, context: C, data?: unknown): void;

    onExit?(to: S, context: C): void;
}

type EnterFunc<S, C> = (from: S | null, context: C, data?: unknown) => void;
type ExitFunc<S, C> = (to: S, context: C) => void;

interface StateConfig<S, C> {
    onEnter: EnterFunc<S, C>;
    onExit: ExitFunc<S, C> | null;
}

/**
 * 极简状态机（移植自 kemo_card 的 StateMachine）。
 *
 * 刻意不做迁移表校验：UI 状态流转是「单向推进 + 异常时强制 Destroy」的语义，
 * 迁移表反而会把「任意状态都可以被打断进 Destroy」这条兜底逻辑挡住。
 *
 * 注意：切换顺序是「先执行旧状态的 OnExit，再改 currentState，最后执行新状态的 OnEnter」，
 * 与 C# 版完全一致；OnEnter 里可以安全地读取 currentState 判断自己是否已被后续流转取代。
 */
export class StateMachine<S extends number, C> {
    private readonly configs = new Map<S, StateConfig<S, C>>();
    private _currentState: S;

    constructor(initialState: S = 0 as S) {
        this._currentState = initialState;
    }

    public get currentState(): S {
        return this._currentState;
    }

    public configure(state: S, onEnter: EnterFunc<S, C>, onExit?: ExitFunc<S, C> | null): void {
        this.configs.set(state, { onEnter, onExit: onExit ?? null });
    }

    public registerHandlers(handlers: ReadonlyArray<IStateHandler<S, C>>): void {
        for (const handler of handlers) {
            this.configure(handler.state, (from, context, data) => handler.onEnter(from, context, data),
                handler.onExit ? (to, context) => handler.onExit!(to, context) : null);
        }
    }

    /**
     * 流转到目标状态。
     *
     * 目标状态没有处理器是合法的：Cache 这类「停驻态」只记录状态、不执行动作，
     * 与 C# 版一致（C# 的 TransitionTo 无论有没有配置都会改 currentState）。
     * 早期实现把「未注册」当错误并忽略流转，导致界面永远进不了 Cache——
     * 缓存重开、缓存到期销毁、Owner 卸载这三条链路会一起失效。
     */
    public transitionTo(targetState: S, context: C, data?: unknown): void {
        const previousState = this._currentState;
        const previous = this.configs.get(previousState);

        // 与 C# 一致：先改状态再触发 OnExit，OnExit 里读到的是目标状态。
        this._currentState = targetState;
        previous?.onExit?.(targetState, context);

        this.configs.get(targetState)?.onEnter(previousState, context, data);
    }

    /** 重新触发当前状态的 OnEnter（用于「重进」语义）。 */
    public enter(from: S | null, context: C, data?: unknown): void {
        const config = this.configs.get(this._currentState);
        config?.onEnter(from, context, data);
    }

    public clearState(): void {
        this._currentState = 0 as S;
    }
}
