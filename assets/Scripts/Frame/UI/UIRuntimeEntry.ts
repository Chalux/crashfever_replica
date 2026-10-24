import type { EUIType } from './Def/EUIType';
import type { UIOpenOpt } from './Def/UIOpenOpt';

/**
 * UI 运行时路由元数据（移植自 UIRuntimeRegistry.cs 的 UIRouteMeta）。
 *
 * 只描述「父子嵌套路由」这一件事：子界面本身不带父界面信息，
 * 由注册项通过 UIRegistration.withParent() 声明。
 */
export class UIRouteMeta {
    /** 父界面 id；为空表示这是一条根路由。 */
    public parentId?: string;

    /**
     * 打开父界面时使用的参数。
     *
     * 注意：它属于「启动期注册的共享实例」，打开链里必须 clone / 复制后再用，
     * 否则会把 pgeId 之类的运行时字段写回注册表，污染同路由的后续打开。
     */
    public parentOpenOpt?: UIOpenOpt | null;

    /** 打开父界面时使用的载荷（通常是共享字典，同理必须先复制）。 */
    public parentOpenPayload?: unknown;
}

/**
 * UI 运行时注册项（移植自 UIRuntimeRegistry.cs 的 UIRuntimeEntry）。
 *
 * 它把「界面是谁的、资源在哪、默认怎么开」固定下来；UIManager 打开界面时
 * 只依赖它，不再回头看具体的 BaseWin 子类。
 *
 * 与 C# 的差异：C# 的 required/init 是编译期约束，TS 这里用构造参数表达；
 * ownerModId 仍必须非空，由 UIRuntimeRegistry.validate() 在启动期兜底校验。
 */
export class UIRuntimeEntry {
    /** 归属功能 Mod 的 id（必填，见 ui-mod-binding 规格 §5.2）。 */
    public readonly ownerModId: string;

    /** 界面 id（全局唯一）。 */
    public readonly id: string;

    /** 界面 prefab 所在的 resources 子目录，例如 "ui/run"。 */
    public readonly dir: string;

    /** 界面类型，决定默认打开方式与层级。 */
    public readonly type: EUIType;

    /** 类型基线参数（来自 DefaultUIOpenOpt.forType）。 */
    public readonly baseOpenOpt: UIOpenOpt | null;

    /** 注册项自己的打开参数（优先级高于基线、低于调用点）。 */
    public readonly openOpt: UIOpenOpt | null;

    /** 嵌套路由元数据（可选）。 */
    public readonly routeMeta: UIRouteMeta | null;

    constructor(
        ownerModId: string,
        id: string,
        dir: string,
        type: EUIType,
        baseOpenOpt: UIOpenOpt | null = null,
        openOpt: UIOpenOpt | null = null,
        routeMeta: UIRouteMeta | null = null,
    ) {
        this.ownerModId = ownerModId;
        this.id = id;
        this.dir = dir;
        this.type = type;
        this.baseOpenOpt = baseOpenOpt;
        this.openOpt = openOpt;
        this.routeMeta = routeMeta;
    }

    /**
     * prefab 路径。
     *
     * Cocos 用 resources 相对路径：不要 "res://" 前缀、也不带 ".prefab" 扩展名
     * （resources.load 会自动补扩展名）。因此这里是 `${dir}/${id}` 而不是 C# 的 ${dir}/${id}.tscn。
     */
    public get prefabPath(): string {
        return `${this.dir}/${this.id}`;
    }
}
