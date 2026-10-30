import { _decorator, Button, Component, Node } from 'cc';
import { BaseWin, BindingScopeSignals } from '../../../Frame/UI';
import { Log } from '../../../Frame/Log';
const { ccclass, property } = _decorator;

@ccclass('TitleWin')
export class TitleWin extends BaseWin {
    @property({ type: Button, visible: true })
    private _enterArea: Button | null = null;

    private _enterlock: boolean = false;

    protected onOpen(): void {
        this._enterlock = false;
    }

    protected initEvent(): void {
        BindingScopeSignals.onClick(this.binder, this._enterArea, () => void this._handleEnter());
    }

    protected updateView(): void {

    }

    private async _handleEnter(): Promise<void> {
        if (this._enterlock) {
            return;
        }

        // 在第一次 await 前锁定，阻止连续点击。
        this._enterlock = true;

        try {
            const payload = this.getTypedPayload<TitlePayload>();
            await payload.onEnter();
        } catch (error) {
            Log.error('进入主界面失败', { tag: 'App', data: error });
        } finally {
            this._enterlock = false;
        }
    }
}

export interface TitlePayload {
    onEnter: () => Promise<boolean>;
}
