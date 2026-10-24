/** 界面类型，决定默认打开参数与可用的打开方式。 */
export enum EUIType {
    /** 挂在其它界面里的局部组件，不由 UIManager 路由。 */
    Cmp,
    /** 全屏窗口，默认 HideBelow = true，会进入导航栈。 */
    Win,
    /** 对话框，默认叠在 Dlg 层。 */
    Dlg,
    /** 页面，必须由 OpenChildAsync 指定父节点挂载。 */
    Pge,
    /** 气泡/浮层，必须指定 Pop.Target。 */
    Pop,
    /** 遮罩场景，由 BaseMask 承载。 */
    Mask,
}
