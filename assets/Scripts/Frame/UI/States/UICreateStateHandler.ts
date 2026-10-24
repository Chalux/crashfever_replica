import type { IStateHandler } from '../../StateMachine/StateMachine';
import { EUIState } from '../Def/EUIState';
import type { IUIStateContext } from '../IUIStateContext';

/**
 * 创建：首次打开时把界面挂到层级上，并调用业务的 onCreate。
 *
 * 挂载放在这里而不是 Open：Create 只会发生一次，Open 可能在「已打开状态下再次 open」时重复进入。
 */
export class UICreateStateHandler implements IStateHandler<EUIState, IUIStateContext> {
    public readonly state: EUIState = EUIState.Create;

    public onEnter(from: EUIState | null, context: IUIStateContext): void {
        const vo = context.vo;
        vo.lifecycle.createTime = Date.now();

        const mask = vo.runtime.mask;
        if (mask) {
            mask.uiVo = vo;
            mask.init(vo);
        }

        vo.runtime.addToNode();

        vo.runtime.ui?.invokeCreate();

        // onCreate 里可能已经把界面关掉/重开，状态变了就不要再往下推。
        if (vo.stateMachine.currentState !== EUIState.Create) return;

        vo.stateMachine.transitionTo(EUIState.Open, context);
    }
}
