export interface AudioChannelSettings {
    volume: number;
    muted: boolean;
}

export interface SettingsData {
    schemaVersion: 1;
    audio: {
        master: AudioChannelSettings;
        bgm: AudioChannelSettings;
        sfx: AudioChannelSettings;
        ambient: AudioChannelSettings;
    };
}

export function createDefaultSettings(): SettingsData {
    return {
        schemaVersion: 1,
        audio: {
            master: { volume: 100, muted: false },
            bgm: { volume: 100, muted: false },
            sfx: { volume: 100, muted: false },
            ambient: { volume: 100, muted: false },
        },
    };
}

export function cloneSettings(data: SettingsData): SettingsData {
    return {
        schemaVersion: 1,
        audio: {
            master: { ...data.audio.master },
            bgm: { ...data.audio.bgm },
            sfx: { ...data.audio.sfx },
            ambient: { ...data.audio.ambient },
        },
    };
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parseSettings(json: string): SettingsData {
    const value: unknown = JSON.parse(json);
    if (!isRecord(value) || value.schemaVersion !== 1 || !isRecord(value.audio)) {
        throw new Error('设置存档格式或版本不受支持');
    }
    const result = createDefaultSettings();
    for (const name of ['master', 'bgm', 'sfx', 'ambient'] as const) {
        const channel = value.audio[name];
        if (
            !isRecord(channel) || typeof channel.volume !== 'number' ||
            !Number.isFinite(channel.volume) || channel.volume < 0 || channel.volume > 100 ||
            typeof channel.muted !== 'boolean'
        ) {
            throw new Error(`设置存档音频字段无效：${name}`);
        }
        result.audio[name] = { volume: channel.volume, muted: channel.muted };
    }
    return result;
}

export function hasFutureVersion(json: string): boolean {
    try {
        const value: unknown = JSON.parse(json);
        return isRecord(value) && typeof value.schemaVersion === 'number' && value.schemaVersion > 1;
    } catch {
        return false;
    }
}

// 这是“设置备份文件”，暂时不是完整游戏存档。
interface SettingsBackup {
    format: 'crashfever-settings';
    version: 1;
    settings: SettingsData;
}

export function exportSettings(data: SettingsData): string {
    // 复用现有校验，同时生成独立的数据副本。
    const settings = parseSettings(JSON.stringify(data));

    const backup: SettingsBackup = {
        format: 'crashfever-settings',
        version: 1,
        settings,
    };

    return JSON.stringify(backup, null, 2);
}

export interface ImportSettingsDataResult {
    error: string | null;
    settings: SettingsData | null;
}

export function importSettings(json: string): ImportSettingsDataResult {
    let value: unknown;
    try {
        value = JSON.parse(json);
    } catch {
        return { error: '备份文件格式无效', settings: null };
    }

    if (
        typeof value !== 'object' ||
        value === null ||
        Array.isArray(value)
    ) {
        return { error: '备份文件格式无效', settings: null };
    }

    const backup = value as Record<string, unknown>;

    if (
        backup.format !== 'crashfever-settings' ||
        backup.version !== 1
    ) {
        return { error: '不支持的备份文件或版本', settings: null };
    }

    if (!('settings' in backup)) {
        return { error: '备份文件缺少设置数据', settings: null };
    }

    try {
        return { error: null, settings: parseSettings(JSON.stringify(backup.settings)) };
    } catch (error) {
        return {
            error: error instanceof Error ? error.message : '设置数据无效',
            settings: null,
        };
    }
}
