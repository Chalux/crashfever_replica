/**
 * UI 异步加载上下文（移植自 UILoadContext.cs）。
 *
 * C# 版用 CancellationTokenSource 真正中止加载；Cocos 的 resources.load 一旦发起
 * 就无法取消，所以这里退化成「轮次标记」：
 * - loadFlag / preLoadFlag 每次新请求或取消都自增，异步回调回来时与快照比对即可判断过期；
 * - cancelled 只是给需要提前 short-circuit 的业务回调看的布尔量，真正的权威判据仍是 flag。
 */
export class UILoadContext {
    /** 当前加载轮次；每次开始/取消都会自增。 */
    public loadFlag = 0;

    /** 当前预加载轮次；用于让 OnPreLoad 的 done/fail 只生效一次。 */
    public preLoadFlag = 0;

    /** 本轮是否成功加载了遮罩 prefab（决定 scenes[1] 是否是遮罩）。 */
    public hasMaskLoaded = false;

    /**
     * 当前这一轮加载是否已取消。
     *
     * 语义对应 C# 的 LoadToken.IsCancellationRequested：beginRequest() 会把它复位为 false
     * （新请求开启），cancel() 置为 true（关闭 / 销毁）。
     */
    public cancelled = false;

    /**
     * 同一 VO 开始新请求：先让旧回调失效，再开启新一轮。
     *
     * 顺序与 C# 一致（先 Increment 两个 flag，再换新的 token）：旧回调醒来时
     * 看到的 loadFlag 一定与它启动时不同，因此不会把过期结果写进新一轮状态。
     */
    public beginRequest(): void {
        this.incrementLoadFlag();
        this.incrementPreLoadFlag();
        this.cancelled = false;
    }

    /** 取消当前请求：自增两轮 flag，并标记 cancelled。 */
    public cancel(): void {
        this.incrementLoadFlag();
        this.incrementPreLoadFlag();
        this.cancelled = true;
    }

    public incrementLoadFlag(): number {
        return ++this.loadFlag;
    }

    public incrementPreLoadFlag(): number {
        return ++this.preLoadFlag;
    }
}
