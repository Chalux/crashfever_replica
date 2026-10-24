import { Log } from '../Log/Log';
import { UIRegistration } from './UIRegistration';
import { UIRuntimeEntry } from './UIRuntimeEntry';

/**
 * UI 运行时注册表（移植自 UIRuntimeRegistry.cs）。
 *
 * 三件事：
 * 1. 登记「界面 id → prefab 路径 / 默认参数 / 归属 Mod」；
 * 2. 维护父子路由（嵌套页面）与反向 children 索引；
 * 3. 启动期校验：归属缺失 / 跨 Mod 抢注 / 父路由不存在 / 路由环。
 *
 * 校验结果不抛异常，只把 hasErrors 置 true 并打日志：组合根应在启动后断言它，
 * 避免「注册漏了归属」拖到运行期才以空指针的方式暴露。
 */
export class UIRuntimeRegistry {
    private readonly _map = new Map<string, UIRuntimeEntry>();
    private readonly _parentMap = new Map<string, string>();
    /** children 索引惰性构建；任何注册/注销都会把它置空。 */
    private childrenMap: Map<string, string[]> | null = null;

    /**
     * 上次 validate() 是否发现致命问题（owner 缺失 / 跨 owner 抢注同名界面 / owner 未登记）。
     */
    private _hasErrors = false;

    public get hasErrors(): boolean {
        return this._hasErrors;
    }

    /** 已登记的归属 Mod id 集合（去重，保持首次出现顺序）。 */
    public get ownerModIds(): string[] {
        const result: string[] = [];
        const seen = new Set<string>();
        for (const entry of this._map.values()) {
            if (seen.has(entry.ownerModId)) continue;
            seen.add(entry.ownerModId);
            result.push(entry.ownerModId);
        }
        return result;
    }

    /**
     * 登记一条路由。
     *
     * 两种入参都接受：组合根手写的 `UIRegistration`（声明式，推荐）与已经转换好的
     * `UIRuntimeEntry`（测试与动态注册用）。
     */
    public register(entry: UIRuntimeEntry | UIRegistration): void {
        const runtimeEntry = entry instanceof UIRuntimeEntry ? entry : entry.toRuntimeEntry();

        // 同一界面 id 被不同功能抢占属于装配错误：后者会静默覆盖前者，双方的生命周期管理都会错乱。
        const existing = this._map.get(runtimeEntry.id);
        if (existing && existing.ownerModId !== runtimeEntry.ownerModId) {
            Log.error(
                `UIRoute: 界面 id ${runtimeEntry.id} 已被归属 ${existing.ownerModId} 注册，`
                + `又被 ${runtimeEntry.ownerModId} 覆盖；同一 id 只能属于一个功能 Mod`,
                'UI',
            );
            this._hasErrors = true;
        }

        this._map.set(runtimeEntry.id, runtimeEntry);

        // 父路由关系必须跟着注册项一起更新：同一个 id 重新注册时可能去掉了父路由。
        const route = runtimeEntry.routeMeta;
        this._parentMap.delete(runtimeEntry.id);
        if (route && route.parentId) {
            this._parentMap.set(runtimeEntry.id, route.parentId);
        }
        this.childrenMap = null;
    }

    /**
     * 移除某功能的声明与父路由关系，阻止卸载后的界面再次打开。
     *
     * 先取快照再删除：getByOwner 返回的是数组，不会在遍历中读到被删条目。
     */
    public unregisterOwner(ownerModId: string): void {
        for (const entry of this.getByOwner(ownerModId)) {
            this._map.delete(entry.id);
            this._parentMap.delete(entry.id);
        }
        this.childrenMap = null;
    }

    /** 取某功能 Mod 名下的全部注册项。 */
    public getByOwner(ownerModId: string): UIRuntimeEntry[] {
        if (!ownerModId || ownerModId.trim().length === 0) {
            throw new Error('ownerModId 不能为空');
        }

        const result: UIRuntimeEntry[] = [];
        for (const entry of this._map.values()) {
            if (entry.ownerModId === ownerModId) result.push(entry);
        }
        return result;
    }

    public registerRange(entries: Iterable<UIRuntimeEntry | UIRegistration>): void {
        for (const entry of entries) {
            this.register(entry);
        }
    }

    public get(id: string): UIRuntimeEntry | null {
        return this._map.get(id) ?? null;
    }

    public getAll(): UIRuntimeEntry[] {
        return Array.from(this._map.values());
    }

    public getAllMap(): ReadonlyMap<string, UIRuntimeEntry> {
        return this._map;
    }

    public getParentId(id: string): string | null {
        return this._parentMap.get(id) ?? null;
    }

    /** 某界面的直接子路由 id 列表；没有子路由时返回空数组（不是 null）。 */
    public getChildren(id: string): string[] {
        this.ensureChildrenMap();
        const children = this.childrenMap?.get(id);
        return children ? [...children] : [];
    }

    /**
     * 校验全部注册项。
     *
     * @param knownOwnerModIds 组合根已装配的功能 Mod id 清单；传 null/undefined 表示跳过该项校验。
     * @returns 是否发现致命问题（同时写 hasErrors）。
     */
    public validate(knownOwnerModIds?: ReadonlyArray<string> | null): boolean {
        // 快照 id 集合：校验过程中可能有人补注册（日志回调等），不能让遍历到的集合中途变化。
        const registeredIds = new Set<string>(this._map.keys());

        for (const [id, entry] of this._map) {
            // ① 归属必须声明
            if (!entry.ownerModId || entry.ownerModId.trim().length === 0) {
                Log.error(`UIRoute: 界面 ${id} 未声明归属 Mod（OwnerModId），无法按功能管理其生命周期`, 'UI');
                this._hasErrors = true;
            } else if (knownOwnerModIds && knownOwnerModIds.indexOf(entry.ownerModId) < 0) {
                // ② 归属必须是已装配的功能 Mod（防拼写错误）
                Log.error(`UIRoute: 界面 ${id} 声明的归属 Mod ${entry.ownerModId} 未在 FeatureModCatalog 登记`, 'UI');
                this._hasErrors = true;
            }

            const route = entry.routeMeta;
            if (!route) continue;

            // ③ 父路由必须存在
            if (route.parentId && !registeredIds.has(route.parentId)) {
                Log.error(`UIRoute: 路由 ${id} 的父路由 ${route.parentId} 未注册`, 'UI');
            }
        }

        // 循环引用检测：从每个有父路由的 id 出发向上走，重复遇到同一 id 即成环。
        // 每个起点用独立 idSet，避免不同链之间互相误判。
        for (const startId of this._parentMap.keys()) {
            const idSet = new Set<string>();
            let cur: string | null = startId;
            while (cur !== null) {
                if (idSet.has(cur)) {
                    Log.error(`UIRoute: 路由 ${cur} 存在循环引用`, 'UI');
                    break;
                }
                idSet.add(cur);
                cur = this.getParentId(cur);
            }
        }

        return this._hasErrors;
    }

    private ensureChildrenMap(): void {
        if (this.childrenMap !== null) return;

        this.childrenMap = new Map<string, string[]>();
        for (const [id, parent] of this._parentMap) {
            let children = this.childrenMap.get(parent);
            if (!children) {
                children = [];
                this.childrenMap.set(parent, children);
            }
            children.push(id);
        }
    }
}
