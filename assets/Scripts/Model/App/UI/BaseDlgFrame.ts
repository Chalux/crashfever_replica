import { _decorator, Button, Component, Label, Layout, Node, UITransform } from 'cc';
import { BaseCmp, BaseDlg, BindingScopeSignals } from '../../../Frame/UI';
import { Log } from '../../../Frame/Log';
const { ccclass, property } = _decorator;

export interface BaseDlgFrameOptions {
    title?: string;

    showConfirm: boolean;
    showCancel: boolean;
    showClose: boolean;

    confirmText: string;
    cancelText: string;

    width: number;
    contentHeight?: number;
    bottomPadding?: number;

    onConfirm?: () => void | Promise<void>;
    onCancel?: () => void | Promise<void>;
    onClose?: () => void | Promise<void>;
}

@ccclass('BaseDlgFrame')
export class BaseDlgFrame extends BaseCmp {
    @property({ type: Layout, visible: true })
    private _stack: Layout | null = null;

    @property({ type: Label, visible: true })
    private _title: Label | null = null;

    @property({ type: Button, visible: true })
    private _closeBtn: Button | null = null;

    @property({ type: Button, visible: true })
    private _confirmBtn: Button | null = null;

    @property({ type: Button, visible: true })
    private _cancelBtn: Button | null = null;

    @property({ type: Label, visible: true })
    private _confirmLabel: Label | null = null;

    @property({ type: Label, visible: true })
    private _cancelLabel: Label | null = null;

    @property({ type: Node, visible: true })
    private _contentRoot: Node | null = null;

    @property({ type: Node, visible: true })
    private _footer: Node | null = null;

    @property({
        visible: true,
        min: 0,
        tooltip: '弹窗最小高度',
    })
    private _minHeight = 120;

    private _actionRunning: boolean = false;

    private _opt: BaseDlgFrameOptions = {
        showConfirm: false,
        showCancel: false,
        showClose: false,
        confirmText: '',
        cancelText: '',
        width: 0
    };

    protected updateView(): void {
    }

    private async _runAction(
        callback?: () => void | Promise<void>,
    ): Promise<void> {
        if (this._actionRunning || !callback) {
            return;
        }

        this._actionRunning = true;

        try {
            await callback();
        } catch (error) {
            Log.error('弹窗操作失败', { tag: 'UI', data: error });
        } finally {
            this._actionRunning = false;
        }
    }

    protected initEvent(): void {
        BindingScopeSignals.onClick(this.binder, this._closeBtn, () => {
            void this._runAction(this._opt.onClose)
        });

        BindingScopeSignals.onClick(this.binder, this._confirmBtn, async () => {
            void this._runAction(this._opt.onConfirm)
        });

        BindingScopeSignals.onClick(this.binder, this._cancelBtn, async () => {
            void this._runAction(this._opt.onCancel)
        });
    }

    public configure(option: BaseDlgFrameOptions): void {
        this._opt = option;
        const width = Math.max(option.width, 480);

        const transform = this._stack?.getComponent(UITransform);
        if (transform) {
            const contentTransform = this._contentRoot?.getComponent(UITransform);
            if (contentTransform) {
                contentTransform.width = width - 96;
            }
            // this._contentRoot.getComponent(Layout)?.re
            transform.width = width;
        }

        this.setTitle(option.title ?? '');
        this._closeBtn.node.active = option.showClose;

        this._confirmBtn.node.active = option.showConfirm;
        this._cancelBtn.node.active = option.showCancel;

        this._footer.active = option.showConfirm || option.showCancel;

        if (option.showConfirm && this._confirmLabel) {
            this._confirmLabel.string = option.confirmText;
        }
        if (option.showCancel && this._cancelLabel) {
            this._cancelLabel.string = option.cancelText;
        }

        this.refreshLayout();
    }

    public setTitle(title: string): void {
        this._title!.node.active = !!title.trim();
        this._title!.string = title.trim();
    }

    private refreshLayout(): void {
        const width = Math.max(this._opt.width, 480);
        const contentHeight = this._opt.contentHeight ?? 360;
        const bottomPadding = Math.max(0, this._opt.bottomPadding ?? 20);
        const height = Math.max(contentHeight + 240 + bottomPadding, this._minHeight);
        // Frame chrome uses explicit geometry so hidden buttons and first-frame
        // text measurement cannot make nested Layout components fight each other.
        this._stack!.enabled = false;
        const footerLayout = this._footer?.getComponent(Layout);
        if (footerLayout) footerLayout.enabled = false;
        this.node.getComponent(UITransform)!.setContentSize(width, height);
        this._stack!.getComponent(UITransform)!.setContentSize(width, height);
        this._contentRoot!.getComponent(UITransform)!.setContentSize(width - 96, contentHeight);
        this._contentRoot!.setPosition(0, -4 + bottomPadding / 2);
        this._title!.node.setPosition(-16, height / 2 - 64);
        this._footer!.setPosition(0, -height / 2 + 66 + bottomPadding);
        const both = this._opt.showConfirm && this._opt.showCancel;
        this._confirmBtn!.node.setPosition(both ? 128 : 0, 0);
        this._cancelBtn!.node.setPosition(both ? -128 : 0, 0);
        this._closeBtn!.node.setPosition(width / 2 - 28, height / 2 - 26);
    }
}


