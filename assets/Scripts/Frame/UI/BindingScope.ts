import { Log } from '../Log/Log';

/**
 * 界面订阅作用域（移植自 kemo_card 的 BindingScope）。
 *
 * 项目约定：界面里所有事件订阅必须通过本类登记，禁止裸写 node.on(...)；
 * 界面重开时框架会 resetBindings() 统一退订，避免重复订阅导致回调翻倍。
 */
export class BindingScope {
    private unbinders: Array<() => void> = [];

    public get count(): number {
        return this.unbinders.length;
    }

    public get hasBindings(): boolean {
        return this.unbinders.length > 0;
    }

    /** 登记一个退订函数（不执行订阅）。 */
    public add(unbind: () => void): void {
        if (typeof unbind !== 'function') return;
        this.unbinders.push(unbind);
    }

    /**
     * 先登记退订函数、再执行订阅。
     *
     * 顺序很重要：若先订阅后登记，订阅过程抛异常就会留下一个无人认领的回调，
     * 下次 resetBindings 也清不掉。
     */
    public bind(subscribe: () => void, unsubscribe: () => void): void {
        this.add(unsubscribe);
        try {
            subscribe();
        } catch (ex) {
            const index = this.unbinders.lastIndexOf(unsubscribe);
            if (index >= 0) this.unbinders.splice(index, 1);
            throw ex;
        }
    }

    /** 逆序退订全部登记项；单条失败只记日志，不阻断其余清理。 */
    public unbindAll(): void {
        if (this.unbinders.length === 0) return;

        const list = this.unbinders;
        this.unbinders = [];

        for (let i = list.length - 1; i >= 0; i--) {
            try {
                list[i]();
            } catch (ex) {
                Log.error(`UI 订阅解绑失败（已继续清理其余订阅）：${String(ex)}`, 'UI');
            }
        }
    }
}
