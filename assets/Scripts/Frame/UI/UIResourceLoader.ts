import { Prefab, resources } from 'cc';
import { Log } from '../Log/Log';

/**
 * UI 资源加载器。
 *
 * 只暴露 promise 化的资源加载，不关心状态机；「加载结果是否已经过期」
 * 由调用方用 flag/token 判断（Cocos 的加载无法真正取消）。
 *
 * 约定：界面 prefab 放在 assets/resources 下，path 为相对 resources 的无扩展名路径，
 * 例如 "ui/run/RunMainWin" 对应 assets/resources/ui/run/RunMainWin.prefab。
 */
export class UIResourceLoader {
    public static loadPrefab(path: string): Promise<Prefab | null> {
        return new Promise<Prefab | null>((resolve) => {
            resources.load(path, Prefab, (err: Error | null, asset: Prefab) => {
                if (err) {
                    Log.error(`UI 资源加载失败：${path}（${err.message}）`, 'UI');
                    resolve(null);
                    return;
                }
                resolve(asset ?? null);
            });
        });
    }

    /**
     * 并发加载多个 prefab，顺序与入参一致；失败项为 null（不整体失败）。
     */
    public static async loadPrefabs(paths: ReadonlyArray<string>): Promise<Array<Prefab | null>> {
        return Promise.all(paths.map((path) => UIResourceLoader.loadPrefab(path)));
    }
}
