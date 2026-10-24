/**
 * 状态机流转时传递的强类型数据，替代魔法字符串。
 *
 * 用于 UILoadStateHandler -> UIOpenStateHandler 等链路中传递「打开语义」：
 * 首次打开、缓存重开、关闭后重开，三者在动画与挂载策略上不同。
 */
export class OpenTransitionData {
    /** 是否重新打开（已打开过的 UI 再次打开）。 */
    public readonly isReopen: boolean;

    /** 是否为关闭后重新打开（CloseDone/Cache -> 重新打开）。 */
    public readonly isCloseOpen: boolean;

    private constructor(isReopen: boolean, isCloseOpen: boolean) {
        this.isReopen = isReopen;
        this.isCloseOpen = isCloseOpen;
    }

    /** 首次打开。 */
    public static get firstOpen(): OpenTransitionData {
        return new OpenTransitionData(false, false);
    }

    /** 通过缓存路径重新打开。 */
    public static get reopen(): OpenTransitionData {
        return new OpenTransitionData(true, false);
    }

    /** 关闭后重新打开。 */
    public static get closeOpen(): OpenTransitionData {
        return new OpenTransitionData(true, true);
    }

    public static isTransitionData(value: unknown): value is OpenTransitionData {
        return value instanceof OpenTransitionData;
    }
}
