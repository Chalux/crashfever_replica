import { createDefaultSettings, hasFutureVersion, parseSettings, SettingsData } from './SettingsData';

export interface SettingsStorage {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
}

export interface SettingsLoadResult {
    data: SettingsData;
    source: 'primary' | 'backup' | 'default';
    canSave: boolean;
}

/** Storage-independent port of Godot's primary/backup save service. */
export class SettingsSaveService {
    static readonly PrimaryKey = 'crashfever.settings';
    static readonly BackupKey = 'crashfever.settings.backup';

    private _canSave = false;

    constructor(
        private readonly _storage: SettingsStorage,
        private readonly _warn: (message: string) => void,
    ) {}

    load(): SettingsLoadResult {
        this._canSave = false;
        try {
            for (const [key, source] of [
                [SettingsSaveService.PrimaryKey, 'primary'],
                [SettingsSaveService.BackupKey, 'backup'],
            ] as const) {
                const json = this._storage.getItem(key);
                if (json === null) continue;
                if (hasFutureVersion(json)) {
                    this._warn('设置存档来自更高版本，本次使用默认设置并禁止覆盖原存档');
                    return { data: createDefaultSettings(), source: 'default', canSave: false };
                }
                try {
                    const data = parseSettings(json);
                    this._canSave = true;
                    if (source === 'backup') this._warn('设置主存档不可用，已读取备份');
                    return { data, source, canSave: true };
                } catch (error) {
                    this._warn(`设置存档校验失败（${source}）：${String(error)}`);
                }
            }
            this._canSave = true;
            return { data: createDefaultSettings(), source: 'default', canSave: true };
        } catch (error) {
            this._warn(`无法读取本地设置，本次使用默认值并禁止覆盖：${String(error)}`);
            return { data: createDefaultSettings(), source: 'default', canSave: false };
        }
    }

    save(data: SettingsData): boolean {
        if (!this._canSave) {
            this._warn('当前设置存档不可写，请先解决读取失败或版本不兼容问题');
            return false;
        }
        try {
            const json = JSON.stringify(parseSettings(JSON.stringify(data)));
            const previous = this._storage.getItem(SettingsSaveService.PrimaryKey);
            if (previous !== null) {
                if (hasFutureVersion(previous)) {
                    this._canSave = false;
                    this._warn('发现更高版本设置存档，已停止覆盖');
                    return false;
                }
                let validPrevious = false;
                try {
                    parseSettings(previous);
                    validPrevious = true;
                } catch {
                    // A corrupt primary must never replace the last valid backup.
                }
                if (validPrevious) {
                    this._storage.setItem(SettingsSaveService.BackupKey, previous);
                }
            }
            // Separate key writes are not a cross-key transaction. Backup is written first.
            this._storage.setItem(SettingsSaveService.PrimaryKey, json);
            return true;
        } catch (error) {
            this._warn(`设置保存失败：${String(error)}`);
            return false;
        }
    }
}
