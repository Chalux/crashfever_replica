import { _decorator, Button, Label, ProgressBar } from "cc";
import { BaseWin, BindingScopeSignals } from "../../../Frame/UI";
import { l10n } from "db://localization-editor/l10n";
const { ccclass, property } = _decorator;

export interface BootLoadingWinPayload {
    onRetry: () => void;
}

@ccclass('BootLoadingWin')
export class BootLoadingWin extends BaseWin {
    @property({ type: Label, visible: true })
    private _loadingText: Label | null = null;

    @property({ type: ProgressBar, visible: true })
    private _loadingProgress: ProgressBar = null!;

    @property({ type: Label, visible: true })
    private _percentLabel: Label = null!;

    @property({ type: Button, visible: true })
    private _retryButton: Button = null!;

    private _retryAvaliable: boolean = false;

    protected onOpen(): void {
        this.ShowProgress(0, 4, l10n.t("loading.preparing"));
    }

    protected updateView(): void {
    }

    protected initEvent(): void {
        BindingScopeSignals.onClick(this.binder, this._retryButton, () => this._handleRetry());
    }

    public ShowProgress(completed: number, total: number, message: string) {
        const progress = total > 0 ? Math.min(1, Math.max(0, completed / total)) : 0;

        this._loadingProgress!.progress = progress;
        this._percentLabel!.string = `${Math.floor(progress * 100)}%`;
        this._loadingText!.string = message;

        this._retryAvaliable = false;
        this._retryButton!.interactable = false;
        this._retryButton!.node.active = false;
    }

    public ShowFailure(message: string) {
        this._loadingText!.string = message;
        this._retryAvaliable = true;
        this._retryButton!.interactable = true;
        this._retryButton!.node.active = true;
    }

    private _handleRetry() {
        if (this._retryAvaliable) {
            this._retryAvaliable = false;
            this._retryButton!.interactable = false;
            this._retryButton!.node.active = false;

            this._loadingText!.string = l10n.t("loading.reloading");

            this.getTypedPayload<BootLoadingWinPayload>().onRetry();
        }
    }
}
