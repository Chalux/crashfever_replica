import { BaseModel } from "../../Frame/Base";
import { EventKey } from "../../Frame/Event/EventDispatcher";
import { SingletonMixin } from "../../Utils/Singleton";
import { ICharacterConfig } from "./CharacterConfig";

export interface ICharacterChangedPayload {
    characters: ReadonlyArray<ICharacterConfig>;
    loaded: boolean;
}

export const characterEvent = {
    changed: new EventKey<ICharacterChangedPayload>('character.changed'),
};

/**
 * 角色模型：保存已校验的角色目录，并负责发出目录变化事件。
 * 配置读取、校验和查询流程由 CharacterController 负责。
 */
export class CharacterModel extends SingletonMixin(BaseModel) {
    private _characters: Map<string, ICharacterConfig> = new Map();
    private _loaded = false;
    private _loading: Promise<boolean> | null = null;

    public get loaded(): boolean {
        return this._loaded;
    }

    /** 当前共享加载任务；多个 Controller 应复用它，避免重复请求配置。 */
    public get loading(): Promise<boolean> | null {
        return this._loading;
    }

    /** 登记共享加载任务，并在任务结束后自动清理。 */
    public trackLoading(task: Promise<boolean>): Promise<boolean> {
        this._loading = task;
        void task.then(
            () => this.clearLoading(task),
            () => this.clearLoading(task),
        );
        return task;
    }

    public all(): ReadonlyArray<ICharacterConfig> {
        return Array.from(this._characters.values());
    }

    public get(id: string): ICharacterConfig | null {
        return this._characters.get(id) ?? null;
    }

    public has(id: string): boolean {
        return this._characters.has(id);
    }

    /** 用一份完整目录替换当前角色；传入空数组也算加载完成。 */
    public setAll(characters: ReadonlyArray<ICharacterConfig>): void {
        this._characters.clear();
        for (const character of characters) {
            this._characters.set(character.id, { ...character });
        }
        this._loaded = true;
        this.notifyChanged();
    }

    /** 清空目录并恢复未加载状态。 */
    public clear(): void {
        this._characters.clear();
        this._loaded = false;
        this.notifyChanged();
    }

    private clearLoading(task: Promise<boolean>): void {
        if (this._loading === task) {
            this._loading = null;
        }
    }

    private notifyChanged(): void {
        this.eventDispatcher.send(characterEvent.changed, {
            characters: this.all(),
            loaded: this._loaded,
        });
    }
}
