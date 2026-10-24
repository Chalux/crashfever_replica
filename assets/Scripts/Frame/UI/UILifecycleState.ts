/**
 * UI 生命周期时间戳（移植自 UILifecycleState.cs）。
 *
 * 所有时间都是 Date.now() 的毫秒时间戳，0 表示「该阶段尚未发生」。
 * 单独拆出来只承担「记录」，超时判定放在 UIVoRegistry（关闭超时 / 缓存到期）
 * 与 UIOpenCoordinator（加载超时）里，避免 UIVo 膨胀。
 */
export class UILifecycleState {
    /** Load 状态开始时刻。 */
    public loadTime = 0;

    /** Create 状态开始时刻。 */
    public createTime = 0;

    /** Open 状态开始时刻。 */
    public openTime = 0;

    /**
     * 开始关闭的时刻（进入 Close 状态），用于关闭超时看门狗。
     *
     * 注意它与 closeTime 的区别：关闭动画可能很久甚至永远不回调，
     * 因此「关闭开始」必须单独记账，不能等到 CloseDone 才写。
     */
    public closeStartTime = 0;

    /** 关闭完成的时刻（进入 CloseDone）；只在此处写入一次。 */
    public closeTime = 0;

    /**
     * 缓存到期销毁时刻；-1 表示永久缓存（对应 C# 的 DestroyTime == -1 判定）。
     * 普通缓存写入 closeTime + effectiveCacheTime，不缓存时写入 closeTime。
     */
    public destroyTime = 0;
}
