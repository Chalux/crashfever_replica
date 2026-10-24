import { instantiate, isValid } from 'cc';
import { Log } from '../../Log/Log';
import type { IStateHandler } from '../../StateMachine/StateMachine';
import { OpenTransitionData } from '../Def/OpenTransitionData';
import { EUIState } from '../Def/EUIState';
import type { IUIStateContext } from '../IUIStateContext';
import { UIResourceLoader } from '../UIResourceLoader';
import { findBaseMask, findBaseWin } from '../Base/UIComponentLookup';

/**
 * 加载：异步加载界面 prefab（以及可选遮罩 prefab），或复用缓存实例。
 *
 * 缓存复用路径不加载资源，只把节点重新挂回层级并直接进 PreLoad——这是「关掉再打开不闪」的关键。
 */
export class UILoadStateHandler implements IStateHandler<EUIState, IUIStateContext> {
    public readonly state: EUIState = EUIState.Load;

    public onEnter(from: EUIState | null, context: IUIStateContext): void {
        const vo = context.vo;
        vo.lifecycle.loadTime = Date.now();

        const cached = vo.runtime.ui;
        const hasCache = cached !== null && isValid(cached);

        if (hasCache && cached) {
            vo.runtime.addToNode();
            // Close 之后重开走 CloseOpen（不做打开动画），其余情况视作普通重开。
            const tag = from === EUIState.Close ? OpenTransitionData.closeOpen : OpenTransitionData.reopen;
            vo.stateMachine.transitionTo(EUIState.PreLoad, context, tag);
            return;
        }

        // 缓存实例已被外部销毁：清掉悬空引用，走完整加载。
        if (cached) vo.runtime.ui = null;

        void UILoadStateHandler.loadAsync(context, from);
    }

    private static async loadAsync(context: IUIStateContext, from: EUIState | null): Promise<void> {
        const vo = context.vo;
        const manager = context.manager;

        // flag 快照：加载期间被新的打开/关闭打断时，这份结果必须整体丢弃。
        const loadFlag = vo.load.incrementLoadFlag();

        try {
            const paths: string[] = [manager.getPath(vo.id)];
            vo.load.hasMaskLoaded = false;

            const maskRuntime = vo.openOpt.mask?.runtime ?? null;
            if (maskRuntime) {
                // mask.runtime 支持两种写法：已登记的 UI 路由 id（走注册表拼路径），
                // 或直接的 resources 相对路径（遮罩通常不是可打开的界面，不进路由表）。
                const maskPath = manager.getPath(maskRuntime) || maskRuntime;
                vo.load.hasMaskLoaded = true;
                paths.push(maskPath);
            }

            const extra = vo.openOpt.preLoadResList?.(vo) ?? [];
            for (const path of extra) paths.push(path);

            const prefabs = await UIResourceLoader.loadPrefabs(paths);
            if (loadFlag !== vo.load.loadFlag || vo.stateMachine.currentState !== EUIState.Load) return;

            const prefab = prefabs[0] ?? null;
            if (!prefab) {
                Log.error(`UI 管理器: 加载UI<${vo.id}> 失败，资源<${paths.join(',')}> 不存在。`, 'UI');
                vo.stateMachine.transitionTo(EUIState.Destroy, context);
                context.openNext();
                return;
            }

            const node = instantiate(prefab);
            const win = findBaseWin(node);
            if (!win) {
                Log.error(`UI 管理器: 加载UI<${vo.id}> 失败，根节点不是BaseWin。`, 'UI');
                node.destroy();
                vo.stateMachine.transitionTo(EUIState.Destroy, context);
                context.openNext();
                return;
            }

            vo.runtime.ui = win;
            win.uiVo = vo;

            if (vo.load.hasMaskLoaded && prefabs.length > 1 && prefabs[1]) {
                const maskNode = instantiate(prefabs[1]!);
                const mask = findBaseMask(maskNode);
                if (mask) {
                    vo.runtime.mask = mask;
                } else {
                    maskNode.destroy();
                }
            }

            const transition = from === EUIState.Close ? OpenTransitionData.closeOpen : OpenTransitionData.firstOpen;
            vo.stateMachine.transitionTo(EUIState.PreLoad, context, transition);
        } catch (ex) {
            if (loadFlag !== vo.load.loadFlag || vo.stateMachine.currentState !== EUIState.Load) return;
            Log.error(`UI 管理器: 加载UI<${vo.id}> 失败，${String(ex)}`, 'UI');
            vo.stateMachine.transitionTo(EUIState.Destroy, context);
            context.openNext();
        }
    }
}
