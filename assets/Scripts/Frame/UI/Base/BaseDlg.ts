import { EUIType } from '../Def/EUIType';
import { BaseWin } from './BaseWin';

/**
 * 对话框基类（移植自 kemo_card 的 BaseDlg）。
 *
 * 只把 uiType 定为 Dlg：层级/遮罩/缓存策略都由 DefaultUIOpenOpt 按类型给出，
 * 行为差异全部收敛到打开参数里，不必在每个子类重复声明。
 */
export abstract class BaseDlg extends BaseWin {
    public get uiType(): EUIType {
        return EUIType.Dlg;
    }
}
