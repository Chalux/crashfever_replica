import { Node, isValid } from 'cc';
import { BoolVal } from '../Common/BoolVal';
import type { BaseWin } from './Base/BaseWin';
import { EUILayer } from './Def/EUILayer';
import type { UIOpenOpt } from './Def/UIOpenOpt';

/**
 * UI 层级（移植自 UILayer.cs）。
 *
 * 与 C# 的差异：C# 里 UILayer 本身是 Control 节点；Cocos 没有「继承 Node」这回事，
 * 所以这里做成普通类，组合一个 Node（由 UILayerManager 创建并铺满父节点）。
 *
 * 职责：
 * - 维护本层界面的插入顺序（uiSort，后加入者渲染在上）；
 * - 通过 hideBool 承接「被上层 HideBelow 遮挡」的可见性；
 * - 遮罩不在这里挂载：由 UIRuntimeData 统一插到界面之前，保证遮罩画在界面下方。
 */
export class UILayer {
    /**
     * 节点 → 层对象的反查表。
     *
     * UILayer 不是 Component，无法用 getComponent 从节点反查；UIManager 的
     * FindLayerForNode（气泡定位）需要一个稳定的映射，因此在这里登记。
     * WeakMap 不阻止节点被回收。
     */
    private static readonly layerByNode = new WeakMap<Node, UILayer>();

    private readonly uiMap = new Map<string, BaseWin>();

    /** 本层挂载的节点（层根）。 */
    public readonly node: Node;

    /** 层级枚举。 */
    public readonly type: EUILayer;

    /** 层默认打开参数（合并顺序：默认 < 基类默认 < 层默认 < 注册项 < 调用点）。 */
    public readonly openOpt: UIOpenOpt;

    /** 是否顶层层级（Debug / Notice 等，批量关闭时默认保留）。 */
    public readonly isTop: boolean;

    /** 「被上层遮挡」的聚合布尔量；变化时同步 node.active。 */
    public readonly hideBool: BoolVal = new BoolVal();

    /** 本层界面，按加入顺序排列（末尾最上层）。快照遍历前请先 [...uiSort]。 */
    public readonly uiSort: BaseWin[] = [];

    constructor(node: Node, type: EUILayer, openOpt: UIOpenOpt, isTop: boolean) {
        this.node = node;
        this.type = type;
        this.openOpt = openOpt;
        this.isTop = isTop;

        // C# 的 Visible = !HideBool.Value；Cocos 对应 node.active。
        this.hideBool.onChange = () => {
            this.node.active = !this.hideBool.value;
        };

        UILayer.layerByNode.set(node, this);
    }

    /** 层名（用于节点名与日志），例如 EUILayer.Dlg → "Dlg"。 */
    public get layerName(): string {
        return EUILayer[this.type];
    }

    /** 由节点反查层对象（只查这一个节点，不向上遍历）。 */
    public static findByNode(node: Node | null): UILayer | null {
        if (!node) return null;
        return UILayer.layerByNode.get(node) ?? null;
    }

    /**
     * 字典键统一用 UIVo.id（路由 id）：移除侧拿到的是 vo.id，
     * 而 BaseUI.uiId 只是「约定上」与之一致，组件类（BaseCmp）并不成立。
     */
    private static keyOf(ui: BaseWin): string {
        return ui.uiVo?.id ?? ui.uiId;
    }

    public hasUI(ui: BaseWin): boolean {
        return this.uiMap.has(UILayer.keyOf(ui));
    }

    public addUI(ui: BaseWin): void {
        const key = UILayer.keyOf(ui);

        // 界面若已挂在别的层，先从那一层摘掉，避免同一界面被两层同时记账。
        ui.uiVo?.layer?.removeUI(key);

        // 同键重入时先摘掉旧条目，避免 uiSort 出现重复节点。
        const existing = this.uiMap.get(key);
        if (existing) {
            const index = this.uiSort.indexOf(existing);
            if (index >= 0) this.uiSort.splice(index, 1);
            this.uiMap.delete(key);
        }

        this.uiMap.set(key, ui);
        this.uiSort.push(ui);

        // 遮罩由 UIRuntimeData.addToNode 统一挂载（保证插在界面之前），此处不再处理。
        this.node.addChild(ui.node);
        if (ui.uiVo) {
            ui.uiVo.layer = this;
        }
    }

    public removeUI(id: string): void {
        const ui = this.uiMap.get(id);
        if (!ui) return;

        this.uiMap.delete(id);
        const index = this.uiSort.indexOf(ui);
        if (index >= 0) this.uiSort.splice(index, 1);

        // 遮罩与界面同父，必须一起摘掉，否则缓存界面重开时会出现两份遮罩。
        const mask = ui.uiVo?.mask;
        if (mask && isValid(mask.node)) {
            mask.node.removeFromParent();
        }

        if (ui.uiVo && ui.uiVo.layer === this) {
            ui.uiVo.layer = null;
        }

        if (isValid(ui.node)) {
            ui.node.removeFromParent();
        }
    }
}
