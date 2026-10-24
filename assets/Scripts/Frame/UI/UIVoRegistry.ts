import type { IStateHandler } from '../StateMachine/StateMachine';
import { Log } from '../Log/Log';
import { EUIState } from './Def/EUIState';
import type { EUIType } from './Def/EUIType';
import { UIConsts } from './Def/UIConsts';
import type { IUIStateContext } from './IUIStateContext';
import type { UIManager } from './UIManager';
import { UIVo } from './UIVo';

/**
 * UIVo 注册表（移植自 UIVoRegistry.cs）。
 *
 * 管理 UIVo 的创建、查找、移除，以及两个后台兜底：
 * - 关闭超时看门狗（Close 状态卡死时强制 CloseDone）；
 * - 缓存到期销毁（Cache 状态超过 DestroyTime 时转 Destroy）。
 *
 * 这两个兜底都必须容忍「遍历过程中 map 被同步修改」，所以 tick 一律先快照。
 */
export class UIVoRegistry {
    private readonly _map = new Map<string, UIVo>();
    private readonly handlers: ReadonlyArray<IStateHandler<EUIState, IUIStateContext>>;
    private readonly manager: UIManager;

    /** 缓存检查节流累加器（秒）。C# 版是每 1 秒检查一次，而不是每帧。 */
    private cacheCheckAccumulator = 0;

    constructor(manager: UIManager, handlers: ReadonlyArray<IStateHandler<EUIState, IUIStateContext>>) {
        this.manager = manager;
        this.handlers = handlers;
    }

    /** 只读视图（调试 / 查询用）；批量操作请先 snapshot()。 */
    public get map(): ReadonlyMap<string, UIVo> {
        return this._map;
    }

    /**
     * 取出当前全部 VO 的快照。
     *
     * UIManager 的批量关闭必须基于快照：Close → Destroy 会在遍历中同步从本表删除条目，
     * 直接遍历 Map 会漏项或读到半销毁状态。
     */
    public snapshot(): UIVo[] {
        return Array.from(this._map.values());
    }

    public getOrCreate(id: string, type: EUIType, ownerModId: string, payload: unknown): UIVo {
        const existing = this._map.get(id);
        if (existing) {
            // 复用同一个 VO：载荷以本次打开为准，状态机与时间戳保持不变。
            existing.payload = payload;
            return existing;
        }

        const vo = new UIVo(id, type, ownerModId, payload, this.manager, this.handlers);
        this._map.set(id, vo);
        return vo;
    }

    public get(id: string): UIVo | null {
        return this._map.get(id) ?? null;
    }

    public remove(id: string): void {
        this._map.delete(id);
    }

    /**
     * 每帧驱动。
     *
     * @param delta 距上一帧的秒数。
     *
     * 1 秒节流：缓存过期与关闭超时都是「秒级」兜底，没必要每帧扫全表。
     */
    public tick(delta: number): void {
        this.cacheCheckAccumulator += delta;
        if (this.cacheCheckAccumulator < 1) return;
        // 与 C# 一致：直接归零而不是减去 1，避免卡顿后连续补跑。
        this.cacheCheckAccumulator = 0;

        const now = Date.now();
        // 快照：强制流转 / 销毁会同步修改 _map（Destroy handler 里 remove），不能边枚举边改。
        const snapshot = Array.from(this._map.values());
        for (const vo of snapshot) this.forceCloseTimeout(vo, now);
        for (const vo of snapshot) this.destroyExpiredCache(vo, now);
    }

    /**
     * 关闭超时看门狗。
     *
     * OnCloseAnim 的 done 永不回调（Tween 被 kill / 节点离树 / 业务漏调）时，
     * VO 会永久停在 Close（isOpen=false、isClose=true，既不会被缓存回收，也进不了批量关闭），
     * 这里兜底推进到 CloseDone。
     */
    private forceCloseTimeout(vo: UIVo, now: number): void {
        if (vo.stateMachine.currentState !== EUIState.Close) return;
        if (vo.lifecycle.closeStartTime === 0) return;

        const elapsed = now - vo.lifecycle.closeStartTime;
        if (elapsed <= UIConsts.UI_CLOSE_TIMEOUT_MS) return;

        Log.error(`UI 管理器: 关闭UI<${vo.id}> 超时（${elapsed}ms），强制进入关闭完成。`, 'UI');
        vo.stateMachine.transitionTo(EUIState.CloseDone, vo);
    }

    private destroyExpiredCache(vo: UIVo, now: number): void {
        if (vo.stateMachine.currentState !== EUIState.Cache) return;
        // -1 表示永久缓存。
        if (vo.lifecycle.destroyTime === -1 || now < vo.lifecycle.destroyTime) return;

        // 二次校验：期间可能已被销毁，或同名 id 已重建为另一个 VO。
        // 不做这个校验会把新 VO 误销毁（旧快照里的 vo 只是同 id 的僵尸）。
        const current = this._map.get(vo.id);
        if (!current || current !== vo) return;

        vo.stateMachine.transitionTo(EUIState.Destroy, vo);
    }
}
