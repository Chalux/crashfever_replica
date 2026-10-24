import { Size, Vec2, Vec3 } from 'cc';

/**
 * 适配模式。
 *
 * - `contain`：完整显示内容。C# 版 FitScaleMath 的语义——只缩不放，
 *   容器比内容大时把子节点尺寸撑到容器大小，保证背景类内容铺满。
 * - `cover`：铺满容器并允许裁切（迁移时新增的模式，C# 版没有）。
 */
export type FitScaleMode = 'contain' | 'cover';

/**
 * FitScaleMath.compute 的返回值，对应 C# 的 `(Vector2 ChildSize, float Scale)` 元组。
 *
 * `childSize` 是**未乘 scale** 的布局尺寸：C# 里它同时是 `_content.Size`
 * 和 `_content.GetCombinedMinimumSize()`；Cocos 侧把它写进内容节点的 UITransform，
 * 再由 `scale` 做等比缩放。两者分开的好处是：缩放不污染布局尺寸，
 * 内容内部的 Widget/Layout 仍按设计尺寸计算。
 */
export interface FitScaleResult {
    /** 内容节点应写入 UITransform 的布局尺寸（未乘 scale）。 */
    childSize: Size;
    /** 等比缩放系数。 */
    scale: number;
}

/**
 * FitScaleBox 的纯数学部分（无节点、无副作用，方便单测/复用）。
 *
 * 逐行对应 C# `FitScaleMath.cs`：C# 用 Vector2，Cocos 用 Size；
 * 命名从 PascalCase 改为 camelCase。所有计算只依赖传入参数，
 * 不读写引擎全局状态，因此可以在编辑器工具、预览逻辑里直接调用。
 */
export class FitScaleMath {
    /**
     * 计算内容尺寸与缩放系数。
     *
     * 退化处理与 C# 完全一致：可用区域或需求尺寸任意一维 <= 0 时，
     * 返回「子节点尺寸 = 可用尺寸、scale = 1」，让调用方至少有确定行为，
     * 而不是得到 NaN/Infinity 把节点变换污染掉。
     *
     * contain 分支的尺寸取 `max(available, need)`，是为了复刻 C# 的
     * 「内容比容器小时用容器尺寸铺满」；scale 仍然只缩不放（上限 1）。
     *
     * cover 分支则把内容尺寸保持为设计尺寸、scale 取两个方向的较大比值，
     * 这样内容一定铺满容器，超出的方向由父节点裁切（需要 Mask 配合）。
     *
     * @param available 容器可用尺寸（通常为自身 UITransform.contentSize）
     * @param need 内容设计尺寸（未缩放）
     * @param mode 适配模式，默认 contain
     * @returns 子节点布局尺寸 + 统一缩放系数
     */
    public static compute(
        available: Readonly<Size>,
        need: Readonly<Size>,
        mode: FitScaleMode = 'contain',
    ): FitScaleResult {
        if (available.width <= 0 || available.height <= 0
            || need.width <= 0 || need.height <= 0) {
            return {
                childSize: new Size(available.width, available.height),
                scale: 1,
            };
        }

        const ratioX = available.width / need.width;
        const ratioY = available.height / need.height;

        if (mode === 'cover') {
            return {
                childSize: new Size(need.width, need.height),
                // 取较大比值：短边也铺满，长边溢出后被裁切。
                scale: Math.max(ratioX, ratioY),
            };
        }

        return {
            // C# 原逻辑：MathF.Max(available, need)，即内容较小时也占满容器。
            childSize: new Size(
                Math.max(available.width, need.width),
                Math.max(available.height, need.height),
            ),
            // 只缩不放，避免小图被拉糊。
            scale: Math.min(1, Math.min(ratioX, ratioY)),
        };
    }

    /**
     * 计算内容节点相对容器节点的居中偏移（容器局部坐标）。
     *
     * 推导：Cocos 的局部原点在父节点的 anchor 处，子节点的 position 放置的是
     * 子节点自身的 anchor。设容器尺寸 A、内容缩放后尺寸 S：
     * 容器覆盖 [-(a.x)*A.w, (1-a.x)*A.w]，内容覆盖
     * [pos.x-(c.x)*S.w, pos.x+(1-c.x)*S.w]；令两者中心重合即可得到
     * `pos = (0.5 - a) * A - (0.5 - c) * S`。
     *
     * 当容器与内容的 anchor 都是默认的 (0.5, 0.5) 时，结果恒为 (0, 0)：
     * Cocos 的局部原点就在锚点处，position=0 已经表示居中，屏幕上的效果与
     * C# 里左上角布局的 `(available - childSize * scale) * 0.5` 一致
     * （数值不同只是因为两边的坐标原点定义不同）。
     *
     * @param available 容器可用尺寸
     * @param childSize 内容布局尺寸（未乘 scale）
     * @param scale 内容缩放系数
     * @param boxAnchor 容器 UITransform 的 anchorPoint
     * @param contentAnchor 内容 UITransform 的 anchorPoint
     * @returns 内容节点的局部坐标（z 固定为 0）
     */
    public static computeOffset(
        available: Readonly<Size>,
        childSize: Readonly<Size>,
        scale: number,
        boxAnchor: Readonly<Vec2>,
        contentAnchor: Readonly<Vec2>,
    ): Vec3 {
        const scaledWidth = childSize.width * scale;
        const scaledHeight = childSize.height * scale;

        const x = (0.5 - boxAnchor.x) * available.width
            - (0.5 - contentAnchor.x) * scaledWidth;
        const y = (0.5 - boxAnchor.y) * available.height
            - (0.5 - contentAnchor.y) * scaledHeight;

        return new Vec3(x, y, 0);
    }
}
