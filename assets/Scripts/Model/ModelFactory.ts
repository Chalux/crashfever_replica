import { CharacterModel } from './Character/CharacterModel';
import { TeamModel } from './Team/TeamModel';

/**
 * 启动时统一注册的模型集合。
 *
 * 新增业务模型时，在接口和 registerModels 的返回值里各补一项即可；调用方只
 * 依赖这个集合，不需要逐个知道模型是单例还是普通实例。
 */
export interface IModelRegistry {
    readonly character: CharacterModel;
    readonly team: TeamModel;
}

/**
 * 创建并初始化所有业务模型。
 *
 * 模型本身通过 SingletonMixin 提供单例访问，因此重复调用会得到同一批实例；
 * BaseModel.init 是幂等的，重试启动不会重复执行模型初始化。
 */
export function registerModels(): IModelRegistry {
    const models: IModelRegistry = {
        character: CharacterModel.getInstance(),
        team: TeamModel.getInstance(),
    };

    for (const model of Object.values(models)) {
        model.init();
    }

    return models;
}
