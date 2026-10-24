/**
 * UI 导航栈（移植自 UIStack.cs）。
 *
 * 语义：HideBelow = true 的全屏界面（Win）打开时压栈，Back() 关闭当前并恢复下层。
 * 关闭界面时用 remove(id) 出栈——它是幂等的，因此 Back() 已经弹过的 id
 * 再被关闭流程清一次不会误删下层界面。
 */
export class UIStack {
    private readonly stack: string[] = [];

    public get count(): number {
        return this.stack.length;
    }

    public get isEmpty(): boolean {
        return this.stack.length === 0;
    }

    public get top(): string | null {
        return this.stack.length > 0 ? this.stack[this.stack.length - 1] : null;
    }

    public push(uiId: string): void {
        this.stack.push(uiId);
    }

    /** 弹出栈顶并返回它；空栈返回 null。 */
    public pop(): string | null {
        if (this.stack.length === 0) return null;
        return this.stack.pop() ?? null;
    }

    /**
     * 返回上一层：要求至少有两层，先弹出当前层，再返回新的栈顶（即上一层）。
     * 栈不足两层时返回 null，由调用方决定「没有上一级」的行为。
     */
    public back(): string | null {
        if (this.stack.length < 2) return null;
        this.stack.pop();
        return this.stack[this.stack.length - 1] ?? null;
    }

    public clear(): void {
        this.stack.length = 0;
    }

    /**
     * 移除指定界面的全部记录（幂等）。
     *
     * 用倒序 splice 而不是 filter：保持栈内顺序不变，同时避免重建数组。
     *
     * @returns 是否真的移除了记录。
     */
    public remove(uiId: string): boolean {
        const before = this.stack.length;
        for (let i = this.stack.length - 1; i >= 0; i--) {
            if (this.stack[i] === uiId) this.stack.splice(i, 1);
        }
        return this.stack.length !== before;
    }

    public contains(uiId: string): boolean {
        return this.stack.indexOf(uiId) >= 0;
    }
}
