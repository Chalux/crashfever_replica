import { EUIType } from '../Def/EUIType';
import { BaseWin } from './BaseWin';

/**
 * 页面基类（移植自 kemo_card 的 BasePge）。
 *
 * 页面与窗口同属导航栈，只是默认铺满且不锁定层级——
 * 所以区别只在 uiType，其余生命周期完全复用 BaseWin。
 */
export abstract class BasePge extends BaseWin {
    public get uiType(): EUIType {
        return EUIType.Pge;
    }
}
