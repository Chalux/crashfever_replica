import type { IStateHandler } from '../../StateMachine/StateMachine';
import { EUIState } from '../Def/EUIState';
import type { IUIStateContext } from '../IUIStateContext';
import { UIManager } from '../UIManager';
import { UIClosePayload, UIEvent } from '../UIEvents';

/**
 * 关闭完成：回调业务 onClose、离树，然后按 cacheTime 决定「进缓存」还是「销毁」。
 *
 * cacheTime 语义：-1 永久缓存；> 0 缓存 N 毫秒后被实例池回收；0 立即销毁。
 */
export class UICloseDoneStateHandler implements IStateHandler<EUIState, IUIStateContext> {
    public readonly state: EUIState = EUIState.CloseDone;

    public onEnter(from: EUIState | null, context: IUIStateContext): void {
        const vo = context.vo;
        const manager = context.manager;

        vo.lifecycle.closeTime = Date.now();

        UIManager.invokeCallback(vo.runtime.ui ? () => vo.runtime.ui!.invokeClose() : null, vo.id, '关闭回调');
        UIManager.invokeCallback(vo.runtime.mask ? () => vo.runtime.mask!.invokeMaskUIClose() : null, vo.id, '遮罩界面关闭回调');

        // onClose 里可能已经重开了这个界面，状态变了就不能再按「关闭完成」处理。
        if (vo.stateMachine.currentState !== EUIState.CloseDone) return;

        vo.runtime.removeFromNode();

        const cacheTime = vo.openOpt.effectiveCacheTime;
        if (cacheTime === -1) {
            vo.lifecycle.destroyTime = -1;
            vo.stateMachine.transitionTo(EUIState.Cache, context);
        } else if (cacheTime > 0) {
            vo.lifecycle.destroyTime = vo.lifecycle.closeTime + cacheTime;
            vo.stateMachine.transitionTo(EUIState.Cache, context);
        } else {
            vo.lifecycle.destroyTime = vo.lifecycle.closeTime;
            vo.stateMachine.transitionTo(EUIState.Destroy, context);
        }

        manager.updateLayers();
        manager.eventDispatcher.send(UIEvent.close, new UIClosePayload(vo));
    }
}
