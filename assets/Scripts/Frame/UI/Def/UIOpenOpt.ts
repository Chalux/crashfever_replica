import { Color, Node, Vec2 } from 'cc';
import { EAnimType } from './EAnimType';
import { EUIAlign } from './EUIAlign';
import { EUILayer } from './EUILayer';
import { IUIVoHandle } from './IUIVoHandle';

/**
 * 遮罩选项。
 *
 * 只有 runtime（遮罩 prefab 路径）会被框架消费：框架负责加载并挂到界面之下。
 * 其余字段仅随 clone() 复制，透明度、点击关闭、最短展示时间等行为需要在
 * 具体的 BaseMask 子类里实现，不要以为在这里赋值就会生效。
 */
export class UIMaskOpt {
    /** 遮罩 prefab 的 resources 相对路径；为空表示无遮罩。 */
    public runtime?: string;

    public alpha = 0.6;
    public clickClose = true;
    public hideTipText = false;
    public closeMinTime = 0;
    public color: Color = Color.BLACK;
    public payload?: unknown;
}

/** 气泡位置参数；框架不做自动定位，由界面自行使用。 */
export class UIPopPosOpt {
    public targetAnchor: Vec2 = new Vec2(0, 0);
    public anchor: Vec2 = new Vec2(0, 0);
    public offset: Vec2 = new Vec2(0, 0);
    public target?: Node;
    public limitInScreen = true;
}

/** 气泡选项；框架只负责选取层级与父节点。 */
export class UIPopOpt {
    /** 目标节点：用于 FindLayerForNode 推断层级。 */
    public target?: Node;
    public pos?: UIPopPosOpt;
}

/**
 * 界面打开参数。
 *
 * 标量字段一律可空：undefined 表示「本次未指定」，mergeFrom() 只覆盖显式指定的字段。
 * 读取方一律用 effective* 取值（把「未指定」收敛为框架默认），不要在调用点散写 ??。
 */
export class UIOpenOpt {
    /** 未指定缓存时间时的默认值（毫秒）。 */
    public static readonly DefaultCacheTime = 30000;

    public layer?: EUILayer;

    /** 打开时添加到的父节点（Pge 必填）。 */
    public parent?: Node;

    /** 缓存时间（毫秒）：-1 永久，0 不缓存，undefined 未指定。 */
    public cacheTime?: number;

    public animType?: EAnimType;

    /** 是否隐藏层级低于自己的界面。 */
    public hideBelow?: boolean;

    /** 是否从顶部判定中排除；可见性由 hideBelow 控制。 */
    public noCover?: boolean;

    /** 对齐方式；只是透传参数，框架不改场景布局。 */
    public align?: EUIAlign;

    public mask?: UIMaskOpt;
    public pop?: UIPopOpt;

    /** 返回 true 表示跳过本次打开（用于「已在打开中不再重复打开」这类短路）。 */
    public skipOpenCheck?: (payload: unknown) => boolean;

    public onOpenBefore?: (vo: IUIVoHandle) => void;
    public onOpen?: (vo: IUIVoHandle) => void;
    public onFail?: () => void;

    /** 额外需要预加载的资源路径（会与界面 prefab、遮罩 prefab 一起加载）。 */
    public preLoadResList?: (vo: IUIVoHandle) => string[];

    public get effectiveCacheTime(): number {
        return this.cacheTime ?? UIOpenOpt.DefaultCacheTime;
    }

    public get effectiveAnimType(): EAnimType {
        return this.animType ?? EAnimType.SkipReOpen;
    }

    public get effectiveHideBelow(): boolean {
        return this.hideBelow ?? false;
    }

    public get effectiveNoCover(): boolean {
        return this.noCover ?? false;
    }

    public get effectiveAlign(): EUIAlign {
        return this.align ?? EUIAlign.Center;
    }

    /**
     * 把 source 中显式指定的字段合并进本实例。
     *
     * 只有非 undefined 字段才覆盖：否则「只想覆盖 CacheTime」的调用会把
     * BaseOpenOpt 提供的 hideBelow = true / align = Full 一起静默改掉。
     * 合并顺序：Default -> BaseOpenOpt -> 层级 -> 注册项 -> 调用点，后者覆盖前者。
     */
    public mergeFrom(source?: UIOpenOpt | null): void {
        if (!source) return;

        if (source.layer !== undefined) this.layer = source.layer;
        if (source.parent !== undefined) this.parent = source.parent;
        if (source.cacheTime !== undefined) this.cacheTime = source.cacheTime;
        if (source.animType !== undefined) this.animType = source.animType;
        if (source.hideBelow !== undefined) this.hideBelow = source.hideBelow;
        if (source.noCover !== undefined) this.noCover = source.noCover;
        if (source.align !== undefined) this.align = source.align;
        if (source.mask !== undefined) this.mask = source.mask;
        if (source.pop !== undefined) this.pop = source.pop;
        if (source.skipOpenCheck !== undefined) this.skipOpenCheck = source.skipOpenCheck;
        if (source.onOpenBefore !== undefined) this.onOpenBefore = source.onOpenBefore;
        if (source.onOpen !== undefined) this.onOpen = source.onOpen;
        if (source.onFail !== undefined) this.onFail = source.onFail;
        if (source.preLoadResList !== undefined) this.preLoadResList = source.preLoadResList;
    }

    public clone(): UIOpenOpt {
        const copy = new UIOpenOpt();
        copy.layer = this.layer;
        copy.parent = this.parent;
        copy.cacheTime = this.cacheTime;
        copy.animType = this.animType;
        copy.hideBelow = this.hideBelow;
        copy.noCover = this.noCover;
        copy.align = this.align;

        if (this.mask) {
            const mask = new UIMaskOpt();
            mask.runtime = this.mask.runtime;
            mask.alpha = this.mask.alpha;
            mask.clickClose = this.mask.clickClose;
            mask.hideTipText = this.mask.hideTipText;
            mask.closeMinTime = this.mask.closeMinTime;
            mask.color = this.mask.color;
            mask.payload = this.mask.payload;
            copy.mask = mask;
        }

        if (this.pop) {
            const pop = new UIPopOpt();
            pop.target = this.pop.target;
            pop.pos = this.pop.pos; // 位置对象按引用共享（与 C# 版一致，pos 视为只读）
            copy.pop = pop;
        }

        copy.skipOpenCheck = this.skipOpenCheck;
        copy.onOpenBefore = this.onOpenBefore;
        copy.onOpen = this.onOpen;
        copy.onFail = this.onFail;
        copy.preLoadResList = this.preLoadResList;
        return copy;
    }
}
