import { isValid } from 'cc';
import type { IStateHandler } from '../../StateMachine/StateMachine';
import { EUIState } from '../Def/EUIState';
import type { IUIStateContext } from '../IUIStateContext';
import { UIManager } from '../UIManager';

/**
 * 销毁：解除寻址、销毁节点、以 null 收尾未完成的打开请求。
 *
 * 「先 Remove 再清理」是刻意的：清理回调（onFail / onDestroy）里重入 open 时会拿到新的 VO，
 * 不会和正在销毁的这个实例打架。
 */
export class UIDestroyStateHandler implements IStateHandler<EUIState, IUIStateContext> {
    public readonly state: EUIState = EUIState.Destroy;

    public onEnter(from: EUIState | null, context: IUIStateContext): void {
        const vo = context.vo;
        const manager = context.manager;

        const request = vo.openTaskSource;
        const onFail = vo.openOpt.onFail;

        // 先解除寻址：清理 hook 重入 open 时会得到新 VO。
        manager.voRegistry.remove(vo.id);
        manager.navStack.remove(vo.id);
        manager.coordinator.resetCurrentOpening(vo);
        manager.coordinator.removeFromQueue(vo);

        vo.load.cancel();
        vo.anim.clearAnim();
        vo.anim.clearMaskAnim();
        vo.runtime.hideBool.destroy();

        const mask = vo.runtime.mask;
        const ui = vo.runtime.ui;

        try {
            vo.runtime.removeFromNode();
            if (mask && isValid(mask)) {
                UIManager.invokeCallback(() => mask.invokeMaskUIDestroy(), vo.id, '遮罩销毁回调');
            }
        } finally {
            vo.runtime.mask = null;
            vo.runtime.ui = null;

            if (mask && isValid(mask)) mask.node.destroy();
            if (ui && isValid(ui)) ui.node.destroy();

            try {
                if (request) UIManager.invokeCallback(onFail ?? null, vo.id, '打开失败回调');
            } finally {
                vo.completeOpen(null, request);
            }

            manager.updateLayers();
        }
    }
}
