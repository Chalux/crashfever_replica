import { sys } from 'cc';
import { Sound } from '../../../Frame/Audio/Sound';
import { SoundBus } from '../../../Frame/Audio/SoundBus';
import { Log } from '../../../Frame/Log';
import { cloneSettings, createDefaultSettings, parseSettings, SettingsData } from './SettingsData';
import { SettingsSaveService } from './SettingsSaveService';

/** Application settings: confirmed snapshot, audio preview and persistence. */
export class SettingsService {
    private static SaveService: SettingsSaveService | null = null;
    private static Current = createDefaultSettings();

    static Initialize(): void {
        // Access localStorage inside the adapter so restricted browser storage is caught by load/save.
        this.SaveService = new SettingsSaveService({
            getItem: key => sys.localStorage.getItem(key),
            setItem: (key, value) => sys.localStorage.setItem(key, value),
        }, message => Log.warn(message, 'Save'));
        this.Current = this.SaveService.load().data;
        this.Apply(this.Current);
    }

    static CaptureAudio(): SettingsData {
        const data = cloneSettings(this.Current);
        for (const [name, bus] of this.AudioChannels) {
            data.audio[name] = {
                volume: Sound.GetBusVolumePercent(bus),
                muted: Sound.GetBusMute(bus),
            };
        }
        return data;
    }

    static Apply(data: SettingsData): void {
        for (const [name, bus] of this.AudioChannels) {
            Sound.SetBusMute(bus, data.audio[name].muted);
            Sound.SetBusVolumePercent(bus, data.audio[name].volume);
        }
    }

    static SaveAudio(): boolean {
        const data = this.CaptureAudio();
        if (!this.SaveService?.save(data)) return false;
        this.Current = cloneSettings(data);
        return true;
    }

    private static readonly AudioChannels = [
        ['master', SoundBus.Master], ['bgm', SoundBus.BGM],
        ['sfx', SoundBus.SFX], ['ambient', SoundBus.Ambient],
    ] as const;

    // 获取已经保存的设置，不包含设置页上尚未保存的试听修改。
    static GetSavedSettings(): SettingsData {
        return cloneSettings(this.Current);
    }

    // 校验、写入成功后，再提交内存状态并应用音量。
    static ImportSettings(data: SettingsData): void {
        const checked = parseSettings(JSON.stringify(data));

        if (!this.SaveService?.save(checked)) {
            throw new Error('设置保存失败');
        }

        this.Current = cloneSettings(checked);
        this.Apply(this.Current);
    }
}
