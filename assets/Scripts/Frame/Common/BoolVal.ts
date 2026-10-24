/**
 * 多来源布尔值（移植自 kemo_card 的 BoolVal）。
 *
 * 语义：value = 任一来源为 true（OR 聚合），只在聚合结果变化时触发 onChange。
 * 典型用途：层级「是否被上层遮挡」由多个上层界面共同决定，任一界面要求隐藏即隐藏。
 */
export class BoolVal {
    private readonly sources = new Map<object, boolean>();

    public onChange: (() => void) | null = null;

    public get value(): boolean {
        for (const value of this.sources.values()) {
            if (value) return true;
        }
        return false;
    }

    public set(from: object, value: boolean): void {
        const previous = this.value;
        if (this.sources.get(from) === value) return;

        this.sources.set(from, value);
        if (previous !== this.value) this.onChange?.();
    }

    public remove(from: object): void {
        const previous = this.value;
        if (!this.sources.delete(from)) return;
        if (previous !== this.value) this.onChange?.();
    }

    /** 清空全部来源并解除回调（界面销毁时调用）。 */
    public destroy(): void {
        this.sources.clear();
        this.onChange = null;
    }
}
