/** 框架级常量。 */
export class UIConsts {
    /** Load / PreLoad 阶段的超时（毫秒）：兜住业务 OnPreLoad 不回调 done/fail 的情况。 */
    public static readonly UI_LOAD_TIMEOUT_MS = 10_000;

    /** Close 阶段的超时（毫秒）：关闭动画的 done 永不来时强制进入 CloseDone。 */
    public static readonly UI_CLOSE_TIMEOUT_MS = 5_000;
}
