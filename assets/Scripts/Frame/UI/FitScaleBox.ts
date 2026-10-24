import {
    _decorator,
    CCInteger,
    Component,
    Node,
    Size,
    UITransform,
    Vec3,
    isValid,
} from 'cc';
import { BindingScope } from './BindingScope';
import { BindingScopeSignals } from './BindingScopeSignals';
import { FitScaleMath } from './FitScaleMath';
// FitScaleMode 只是类型别名，单独用 import type 引入：
// 项目开启了 isolatedModules，避免转译后留下不存在的运行时导入。
import type { FitScaleMode } from './FitScaleMath';
import { Log } from '../Log/Log';

const { ccclass, property, disallowMultiple, menu, requireComponent } = _decorator;

/**
 * 把单个内容节点按设计尺寸等比缩放到自身 UITransform 范围内并居中。
 *
 * C# 版 FitScaleBox（Godot Control）的做法是：内容节点改成左上锚点，
 * 写 `Size`/`Scale`/`Position`，并在自身 Resized、内容 MinimumSizeChanged 时重排。
 * 迁移到 Cocos 后的差异与取舍：
 *
 * 1. **为什么不直接改 contentSize 完成缩放**：contentSize 是布局输入，
 *    改它会触发 Widget/Layout 重新排列子节点，而重排又可能反过来改尺寸，
 *    形成「重排 → SIZE_CHANGED → 再重排」的循环（C# 源码注释也专门警告过）。
 *    scale 只影响渲染变换，不参与布局计算，既不会触发重排，也能保持内容内部
 *    已经按设计尺寸排好的相对位置，所以这里固定用 `node.setScale` 做缩放。
 * 2. **为什么还要写 contentSize**：C# 会把子节点尺寸设成 `max(available, need)`
 *    以便内容较小时铺满容器；也为了让内容的 Widget 有正确的参照尺寸。
 *    这里保留同样语义，写入的是「未乘 scale」的布局尺寸。
 * 3. **为什么写 position 而不是用 Widget 居中**：Widget 需要额外组件和编辑器配置，
 *    且会和本组件的写入互相覆盖；直接按 anchor 公式算偏移更可控，也不依赖 tween。
 * 4. **为什么只在 onLoad/onEnable 和 SIZE_CHANGED 时算**：适配是低频事件，
 *    不需要每帧计算；所有写入前都做 epsilon 比较，值没变就不写，
 *    这也是打断重排循环的关键。
 *
 * 使用约束：内容节点应作为本节点的直接子节点，且不要再挂 Widget 拉伸，
 * 也不要挂会在运行时改写自身 size/position 的 Layout，否则会和本组件互相覆盖。
 */
@ccclass('KemoFitScaleBox')
@disallowMultiple
@requireComponent(UITransform)
@menu('Kemo/UI/FitScaleBox')
export class FitScaleBox extends Component {
    /**
     * 内容设计宽度。
     *
     * 为 0 表示不启用设计尺寸，退化为「首次读到内容节点的 contentSize」。
     * 只有 designWidth 与 designHeight 同时 > 0 时才使用设计尺寸；
     * 场景里的内容尺寸不确定（例如运行时换皮）时建议显式填写。
     */
    @property({
        type: CCInteger,
        tooltip: '内容设计宽度。0 表示使用内容节点首次读到的 contentSize。需与 designHeight 同时 > 0。',
    })
    public designWidth = 0;

    /**
     * 内容设计高度。
     *
     * 与 designWidth 成对使用；单独填一个不会生效，避免出现只锁一边的奇怪比例。
     */
    @property({
        type: CCInteger,
        tooltip: '内容设计高度。0 表示使用内容节点首次读到的 contentSize。需与 designWidth 同时 > 0。',
    })
    public designHeight = 0;

    /**
     * 适配模式：
     * - `contain`：完整显示，只缩不放（与 C# 版一致）。
     * - `cover`：等比放大到铺满容器，超出的部分需要父节点 Mask 裁切。
     */
    @property({
        type: String,
        tooltip: "contain=完整显示（只缩不放，默认）；cover=铺满容器（超出部分需 Mask 裁切）",
    })
    public fitMode: FitScaleMode = 'contain';

    /**
     * 是否把计算结果写到内容节点的 scale 上。
     *
     * 默认 true：整棵内容子树一起等比缩放，内部排版不会被破坏。
     * 设为 false 时 scale 固定为 1，只调整内容尺寸和位置——适合内容内部还要
     * 用 Widget/相对布局、缩放会糊或者需要保持 1:1 像素的场景；
     * 代价是无法再通过反向缩放来适配：内容大于容器时会溢出，小于容器时可能留白
     * （cover 模式下也不会真正铺满）。
     */
    @property({
        tooltip: 'true=把缩放写进内容节点（推荐）；false=scale 固定 1，只调整尺寸与位置',
    })
    public applyScaleToChildren = true;

    /**
     * 内容节点。留空或引用失效时自动取本节点的第一个子节点。
     *
     * 显式配置可以避免「以后在它前面插入一个装饰节点」导致取错对象；
     * 但配置的节点必须是本节点的直接子节点，否则会被忽略并在控制台告警。
     */
    @property({
        type: Node,
        tooltip: '要适配的内容节点，必须是自身直接子节点；留空则取第一个子节点',
    })
    public contentNode: Node | null = null;

    /** 订阅作用域：所有事件监听都登记在这里，onDisable 统一退订。 */
    private readonly _binder = new BindingScope();

    /** 当前生效的内容节点。 */
    private _content: Node | null = null;

    /** 本次计算使用的需求尺寸（复用对象，避免每次 apply 产生垃圾）。 */
    private readonly _needSize = new Size();

    /** 未配置设计尺寸时，从内容节点首次读到的兜底尺寸。 */
    private readonly _fallbackNeed = new Size();

    /** 兜底尺寸是否已成功捕获（内容尺寸可能晚于 onLoad 才被 Widget 写好，故允许重试）。 */
    private _fallbackCaptured = false;

    /** 是否正在执行 applyFit：写入尺寸可能同步触发外部重排，用它把嵌套调用折叠成一次重算。 */
    private _applying = false;

    /** 本轮适配期间是否又收到了重算请求。 */
    private _applyPending = false;

    /** 浮点比较阈值：UI 像素级差异，0.001 足够，同时能有效打断无意义的重写。 */
    private static readonly EPSILON = 0.001;

    /** 单次 applyFit 最多连续重算的轮数，防止外部布局与适配互相驱动形成死循环。 */
    private static readonly MAX_APPLY_PASSES = 3;

    protected onLoad(): void {
        this.resolveContent();
        this.applyFit();
    }

    protected onEnable(): void {
        // 先清一次，防止 onDisable 因节点未激活等原因没有执行时重复订阅。
        this._binder.unbindAll();
        this.resolveContent();

        // 只监听自身的尺寸变化：内容节点被本组件写入尺寸时不应反过来触发重算，
        // 否则两侧互相驱动，容易形成布局循环。
        BindingScopeSignals.onSizeChanged(this._binder, this.node, (): void => {
            this.applyFit();
        });

        this.applyFit();
    }

    protected onDisable(): void {
        this._binder.unbindAll();
    }

    protected onDestroy(): void {
        // 节点销毁后 onDisable 不保证一定先执行，这里再兜底一次。
        this._binder.unbindAll();
    }

    /**
     * 立即按当前尺寸重新计算并应用一次适配。
     *
     * 公开出来便于外部在「切换皮肤 / 运行时改设计尺寸 / 强制刷新」时手动调用。
     * 内部所有写入都有 epsilon 比较，重复调用是幂等的。
     *
     * 注意：Cocos 的 SIZE_CHANGED 是同步派发的，写内容尺寸时如果外部还挂了
     * Layout/Widget 之类的组件，可能在本方法执行到一半时又回调进来。
     * 这里用 `_applying` 把嵌套调用折叠成「本轮结束后再按最新尺寸算一次」，
     * 避免递归，也避免用旧尺寸算出的 scale/position 留在节点上。
     */
    public applyFit(): void {
        if (this._applying) {
            this._applyPending = true;
            return;
        }

        this._applying = true;
        try {
            let pass = 0;
            do {
                this._applyPending = false;
                this.applyFitOnce();
                pass++;
            } while (this._applyPending
                && pass < FitScaleBox.MAX_APPLY_PASSES
                && isValid(this.node));

            if (this._applyPending && isValid(this.node)) {
                Log.warn(
                    'FitScaleBox：适配过程中布局反复变化，已停止本轮重算；'
                    + '请检查内容节点是否还挂了会改写自身 size/position 的 Widget/Layout。',
                    'UI',
                );
            }
        } finally {
            this._applying = false;
            this._applyPending = false;
        }
    }

    /** applyFit 的单轮实现；不处理重入，由 applyFit 统一调度。 */
    private applyFitOnce(): void {
        if (!isValid(this.node)) {
            return;
        }

        const content = this.resolveContent();
        if (!content) {
            return;
        }

        const boxTransform = this.getOrAddTransform(this.node);
        const contentTransform = this.getOrAddTransform(content);
        const available = boxTransform.contentSize;
        const need = this.resolveNeedSize(contentTransform);

        const result = FitScaleMath.compute(available, need, this.normalizedFitMode());
        // 不允许缩放时把系数压成 1：尺寸仍按当前模式算出的 childSize 写入，
        // 内容与容器比例不一致时会溢出（这是该选项的预期代价）。
        const scale = this.applyScaleToChildren ? result.scale : 1;

        const offset = FitScaleMath.computeOffset(
            available,
            result.childSize,
            scale,
            boxTransform.anchorPoint,
            contentTransform.anchorPoint,
        );

        // 顺序：先尺寸、再缩放、最后位置。尺寸变化可能触发内容内部 Layout，
        // 先把它稳定下来，再写 scale/position，避免居中偏移按旧尺寸计算。
        this.writeContentSize(contentTransform, result.childSize.width, result.childSize.height);
        this.writeContentScale(content, scale);
        this.writeContentPosition(content, offset);
    }

    /**
     * 解析内容节点：优先 contentNode，其次第一个子节点。
     *
     * 内容节点变化时清空兜底尺寸缓存，保证换内容后重新按新内容测量。
     */
    private resolveContent(): Node | null {
        if (!isValid(this.node)) {
            return null;
        }

        let candidate: Node | null = null;

        if (this.contentNode && isValid(this.contentNode) && this.contentNode !== this.node) {
            candidate = this.contentNode;
        } else if (this.node.children.length > 0) {
            candidate = this.node.children[0];
        }

        if (candidate && candidate.parent !== this.node) {
            Log.warn('FitScaleBox：contentNode 必须是自身直接子节点，已忽略该配置。', 'UI');
            candidate = null;
        }

        if (candidate !== this._content) {
            this._content = candidate;
            this._fallbackCaptured = false;
            this._fallbackNeed.width = 0;
            this._fallbackNeed.height = 0;
        }

        return this._content;
    }

    /**
     * 决定本次计算的需求尺寸。
     *
     * 显式设计尺寸优先；否则使用首次捕获的内容尺寸。兜底值只在成功读到
     * 正尺寸时才锁定，避免在 Widget 尚未布局完成（contentSize 还是 0）时
     * 把 0 缓存下来，导致之后永远算不出结果。
     */
    private resolveNeedSize(contentTransform: UITransform): Size {
        if (this.designWidth > 0 && this.designHeight > 0) {
            this._needSize.width = this.designWidth;
            this._needSize.height = this.designHeight;
            return this._needSize;
        }

        if (!this._fallbackCaptured) {
            const current = contentTransform.contentSize;
            if (current.width > 0 && current.height > 0) {
                this._fallbackNeed.width = current.width;
                this._fallbackNeed.height = current.height;
                this._fallbackCaptured = true;
            }
        }

        if (this._fallbackCaptured) {
            this._needSize.width = this._fallbackNeed.width;
            this._needSize.height = this._fallbackNeed.height;
        } else {
            // 还没读到有效尺寸：先透传当前值，FitScaleMath 会走退化分支（scale=1），
            // 等下一次尺寸事件/重新启用时再捕获。
            this._needSize.width = contentTransform.contentSize.width;
            this._needSize.height = contentTransform.contentSize.height;
        }

        return this._needSize;
    }

    /** 归一化编辑器里可能出现的非法字符串（例如手改序列化数据）。 */
    private normalizedFitMode(): FitScaleMode {
        return this.fitMode === 'cover' ? 'cover' : 'contain';
    }

    /** 取 UITransform，没有则补一个（内容节点可能是纯容器）。 */
    private getOrAddTransform(node: Node): UITransform {
        const transform = node.getComponent(UITransform);
        return transform ?? node.addComponent(UITransform);
    }

    /** 写内容尺寸；值没变就不写，避免触发无意义的 SIZE_CHANGED/重排。 */
    private writeContentSize(transform: UITransform, width: number, height: number): void {
        const current = transform.contentSize;
        if (FitScaleBox.isNearly(current.width, width)
            && FitScaleBox.isNearly(current.height, height)) {
            return;
        }
        transform.setContentSize(width, height);
    }

    /** 写内容缩放；保留原有的 z 分量（2D 下无意义，但不要破坏用户设置）。 */
    private writeContentScale(content: Node, scale: number): void {
        const current = content.scale;
        if (FitScaleBox.isNearly(current.x, scale)
            && FitScaleBox.isNearly(current.y, scale)) {
            return;
        }
        content.setScale(scale, scale, current.z);
    }

    /** 写内容位置；保留原有的 z 分量，只改 x/y。 */
    private writeContentPosition(content: Node, offset: Vec3): void {
        const current = content.position;
        if (FitScaleBox.isNearly(current.x, offset.x)
            && FitScaleBox.isNearly(current.y, offset.y)) {
            return;
        }
        content.setPosition(offset.x, offset.y, current.z);
    }

    /** 浮点近似比较。 */
    private static isNearly(a: number, b: number): boolean {
        return Math.abs(a - b) <= FitScaleBox.EPSILON;
    }
}
