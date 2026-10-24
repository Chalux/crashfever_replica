/**
 * UI 层级的逻辑顺序。
 *
 * 数组顺序 = 从下到上，UILayerManager 依此创建节点并决定 siblingIndex；
 * 新增层级请追加到末尾，不要插在中间（历史节点的 z 序会整体错位）。
 */
export enum EUILayer {
    Win,
    Dlg,
    Loading,
    Pop,
    Guide,
    Debug,
    Notice,
}
