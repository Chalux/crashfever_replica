import type { IStateHandler } from '../StateMachine/StateMachine';
import { EUIState } from './Def/EUIState';
import type { IUIStateContext } from './IUIStateContext';
import { UICloseDoneStateHandler } from './States/UICloseDoneStateHandler';
import { UICloseStateHandler } from './States/UICloseStateHandler';
import { UICreateStateHandler } from './States/UICreateStateHandler';
import { UIDestroyStateHandler } from './States/UIDestroyStateHandler';
import { UILoadStateHandler } from './States/UILoadStateHandler';
import { UIOpenStateHandler } from './States/UIOpenStateHandler';
import { UIPreLoadStateHandler } from './States/UIPreLoadStateHandler';

/**
 * 默认的状态处理器集合。
 *
 * 顺序与状态机的「推进顺序」一致，便于对照阅读；实际注册是按 state 查表，顺序不影响行为。
 * 业务可以在初始化时整体替换（UIManagerInitOptions.stateHandlers），比如插入埋点用的装饰器。
 */
export function createDefaultStateHandlers(): IStateHandler<EUIState, IUIStateContext>[] {
    return [
        new UILoadStateHandler(),
        new UIPreLoadStateHandler(),
        new UICreateStateHandler(),
        new UIOpenStateHandler(),
        new UICloseStateHandler(),
        new UICloseDoneStateHandler(),
        new UIDestroyStateHandler(),
    ];
}
