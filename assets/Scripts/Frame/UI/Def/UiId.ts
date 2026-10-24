/**
 * 强类型 UI 标识符：把 Id 与载荷类型在编译期绑定。
 *
 * TS 无法像 C# 那样做隐式转换，所以统一用 openAsync<TPayload>(new UiId<T>(id), payload) 的写法；
 * 运行时它就是一层薄包装，toString() 返回原始 id。
 */
export class UiId<TPayload = unknown> {
    constructor(public readonly value: string) {
    }

    public toString(): string {
        return this.value;
    }
}

/** 把 string | UiId 归一成 string。 */
export function toUiIdString(id: string | UiId<unknown>): string {
    return typeof id === 'string' ? id : id.value;
}
