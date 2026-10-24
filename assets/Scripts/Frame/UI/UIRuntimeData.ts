import { Node, isValid } from 'cc';
import { BoolVal } from '../Common/BoolVal';
import { Log } from '../Log/Log';
import type { BaseMask } from './Base/BaseMask';
import type { BaseWin } from './Base/BaseWin';
import type { IUILifecycleInvoker } from './Base/IUILifecycleInvoker';
import { EUILayer } from './Def/EUILayer';
import { UILayerManager } from './UILayerManager';
import type { UILayer } from './UILayer';
import { UIManager } from './UIManager';
import type { UIVo } from './UIVo';

/**
 * UI 运行时引用数据（移植自 UIRuntimeData.cs）。
 *
 * 从 UIVo 中拆出的组合对象，只负责「节点怎么挂、遮罩怎么排、可见性怎么同步」。
 * 生命周期时间戳与状态机不在这里，避免职责混杂。
 */
export class UIRuntimeData {
    private readonly owner: UIVo;

    /** 界面根组件（prefab 根节点上的 BaseWin）。 */
    public ui: BaseWin | null = null;

    /** 遮罩组件；为空表示该界面没有遮罩。 */
    public mask: BaseMask | null = null;

    /** 当前所在层级；由 UILayer.addUI / removeUI 维护。 */
    public layer: UILayer | null = null;

    /** 「被上层遮挡」的聚合布尔量；变化时同步 ui / mask 的 node.active。 */
    public readonly hideBool: BoolVal = new BoolVal();

    constructor(owner: UIVo) {
        this.owner = owner;
        this.hideBool.onChange = () => this.updateVisible();
    }

    /**
     * 把界面（与遮罩）挂到该去的地方：显式 Parent 优先，否则挂到 OpenOpt 指定的层。
     *
     * 两个容易出错的地方：
     * - 界面可能来自缓存（已挂在某层），换层前必须先让旧层忘掉它，否则旧层会残留引用；
     * - 遮罩必须在界面「之前」（更小的 siblingIndex），否则会盖住界面。
     */
    public addToNode(): void {
        const ui = this.ui;
        if (!ui || !isValid(ui.node)) return;

        const opt = this.owner.openOpt;
        const layer = this.owner.manager.getLayer(opt.layer ?? EUILayer.Dlg);
        const parent: Node | null = opt.parent ?? layer?.node ?? null;

        if (!parent) {
            Log.error(`界面<${this.owner.id}>挂载失败：无有效父节点`, 'UI');
            return;
        }

        const uiNode = ui.node;
        const currentParent = uiNode.parent;

        if (currentParent === parent) {
            // 已经挂在目标父节点下：只校正遮罩顺序，不重复 addChild（否则会改变 siblingIndex）。
            this.mountMask(parent);
            return;
        }

        if (currentParent) {
            const oldLayer = UILayerManager.findLayerForNode(currentParent);
            if (oldLayer && oldLayer.node === currentParent) {
                // 直接挂在层节点下：走层记账，顺便清掉遮罩。
                oldLayer.removeUI(this.owner.id);
            } else {
                // 挂在业务自定义父节点下：只摘节点，不碰层记账（它本来就不在某层）。
                currentParent.removeChild(uiNode);
            }
        }

        if (opt.parent || !layer) {
            // 指定了业务父节点（Pge / Pop），或层级不存在时，只能直接挂。
            parent.addChild(uiNode);
        } else {
            layer.addUI(ui);
        }

        this.mountMask(parent);
    }

    /**
     * 遮罩统一在这里挂载（UILayer.addUI 不再处理），且始终排在界面之前，
     * 保证遮罩绘制在界面下方。已挂在同一父节点时只校正顺序，不重复 addChild。
     */
    private mountMask(parent: Node): void {
        const mask = this.mask;
        if (!mask || !isValid(mask.node) || !this.ui) return;

        const maskNode = mask.node;
        if (maskNode.parent !== parent) {
            maskNode.removeFromParent();
            parent.addChild(maskNode);
        }

        const uiIndex = this.ui.node.getSiblingIndex();
        if (maskNode.getSiblingIndex() > uiIndex) {
            // 移到界面当前的位置：界面整体后移一位，遮罩正好落在它下面。
            maskNode.setSiblingIndex(uiIndex);
        }
    }

    /**
     * 同步可见性：HideBool 为 true 时界面与遮罩都隐藏。
     *
     * C# 用 Control.Visible；Cocos 对应 Node.active（节点失活后其子树都不渲染，
     * 与 Godot 的 Visible 语义在「整棵子树」层面一致）。
     */
    public updateVisible(): void {
        const ui = this.ui;
        if (!ui || !isValid(ui.node)) return;

        const visible = !this.hideBool.value;
        ui.node.active = visible;

        const mask = this.mask;
        if (mask && isValid(mask.node)) {
            mask.node.active = visible;
        }

        // 界面内部可能有自己的显隐逻辑（例如隐藏时停 Tween），用统一回调保护隔离异常。
        UIManager.invokeCallback(
            () => (ui as unknown as IUILifecycleInvoker).invokeLayerVisibleUpdate(),
            this.owner.id,
            '可见性回调',
        );
    }

    /**
     * 从节点树摘除界面与遮罩（进入缓存 / 销毁都走这里），但不 destroy 节点：
     * 缓存重开还要复用同一个节点。
     */
    public removeFromNode(): void {
        this.layer?.removeUI(this.owner.id);
        if (this.mask && isValid(this.mask.node)) {
            this.mask.node.removeFromParent();
        }
        if (this.ui && isValid(this.ui.node)) {
            this.ui.node.removeFromParent();
        }
    }
}
