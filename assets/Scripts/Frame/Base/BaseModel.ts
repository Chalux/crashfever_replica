import { EventDispatcher } from '../Event/EventDispatcher';

/**
 * 业务模型基类。
 *
 * 模型只保存内存状态，并通过事件总线通知变化；存档、校验和界面交互由子类
 * 或控制器负责。本类不依赖 cc，也不依赖 Model/Utils，便于在 Node 中测试。
 *
 * 生命周期是幂等的：重复 init 不会重复触发 onInit，dispose 之后不再允许 init。
 * 需要单例的模型用 `SingletonMixin(BaseModel)` 获得 getInstance，而不是让
 * 框架层反向依赖 Utils 中的单例实现。
 */
export class BaseModel {
    /** 模型事件总线，供界面或其他模型订阅。 */
    public readonly eventDispatcher: EventDispatcher = new EventDispatcher();

    private _initialized = false;
    private _disposed = false;

    public get initialized(): boolean {
        return this._initialized;
    }

    public get disposed(): boolean {
        return this._disposed;
    }

    /** 初始化模型；重复调用不会重复触发 onInit。 */
    public init(): void {
        if (this._initialized || this._disposed) return;
        this.onInit();
        this._initialized = true;
    }

    /** 释放模型并清空事件；dispose 后该实例不再接受 init。 */
    public dispose(): void {
        if (this._disposed) return;
        this._disposed = true;
        this.onDispose();
        this._initialized = false;
        this.eventDispatcher.clear();
    }

    /** 子类在这里建立初始状态或订阅。 */
    protected onInit(): void {
    }

    /** 子类在这里释放订阅或外部引用；事件总线由基类统一清空。 */
    protected onDispose(): void {
    }
}
