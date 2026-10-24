import { Node, UITransform, Widget } from 'cc';
import { EUILayer } from './Def/EUILayer';
import { UIOpenOpt } from './Def/UIOpenOpt';
import { UILayer } from './UILayer';

/**
 * UI 层级管理器（移植自 UILayerManager.cs）。
 *
 * 负责：层级节点的创建 / 查找 / 可见性刷新。
 * 层级节点的创建被收拢在这里，UIManager 只持有两个全屏根节点。
 */
export class UILayerManager {
    /**
     * 「被遮挡」在 BoolVal 里的来源键；所有层与界面共用同一个键，等价于 C# 的 "hideBelow"。
     *
     * 注意：C# 的 BoolVal 用字符串来源键；TS 版 BoolVal 的 Set(from: object, ...) 以
     * 引用相等聚合同一来源，因此这里用一个共享对象常量而不是字符串（否则 TS2322）。
     * 语义不变：同一来源写入/覆盖，互不干扰。
     */
    private static readonly HIDE_BELOW_KEY: object = { name: 'hideBelow' };

    private readonly _layerMap = new Map<EUILayer, UILayer>();
    private layers: ReadonlyArray<EUILayer> = [];
    private topLayers: ReadonlyArray<EUILayer> = [];
    private allLayers: ReadonlyArray<EUILayer> = [];

    /**
     * 可见性重算的版本号。
     *
     * 见 updateLayers()：刷新过程中会同步触发 hideBool.onChange → 业务回调，
     * 业务可能关闭/重开界面并再次调用 updateLayers()。旧轮次必须能发现
     * 「已经有更新的一轮跑过了」，否则会用过期状态覆盖最新结果。
     */
    private visibilityVersion = 0;

    /** 层对象只读视图（调试 / 工具用）。 */
    public get layerMap(): ReadonlyMap<EUILayer, UILayer> {
        return this._layerMap;
    }

    /**
     * 初始化：为每个层级建一个铺满根节点的层节点。
     *
     * @param root 普通层级的挂载根。
     * @param topRoot 顶层层级的挂载根。
     * @param layers 普通层级，由下到上。
     * @param topLayers 顶层层级，由下到上（整体渲染在普通层级之上）。
     * @param layerOpenOpts 层默认参数；缺省时该层用「全未指定」的 UIOpenOpt。
     */
    public init(
        root: Node,
        topRoot: Node,
        layers: ReadonlyArray<EUILayer>,
        topLayers: ReadonlyArray<EUILayer>,
        layerOpenOpts?: Partial<Record<EUILayer, UIOpenOpt>> | null,
    ): void {
        this.layers = layers;
        this.topLayers = topLayers;
        this.allLayers = [...layers, ...topLayers];

        this.buildLayers(root, layers, layerOpenOpts ?? null, false);
        this.buildLayers(topRoot, topLayers, layerOpenOpts ?? null, true);
    }

    public getLayer(id: EUILayer): UILayer | null {
        return this._layerMap.get(id) ?? null;
    }

    /** 全部层级（普通 + 顶层），由下到上。 */
    public getAllLayers(): ReadonlyArray<EUILayer> {
        return this.allLayers;
    }

    /** 普通层级，由下到上。 */
    public getLayers(): ReadonlyArray<EUILayer> {
        return this.layers;
    }

    /**
     * 重算全部层与界面的可见性（HideBelow 语义）。
     *
     * 关键点（C# 版踩过的坑，逐条保留）：
     * 1. 重入守卫靠 visibilityVersion：hideBool.onChange 会同步回调业务，
     *    业务可能立刻改变界面栈并再次进入本方法；旧轮次一旦发现 version 变了就必须退出，
     *    否则会拿过期快照覆盖新一轮的结果。
     * 2. 每写一个 BoolVal 都复核一次 version 与 layer：写入本身可能触发重入，
     *    此后当前 vo 可能已经换层（甚至被销毁），不能继续按旧 layer 推断。
     * 3. 每层内部必须从「最上层界面」往下遍历：hideBelow 的界面会遮挡它下面的所有层，
     *    所以 hide 只应在遇到 hideBelow 界面后置为 true，并保持到更下层。
     * 4. 遍历界面用快照：可见性回调可能增删 uiSort。
     */
    public updateLayers(): void {
        const version = ++this.visibilityVersion;
        let hide = false;
        const hideKey = UILayerManager.HIDE_BELOW_KEY;

        for (let i = this.allLayers.length - 1; i >= 0; i--) {
            const layer = this.getLayer(this.allLayers[i]);
            if (!layer) continue;

            // 先把「层自身是否被遮挡」写下去；层被隐藏时整层子节点都不渲染。
            layer.hideBool.set(hideKey, hide);
            if (version !== this.visibilityVersion) return;

            // 可见性 hook 可以关闭或重开界面；当前遍历不能持有可变列表。
            const uis = [...layer.uiSort];
            for (let j = uis.length - 1; j >= 0; j--) {
                const vo = uis[j].uiVo;
                if (!vo || vo.runtime.layer !== layer) continue;

                vo.runtime.hideBool.set(hideKey, hide);
                // 重入刷新已按最新层级完成，旧轮次不能再覆盖它。
                if (version !== this.visibilityVersion) return;
                if (vo.runtime.layer !== layer) continue;

                // 自己会遮挡下层的界面，把它之下的内容全部标记为隐藏。
                if (!hide) {
                    hide = vo.openOpt.effectiveHideBelow;
                }
            }
        }
    }

    /**
     * 从节点向上找它所在的 UI 层。
     *
     * 用于气泡（Pop）未显式指定层级时，按目标节点推断应挂在哪个层。
     */
    public static findLayerForNode(node: Node): UILayer | null {
        let cur: Node | null = node;
        while (cur) {
            const layer = UILayer.findByNode(cur);
            if (layer) return layer;
            cur = cur.parent;
        }
        return null;
    }

    private buildLayers(
        root: Node,
        layers: ReadonlyArray<EUILayer>,
        openOpts: Partial<Record<EUILayer, UIOpenOpt>> | null,
        isTop: boolean,
    ): void {
        for (const type of layers) {
            const opt = openOpts?.[type] ?? null;

            // C# 里 UILayer 自己就是 Control 节点；Cocos 里新建节点再由 UILayer 组合。
            const node = new Node(`Layer-${EUILayer[type]}`);
            // 与根节点同 layer，保证被同一台 UI 相机渲染。
            node.layer = root.layer;

            node.addComponent(UITransform);

            // Cocos 没有 Godot 的 FullRect 预设：四边对齐 + ALWAYS 才能铺满父节点。
            const widget = node.addComponent(Widget);
            widget.isAlignTop = true;
            widget.isAlignBottom = true;
            widget.isAlignLeft = true;
            widget.isAlignRight = true;
            widget.top = 0;
            widget.bottom = 0;
            widget.left = 0;
            widget.right = 0;
            widget.alignMode = Widget.AlignMode.ALWAYS;

            root.addChild(node);

            // 层级参数是显式覆盖；完整默认值只在最终合并的基线中使用。
            const layer = new UILayer(node, type, opt ? opt.clone() : new UIOpenOpt(), isTop);
            this._layerMap.set(type, layer);
        }
    }
}
