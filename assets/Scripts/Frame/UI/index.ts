/**
 * UI 框架的公共出口。
 *
 * 业务代码只从 'Frame/UI'（或相对路径 './Frame/UI'）导入，不直接进子目录，
 * 这样内部文件重组不会波及业务；只有想替换某个状态处理器时才需要深入 States/。
 */

// 门面与驱动
export { UIManager } from './UIManager';
export type { UIManagerInitOptions } from './UIManager';
export { UIManagerTicker } from './UIManagerTicker';
export { createDefaultStateHandlers } from './DefaultStateHandlers';
export { UIEvent, UIOpenPayload, UIClosePayload } from './UIEvents';

// 运行时对象
export { UIVo } from './UIVo';
export { UIVoRegistry } from './UIVoRegistry';
export { UIRuntimeData } from './UIRuntimeData';
export { UILifecycleState } from './UILifecycleState';
export { UILoadContext } from './UILoadContext';
export { UIAnimController } from './UIAnimController';
export { UILayer } from './UILayer';
export { UILayerManager } from './UILayerManager';
export { UIStack } from './UIStack';
export { UIOpenCoordinator } from './UIOpenCoordinator';
export { OpenRequest } from './OpenRequest';

// 路由
export { UIRuntimeRegistry } from './UIRuntimeRegistry';
export { UIRuntimeEntry } from './UIRuntimeEntry';
export { UIRegistration } from './UIRegistration';

// 订阅与工具
export { BindingScope } from './BindingScope';
export * from './BindingScopeSignals';
export { FitScaleBox } from './FitScaleBox';
export { FitScaleMath } from './FitScaleMath';
export { UIResourceLoader } from './UIResourceLoader';
export { findBaseWin, findBaseMask } from './Base/UIComponentLookup';
export type { IUiFacadeProvider } from './IUiFacadeProvider';
export type { IUIStateContext } from './IUIStateContext';

// 基类
export { BaseUI } from './Base/BaseUI';
export { BaseWin } from './Base/BaseWin';
export { BaseMask } from './Base/BaseMask';
export { BaseCmp } from './Base/BaseCmp';
export { BaseDlg } from './Base/BaseDlg';
export { BasePge } from './Base/BasePge';
export { BasePop } from './Base/BasePop';
export type { IUILifecycleInvoker } from './Base/IUILifecycleInvoker';

// 枚举与参数
export * from './Def/EAnimType';
export * from './Def/EUIAlign';
export * from './Def/EUIAnimState';
export * from './Def/EUIEvent';
export * from './Def/EUILayer';
export * from './Def/EUIState';
export * from './Def/EUIType';
export * from './Def/UIConsts';
export * from './Def/UIOpenOpt';
export * from './Def/DefaultUIOpenOpt';
export * from './Def/OpenTransitionData';
export * from './Def/UiId';
export type { IUIMeta } from './Def/IUIMeta';
export type { IUIPayloadHandle } from './Def/IUIPayloadHandle';
export type { IUIVoHandle } from './Def/IUIVoHandle';
export type { EmptyPayload } from './Def/EmptyPayload';
export * from './Def/UIStateTags';

// 状态处理器（替换/装饰时才用）
export { UILoadStateHandler } from './States/UILoadStateHandler';
export { UIPreLoadStateHandler } from './States/UIPreLoadStateHandler';
export { UICreateStateHandler } from './States/UICreateStateHandler';
export { UIOpenStateHandler } from './States/UIOpenStateHandler';
export { UICloseStateHandler } from './States/UICloseStateHandler';
export { UICloseDoneStateHandler } from './States/UICloseDoneStateHandler';
export { UIDestroyStateHandler } from './States/UIDestroyStateHandler';
