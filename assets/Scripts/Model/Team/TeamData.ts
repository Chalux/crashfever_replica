export const teamCount = 30;
export const teamSlotCount = 4;
export const currentVersion = 1;

export interface ITeamData {
    name: string;
    slots: Array<string | null>;
}

export interface ITeamSaveData {
    version: 1;
    selectedTeam: number;
    teams: ITeamData[];
}

export interface ITeamSaveService {
    Load(): ITeamLoadResult;
    Save(data: ITeamSaveData): boolean;
}

export type TeamSaveSource = 'primary' | 'backup' | 'default';

/** 一次读取的结果：数据 + 来源 + 本次会话是否允许写回。 */
export interface ITeamLoadResult {
    data: ITeamSaveData;
    source: TeamSaveSource;   // 数据是从主档、备份还是默认值来的
    canSave: boolean;         // false = 高版本/存储不可用，本次禁止覆盖
}

/** TeamSaveService 依赖的最小存储端口；只有字符串键值，不暴露 clear/removeItem/length。 */
export interface ITeamStorage {
    getItem(key: string): string | null;   // 不存在返回 null，与 localStorage 语义一致
    setItem(key: string, value: string): void; // 写入失败直接抛异常，由服务转成 false
}

/** 深复制编队存档，避免模型和调用方共享可变数组。 */
export function cloneTeamSaveData(data: ITeamSaveData): ITeamSaveData {
    const teams = data.teams.map((team) => ({
        name: team.name,
        slots: team.slots.slice(),
    }));
    const selectedTeam = Number.isInteger(data.selectedTeam)
        && data.selectedTeam >= 0
        && data.selectedTeam < teams.length
        ? data.selectedTeam
        : 0;

    return {
        version: 1,
        selectedTeam,
        teams,
    };
}

/** 默认 30 队：名称「编队 1」到「编队 30」，每队 4 个空槽，当前队 0。 */
export function createDefaultTeamSaveData(): ITeamSaveData {
    const teams: ITeamData[] = [];
    for (let i = 0; i < teamCount; i++) {
        teams.push({
            name: `编队 ${i + 1}`,
            slots: Array(teamSlotCount).fill(null),
        });
    }
    return {
        version: currentVersion,
        selectedTeam: 0,
        teams,
    };
}

/** 完整校验编队存档；同时作为类型守卫，供模型和存档服务复用，避免两套规则漂移。 */
export function checkDataValidate(data: unknown): data is ITeamSaveData {
    if (!data || typeof data !== 'object') return false;

    const value = data as ITeamSaveData;
    if (value.version !== currentVersion) return false;
    if (!Array.isArray(value.teams) || value.teams.length !== teamCount) return false;
    if (!Number.isSafeInteger(value.selectedTeam)
        || value.selectedTeam < 0
        || value.selectedTeam >= teamCount) return false;

    for (const team of value.teams) {
        if (!team || typeof team.name !== 'string') return false;
        if (!Array.isArray(team.slots) || team.slots.length !== teamSlotCount) return false;
        if (!team.slots.every(slot => slot === null || typeof slot === 'string')) return false;
    }
    return true;
}
