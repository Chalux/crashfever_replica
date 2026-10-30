/**
 * 单例工具。
 *
 * TypeScript 的 interface 只能描述实例侧成员，不能声明 static / private 字段，
 * 也不能携带方法实现，所以无法照搬 C# 的 `interface ISingleton`。
 * 这里提供两种落地方式：
 * 1. 普通类直接 `extends Singleton`，即可获得 `getInstance()`；
 * 2. 已经继承其它基类（例如 `cc.Component`）的类，用 `SingletonMixin(Base)` 包一层。
 * `ISingleton` 是纯标记接口，只用于在类型层面表达「这是一个单例类」。
 */

type Constructor<T = object> = new (...args: any[]) => T;

/** 单例标记接口：没有任何成员，`implements` 它不会产生额外约束。 */
export interface ISingleton {
}

/** 构造器 -> 唯一实例。以构造器为键，保证父子类各自持有自己的实例。 */
const instances = new WeakMap<Function, unknown>();

function resolveInstance<T>(ctor: Constructor<T>): T {
    let instance = instances.get(ctor) as T | undefined;
    if (instance === undefined) {
        instance = new ctor();
        instances.set(ctor, instance);
    }
    return instance;
}

/**
 * 单例基类：子类继承后即可使用静态的 getInstance / hasInstance / clearInstance。
 * 构造函数保持 protected，避免外部直接 new。
 *
 * @example
 * class Foo extends Singleton {
 *     // ...
 * }
 * const foo = Foo.getInstance();
 */
export abstract class Singleton implements ISingleton {
    protected constructor() {
    }

    /** 获取当前类的唯一实例，首次调用时创建。 */
    public static getInstance<T>(this: { prototype: T }): T {
        return resolveInstance(this as unknown as Constructor<T>);
    }

    /** 是否已经创建过实例，不会触发创建。 */
    public static hasInstance(this: Function): boolean {
        return instances.has(this);
    }

    /** 丢弃当前实例引用；下次 getInstance 会重新创建（场景重载时使用）。 */
    public static clearInstance(this: Function): void {
        instances.delete(this);
    }
}

/**
 * 单例混入：用于已经继承其它基类的类。
 *
 * @example
 * class Foo extends SingletonMixin(Component) {
 *     // ...
 * }
 * const foo = Foo.getInstance();
 */
export function SingletonMixin<TBase extends Constructor>(base: TBase) {
    return class extends base implements ISingleton {
        public constructor(...args: any[]) {
            super(...args);
        }

        /** 获取当前类的唯一实例，首次调用时创建。 */
        public static getInstance<T>(this: { prototype: T }): T {
            return resolveInstance(this as unknown as Constructor<T>);
        }

        /** 是否已经创建过实例，不会触发创建。 */
        public static hasInstance(this: Function): boolean {
            return instances.has(this);
        }

        /** 丢弃当前实例引用；下次 getInstance 会重新创建（场景重载时使用）。 */
        public static clearInstance(this: Function): void {
            instances.delete(this);
        }
    };
}
