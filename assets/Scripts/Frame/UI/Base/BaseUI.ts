import { Component } from 'cc';
import { Log } from '../../Log/Log';
import { BindingScope } from '../BindingScope';
import { EUIType } from '../Def/EUIType';
import { IUIMeta } from '../Def/IUIMeta';

/**
 * 所有界面/遮罩/组件的公共基类（移植自 kemo_card 的 BaseUI）。
 *
 * 职责只有两件：提供元信息（uiId / uiDir / uiType），以及托管订阅作用域。
 * 生命周期不在这里编排——编排是 UIManager 的事，派生类只填钩子。
 *
 * 与 Godot 的对应关系：Godot 用 `_ExitTree` 做「离场时退订」，Cocos 对应的是 onDestroy；
 * 但缓存重开的界面不会销毁节点，所以退订的另一半（resetBindings）由框架在重新打开前显式调用。
 */
export abstract class BaseUI extends Component implements IUIMeta {
    /**
     * 订阅作用域：界面里所有事件订阅都要经它登记。
     * 声明为 readonly 是刻意的——作用域实例本身从不替换，只往里增删登记项。
     */
    public readonly binder: BindingScope = new BindingScope();

    /**
     * 界面标识，默认取类名。
     *
     * 之所以让子类可以覆写：打包后类名可能被压缩/改写，而 uiId 是资源路径推导和
     * 「同 id 只留一个实例」判重的依据，必须稳定。需要稳定字符串的界面请覆写本属性。
     */
    public get uiId(): string {
        return this.constructor.name;
    }

    /**
     * 界面所在目录（相对 UI 资源根），用于推导 prefab 路径。
     * 默认空串表示「由框架登记时提供」，组件类通常用不到。
     */
    public get uiDir(): string {
        return '';
    }

    /** 界面种类，决定默认打开参数与可用的生命周期步骤。 */
    public abstract get uiType(): EUIType;

    /**
     * 清空全部订阅。
     *
     * 框架在两种时机调用：节点销毁（onDestroy 内部）与「已打开界面被再次 Open」之前。
     * 后者尤其重要：不经过离场流程的重复打开如果不先清账，回调会成倍叠加。
     */
    public resetBindings(): void {
        this.binder.unbindAll();
    }

    /**
     * Cocos 在节点销毁时触发，对应 Godot 的 `_ExitTree`。
     *
     * 顺序刻意固定为「先让子类做自己的离场清理 → 再退订 → 最后交给父类」：
     * 子类清理时订阅仍然有效，才能安全地读到最后一次状态；
     * 反过来先退订会让子类清理拿不到事件。
     *
     * 子类若覆写本方法，必须调用 super.onDestroy()，否则退订与离场清理都不会执行。
     */
    protected onDestroy(): void {
        try {
            this.onExitTree();
        } catch (ex) {
            Log.error(`界面<${this.uiId}> 离场清理失败：${String(ex)}`, 'UI');
        } finally {
            this.binder.unbindAll();

            // cc.d.ts 把 onDestroy 声明为可选方法，Component 本身并没有实现体，
            // 直接 super.onDestroy() 在运行时会抛 TypeError；这里保留「父类若实现则调用」的语义。
            const superOnDestroy = super.onDestroy;
            if (superOnDestroy) superOnDestroy.call(this);
        }
    }

    /**
     * 离场清理钩子（C# 的 OnExitTree）。
     * 只放「必须趁订阅还在时做」的收尾；纯退订请交给 binder，不要写在这里。
     */
    protected onExitTree(): void {
        // 默认无事可做：绝大多数界面只需要退订，而退订由 onDestroy 统一处理。
    }
}
