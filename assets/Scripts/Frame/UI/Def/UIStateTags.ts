/**
 * 状态机流转时传递的标签常量，替代魔法字符串。
 *
 * 目前用 OpenTransitionData 承载，这里保留给需要在日志/工具里比对字符串的场景。
 */
export class UIStateTags {
    public static readonly Reopen = 'reopen';
    public static readonly CloseOpen = 'closeOpen';
}
