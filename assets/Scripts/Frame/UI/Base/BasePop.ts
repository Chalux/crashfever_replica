import { EUIType } from '../Def/EUIType';
import { BaseWin } from './BaseWin';

/**
 * 弹出层基类（移植自 kemo_card 的 BasePop）：飘字、气泡、轻提示这类不参与导航的窗口。
 *
 * uiType 决定默认层级与对齐；与 Dlg 的差别只在打开参数，生命周期仍是 BaseWin 那一套。
 */
export abstract class BasePop extends BaseWin {
    public get uiType(): EUIType {
        return EUIType.Pop;
    }
}
