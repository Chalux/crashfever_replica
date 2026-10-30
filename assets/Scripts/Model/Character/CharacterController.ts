import { BaseController } from "../../Frame/Base";
import { Log } from "../../Frame/Log";
import { ICharacterConfig, ICharacterConfigLoader } from "./CharacterConfig";
import { CharacterModel } from "./CharacterModel";

export interface ICharacterController {
    Initialize(loader: ICharacterConfigLoader): Promise<boolean>;
    All(): ReadonlyArray<ICharacterConfig>;
    Get(id: string): ICharacterConfig | null;
    Has(id: string): boolean;
    IsLoaded(): boolean;
}

/**
 * 角色控制器：调用配置加载器，把已校验的角色目录写入 CharacterModel，
 * 并提供目录查询。控制器本身不保存角色数据。
 */
export class CharacterController extends BaseController<CharacterModel> implements ICharacterController {
    constructor(model: CharacterModel = CharacterModel.getInstance()) {
        super();
        this.bindModel(model);
    }

    public async Initialize(loader: ICharacterConfigLoader): Promise<boolean> {
        if (this.disposed) {
            return false;
        }
        if (!loader) {
            Log.error('角色配置加载器未传入', 'Character');
            return false;
        }

        if (this.initialized) {
            return true;
        }

        const model = this.requireModel();

        // 已有目录说明启动流程或其他控制器已经加载过，不重复请求配置。
        if (model.loaded) {
            model.init();
            this.init();
            return true;
        }

        // 加载锁在 Model 上，多个 Controller 共享同一个请求。
        if (model.loading) {
            const result = await model.loading;
            if (!this.disposed && model.loaded) {
                model.init();
                this.init();
            }
            return this.disposed ? false : result;
        }

        const result = await model.trackLoading(this.load(loader));
        return this.disposed ? false : result;
    }

    public All(): ReadonlyArray<ICharacterConfig> {
        return this.model?.all() ?? [];
    }

    public Get(id: string): ICharacterConfig | null {
        return this.model?.get(id) ?? null;
    }

    public Has(id: string): boolean {
        return this.model?.has(id) ?? false;
    }

    public IsLoaded(): boolean {
        return this.model?.loaded ?? false;
    }

    private async load(loader: ICharacterConfigLoader): Promise<boolean> {
        try {
            const characters = await loader.Load();
            if (this.disposed) {
                return false;
            }

            const model = this.requireModel();
            model.setAll(characters);
            model.init();
            this.init();
            return true;
        } catch (error) {
            Log.error('角色配置加载失败', { tag: 'Character', data: error });
            return false;
        }
    }
}
