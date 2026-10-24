import { Node } from 'cc';
import { BaseMask } from './BaseMask';
import { BaseWin } from './BaseWin';

/**
 * 在节点自己身上找 BaseWin / BaseMask 实例。
 *
 * 不能用 node.getComponent(BaseWin)：Cocos 的 getComponent 按 @ccclass 注册的类 id 匹配，
 * 而框架基类刻意不加 @ccclass（避免编辑器里出现一堆抽象类），所以这里用 instanceof 线性查找。
 * prefab 数量级是「一个界面一个」，线性开销可以忽略。
 */
export function findBaseWin(node: Node): BaseWin | null {
    for (const component of node.components) {
        if (component instanceof BaseWin) return component;
    }
    return null;
}

/** 同 {@link findBaseWin}，找遮罩根节点上的 BaseMask。 */
export function findBaseMask(node: Node): BaseMask | null {
    for (const component of node.components) {
        if (component instanceof BaseMask) return component;
    }
    return null;
}
