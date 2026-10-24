import { _decorator, Component, Node } from 'cc';
import { EUILayer, UIManager, UIRegistration, UIRuntimeRegistry } from '../../Frame/UI';
import { TitlePayload, TitleWin } from './UI/TitleWin';
import { SoundManager } from '../../Frame/Audio/SoundManager';
import { Sound } from '../../Frame/Audio/Sound';
import { SettingsService } from './Save/SettingsService';
const { ccclass, property } = _decorator;

@ccclass('AppEntry')
export class AppEntry extends Component {
    @property({ type: Node, visible: true })
    private _uiRoot: Node | null;

    @property({ type: SoundManager, visible: true })
    private _soundManager: SoundManager | null = null;

    private _uiManager: UIManager | null = null;

    async start() {
        if (!this._uiRoot) {
            throw new Error("UIRoot绑定错误！");
        }

        // this.bootHint.string = l10n.t("title.entry");

        if (!this._soundManager) {
            throw new Error("SoundManager 未绑定");
        }

        Sound.Configure(this._soundManager);
        SettingsService.Initialize();
        Sound.PlayBgm("audio/bgm/00_System");
        // Sound.PlaySfx("audio/sfx/candidates/sse_009");

        const uiRegistry = new UIRuntimeRegistry();
        uiRegistry.registerRange([
            UIRegistration.window('app', 'BootLoadingWin', 'ui/app'),
            UIRegistration.window('app', 'TitleWin', 'ui/app'),
            UIRegistration.window('app', 'MainWin', 'ui/app'),
            UIRegistration.dialog('app', 'SettingDlg', 'ui/app'),
            UIRegistration.dialog('app', 'ConfirmDlg', 'ui/app'),
        ]);

        const manager = new UIManager();
        this._uiManager = manager;

        manager.init({
            root: this._uiRoot,
            layers: [EUILayer.Win, EUILayer.Dlg, EUILayer.Loading, EUILayer.Pop],
            topLayers: [EUILayer.Debug, EUILayer.Notice],
            registry: uiRegistry,
            knownOwnerModIds: ['app'],
        });

        if (uiRegistry.hasErrors) {
            throw new Error("UI注册表存在错误！");
        }

        if (!manager.isInited) {
            throw new Error("UIManager初始化失败！");
        }

        const loadingWin = await manager.open('BootLoadingWin');
        if (!loadingWin) {
            throw new Error("BootLoadingWin打开失败！");
        }
        const titleWin = await manager.open<TitlePayload>('TitleWin', {
            onEnter: async () => {
                const mainWin = await manager.open('MainWin');

                if (!mainWin) {
                    throw new Error('MainWin 打开失败');
                }

                manager.close('TitleWin');
            },
        });

        if (!titleWin) {
            throw new Error('TitleWin 打开失败');
        }

        manager.close('BootLoadingWin');
    }

    onDestroy() {
        this._uiManager?.dispose();
        this._uiManager = null;
    }
}


