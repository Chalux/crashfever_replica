import { Log } from '../../Log/Log';
import type { IStateHandler } from '../../StateMachine/StateMachine';
import { OpenTransitionData } from '../Def/OpenTransitionData';
import { EUIState } from '../Def/EUIState';
import type { IUIStateContext } from '../IUIStateContext';
import { UIManager } from '../UIManager';
import { UIEvent, UIOpenPayload } from '../UIEvents';

/**
 * 打开：订阅登记、遮罩与界面生命周期回调、打开动画、事件派发。
 *
 * 这里有两条硬约束（都是 C# 版踩过坑后加的）：
 * 1. 必须先 resetBindings 再 initEvent——「已打开状态下再次 open」不经过离场，
 *    旧订阅还活着，不清账会重复订阅。
 * 2. 成功状态先交付（completeOpen），之后再派发事件/回调；回调抛异常不能把已打开的界面打成失败。
 */
export class UIOpenStateHandler implements IStateHandler<EUIState, IUIStateContext> {
    public readonly state: EUIState = EUIState.Open;

    public onEnter(from: EUIState | null, context: IUIStateContext, data?: unknown): void {
        const vo = context.vo;
        const manager = context.manager;
        const win = vo.runtime.ui;
        if (!win) {
            // 走到 Open 却没有界面实例，属于内存被外部销毁；直接回收，避免卡在 isOpen 状态。
            Log.error(`UI<${vo.id}> 打开失败：界面实例不存在。`, 'UI');
            vo.stateMachine.transitionTo(EUIState.Destroy, context);
            context.openNext();
            return;
        }

        const requestFlag = vo.load.preLoadFlag;
        const openOpt = vo.openOpt;
        const request = vo.openTaskSource;
        let published = false;

        const isCurrentRequest = (): boolean =>
            vo.stateMachine.currentState === EUIState.Open && requestFlag === vo.load.preLoadFlag;

        try {
            vo.lifecycle.openTime = Date.now();

            // 全屏界面（hideBelow）打开时入导航栈，供 back() 关闭当前并恢复上一层。
            if (vo.openOpt.effectiveHideBelow && !manager.navStack.contains(vo.id)) {
                manager.navStack.push(vo.id);
            }

            // 挂载是流程必需项，不能由「过渡数据是否为空」隐式决定：
            // 首开由 Create 挂载、缓存重开由 Load 挂载，这里只兜住「本应已挂树却没挂」的异常路径。
            if (win.node.parent === null) {
                vo.runtime.addToNode();
            }

            win.payload = vo.payload;

            const onOpenBefore = openOpt.onOpenBefore;
            openOpt.onOpenBefore = null;
            UIManager.invokeCallback(onOpenBefore ? () => onOpenBefore(vo) : null, vo.id, '打开前回调');
            if (!isCurrentRequest()) return;

            const mask = vo.runtime.mask;
            if (mask) {
                mask.invokeResetBindings();
                mask.invokeInitEvent();
            }

            win.invokeResetBindings();
            win.invokeInitEvent();

            if (!isCurrentRequest()) return;

            if (mask) {
                vo.anim.startMaskOpenAnim(mask, () => { });
                mask.invokeMaskOpen();
            }

            win.invokeOpen();
            mask?.invokeMaskUIOpen();

            if (!isCurrentRequest()) return;

            const transitionData = data instanceof OpenTransitionData ? data : undefined;
            vo.runtime.updateVisible();
            if (!isCurrentRequest()) return;

            vo.anim.startOpenAnim(vo.openOpt.effectiveAnimType, transitionData ?? null, win, () => manager.updateLayers());

            if (!isCurrentRequest()) return;

            // 成功状态先交付；事件/观察回调重入不能把已经打开的请求改成失败。
            vo.completeOpen(vo, request);
            published = true;

            UIManager.invokeCallback(
                () => manager.eventDispatcher.send(UIEvent.open, new UIOpenPayload(vo)),
                vo.id,
                '打开事件派发');
            UIManager.invokeCallback(openOpt.onOpen ? () => openOpt.onOpen!(vo) : null, vo.id, '打开成功回调');
        } catch (ex) {
            Log.error(`UI<${vo.id}> 打开生命周期失败：${String(ex)}`, 'UI');
            // published 之后界面已交付成功，回调异常不得再销毁它。
            if (!published && isCurrentRequest()) vo.stateMachine.transitionTo(EUIState.Destroy, context);
        } finally {
            context.openNext();
        }
    }
}
