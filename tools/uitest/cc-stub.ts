/**
 * 最小 `cc` 模块桩，仅供 tools/uitest 的冒烟驱动在 Node.js 里跑框架逻辑用。
 *
 * 只实现 UI 框架真正调用到的表面：节点树、组件挂载、四边对齐 Widget、
 * resources.load 与 prefab 实例化。渲染、输入、Tween 一律不实现——
 * 框架不该依赖它们（依赖了就是移植缺陷，冒烟会立刻炸出来）。
 */

export class Vec2 {
    constructor(public x: number = 0, public y: number = 0) {}
}

export class Vec3 {
    constructor(public x: number = 0, public y: number = 0, public z: number = 0) {}
    public static readonly ZERO = new Vec3(0, 0, 0);
}

export class Size {
    constructor(public width: number = 0, public height: number = 0) {}
}

export class Color {
    constructor(
        public r: number = 255,
        public g: number = 255,
        public b: number = 255,
        public a: number = 255,
    ) {}
    public static readonly BLACK = new Color(0, 0, 0, 255);
    public static readonly WHITE = new Color(255, 255, 255, 255);
    public static readonly TRANSPARENT = new Color(0, 0, 0, 0);
}

export class Component {
    public node: Node = null as unknown as Node;
    public enabled = true;

    protected onLoad?(): void;
    protected onEnable?(): void;
    protected onDisable?(): void;
    protected onDestroy?(): void;
}

export class UITransform extends Component {
    public readonly contentSize: Size = new Size();
    public readonly anchorPoint: Vec2 = new Vec2(0.5, 0.5);

    public setContentSize(width: number, height: number): void {
        this.contentSize.width = width;
        this.contentSize.height = height;
    }

    public setAnchorPoint(x: number, y: number): void {
        this.anchorPoint.x = x;
        this.anchorPoint.y = y;
    }

    public get width(): number {
        return this.contentSize.width;
    }

    public get height(): number {
        return this.contentSize.height;
    }
}

export class Widget extends Component {
    public static readonly AlignMode = { ONCE: 0, ON_WINDOW_RESIZE: 1, ALWAYS: 2 };

    public isAlignTop = false;
    public isAlignBottom = false;
    public isAlignLeft = false;
    public isAlignRight = false;
    public top = 0;
    public bottom = 0;
    public left = 0;
    public right = 0;
    public alignMode = Widget.AlignMode.ON_WINDOW_RESIZE;
}

export class Node {
    /** 节点事件名；桩只列出框架用到的几个。 */
    public static readonly EventType = {
        TOUCH_START: 'touch-start',
        TOUCH_MOVE: 'touch-move',
        TOUCH_END: 'touch-end',
        TOUCH_CANCEL: 'touch-cancel',
        SIZE_CHANGED: 'size-changed',
    };

    public name: string;
    public parent: Node | null = null;
    public readonly children: Node[] = [];
    public readonly components: Component[] = [];
    public active = true;
    public layer = 0;
    public readonly position: Vec3 = new Vec3();
    public readonly scale: Vec3 = new Vec3(1, 1, 1);

    private destroyed = false;

    constructor(name: string = '') {
        this.name = name;
    }

    public setPosition(x: number, y: number, z: number = 0): void {
        this.position.x = x;
        this.position.y = y;
        this.position.z = z;
    }

    public setScale(x: number, y: number, z: number = 1): void {
        this.scale.x = x;
        this.scale.y = y;
        this.scale.z = z;
    }

    public get isValid(): boolean {
        return !this.destroyed;
    }

    public addChild(child: Node): void {
        if (child.parent === this) return;
        child.removeFromParent();
        child.parent = this;
        this.children.push(child);
    }

    public removeChild(child: Node): void {
        const index = this.children.indexOf(child);
        if (index < 0) return;
        this.children.splice(index, 1);
        child.parent = null;
    }

    public removeFromParent(): void {
        this.parent?.removeChild(this);
    }

    public getSiblingIndex(): number {
        return this.parent ? this.parent.children.indexOf(this) : 0;
    }

    public setSiblingIndex(index: number): void {
        const parent = this.parent;
        if (!parent) return;
        const current = parent.children.indexOf(this);
        if (current < 0) return;
        parent.children.splice(current, 1);
        const clamped = Math.max(0, Math.min(index, parent.children.length));
        parent.children.splice(clamped, 0, this);
    }

    public addComponent<T extends Component>(ctor: new () => T): T {
        const component = new ctor();
        component.node = this;
        this.components.push(component);

        // Cocos 的时序：addComponent 后立刻 onLoad，节点已激活则继续 onEnable。
        (component as unknown as { onLoad?: () => void }).onLoad?.();
        if (this.active) (component as unknown as { onEnable?: () => void }).onEnable?.();
        return component;
    }

    public getComponent<T extends Component>(ctor: new () => T): T | null {
        for (const component of this.components) {
            if (component instanceof ctor) return component as T;
        }
        return null;
    }

    public destroy(): boolean {
        if (this.destroyed) return false;
        this.destroyed = true;

        for (const component of [...this.components]) {
            (component as unknown as { onDestroy?: () => void }).onDestroy?.();
        }
        this.components.length = 0;

        for (const child of [...this.children]) child.destroy();
        this.removeFromParent();
        return true;
    }

    public on(_type: string, _callback: unknown, _target?: unknown): void {}
    public off(_type: string, _callback?: unknown, _target?: unknown): void {}
    public targetOff(_target: unknown): void {}
    public emit(_type: string, ..._args: unknown[]): void {}
}

export function isValid(value: unknown): boolean {
    if (!value) return false;
    if (value instanceof Node) return value.isValid;
    const node = (value as { node?: unknown }).node;
    if (node instanceof Node) return node.isValid;
    return true;
}

export class Prefab {
    /** 桩专用：每次 instantiate 都调用它新建一棵节点树（真实引擎是克隆 prefab.data）。 */
    public factory: (() => Node) | null = null;
    public data: Node | null = null;
}

export function instantiate(original: Prefab | Node): Node {
    if (original instanceof Node) return original;
    if (original.factory) return original.factory();
    throw new Error('cc-stub: Prefab 缺少 factory，无法实例化');
}

const prefabRegistry = new Map<string, Prefab>();

/** 桩专用：登记某个 resources 路径对应的 prefab。 */
export function __registerPrefab(path: string, prefab: Prefab): void {
    prefabRegistry.set(path, prefab);
}

export const resources = {
    load(path: string, _type: unknown, callback: (err: Error | null, asset: Prefab | null) => void): void {
        // 模拟异步加载：真实引擎也不会在本帧同步回调。
        queueMicrotask(() => {
            const prefab = prefabRegistry.get(path);
            if (prefab) callback(null, prefab);
            else callback(new Error(`not found: ${path}`), null);
        });
    },
};

// ---- 装饰器与控件桩：只要能被 import / 当装饰器调用即可 ----

export const _decorator = {
    ccclass: (_name: string) => (_target: unknown) => {},
    property: (_options?: unknown) => (_target: unknown, _key?: string) => {},
    menu: (_path: string) => (_target: unknown) => {},
    disallowMultiple: (_target: unknown) => {},
    requireComponent: (_ctor: unknown) => (_target: unknown) => {},
};

export const CCInteger = 'cc.Integer';
export const CCString = 'cc.String';
export const CCBoolean = 'cc.Boolean';
export const CCFloat = 'cc.Float';

export class Button extends Component {
    public static readonly EventType = { CLICK: 'click' };
}

/** 仅满足 RedDotBadge 等视图脚本的类型/运行时需求。 */
export class Label extends Component {
    public string = '';
    public fontSize = 0;
}

export class Toggle extends Component {
    public static readonly EventType = { TOGGLE: 'toggle' };
    public isChecked = false;
}

export class Slider extends Component {
    public static readonly EventType = { SLIDE: 'slide' };
    public progress = 0;
}

export class EditBox extends Component {
    public string = '';
}
export class EventTouch {}

// NodeEventType 只作为参数类型使用（import type），这里给出同名字面量类型即可。
export type NodeEventType = string;
