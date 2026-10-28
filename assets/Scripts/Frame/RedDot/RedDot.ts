import { EventDispatcher } from "../Event/EventDispatcher";
import { Log, LogOptions } from "../Log";
import { redDotEvent } from "./RedDotEvent";
import { IRedDotNodeInfo, RedDotChange, RedDotListener, RedDotStore } from "./RedDotStore";

export class RedDot {
    private static Store: RedDotStore | null = null;
    private static EventDispatcher: EventDispatcher = new EventDispatcher();
    private static UnsubscribeStore: (() => void) | null = null;

    public static Initialize(): void {
        if (RedDot.Store) {
            Log.warn(`RedDot has been inited.`, { tag: 'RedDot' } as LogOptions);
            return;
        }
        RedDot.Store = new RedDotStore();
        RedDot.UnsubscribeStore = RedDot.Store.OnChanged((change: RedDotChange) => {
            RedDot.EventDispatcher.send(redDotEvent.changed, change);
        });
    }

    private static EnsureStore(): RedDotStore {
        if (RedDot.Store === null) {
            RedDot.Initialize();
        }
        return RedDot.Store!;
    }

    public static Register(id: string, parent: string | null = null, initialCount: number = 0): boolean {
        return RedDot.EnsureStore().Register(id, parent, initialCount);
    }

    public static Set(id: string, count: number): void {
        RedDot.EnsureStore().Set(id, count);
    }

    public static Add(id: string, delta: number): void {
        RedDot.EnsureStore().Add(id, delta);
    }

    public static Get(id: string): number {
        return RedDot.EnsureStore().Get(id);
    }

    public static OnChanged(callback: (change: RedDotChange) => void): () => void {
        RedDot.EnsureStore();

        const handler: RedDotListener = change => callback(change);
        RedDot.EventDispatcher.on(redDotEvent.changed, handler);

        let subcribed = true;
        return () => {
            if (!subcribed) return;
            subcribed = false;
            RedDot.EventDispatcher.off(redDotEvent.changed, handler);
        };
    }

    public static Dispose(): void {
        RedDot.UnsubscribeStore?.();
        RedDot.UnsubscribeStore = null;
        RedDot.Store?.Dispose();
        RedDot.Store = null;
    }

    public static Unregister(id: string): void {
        RedDot.EnsureStore().Unregister(id);
    }

    public static IsRegistered(id: string): boolean {
        return RedDot.EnsureStore().IsRegistered(id);
    }

    public static Clear(id: string): void {
        RedDot.EnsureStore().Clear(id);
    }

    public static ClearTree(id: string): void {
        RedDot.EnsureStore().ClearTree(id);
    }

    public static GetOwn(id: string): number {
        return RedDot.EnsureStore().GetOwn(id);
    }

    public static Has(id: string): boolean {
        return RedDot.EnsureStore().Has(id);
    }

    public static Batch(fn: () => void): void {
        RedDot.EnsureStore().Batch(fn);
    }

    public static ResetCounts(): void {
        RedDot.EnsureStore().ResetCounts();
    }

    public static Snapshot(): readonly IRedDotNodeInfo[] {
        return RedDot.EnsureStore().Snapshot();
    }
}
