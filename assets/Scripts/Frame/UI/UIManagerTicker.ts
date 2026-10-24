import { _decorator, Component } from 'cc';
import type { UIManager } from './UIManager';

const { ccclass } = _decorator;

/**
 * 每帧驱动 UIManager 的组件。
 *
 * Cocos 没有 Godot 那样的 Node._Process 虚函数可继承，所以由管理器在初始化时
 * 挂一个隐藏节点承载本组件，把 update 回调转给 UIManager.tick(dt)。
 */
@ccclass('KemoUiManagerTicker')
export class UIManagerTicker extends Component {
    public manager: UIManager | null = null;

    protected update(dt: number): void {
        this.manager?.tick(dt);
    }
}
