import type { UIVo } from './UIVo';
import { EventKey } from '../Event/EventDispatcher';

/** 界面打开完成事件载荷。 */
export class UIOpenPayload {
    constructor(public readonly vo: UIVo) {
    }
}

/** 界面关闭完成事件载荷。 */
export class UIClosePayload {
    constructor(public readonly vo: UIVo) {
    }
}

/**
 * 框架对外广播的界面事件。
 *
 * 用对象键而不是字符串，避免 "ui.open" 之类的魔法字符串在模块间失配；
 * 监听方通常通过 EventDispatcher.on(UIEvent.open, ...) 注册。
 */
export const UIEvent = {
    open: new EventKey<UIOpenPayload>('ui.open'),
    close: new EventKey<UIClosePayload>('ui.close'),
};
