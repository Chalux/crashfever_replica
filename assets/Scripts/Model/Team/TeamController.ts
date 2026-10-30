import { BaseController } from "../../Frame/Base";
import { Log } from "../../Frame/Log";
import { ITeamData, ITeamSaveService } from "./TeamData";
import { TeamModel } from "./TeamModel";

export interface ITeamController {
    Initialize(saveService: ITeamSaveService): Promise<void>;
    GetTeam(index: number): Readonly<ITeamData> | null;
    GetSelectedIndex(): number;
    Select(index: number): boolean;
    Assign(index: number, slot: number, characterId: string | null): boolean;
    Remove(index: number, slot: number): boolean;
    Rename(index: number, name: string): boolean;
    CanDeploy(index: number): boolean;
    IsDirty(): boolean;
    Save(): boolean;
    Discard(): void;
}

/**
 * 编队控制器：操作 TeamModel 中的数据并调用存档服务。
 * 控制器本身不保存编队数据，也不创建事件分发器。
 */
export class TeamController extends BaseController<TeamModel> implements ITeamController {
    private _saveService: ITeamSaveService | null = null;

    constructor(model: TeamModel = TeamModel.getInstance()) {
        super();
        this.bindModel(model);
    }

    public async Initialize(saveService: ITeamSaveService): Promise<void> {
        if (this.disposed) {
            return;
        }
        if (!saveService) {
            Log.error("TeamSaveService未传入正确的类", "Team");
            return;
        }

        this._saveService = saveService;

        if (this.initialized) {
            return;
        }

        const model = this.requireModel();

        // 已经有数据说明另一个控制器或启动流程已经加载过，不能覆盖未保存修改。
        if (model.data) {
            model.init();
            this.init();
            return;
        }

        this.load(saveService);
    }

    public GetTeam(index: number): Readonly<ITeamData> | null {
        // 克隆一个副本，避免外部修改内部数据
        const team = this.getTeam(index);
        return team ? { name: team.name, slots: team.slots.slice() } : null;
    }

    public GetSelectedIndex(): number {
        const data = this.model?.data;
        if (!data || !Array.isArray(data.teams) || data.teams.length === 0) {
            return 0;
        }

        const selected = data.selectedTeam;
        return Number.isInteger(selected) && selected >= 0 && selected < data.teams.length
            ? selected
            : 0;
    }

    public Select(index: number): boolean {
        const data = this.model?.data;
        if (!data || !this.getTeam(index)) {
            return false;
        }
        if (data.selectedTeam === index) {
            return true;
        }

        data.selectedTeam = index;
        this.requireModel().markDirty();
        return true;
    }

    public Assign(index: number, slot: number, characterId: string | null): boolean {
        if (characterId !== null && !characterId) {
            return false;
        }

        const team = this.getTeam(index);
        if (!team || !this.isValidSlot(team, slot)) {
            return false;
        }
        if (team.slots[slot] === characterId) {
            return true;
        }

        team.slots[slot] = characterId;
        this.requireModel().markDirty();
        return true;
    }

    public Remove(index: number, slot: number): boolean {
        const team = this.getTeam(index);
        if (!team || !this.isValidSlot(team, slot)) {
            return false;
        }
        if (team.slots[slot] === null) {
            return true;
        }

        team.slots[slot] = null;
        this.requireModel().markDirty();
        return true;
    }

    public Rename(index: number, name: string): boolean {
        const team = this.getTeam(index);
        if (!team) {
            return false;
        }
        if (team.name === name) {
            return true;
        }

        team.name = name;
        this.requireModel().markDirty();
        return true;
    }

    public CanDeploy(index: number): boolean {
        const team = this.getTeam(index);
        return !!team && team.slots.some(slot => slot !== null && slot !== '');
    }

    public IsDirty(): boolean {
        return this.model?.dirty ?? false;
    }

    public Save(): boolean {
        const model = this.model;
        const data = model?.data;
        if (!this._saveService || !model || !data) {
            return false;
        }
        if (!this._saveService.Save(data)) {
            return false;
        }

        model.acceptSaved();
        return true;
    }

    public Discard(): void {
        this.model?.discard();
    }

    private load(saveService: ITeamSaveService): void {
        try {
            const data = saveService.Load();
            if (this.disposed) {
                return;
            }

            const model = this.requireModel();
            if (!model.load(data.data)) {
                Log.error("编队存档数据无效", "Team");
                return;
            }

            model.init();
            this.init();
        } catch (error) {
            Log.error("编队存档加载失败", { tag: "Team", data: error });
        }
    }

    private getTeam(index: number): ITeamData | null {
        const teams = this.model?.data?.teams;
        if (!teams || !Number.isInteger(index) || index < 0 || index >= teams.length) {
            return null;
        }
        return teams[index] ?? null;
    }

    private isValidSlot(team: ITeamData, slot: number): boolean {
        return Number.isInteger(slot) && slot >= 0 && slot < team.slots.length;
    }
}
