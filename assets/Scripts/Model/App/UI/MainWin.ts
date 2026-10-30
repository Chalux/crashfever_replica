import { _decorator, Button } from 'cc';
import { BaseWin, BindingScopeSignals, UIManager } from '../../../Frame/UI';
import { ConfirmPayload } from './ConfirmDlg';
import { RedDot } from '../../../Frame/RedDot';
import { appRedDotId } from '../RedDot/AppRedDotTree';
import { l10n } from 'db://localization-editor/l10n';
const { ccclass, property } = _decorator;

@ccclass('MainWin')
export class MainWin extends BaseWin {
    @property({ type: Button, visible: true })
    private _teamEditBtn: Button | null = null;

    @property({ type: Button, visible: true })
    private _stagePickBtn: Button | null = null;

    @property({ type: Button, visible: true })
    private _settingBtn: Button | null = null;

    protected onOpen(): void {
        // 角色配置在 AppEntry 启动时统一加载；窗口缓存重开时不重复读取。
    }

    protected updateView(): void {

    }

    protected initEvent(): void {
        BindingScopeSignals.onClick(this.binder, this._teamEditBtn, this._onTeamEditBtnPress.bind(this));
        BindingScopeSignals.onClick(this.binder, this._stagePickBtn, this._onStageBtnPress.bind(this));
        BindingScopeSignals.onClick(this.binder, this._settingBtn, this._onSettingBtnPress.bind(this));
    }

    private _onTeamEditBtnPress(): void {
        RedDot.ClearTree(appRedDotId.team);
        void UIManager.instance.open<ConfirmPayload>('ConfirmDlg', {
            title: l10n.t('button.teamedit'), message: l10n.t('main.teamUnavailable'),
            confirmText: l10n.t('common.understood'),
        });
    }

    private _onStageBtnPress(): void {
        RedDot.ClearTree(appRedDotId.stage);
        void UIManager.instance.open<ConfirmPayload>('ConfirmDlg', {
            title: l10n.t('button.stagepick'), message: l10n.t('main.stageUnavailable'),
            confirmText: l10n.t('common.understood'),
        });
    }

    private _onSettingBtnPress(): void {
        UIManager.instance.open('SettingDlg');
    }
}
