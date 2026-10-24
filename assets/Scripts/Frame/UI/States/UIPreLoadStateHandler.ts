import { isValid } from 'cc';
import { Log } from '../../Log/Log';
import type { IStateHandler } from '../../StateMachine/StateMachine';
import { OpenTransitionData } from '../Def/OpenTransitionData';
import { EUIState } from '../Def/EUIState';
import type { IUIStateContext } from '../IUIStateContext';

/**
 * 预加载：给界面一次「异步准备数据」的机会（onPreLoad(done, fail)）。
 *
 * 这是唯一允许业务挂起打开流程的钩子：done 之前状态机停在 PreLoad，
 * 协调器不会推进下一个界面。done 之后按过渡数据决定进 Create（首次）还是 Open（重开）。
 */
export class UIPreLoadStateHandler implements IStateHandler<EUIState, IUIStateContext> {
    public readonly state: EUIState = EUIState.PreLoad;

    public onEnter(from: EUIState | null, context: IUIStateContext, data?: unknown): void {
        const vo = context.vo;

        // flag 快照 + completed：done 与 fail 都可能被回调多次，只有第一次生效。
        const preloadFlag = vo.load.incrementPreLoadFlag();
        let completed = false;

        const tryComplete = (): boolean => {
            if (completed || preloadFlag !== vo.load.preLoadFlag || vo.stateMachine.currentState !== EUIState.PreLoad) return false;
            completed = true;
            return true;
        };

        const fail = (): void => {
            if (!tryComplete()) return;
            Log.error(`UI 管理器: 预加载UI<${vo.id}> 失败。`, 'UI');
            try {
                vo.stateMachine.transitionTo(EUIState.Destroy, context);
            } finally {
                context.openNext();
            }
        };

        // 创建阶段抛异常也要把 VO 收掉，否则它会永远停在 Create（isOpen 为真、却不进队列也不再被调度）。
        const abort = (ex: unknown): void => {
            if (preloadFlag !== vo.load.preLoadFlag) return;
            // 真正打开之后（openTime > 0）业务再抛异常，不能把界面回滚销毁；
            // 但 completed 之后仍停在 Create（openTime === 0）说明确实没打开成功，必须回收。
            if (completed && vo.lifecycle.openTime > 0) return;
            if (vo.isClose) return;
            Log.error(`UI<${vo.id}> 预加载/创建异常：${String(ex)}`, 'UI');
            try {
                vo.stateMachine.transitionTo(EUIState.Destroy, context);
            } finally {
                context.openNext();
            }
        };

        const win = vo.runtime.ui;
        if (!win || !isValid(win)) {
            fail();
            return;
        }

        try {
            // 放在 try 内：缓存重开时窗口可能已被外部销毁，给 payload 赋值会抛。
            win.payload = vo.payload;

            win.invokePreLoad(() => {
                if (!tryComplete()) return;

                const reopen = data instanceof OpenTransitionData && data.isReopen;
                try {
                    vo.stateMachine.transitionTo(reopen ? EUIState.Open : EUIState.Create, context, data);
                } catch (ex) {
                    abort(ex);
                }
            }, fail);
        } catch (ex) {
            abort(ex);
        }
    }
}
