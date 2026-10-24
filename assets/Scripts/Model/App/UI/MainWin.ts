import { _decorator, Button, Component, Node } from 'cc';
import { BaseWin, BindingScope, BindingScopeSignals, UIManager } from '../../../Frame/UI';
import { ConfirmPayload } from './ConfirmDlg';
import { Log } from '../../../Frame/Log';
import { DEV } from 'cc/env';
const { ccclass, property } = _decorator;

@ccclass('MainWin')
export class MainWin extends BaseWin {
    @property({ type: Button, visible: true })
    private _teamEditBtn: Button | null = null;

    @property({ type: Button, visible: true })
    private _stagePickBtn: Button | null = null;

    @property({ type: Button, visible: true })
    private _settingBtn: Button | null = null;

    @property(Button)
    private _confirmTestBtn: Button | null = null;

    protected onOpen(): void {
        if (this._confirmTestBtn) this._confirmTestBtn.node.active = DEV;
    }

    protected updateView(): void {

    }

    protected initEvent(): void {
        BindingScopeSignals.onClick(this.binder, this._teamEditBtn, this._onTeamEditBtnPress.bind(this));
        BindingScopeSignals.onClick(this.binder, this._stagePickBtn, this._onStageBtnPress.bind(this));
        BindingScopeSignals.onClick(this.binder, this._settingBtn, this._onSettingBtnPress.bind(this));
        BindingScopeSignals.onClick(this.binder, this._confirmTestBtn, () => {
            void UIManager.instance.open<ConfirmPayload>('ConfirmDlg', {
                title: '测试确认',
                message: '是否执行本次操作？\n\n此弹窗用于验证确认、取消和重复打开，不会修改存档。',
                onConfirm: () => { Log.info('确认弹窗：已确认', 'App'); },
                onCancel: () => { Log.info('确认弹窗：已取消', 'App'); },
            });
        });
    }

    private _onTeamEditBtnPress(): void {
        void UIManager.instance.open<ConfirmPayload>('ConfirmDlg', {
            title: '角色编队', message: '编队功能将在下一阶段开放。',
            confirmText: '知道了',
        });
    }

    private _onStageBtnPress(): void {
        void UIManager.instance.open<ConfirmPayload>('ConfirmDlg', {
            title: '关卡选择', message: '暂无关卡，关卡与战斗功能将在后续阶段加入。',
            confirmText: '知道了',
        });
    }

    private _onSettingBtnPress(): void {
        UIManager.instance.open('SettingDlg');
    }
}


