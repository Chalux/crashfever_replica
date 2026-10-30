import type { EventDispatcher } from '../Event/EventDispatcher';
import { BaseModel } from './BaseModel';

/**
 * 业务控制器基类。
 *
 * 控制器把模型能力转成界面可调用的操作，并持有当前模型引用；它不直接保存
 * 业务数据，也不操作 Cocos 节点。控制器不创建自己的事件分发器，通知界面时
 * 使用绑定模型的事件总线。
 *
 * 泛型只用于约束绑定的模型类型，默认 BaseModel。模型通过 bindModel 绑定，
 * 释放时自动解绑，避免控制器长期持有已废弃的模型。
 */
export class BaseController<TModel extends BaseModel = BaseModel> {
    private _model: TModel | null = null;
    private _initialized = false;
    private _disposed = false;

    public get model(): TModel | null {
        return this._model;
    }

    /**
     * 绑定模型的事件总线；控制器不自己创建事件分发器。
     * 未绑定模型时返回 null。
     */
    public get eventDispatcher(): EventDispatcher | null {
        return this._model?.eventDispatcher ?? null;
    }

    public get initialized(): boolean {
        return this._initialized;
    }

    public get disposed(): boolean {
        return this._disposed;
    }

    /** 获取已绑定模型；未绑定时抛错，避免子类静默操作空引用。 */
    protected requireModel(): TModel {
        if (!this._model) {
            throw new Error('BaseController 尚未绑定模型');
        }
        return this._model;
    }

    /** 绑定模型；重新绑定前会先解绑旧模型。 */
    public bindModel(model: TModel): void {
        if (this._disposed || model.disposed || this._model === model) return;
        this.unbindModel();
        this._model = model;
        this.onModelBound(model);
    }

    /** 解绑当前模型；没有模型时什么也不做。 */
    public unbindModel(): void {
        const model = this._model;
        if (!model) return;
        this._model = null;
        this.onModelUnbound(model);
    }

    /** 初始化控制器；重复调用不会重复触发 onInit。 */
    public init(): void {
        if (this._initialized || this._disposed) return;
        this.onInit();
        this._initialized = true;
    }

    /** 释放控制器并解绑模型；模型的事件总线由模型自己管理。 */
    public dispose(): void {
        if (this._disposed) return;
        this._disposed = true;
        this.onDispose();
        this.unbindModel();
        this._initialized = false;
    }

    /** 绑定模型后的回调，子类可覆写。 */
    protected onModelBound(model: TModel): void {
        void model;
    }

    /** 解绑模型后的回调，子类可覆写。 */
    protected onModelUnbound(model: TModel): void {
        void model;
    }

    /** 子类在这里建立初始状态或订阅。 */
    protected onInit(): void {
    }

    /** 子类在这里释放订阅或外部引用；模型由基类解绑，模型事件由模型自己管理。 */
    protected onDispose(): void {
    }
}
