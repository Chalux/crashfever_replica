import { _decorator, Label } from "cc";
import { BaseWin } from "../../../Frame/UI";
import { Log } from '../../../Frame/Log';
import { l10n } from "db://localization-editor/l10n";
const { ccclass, property } = _decorator;

@ccclass('BootLoadingWin')
export class BootLoadingWin extends BaseWin {
    @property({ type: Label, visible: true })
    private _loadingText: Label | null = null;

    protected onOpen(): void {
        Log.info('BootLoadingWin opened', 'App');
        if (this._loadingText) {
            this._loadingText.string = l10n.t("loading.hint");
        }
    }

    protected updateView(): void {
    }
}
