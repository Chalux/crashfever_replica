import { EUIType } from '../Def/EUIType';
import { BaseUI } from './BaseUI';

/**
 * 嵌入型 UI 组件基类（移植自 kemo_card 的 BaseCmp）：挂在窗口/对话框里的可复用片段。
 *
 * 与 Win 系的区别：组件不参与导航与层级，没有 openOpt、payload、动画；
 * 它的生命周期完全由宿主节点决定——被挂到激活节点上就初始化，摘下就解绑。
 *
 * Cocos 生命周期映射的关键取舍：
 * Godot 里 BaseCmp 把订阅登记挂在 `_EnterTree`（节点每次进入场景树都触发），并特意注明
 * 不能挂 `_Ready`（每节点只触发一次，缓存复用后再 AddChild 不会再触发，订阅就永久丢失）。
 * Cocos 里与之语义最接近的是 onEnable：节点每次变为激活状态都会触发，正好覆盖「重新挂载」。
 * 因此这里用 onEnable 而不是 onLoad。
 */
export abstract class BaseCmp extends BaseUI {
    public get uiType(): EUIType {
        return EUIType.Cmp;
    }

    /** 登记事件订阅；可覆写，但覆写时不要再调 super（基类没有订阅要登记）。 */
    protected initEvent(): void {
        // 默认无事可做：没有订阅的组件不需要写空实现。
    }

    /**
     * 每次变为激活状态时触发，对应 Godot 的 `_EnterTree`。
     * 用 onEnable 而非 onLoad，是因为组件可能在缓存节点上被反复启用/禁用。
     *
     * 子类若覆写本方法，必须调用 super.onEnable()，否则订阅不会重新登记。
     */
    protected onEnable(): void {
        this.initEvent();
    }

    /**
     * 停用时退订，对应 Godot `_ExitTree` 里 Binder.UnbindAll() 的那一半。
     *
     * 为什么非加不可：Cocos 里把节点从父节点摘下或 setActive(false) 只触发 onDisable，
     * 不触发 onDestroy；下次重新挂载时 onEnable 又会让 initEvent 再登记一遍。
     * 不在 onDisable 里清账，缓存复用的组件订阅就会成倍叠加。
     *
     * 代价是「隐藏期间收不到事件」：所以 initEvent 必须能从当前状态完整重建订阅，
     * 不能依赖隐藏期间发生的增量事件去补状态。
     *
     * 注意只有 BaseCmp 这么做：Win 系界面的 active 可能被 hideBelow 之类的机制控制，
     * 在 onDisable 里退订会把「已打开但被隐藏」的界面订阅误清掉。
     * 子类若覆写本方法，必须调用 super.onDisable()。
     */
    protected onDisable(): void {
        this.binder.unbindAll();
    }
}
