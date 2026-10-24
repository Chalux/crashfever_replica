import { Log } from '../Log/Log';

/**
 * 强类型事件键。
 *
 * 用对象而不是字符串做键，避免 "ui.open" 之类的魔法字符串在模块间失配；
 * 泛型参数只用于约束 send/on 两侧的载荷类型。
 */
export class EventKey<T> {
    constructor(public readonly name: string) {
    }

    public toString(): string {
        return this.name;
    }
}

export type EventHandler<T> = (payload: T) => void;

interface ListenerRecord {
    handler: EventHandler<unknown>;
    caller?: object;
    once: boolean;
}

/**
 * 轻量事件分发器（移植自 kemo_card 的 EventDispatcher）。
 *
 * 与 Godot 版一致：发送时对监听表做快照，允许回调内部增删监听；
 * 单个监听抛异常只记录日志，不影响其余监听。
 */
export class EventDispatcher {
    private readonly listeners = new Map<EventKey<unknown>, ListenerRecord[]>();

    public on<T>(key: EventKey<T>, handler: EventHandler<T>, caller?: object): void {
        this.add(key, handler, caller, false);
    }

    public once<T>(key: EventKey<T>, handler: EventHandler<T>, caller?: object): void {
        this.add(key, handler, caller, true);
    }

    public off<T>(key: EventKey<T>, handler: EventHandler<T>): void {
        const list = this.listeners.get(key as EventKey<unknown>);
        if (!list) return;

        const index = list.findIndex((record) => record.handler === (handler as EventHandler<unknown>));
        if (index >= 0) list.splice(index, 1);
        if (list.length === 0) this.listeners.delete(key as EventKey<unknown>);
    }

    /** 移除某个宿主（通常是界面组件）登记的全部监听。 */
    public offCaller(caller: object): void {
        for (const [key, list] of this.listeners) {
            const remain = list.filter((record) => record.caller !== caller);
            if (remain.length === 0) this.listeners.delete(key);
            else if (remain.length !== list.length) this.listeners.set(key, remain);
        }
    }

    public send<T>(key: EventKey<T>, payload: T): void {
        const list = this.listeners.get(key as EventKey<unknown>);
        if (!list || list.length === 0) return;

        // 快照：回调里可能取消订阅或再次 send。
        const snapshot = list.slice();
        for (const record of snapshot) {
            if (record.once) {
                const current = this.listeners.get(key as EventKey<unknown>);
                const index = current?.indexOf(record) ?? -1;
                if (current && index >= 0) current.splice(index, 1);
            }

            try {
                (record.handler as EventHandler<T>)(payload);
            } catch (ex) {
                Log.error(`事件<${key.name}>回调异常：${String(ex)}`, 'Event');
            }
        }
    }

    public clear(): void {
        this.listeners.clear();
    }

    private add<T>(key: EventKey<T>, handler: EventHandler<T>, caller: object | undefined, once: boolean): void {
        const typedKey = key as EventKey<unknown>;
        let list = this.listeners.get(typedKey);
        if (!list) {
            list = [];
            this.listeners.set(typedKey, list);
        }

        list.push({ handler: handler as EventHandler<unknown>, caller, once });
    }
}
