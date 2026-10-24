/** 打开/关闭界面动画策略。 */
export enum EAnimType {
    /** 不播放动画。 */
    None,
    /** 每次打开都播放。 */
    Always,
    /** 已经打开过的界面再次打开时跳过动画。 */
    SkipReOpen,
}
