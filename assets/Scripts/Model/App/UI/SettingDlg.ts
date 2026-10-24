import { _decorator, Button, Slider, Toggle } from 'cc';
import { BaseDlg, BindingScopeSignals, UIManager } from '../../../Frame/UI';
import { BaseDlgFrame } from './BaseDlgFrame';
import { l10n } from 'db://localization-editor/l10n';
import { Sound } from '../../../Frame/Audio/Sound';
import { SoundBus } from '../../../Frame/Audio/SoundBus';
import { SettingsService } from '../Save/SettingsService';
import { exportSettings, importSettings, SettingsData } from '../Save/SettingsData';
import { downloadJson, selectJsonFile } from '../Save/DownloadSetting';
import { ConfirmPayload } from './ConfirmDlg';
import { Log } from '../../../Frame/Log';
const { ccclass, property } = _decorator;

@ccclass('SettingDlg')
export class SettingDlg extends BaseDlg {
    @property({ type: BaseDlgFrame, visible: true })
    private _frame: BaseDlgFrame | null = null;

    @property({ type: Slider, visible: true })
    private _masterSlider: Slider | null = null;

    @property({ type: Slider, visible: true })
    private _bgmSlider: Slider | null = null;

    @property({ type: Slider, visible: true })
    private _sfxSlider: Slider | null = null;

    @property({ type: Toggle, visible: true })
    private _masterToggle: Toggle | null = null;

    @property({ type: Toggle, visible: true })
    private _bgmToggle: Toggle | null = null;

    @property({ type: Toggle, visible: true })
    private _sfxToggle: Toggle | null = null;

    @property({ type: Button, visible: true })
    private _importSaveBtn: Button | null = null;

    @property({ type: Button, visible: true })
    private _exportSaveBtn: Button | null = null;

    private _originalSettings: SettingsData | null = null;

    protected onOpen(): void {
        if (this._originalSettings) SettingsService.Apply(this._originalSettings);
        this._originalSettings = SettingsService.CaptureAudio();
        this._configureFrame();
        this._masterSlider!.progress = Sound.GetBusVolumePercent(SoundBus.Master) / 100;
        this._bgmSlider!.progress = Sound.GetBusVolumePercent(SoundBus.BGM) / 100;
        this._sfxSlider!.progress = Sound.GetBusVolumePercent(SoundBus.SFX) / 100;
        this._masterToggle!.isChecked = !Sound.GetBusMute(SoundBus.Master);
        this._bgmToggle!.isChecked = !Sound.GetBusMute(SoundBus.BGM);
        this._sfxToggle!.isChecked = !Sound.GetBusMute(SoundBus.SFX);
    }

    private _configureFrame(saveFailed = false): void {
        this._frame?.configure({
            title: saveFailed ? `${l10n.t("common.settings")}（保存失败）` : l10n.t("common.settings"),
            showClose: false,
            showConfirm: true,
            showCancel: true,
            confirmText: l10n.t("common.save"),
            cancelText: l10n.t("common.cancel"),
            width: 608,
            contentHeight: 512,
            onConfirm: () => {
                if (!SettingsService.SaveAudio()) {
                    this._configureFrame(true);
                    return;
                }
                this._originalSettings = null;
                this.close();
            },
            onCancel: () => {
                this.close();
            }
        });
    }

    protected initEvent(): void {
        BindingScopeSignals.onSlider(this.binder, this._masterSlider!, (value) => Sound.SetBusVolumePercent(SoundBus.Master, value * 100));
        BindingScopeSignals.onSlider(this.binder, this._bgmSlider!, (value) => Sound.SetBusVolumePercent(SoundBus.BGM, value * 100));
        BindingScopeSignals.onSlider(this.binder, this._sfxSlider!, (value) => Sound.SetBusVolumePercent(SoundBus.SFX, value * 100));
        BindingScopeSignals.onToggle(this.binder, this._masterToggle!, (value) => Sound.SetBusMute(SoundBus.Master, !value));
        BindingScopeSignals.onToggle(this.binder, this._bgmToggle!, (value) => Sound.SetBusMute(SoundBus.BGM, !value));
        BindingScopeSignals.onToggle(this.binder, this._sfxToggle!, (value) => Sound.SetBusMute(SoundBus.SFX, !value));
        BindingScopeSignals.onClick(this.binder, this._importSaveBtn!, () => {
            selectJsonFile(
                async (text) => {
                    // 校验在覆盖确认之前完成；失败时由外层捕获并显示提示。
                    const settings = importSettings(text);
                    if (settings.error) {
                        Log.error('导入设置失败:', { tag: 'Save', data: settings.error });
                        await UIManager.instance.open<ConfirmPayload>('ConfirmDlg', {
                            title: '导入失败',
                            message: settings.error,
                            confirmText: '确定',
                            cancelText: '关闭',
                        });
                        return;
                    }
                    await UIManager.instance.open<ConfirmPayload>('ConfirmDlg', {
                        title: '导入设置',
                        message: '导入会覆盖当前设置，是否继续？',
                        confirmText: '导入',
                        cancelText: '取消',

                        onConfirm: () => {
                            SettingsService.ImportSettings(settings.settings!);

                            // 导入成功后关闭设置页。
                            // 清掉旧快照，避免 onClose 恢复导入前的音量。
                            this._originalSettings = null;
                            this.close();
                        },
                    });
                },
                (error) => {
                    Log.error('导入设置失败:', { tag: 'Save', data: error });
                    void UIManager.instance.open<ConfirmPayload>('ConfirmDlg', {
                        title: '导入失败',
                        message: error instanceof Error ? error.message : '无法读取备份文件',
                        confirmText: '确定',
                        cancelText: '关闭',
                    }).catch(openError => {
                        Log.error('无法显示导入失败提示', { tag: 'UI', data: openError });
                    });
                }
            );
            // if (!file) return;
            // const json = await file.text();

            // // 校验在覆盖确认之前完成；失败时由外层捕获并显示提示。
            // const settings = importSettings(json);

            // await UIManager.instance.open<ConfirmPayload>('ConfirmDlg', {
            //     title: '导入设置',
            //     message: '导入会覆盖当前设置，是否继续？',
            //     confirmText: '导入',
            //     cancelText: '取消',

            //     onConfirm: () => {
            //         SettingsService.ImportSettings(settings);

            //         // 导入成功后关闭设置页。
            //         // 清掉旧快照，避免 onClose 恢复导入前的音量。
            //         this._originalSettings = null;
            //         this.close();
            //     },
            // });
        });
        BindingScopeSignals.onClick(this.binder, this._exportSaveBtn!, () => {
            const json = exportSettings(SettingsService.GetSavedSettings());
            downloadJson('crashfever-settings.json', json);
        });
    }

    protected updateView(): void {
    }

    protected onClose(): void {
        if (this._originalSettings) {
            SettingsService.Apply(this._originalSettings);
            this._originalSettings = null;
        }
    }

    protected onExitTree(): void {
        // A forced destruction should also discard unsaved preview changes.
        this.onClose();
    }
}


