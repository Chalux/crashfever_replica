/**
 * UI 生命周期状态。
 *
 * 顺序即推进顺序：Wait -> Load -> PreLoad -> Create -> Open -> Close -> CloseDone -> Cache -> Destroy。
 * UIVo 的 isOpen / isClose 用的是显式枚举集合，不依赖本枚举的数值顺序。
 */
export enum EUIState {
    Wait,
    Load,
    PreLoad,
    Create,
    Open,
    Close,
    CloseDone,
    Cache,
    Destroy,
}
