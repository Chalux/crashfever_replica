import { EUIState } from './Def/EUIState';
import { UIConsts } from './Def/UIConsts';
import type { UIManager } from './UIManager';
import type { UIVo } from './UIVo';

/**
 * UI 打开协调器（移植自 UIOpenCoordinator.cs）。
 *
 * 串行化打开流程：同一时刻只允许一个界面处于 Load / PreLoad，
 * 其余请求排队；前一个进入 Open 后立即推进下一个。
 * Pop / Pge 不走这里（UIManager 直接 transitionTo(Load)），因为它们要立刻挂到父节点。
 */
export class UIOpenCoordinator {
    /** 等待打开的队列（FIFO）。用数组 + shift 模拟 Queue。 */
    private openQueue: UIVo[] = [];
    private currOpening: UIVo | null = null;
    private readonly manager: UIManager;

    constructor(manager: UIManager) {
        this.manager = manager;
    }

    public get currentOpening(): UIVo | null {
        return this.currOpening;
    }

    /**
     * 入队并尝试立即打开。
     *
     * 去重方式与 C# 完全一致：先把队列整个取出、跳过同一个 vo，再把 vo 追加到队尾。
     * 效果是「重复打开同一界面 = 把它移到队尾并重置为本次请求」，而不是留两份。
     */
    public enqueueOpen(vo: UIVo): void {
        const pending = this.openQueue;
        this.openQueue = [];
        for (const item of pending) {
            if (item !== vo) this.openQueue.push(item);
        }

        // 同一个 vo 正在打开中：视为「本次请求重新开始」，先解除当前占用。
        if (this.currOpening === vo) this.currOpening = null;

        this.openQueue.push(vo);
        this.openNext();
    }

    /**
     * 推进队列。
     *
     * 若当前打开项还在 Load / PreLoad，必须等待（否则会并发加载两个界面）；
     * 其它状态（Create / Open / Close / Destroy …）都视为「已让出串行位」，清空后继续。
     * 用递归而不是循环清空，是为了保持与 C# 版完全一致的执行顺序。
     */
    public openNext(): void {
        if (this.currOpening) {
            const state = this.currOpening.stateMachine.currentState;
            switch (state) {
                case EUIState.Load:
                case EUIState.PreLoad:
                    return;
                default:
                    this.currOpening = null;
                    this.openNext();
                    return;
            }
        }

        while (this.openQueue.length > 0) {
            const vo = this.openQueue.shift();
            if (!vo) return;
            // 已销毁的请求直接丢弃，不能让它把队列卡住。
            if (vo.stateMachine.currentState === EUIState.Destroy) continue;

            this.currOpening = vo;
            vo.stateMachine.transitionTo(EUIState.Load, vo);
            return;
        }
    }

    /** 从队列移除指定 VO（关闭 / 销毁时调用）；同样用「取出重建」而不是 splice 查找。 */
    public removeFromQueue(vo: UIVo): void {
        const pending = this.openQueue;
        this.openQueue = [];
        for (const item of pending) {
            if (item !== vo) this.openQueue.push(item);
        }
    }

    /**
     * 加载超时看门狗：兜住 OnPreLoad 不回调 done/fail（或资源加载卡死）的情况。
     *
     * 超时后强制 Destroy（Destroy handler 会从队列 / 注册表清理并回调失败）。
     */
    public checkLoadTimeout(): void {
        const opening = this.currOpening;
        if (!opening) return;

        const state = opening.stateMachine.currentState;
        if (state !== EUIState.Load && state !== EUIState.PreLoad) return;

        if (opening.lifecycle.loadTime === 0) return;

        const now = Date.now();
        if (now - opening.lifecycle.loadTime > UIConsts.UI_LOAD_TIMEOUT_MS) {
            const timedOut = opening;
            timedOut.stateMachine.transitionTo(EUIState.Destroy, timedOut);
            this.resetCurrentOpening(timedOut);
            this.openNext();
        }
    }

    /** 仅当 vo 仍是当前打开项时才清空（避免误清掉后来者）。 */
    public resetCurrentOpening(vo: UIVo): void {
        if (this.currOpening === vo) this.currOpening = null;
    }
}
