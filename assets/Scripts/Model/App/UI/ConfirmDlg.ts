import { _decorator, Label, ScrollView, UITransform } from 'cc';
import { BaseDlg } from '../../../Frame/UI';
import { Log } from '../../../Frame/Log';
import { BaseDlgFrame } from './BaseDlgFrame';
const { ccclass, property } = _decorator;

export interface ConfirmPayload {
    title?: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    onConfirm?: () => void | Promise<void>;
    onCancel?: () => void | Promise<void>;
}

@ccclass('ConfirmDlg')
export class ConfirmDlg extends BaseDlg {
    @property(BaseDlgFrame)
    private _frame: BaseDlgFrame | null = null;

    @property(Label)
    private _message: Label | null = null;

    @property(ScrollView)
    private _scroll: ScrollView | null = null;

    private _settled = false;
    private _epoch = 0;

    protected onOpen(): void {
        const payload = this.getTypedPayload<ConfirmPayload>();
        this._settled = false;
        this._epoch++;
        this._message!.string = payload.message;
        this._message!.updateRenderData(true);
        const textHeight = this._message!.getComponent(UITransform)!.height;
        const viewHeight = Math.min(560, Math.max(160, textHeight + 32));
        this._scroll!.node.getComponent(UITransform)!.height = viewHeight;
        this._scroll!.content!.getComponent(UITransform)!.height = Math.max(viewHeight, textHeight + 32);
        this._scroll!.scrollToTop(0);
        this._frame!.configure({
            title: payload.title ?? '请确认',
            showClose: false,
            showConfirm: true,
            showCancel: true,
            confirmText: payload.confirmText ?? '确认',
            cancelText: payload.cancelText ?? '取消',
            width: 608,
            contentHeight: viewHeight,
            onConfirm: () => this._finish(payload.onConfirm),
            onCancel: () => this._finish(payload.onCancel),
        });
    }

    protected updateView(): void {}

    private async _finish(callback?: () => void | Promise<void>): Promise<void> {
        if (this._settled) return;
        this._settled = true;
        const epoch = this._epoch;
        try {
            await callback?.();
            if (this.isValid && epoch === this._epoch) this.close();
        } catch (error) {
            if (epoch !== this._epoch) return;
            Log.error('确认弹窗操作失败', { tag: 'UI', data: error });
            // A failed action can be retried; successful actions cannot execute twice.
            this._settled = false;
            this._frame!.setTitle('操作失败，请重试');
        }
    }

    protected onClose(): void {
        this._settled = true;
        this._epoch++;
    }
}
