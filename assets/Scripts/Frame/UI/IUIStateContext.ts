import type { UIManager } from './UIManager';
import type { UIVo } from './UIVo';

/**
 * 状态机的上下文：状态处理器只通过它访问「当前 VO」与「管理器」。
 *
 * UIVo 自身实现了本接口，因此流转时直接把 vo 当上下文传即可，无需再包一层。
 */
export interface IUIStateContext {
    readonly vo: UIVo;
    readonly manager: UIManager;

    /** 让协调器推进到队列里的下一个界面。 */
    openNext(): void;
}
