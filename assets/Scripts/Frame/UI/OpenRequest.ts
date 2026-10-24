import type { UIVo } from './UIVo';

/**
 * 一次打开请求的等待凭据（对应 C# 的 TaskCompletionSource<UIVo?>）。
 *
 * 只有第一次 resolve 生效；重复打开同一界面时，旧请求会被 CompleteOpen(null)
 * 提前以 null 收尾，调用方据此知道「这次打开被新的请求取代了」。
 */
export class OpenRequest {
    /**
     * Promise 的 resolve 句柄。
     *
     * 刻意不写 readonly：它只能在 Promise 构造器里拿到，而 TS 不把
     * 「构造器内箭头函数里的赋值」当成构造期初始化（TS2540）。
     */
    private resolvePromise: (vo: UIVo | null) => void = () => undefined;
    private resolved = false;

    public readonly promise: Promise<UIVo | null>;

    constructor() {
        this.promise = new Promise<UIVo | null>((resolve) => {
            this.resolvePromise = resolve;
        });
    }

    public get settled(): boolean {
        return this.resolved;
    }

    public resolve(vo: UIVo | null): void {
        if (this.resolved) return;
        this.resolved = true;
        this.resolvePromise(vo);
    }
}
