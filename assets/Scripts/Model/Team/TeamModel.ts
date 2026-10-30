import { BaseModel } from "../../Frame/Base";
import { EventKey } from "../../Frame/Event/EventDispatcher";
import { SingletonMixin } from "../../Utils/Singleton";
import { checkDataValidate, cloneTeamSaveData, ITeamSaveData } from "./TeamData";

export interface ITeamChangedPayload {
    data: ITeamSaveData | null;
    dirty: boolean;
}

export const teamEvent = {
    changed: new EventKey<ITeamChangedPayload>('team.changed'),
};

/**
 * 编队模型：只保存当前存档数据和最后一次成功保存的快照，并负责发出变更事件。
 * 编队操作和存档读写由 TeamController 负责。
 */
export class TeamModel extends SingletonMixin(BaseModel) {
    private _data: ITeamSaveData | null = null;
    private _savedData: ITeamSaveData | null = null;
    private _dirty = false;

    public get data(): ITeamSaveData | null {
        return this._data;
    }

    public get dirty(): boolean {
        return this._dirty;
    }

    /** 载入存档并重置保存快照；失败时保留原数据。 */
    public load(data: ITeamSaveData | null): boolean {
        if (!checkDataValidate(data)) {
            return false;
        }

        const loaded = cloneTeamSaveData(data);
        this._data = loaded;
        this._savedData = cloneTeamSaveData(loaded);
        this._dirty = false;
        this.notifyChanged();
        return true;
    }

    /** 标记当前数据已修改，并通知订阅方刷新。 */
    public markDirty(): void {
        this._dirty = true;
        this.notifyChanged();
    }

    /** 保存成功后把当前数据记为新的快照。 */
    public acceptSaved(): void {
        if (!this._data) {
            return;
        }

        this._savedData = cloneTeamSaveData(this._data);
        this._dirty = false;
        this.notifyChanged();
    }

    /** 丢弃未保存修改，回到最后一次成功读取或保存的状态。 */
    public discard(): boolean {
        if (!this._savedData) {
            return false;
        }

        this._data = cloneTeamSaveData(this._savedData);
        this._dirty = false;
        this.notifyChanged();
        return true;
    }

    private notifyChanged(): void {
        this.eventDispatcher.send(teamEvent.changed, {
            data: this._data,
            dirty: this._dirty,
        });
    }
}
