import { sys } from 'cc';
import { Log } from '../../Frame/Log';
import { ITeamStorage } from './TeamData';
import { TeamSaveService } from './TeamSaveService';

class LocalStorageTeamStorage implements ITeamStorage {
    public getItem(key: string): string | null {
        return sys.localStorage.getItem(key);
    }
    public setItem(key: string, value: string): void {
        sys.localStorage.setItem(key, value);
    }
}

/**
 * 编队存档的组装点：cc 侧只调用它拿服务，不自己拼 localStorage。
 * 注意这里不访问数据、不判断版本；读写异常留给 TeamSaveService 的 try/catch。
 */
export function createTeamSaveService(): TeamSaveService {
    return new TeamSaveService(new LocalStorageTeamStorage(), message => Log.warn(message, 'Team'));
}