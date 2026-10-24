import { DefaultUIOpenOpt } from './Def/DefaultUIOpenOpt';
import { EUIType } from './Def/EUIType';
import type { UIOpenOpt } from './Def/UIOpenOpt';
import { UIRouteMeta, UIRuntimeEntry } from './UIRuntimeEntry';

/**
 * 声明式 UI 注册项（移植自 UIRegistration.cs）。
 *
 * 组合根用它描述「有哪些界面」；UIManager.init 之前把它转成 UIRuntimeEntry 注册进
 * UIRuntimeRegistry。ownerModId 是必填：每个界面必须归属唯一功能 Mod，
 * 用于启动期校验、按功能批量关闭/销毁，以及界面取门面时的归属解析（ui-mod-binding §5）。
 */
export class UIRegistration {
    /** 归属功能 Mod 的 id（与 FeatureModCatalog 中登记的 modId 一致）。 */
    public readonly ownerModId: string;

    public readonly id: string;

    /** prefab 所在的 resources 子目录。 */
    public readonly dir: string;

    public readonly type: EUIType;

    /** 类型基线参数（工厂里按 type 填好）。 */
    public readonly baseOpenOpt: UIOpenOpt | null;

    /** 注册项自己的打开参数。 */
    public readonly openOpt: UIOpenOpt | null;

    /** 父路由元数据（withParent 填写）。 */
    public readonly parent: UIRouteMeta | null;

    constructor(
        ownerModId: string,
        id: string,
        dir: string,
        type: EUIType,
        baseOpenOpt: UIOpenOpt | null = null,
        openOpt: UIOpenOpt | null = null,
        parent: UIRouteMeta | null = null,
    ) {
        this.ownerModId = ownerModId;
        this.id = id;
        this.dir = dir;
        this.type = type;
        this.baseOpenOpt = baseOpenOpt;
        this.openOpt = openOpt;
        this.parent = parent;
    }

    public static page(ownerModId: string, id: string, dir: string): UIRegistration {
        return new UIRegistration(ownerModId, id, dir, EUIType.Pge, DefaultUIOpenOpt.forType(EUIType.Pge));
    }

    public static dialog(ownerModId: string, id: string, dir: string): UIRegistration {
        return new UIRegistration(ownerModId, id, dir, EUIType.Dlg, DefaultUIOpenOpt.forType(EUIType.Dlg));
    }

    public static window(ownerModId: string, id: string, dir: string): UIRegistration {
        return new UIRegistration(ownerModId, id, dir, EUIType.Win, DefaultUIOpenOpt.forType(EUIType.Win));
    }

    public static popup(ownerModId: string, id: string, dir: string): UIRegistration {
        return new UIRegistration(ownerModId, id, dir, EUIType.Pop, DefaultUIOpenOpt.forType(EUIType.Pop));
    }

    /**
     * 声明父路由（C# record 的 `with` 语义：返回新实例，不修改原对象）。
     *
     * @param parentId 父界面 id。
     * @param parentOpenOpt 打开父界面时使用的参数。
     * @param parentOpenPayload 打开父界面时使用的载荷（共享实例，打开链里会先复制）。
     */
    public withParent(
        parentId: string,
        parentOpenOpt: UIOpenOpt | null = null,
        parentOpenPayload: unknown = null,
    ): UIRegistration {
        const meta = new UIRouteMeta();
        meta.parentId = parentId;
        meta.parentOpenOpt = parentOpenOpt;
        meta.parentOpenPayload = parentOpenPayload;

        return new UIRegistration(
            this.ownerModId,
            this.id,
            this.dir,
            this.type,
            this.baseOpenOpt,
            this.openOpt,
            meta,
        );
    }

    /** 转成运行时注册项（交给 UIRuntimeRegistry.register）。 */
    public toRuntimeEntry(): UIRuntimeEntry {
        return new UIRuntimeEntry(
            this.ownerModId,
            this.id,
            this.dir,
            this.type,
            this.baseOpenOpt,
            this.openOpt,
            this.parent,
        );
    }
}
