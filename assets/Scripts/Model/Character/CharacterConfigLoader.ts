import { JsonAsset, resources } from "cc";
import { Log } from "../../Frame/Log";
import {
    ICharacterConfig,
    ICharacterConfigLoader,
    validateCharacterConfigs,
} from "./CharacterConfig";

/** 从 resources 读取角色配置；只负责引擎适配和日志，不直接修改业务模型。 */
export class CharacterConfigLoader implements ICharacterConfigLoader {
    public Load(): Promise<ICharacterConfig[]> {
        return new Promise((resolve, reject) => {
            resources.load('config/characters', JsonAsset, (err, asset) => {
                if (err) {
                    Log.error('角色配置加载失败', { tag: 'Character', data: err });
                    reject(err)
                    return;
                }

                const result = validateCharacterConfigs(asset?.json);
                if (result.errors.length > 0) {
                    for (const error of result.errors) {
                        Log.error(error, 'Character');
                    }
                    Log.error('角色配置校验失败，已拒绝整份配置', 'Character');
                    reject(new Error('角色配置校验失败，已拒绝整份配置'));
                    return;
                }

                if (result.characters.length === 0) {
                    Log.warn('角色配置为空', 'Character');
                } else {
                    Log.info(`角色配置加载完成：${result.characters.length} 个`, 'Character');
                }
                resolve(result.characters);
            });
        });
    }
}
