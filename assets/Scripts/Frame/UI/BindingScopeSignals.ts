import {
    Button,
    EditBox,
    EventTouch,
    Node,
    Slider,
    Toggle,
    isValid,
} from 'cc';
// 只作为参数类型使用，import type 可确保 isolatedModules 下不留下运行时导入。
import type { NodeEventType } from 'cc';
import { BindingScope } from './BindingScope';

/**
 * EditBox 需要监听的文本事件名。
 *
 * Cocos 的 `EditBox.EventType` 里还有 editing-did-began / editing-return，
 * 但业务层通常只关心「输入完成」和「输入过程中」，所以这里收窄成两个值。
 */
export type EditBoxTextEvent = 'editing-did-ended' | 'text-changed';

/**
 * Cocos 的 Slider 组件没有像 Button 那样的 `EventType` 常量，
 * 引擎源码里是在 `node` 上写死 `emit('slide', this)` 的，故这里保留字面量。
 */
const SLIDER_SLIDE_EVENT = 'slide';

/**
 * 控件事件 -> BindingScope 的登记帮助类。
 *
 * C# 版的 BindingScopeSignals 是给 Godot 信号套一层「自动登记退订」的扩展方法；
 * 迁移到 Cocos 后，事件都挂在控件的 `node` 上，生命周期仍由宿主节点的 BindingScope 统一管理：
 * 关闭/销毁时调用 `scope.unbindAll()`，所有 `on` 都有配对的 `off`，不会留下悬空监听。
 *
 * 所有方法都会先做 `isValid` 判断：节点已经销毁时直接放弃订阅，避免把事件挂到
 * 已销毁的对象上（这时 Cocos 会报错，而且永远不会触发）。
 *
 * @example
 * this._binder = new BindingScope();
 * BindingScopeSignals.onClick(this._binder, this.closeButton, () => this.close());
 * // onDisable / onDestroy:
 * this._binder.unbindAll();
 */
export class BindingScopeSignals {
    /**
     * 监听 Button 的点击（Button.EventType.CLICK，由 button.node 派发）。
     *
     * @param scope 宿主节点的订阅作用域，负责统一退订
     * @param button 目标按钮；已销毁时忽略
     * @param handler 点击回调，不接收事件参数
     */
    public static onClick(scope: BindingScope, button: Button, handler: () => void): void {
        const node = button?.node;
        if (!scope || !isValid(button) || !node || !isValid(node) || typeof handler !== 'function') {
            return;
        }

        // 每次订阅都新建 wrapped，保证 off 时传入的是同一个函数引用，
        // 不会误删其他调用方注册的同名回调。
        const wrapped = (): void => {
            handler();
        };

        scope.bind(
            () => {
                node.on(Button.EventType.CLICK, wrapped);
            },
            () => {
                if (isValid(node)) {
                    node.off(Button.EventType.CLICK, wrapped);
                }
            },
        );
    }

    /**
     * 监听 Toggle 的开关变化（Toggle.EventType.TOGGLE）。
     *
     * 回调参数直接读取切换后的 `toggle.isChecked`，而不是依赖事件参数：
     * Toggle 的 emit 参数就是组件本身，但源码在不同版本里参数个数有差异，读组件状态更稳。
     *
     * @param scope 宿主节点的订阅作用域
     * @param toggle 目标开关；已销毁时忽略
     * @param handler 开关回调，参数为最新的选中状态
     */
    public static onToggle(
        scope: BindingScope,
        toggle: Toggle,
        handler: (isChecked: boolean) => void,
    ): void {
        const node = toggle?.node;
        if (!scope || !isValid(toggle) || !node || !isValid(node) || typeof handler !== 'function') {
            return;
        }

        const wrapped = (): void => {
            // toggle 在事件派发时必然有效；这里再判一次，防止异步回调里访问已销毁组件。
            if (!isValid(toggle)) {
                return;
            }
            handler(toggle.isChecked);
        };

        scope.bind(
            () => {
                node.on(Toggle.EventType.TOGGLE, wrapped);
            },
            () => {
                if (isValid(node)) {
                    node.off(Toggle.EventType.TOGGLE, wrapped);
                }
            },
        );
    }

    /**
     * 监听 Slider 的拖动（引擎在 slider.node 上派发 'slide'）。
     *
     * Slider 只有 0~1 的 `progress`，没有 min/max；业务层需要实际数值时自行换算，
     * 这样帮助类保持与引擎数据模型一致，不引入额外配置。
     *
     * @param scope 宿主节点的订阅作用域
     * @param slider 目标滑动条；已销毁时忽略
     * @param handler 滑动回调，参数为 0~1 的进度
     */
    public static onSlider(
        scope: BindingScope,
        slider: Slider,
        handler: (value: number) => void,
    ): void {
        const node = slider?.node;
        if (!scope || !isValid(slider) || !node || !isValid(node) || typeof handler !== 'function') {
            return;
        }

        const wrapped = (): void => {
            if (!isValid(slider)) {
                return;
            }
            handler(slider.progress);
        };

        scope.bind(
            () => {
                node.on(SLIDER_SLIDE_EVENT, wrapped);
            },
            () => {
                if (isValid(node)) {
                    node.off(SLIDER_SLIDE_EVENT, wrapped);
                }
            },
        );
    }

    /**
     * 监听 EditBox 的文本变化。
     *
     * 默认监听 `editing-did-ended`（输入框失焦/回车提交后触发一次），
     * 适合「输入完成再校验」的场景；需要实时过滤时传 `'text-changed'`。
     *
     * EditBox 的 TEXT_CHANGED 事件在源码里先更新 `editBox.string` 再 emit，
     * 所以事件第二参没有文本时回退读 `editBox.string` 也不会拿到旧值。
     *
     * @param scope 宿主节点的订阅作用域
     * @param editBox 目标输入框；已销毁时忽略
     * @param handler 文本回调
     * @param event 监听的 EditBox 事件，默认 'editing-did-ended'
     */
    public static onEditBox(
        scope: BindingScope,
        editBox: EditBox,
        handler: (text: string) => void,
        event: EditBoxTextEvent = 'editing-did-ended',
    ): void {
        const node = editBox?.node;
        if (!scope || !isValid(editBox) || !node || !isValid(node) || typeof handler !== 'function') {
            return;
        }

        // 类型系统之外（例如 Inspector 传值/JS 调用）可能传入非法事件名，
        // 统一收敛到默认值，避免监听一个永远不会触发的事件。
        const eventName: EditBoxTextEvent = event === 'text-changed'
            ? 'text-changed'
            : 'editing-did-ended';

        const wrapped = (_editBox: EditBox, text?: string): void => {
            if (!isValid(editBox)) {
                return;
            }
            handler(typeof text === 'string' ? text : editBox.string);
        };

        scope.bind(
            () => {
                node.on(eventName, wrapped);
            },
            () => {
                if (isValid(node)) {
                    node.off(eventName, wrapped);
                }
            },
        );
    }

    /**
     * 监听任意节点的点击（TOUCH_END）。
     *
     * 适用于没有 Button 组件的纯图片/文本节点。注意：节点必须能命中触摸，
     * 也就是要有 UITransform 且尺寸非零（Cocos 3.x 的触摸命中依据 UITransform）。
     *
     * @param scope 宿主节点的订阅作用域
     * @param node 目标节点；已销毁时忽略
     * @param handler 点击回调，不接收事件参数
     */
    public static onNodeClick(scope: BindingScope, node: Node, handler: () => void): void {
        if (!scope || !node || !isValid(node) || typeof handler !== 'function') {
            return;
        }

        const wrapped = (): void => {
            handler();
        };

        scope.bind(
            () => {
                node.on(Node.EventType.TOUCH_END, wrapped);
            },
            () => {
                if (isValid(node)) {
                    node.off(Node.EventType.TOUCH_END, wrapped);
                }
            },
        );
    }

    /**
     * 监听节点的触摸事件（默认 TOUCH_END，可传 TOUCH_START / TOUCH_MOVE / TOUCH_CANCEL）。
     *
     * 与 `onNodeClick` 的区别是回调会拿到原始 `EventTouch`，适合拖拽、长按、
     * 阻止冒泡等需要坐标/触摸信息的场景；只想要「点一下」时用 onNodeClick 更省事。
     *
     * @param scope 宿主节点的订阅作用域
     * @param node 目标节点；已销毁时忽略
     * @param handler 触摸回调
     * @param event 要监听的节点事件，默认 Node.EventType.TOUCH_END
     */
    public static onNodeTouch(
        scope: BindingScope,
        node: Node,
        handler: (event: EventTouch) => void,
        event: NodeEventType = Node.EventType.TOUCH_END,
    ): void {
        if (!scope || !node || !isValid(node) || typeof handler !== 'function') {
            return;
        }

        const wrapped = (touch: EventTouch): void => {
            handler(touch);
        };

        scope.bind(
            () => {
                node.on(event, wrapped);
            },
            () => {
                if (isValid(node)) {
                    node.off(event, wrapped);
                }
            },
        );
    }

    /**
     * 监听节点 UITransform 的尺寸变化（SIZE_CHANGED）。
     *
     * Widget、Layout、父节点拉伸以及手动 `setContentSize` 最终都会让 UITransform
     * 在节点上 emit SIZE_CHANGED，所以这是自绘/自适应组件最可靠的重新布局入口。
     *
     * @param scope 宿主节点的订阅作用域
     * @param node 目标节点；已销毁时忽略
     * @param handler 尺寸变化回调，不接收参数
     */
    public static onSizeChanged(scope: BindingScope, node: Node, handler: () => void): void {
        if (!scope || !node || !isValid(node) || typeof handler !== 'function') {
            return;
        }

        const wrapped = (): void => {
            handler();
        };

        scope.bind(
            () => {
                node.on(Node.EventType.SIZE_CHANGED, wrapped);
            },
            () => {
                if (isValid(node)) {
                    node.off(Node.EventType.SIZE_CHANGED, wrapped);
                }
            },
        );
    }
}
