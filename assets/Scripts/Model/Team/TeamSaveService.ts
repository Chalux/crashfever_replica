import { checkDataValidate, createDefaultTeamSaveData, currentVersion, ITeamLoadResult, ITeamSaveData, ITeamSaveService, ITeamStorage } from "./TeamData";

export class TeamSaveService implements ITeamSaveService {
    static readonly PrimaryKey = 'crashfever.teams';
    static readonly BackupKey = 'crashfever.teams.backup';

    private _canSave = false;

    constructor(private readonly _storage: ITeamStorage, private readonly _warn: (message: string) => void) { }

    Load(): ITeamLoadResult {
        this._canSave = false;

        for (const [key, source] of [
            [TeamSaveService.PrimaryKey, 'primary'],
            [TeamSaveService.BackupKey, 'backup'],
        ] as const) {
            const json = this._storage.getItem(key);
            if (json === null) continue;

            if (this.isFutureTeamSave(json)) {
                this._warn('编队存档来自更高版本，本次使用默认编队并禁止覆盖');
                return { data: createDefaultTeamSaveData(), source: 'default', canSave: false };
            }

            const data = this.parseTeamSaveData(json);   // 失败返回 null 并记录原因
            if (data) {
                this._canSave = true;
                if (source === 'backup') this._warn('编队主存档不可用，已读取备份');
                return { data, source, canSave: true };
            }
            this._warn(`编队存档校验失败（${source}）`);
        }

        this._canSave = true;   // 主备都不存在或都损坏 → 可安全重建
        return { data: createDefaultTeamSaveData(), source: 'default', canSave: true };
    }

    Save(data: ITeamSaveData): boolean {
        if (!this._canSave) {
            this._warn('当前编队存档不可写，已取消保存');
            return false;
        }
        if (!checkDataValidate(data)) {
            this._warn('编队存档数据无效，已取消保存');
            return false;
        }

        try {
            const json = JSON.stringify(data);
            const oldData = this._storage.getItem(TeamSaveService.PrimaryKey);

            if (oldData !== null) {
                // 读取之后别处写入了更高版本，不能覆盖。
                if (this.isFutureTeamSave(oldData)) {
                    this._canSave = false;
                    this._warn('发现更高版本编队存档，已停止覆盖');
                    return false;
                }

                // 只备份「能完整校验通过」的旧主档；损坏的旧主档不复制，也不阻断本次保存。
                try {
                    if (checkDataValidate(JSON.parse(oldData))) {
                        this._storage.setItem(TeamSaveService.BackupKey, oldData);
                    }
                } catch {
                    // 旧主档损坏：跳过备份，继续写新主档。
                }
            }

            this._storage.setItem(TeamSaveService.PrimaryKey, json);
            return true;
        } catch (error) {
            this._warn(`编队存档保存失败: ${error}`);
            return false;
        }
    }

    private isFutureTeamSave(json: string): boolean {
        try {
            const data = JSON.parse(json);
            return !!data && typeof data === 'object' && data.version > currentVersion;
        } catch (error) {
            return false;
        }
    }

    private parseTeamSaveData(json: string): ITeamSaveData | null {
        try {
            const data = JSON.parse(json);
            return checkDataValidate(data) ? data : null;
        } catch (error) {
            return null;
        }
    }
}
