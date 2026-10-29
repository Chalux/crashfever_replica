import { _decorator, Button, Component, isValid, Label, Node } from 'cc';
import { EUILayer, UIManager, UIOpenOpt, UIRegistration, UIRuntimeRegistry } from '../../Frame/UI';
import { TitlePayload, TitleWin } from './UI/TitleWin';
import { SoundManager } from '../../Frame/Audio/SoundManager';
import { Sound } from '../../Frame/Audio/Sound';
import { SettingsService } from './Save/SettingsService';
import { RedDot } from '../../Frame/RedDot/index';
import { registerAppRedDots, seedDemoRedDots } from './RedDot/AppRedDotTree';
import { DEV } from 'cc/env';
import { BootLoadingWin, BootLoadingWinPayload } from './UI/BootLoadingWin';
import { l10n } from 'db://localization-editor/l10n';
import { Log } from '../../Frame/Log';
const { ccclass, property } = _decorator;

enum BootState {
    idle,
    running,
    failure,
    ready,
    disposed
}

@ccclass('AppEntry')
export class AppEntry extends Component {
    @property({ type: Node, visible: true })
    private _uiRoot: Node | null;

    @property({ type: SoundManager, visible: true })
    private _soundManager: SoundManager | null = null;

    @property({ type: Label, visible: true })
    private _bootHint: Label = null!;

    @property({ type: Button, visible: true })
    private _bootRetryButton: Button = null!;

    private _uiManager: UIManager | null = null;

    private _bootState: BootState = BootState.idle;
    private _attemptId = 0;

    private _loadingWin: BootLoadingWin | null = null;

    private _soundConfigured = false;
    private _settingReady = false;
    private _redDotsReady = false;
    private _bgmStarted = false;

    start() {
        this._bootRetryButton?.node.on(Button.EventType.CLICK, this._retryBoot, this);

        void this._runBootAttempt();
    }

    private _retryBoot(): void {
        if (this._bootState !== BootState.failure) return;

        void this._runBootAttempt();
    }

    private async _runBootAttempt(): Promise<void> {
        if (this._bootState !== BootState.idle && this._bootState !== BootState.failure) {
            return;
        }

        this._bootState = BootState.running;
        const attemptId = ++this._attemptId;

        this._showSceneHint(l10n.t('loading.preparing'), false);

        if (this._loadingWin && isValid(this._loadingWin)) {
            try {
                this._loadingWin.ShowProgress(0, 4, l10n.t('loading.preparing'));
            }
            catch (error) {
                Log.error('加载页无法显示准备中', {
                    tag: 'App',
                    data: error,
                });
            }
        }

        let failureMessage = l10n.t('loading.failed');

        try {
            const manager = this._getOrCreateUiManager();

            // 加载页位于标题页上方，标题准备完成前不暴露它。
            const loadingOpt = new UIOpenOpt();
            loadingOpt.layer = EUILayer.Loading;
            loadingOpt.hideBelow = true;
            loadingOpt.cacheTime = 0;

            const loadingVo = await manager.open<BootLoadingWinPayload>(
                'BootLoadingWin',
                {
                    onRetry: () => this._retryBoot(),
                },
                loadingOpt,
            );

            if (!this._isCurrentAttempt(attemptId)) return;

            if (!(loadingVo?.ui instanceof BootLoadingWin)) {
                throw new Error('BootLoadingWin 打开失败');
            }

            const loadingWin = loadingVo.ui;

            // 尽早发现漏绑字段等配置问题。
            loadingWin.ShowProgress(
                0, 4, l10n.t('loading.preparing'),
            );

            this._loadingWin = loadingWin;
            this._hideSceneHint();

            failureMessage = l10n.t('loading.initsounderror');
            loadingWin.ShowProgress(
                0, 4, l10n.t('loading.initsound'),
            );

            if (!this._soundConfigured) {
                if (!this._soundManager) {
                    throw new Error('SoundManager 未绑定');
                }

                Sound.Configure(this._soundManager);
                this._soundConfigured = true;
            }

            failureMessage = l10n.t('loading.initsettingserror');
            loadingWin.ShowProgress(
                1, 4, l10n.t('loading.initsettings'),
            );

            if (!this._settingReady) {
                SettingsService.Initialize();
                this._settingReady = true;
            }

            // 必须在设置恢复后播放，避免先用默认音量播放。
            if (!this._bgmStarted) {
                Sound.PlayBgm('audio/bgm/00_System');
                this._bgmStarted = true;
            }

            failureMessage = l10n.t('loading.initreddotserror');
            loadingWin.ShowProgress(
                2, 4, l10n.t('loading.initreddots'),
            );

            if (!this._redDotsReady) {
                RedDot.Initialize();
                registerAppRedDots();

                if (DEV) {
                    seedDemoRedDots();
                }

                this._redDotsReady = true;
            }

            failureMessage = l10n.t('loading.inittitlewinerror');
            loadingWin.ShowProgress(
                3, 4, l10n.t('loading.inittitlewin'),
            );

            const titleVo = await manager.open<TitlePayload>(
                'TitleWin',
                {
                    onEnter: async () => {
                        if (this._bootState !== BootState.ready) return;

                        const mainVo = await manager.open('MainWin');

                        if (!this._isCurrentAttempt(attemptId)) return;

                        if (!mainVo) {
                            throw new Error('MainWin 打开失败');
                        }

                        manager.close('TitleWin');
                    },
                },
            );

            if (!this._isCurrentAttempt(attemptId)) return;

            // 返回 null 不会进入 catch，必须主动转成异常。
            if (!titleVo) {
                throw new Error('TitleWin 打开失败');
            }

            loadingWin.ShowProgress(
                4, 4, l10n.t('loading.initcomplete'),
            );

            manager.close('BootLoadingWin');
            this._loadingWin = null;
            this._bootState = BootState.ready;
        } catch (error) {
            if (!this._isCurrentAttempt(attemptId)) return;

            this._bootState = BootState.failure;

            Log.error('启动失败', {
                tag: 'App',
                data: {
                    stage: failureMessage,
                    error,
                },
            });

            // 加载页失效或展示失败时，退回场景静态提示。
            try {
                if (this._loadingWin && isValid(this._loadingWin)) {
                    this._loadingWin.ShowFailure(failureMessage);
                    return;
                }
            } catch (displayError) {
                Log.error('加载页无法显示错误', {
                    tag: 'App',
                    data: displayError,
                });
            }

            this._showSceneHint(failureMessage, true);
        }
    }

    onDestroy(): void {
        this._bootState = BootState.disposed;
        ++this._attemptId;

        this._bootRetryButton?.node.off(
            Button.EventType.CLICK,
            this._retryBoot,
            this,
        );

        this._loadingWin = null;

        this._uiManager?.dispose();
        this._uiManager = null;

        RedDot.Dispose();
    }

    private _getOrCreateUiManager(): UIManager {
        if (this._uiManager?.isInited) {
            return this._uiManager;
        }

        if (!this._uiRoot) {
            throw new Error('UIRoot 未绑定');
        }

        const registry = new UIRuntimeRegistry();

        registry.registerRange([
            UIRegistration.window('app', 'BootLoadingWin', 'ui/app'),
            UIRegistration.window('app', 'TitleWin', 'ui/app'),
            UIRegistration.window('app', 'MainWin', 'ui/app'),
            UIRegistration.dialog('app', 'SettingDlg', 'ui/app'),
            UIRegistration.dialog('app', 'ConfirmDlg', 'ui/app'),
        ]);

        if (registry.hasErrors) {
            throw new Error('UI 注册表存在错误');
        }

        const manager = new UIManager();

        try {
            manager.init({
                root: this._uiRoot,
                layers: [
                    EUILayer.Win,
                    EUILayer.Dlg,
                    EUILayer.Loading,
                    EUILayer.Pop,
                ],
                topLayers: [EUILayer.Debug, EUILayer.Notice],
                registry,
                knownOwnerModIds: ['app'],
            });

            if (!manager.isInited) {
                throw new Error('UIManager 初始化失败');
            }

            // 装配成功后才保存，后续尝试直接复用。
            this._uiManager = manager;
            return manager;
        } catch (error) {
            manager.dispose();
            throw error;
        }
    }

    private _isCurrentAttempt(attemptId: number): boolean {
        return (
            isValid(this) &&
            this._bootState !== BootState.disposed &&
            this._attemptId === attemptId
        );
    }

    private _showSceneHint(
        message: string,
        allowRetry: boolean,
    ): void {
        if (this._bootHint) {
            this._bootHint.node.active = true;
            this._bootHint.string = message;
        }

        if (this._bootRetryButton) {
            this._bootRetryButton.node.active = allowRetry;
            this._bootRetryButton.interactable = allowRetry;
        }
    }

    private _hideSceneHint(): void {
        if (this._bootHint) {
            this._bootHint.node.active = false;
        }

        if (this._bootRetryButton) {
            this._bootRetryButton.node.active = false;
        }
    }
}


