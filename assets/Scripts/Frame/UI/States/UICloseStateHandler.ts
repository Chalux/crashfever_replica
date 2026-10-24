import { Log } from '../../Log/Log';
import type { IStateHandler } from '../../StateMachine/StateMachine';
import { EUIAnimState } from '../Def/EUIAnimState';
import { EUIState } from '../Def/EUIState';
import type { IUIStateContext } from '../IUIStateContext';

/**
 * 关闭：播放关闭动画（遮罩与界面各自回调，两个都完成才进 CloseDone）。
 *
 * 没有界面实例、或从未打开成功（openTime === 0）时直接进 Destroy，
 * 避免「加载失败 → 关闭」在空节点上播放动画、永远等不到 done。
 */
export class UICloseStateHandler implements IStateHandler<EUIState, IUIStateContext> {
    public readonly state: EUIState = EUIState.Close;

    public onEnter(from: EUIState | null, context: IUIStateContext): void {
        const vo = context.vo;

        // closeTime 只在 CloseDone 写一次（关闭完成时刻）；这里记录开始时刻，便于诊断「关闭动画拖了多久」。
        vo.lifecycle.closeStartTime = Date.now();

        // 出栈：与打开时的 hideBelow 压栈配对，避免已关闭界面留在导航栈里。
        context.manager.navStack.remove(vo.id);

        if (!vo.runtime.ui || vo.lifecycle.openTime === 0) {
            vo.stateMachine.transitionTo(EUIState.Destroy, context);
            return;
        }

        let remaining = vo.runtime.mask ? 2 : 1;
        const requestFlag = vo.load.preLoadFlag;

        const isCurrentClose = (): boolean =>
            vo.stateMachine.currentState === EUIState.Close && requestFlag === vo.load.preLoadFlag;

        const onAnimationDone = (): void => {
            if (!isCurrentClose()) return;
            remaining -= 1;
            if (remaining !== 0) return;
            vo.stateMachine.transitionTo(EUIState.CloseDone, context);
        };

        try {
            const mask = vo.runtime.mask;
            if (mask) vo.anim.startMaskCloseAnim(mask, onAnimationDone);
            if (isCurrentClose()) vo.anim.startCloseAnim(vo.openOpt.effectiveAnimType, vo.runtime.ui, onAnimationDone);
        } catch (ex) {
            Log.error(`UI<${vo.id}> 关闭动画失败：${String(ex)}`, 'UI');
            if (!isCurrentClose()) return;

            // 逐步复核：清理动画的回调本身可能触发状态流转。
            vo.anim.clearAnim();
            if (!isCurrentClose()) return;
            vo.anim.clearMaskAnim();
            if (!isCurrentClose()) return;

            vo.runtime.ui.animState = EUIAnimState.None;
            if (vo.runtime.mask) vo.runtime.mask.animState = EUIAnimState.None;
            vo.stateMachine.transitionTo(EUIState.CloseDone, context);
        }
    }
}
