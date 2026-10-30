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
import { Log, LogOptions } from '../../Frame/Log';
import { IRecoveryService, RecoveryService, RecoveryState } from './Recovery/RecoveryService';
import { IModelRegistry, registerModels } from '../ModelFactory';
import { CharacterController } from '../Character/CharacterController';
import { CharacterConfigLoader } from '../Character/CharacterConfigLoader';
import { ConfirmPayload } from './UI/ConfirmDlg';
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
    private _models: IModelRegistry | null = null;
    private _characterController: CharacterController | null = null;
    private _redDotsReady = false;
    private _bgmStarted = false;

    private _entryAbort: EntryAbort | null = null;
    private _recovery: IRecoveryService = RecoveryService.getInstance();

    start() {
        if (DEV) {
            Log.verbose = true;
        }

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
                this._loadingWin.ShowProgress(0, 5, l10n.t('loading.preparing'));
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
                0, 5, l10n.t('loading.preparing'),
            );

            this._loadingWin = loadingWin;
            this._hideSceneHint();

            failureMessage = l10n.t('loading.initsounderror');
            loadingWin.ShowProgress(
                0, 5, l10n.t('loading.initsound'),
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
                1, 5, l10n.t('loading.initsettings'),
            );

            if (!this._settingReady) {
                SettingsService.Initialize();
                this._settingReady = true;
            }

            failureMessage = l10n.t('loading.failed');
            if (!this._models) {
                this._models = registerModels();
            }

            // 必须在设置恢复后播放，避免先用默认音量播放。
            if (!this._bgmStarted) {
                Sound.PlayBgm('audio/bgm/00_System');
                this._bgmStarted = true;
            }

            failureMessage = l10n.t('loading.initcharacterserror');
            loadingWin.ShowProgress(
                2, 5, l10n.t('loading.initcharacters'),
            );

            if (!this._characterController) {
                this._characterController = new CharacterController();
            }
            if (!this._characterController.IsLoaded()) {
                // 配置失败只记录日志并保留空目录，不阻断启动。
                await this._characterController.Initialize(new CharacterConfigLoader());
            }

            if (!this._isCurrentAttempt(attemptId)) return;

            failureMessage = l10n.t('loading.initreddotserror');
            loadingWin.ShowProgress(
                3, 5, l10n.t('loading.initreddots'),
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
                4, 5, l10n.t('loading.inittitlewin'),
            );

            const titleVo = await manager.open<TitlePayload>(
                'TitleWin',
                {
                    onEnter: () => this._enterFromTitle(attemptId),
                },
            );

            if (!this._isCurrentAttempt(attemptId)) return;

            // 返回 null 不会进入 catch，必须主动转成异常。
            if (!titleVo) {
                throw new Error('TitleWin 打开失败');
            }

            loadingWin.ShowProgress(
                5, 5, l10n.t('loading.initcomplete'),
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
        ++this._entrySeq;

        this._bootRetryButton?.node.off(
            Button.EventType.CLICK,
            this._retryBoot,
            this,
        );

        this._entryAbort?.Abort();
        this._entryAbort = null;

        this._loadingWin = null;

        this._characterController?.dispose();
        this._characterController = null;
        this._models?.character?.dispose();
        this._models?.team?.dispose();
        this._models = null;

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

    private _entrySeq: number = 0;

    private async _enterFromTitle(attemptId: number): Promise<boolean> {
        this._entryAbort?.Abort();
        const abort = new EntryAbort();
        this._entryAbort = abort;

        if (this._bootState !== BootState.ready) return false;

        const entryId = ++this._entrySeq;
        const alive = () => this._isEntryAlive(entryId, attemptId);

        let state: RecoveryState;
        try {
            state = (await this._recovery.check()).state;
        } catch (e) {
            Log.error('恢复检查失败', { tag: 'App', data: e } as LogOptions);
            return false;
        }
        if (!alive()) return false;

        if (state == RecoveryState.none) {
            return this._tryEnterMainWin(entryId, attemptId);
        }
        if (state == RecoveryState.available) {
            const choice = await this._waitChoice({
                title: l10n.t('recovery.foundTitle'),
                message: l10n.t('recovery.foundMessage'),
                confirmText: l10n.t('recovery.continue'),
                cancelText: l10n.t('recovery.discard'),
                onCancel: async () => {
                    await this._recovery.discard();
                }
            });
            if (choice == ChoiceResult.abort || !alive()) return false;
            if (choice == ChoiceResult.confirm) {
                await this._waitChoice({
                    title: l10n.t('common.confirmTitle'),
                    message: l10n.t('recovery.unavailable'),
                    confirmText: l10n.t('common.understood'),
                    showCancel: false,
                });
                return false;
            }

            return this._tryEnterMainWin(entryId, attemptId);
        }

        if (state == RecoveryState.incompatible) {
            const choice = await this._waitChoice({
                title: l10n.t('recovery.incompatibleTitle'),
                message: l10n.t('recovery.incompatibleMessage'),
                confirmText: l10n.t('common.understood'),
                showCancel: false,
            });
            if (choice != ChoiceResult.confirm || !alive()) return false;
            if (!(await this._tryEnterMainWin(entryId, attemptId))) return false;
            await this._showStagePlaceholder(entryId, attemptId);
            return true;
        }
        return false;
    }

    private async _tryEnterMainWin(entryId: number, attemptId: number): Promise<boolean> {
        if (!this._isEntryAlive(entryId, attemptId)) return false;

        const manager = this._uiManager;
        if (!manager?.isInited) {
            Log.error('UI管理器不可用', { tag: 'App' });
            return false;
        }
        let mainVo = null;

        try {
            if (!this._isEntryAlive(entryId, attemptId)) return false;
            mainVo = await manager.open('MainWin');
        } catch (e) {
            Log.error('MainWin 打开失败', { tag: 'App', data: e } as LogOptions);
            return false;
        }

        if (!this._isEntryAlive(entryId, attemptId)) return false;

        if (!mainVo) {
            Log.error('MainWin 打开失败', { tag: 'App' });
            return false;
        }

        manager.close('TitleWin');
        return true;
    }

    private _waitChoice(payload: ConfirmPayload): Promise<ChoiceResult> {
        const manager = this._uiManager;
        const abort = this._entryAbort;

        if (!manager?.isInited) {
            return Promise.reject(new Error('UI管理器不可用'));
        }
        if (!abort || abort.aborted) {
            return Promise.resolve(ChoiceResult.abort);
        }

        return new Promise<ChoiceResult>((resolve, reject) => {
            let settled = false;
            const settle = (value: ChoiceResult) => {
                if (settled) return;
                settled = true;
                resolve(value);
            };

            void abort.promise.then(() => {
                settle(ChoiceResult.abort);
            });

            void manager.open<ConfirmPayload>('ConfirmDlg', {
                ...payload, onConfirm: async () => {
                    await payload.onConfirm?.();
                    settle(ChoiceResult.confirm);
                }, onCancel: async () => {
                    await payload.onCancel?.();
                    settle(ChoiceResult.cancel);
                }
            }).then(vo => {
                if (!vo) reject(new Error('ConfirmDlg 打开失败'));
            }).catch(reject);
        });
    }

    private _isEntryAlive(entryId: number, attemptId: number): boolean {
        return this._entrySeq === entryId && this._isCurrentAttempt(attemptId);
    }

    private async _showStagePlaceholder(
        entryId: number,
        attemptId: number,
    ): Promise<void> {
        if (!this._isEntryAlive(entryId, attemptId)) return;

        try {
            const choice = await this._waitChoice({
                title: l10n.t('button.stagepick'),
                message: l10n.t('main.stageUnavailable'),
                confirmText: l10n.t('common.understood'),
                showCancel: false,
            });
            if (choice != ChoiceResult.confirm) {
                // 用户取消，不处理
                return;
            }
        } catch (error) {
            // 主页已经打开，这里失败只记录，不应把玩家退回标题。
            Log.error('关卡占位提示打开失败', { tag: 'App', data: error });
        }
    }
}

class EntryAbort {
    public aborted = false;
    public readonly promise: Promise<void>;
    private _resolve!: () => void;

    constructor() {
        this.promise = new Promise<void>((resolve) => {
            this._resolve = resolve;
        });
    }

    public Abort(): void {
        if (this.aborted) return;
        this.aborted = true;
        this._resolve();
    }
}

enum ChoiceResult {
    confirm,
    cancel,
    abort,
}