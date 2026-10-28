import { Log, LogOptions } from "../Log";
import { normalizeCount } from "./RedDotFormat";
import { RedDotNode } from "./RedDotNode";

function isValidId(id: unknown): id is string {
    return typeof id === 'string' && id.length > 0 && id === id.trim();
}

export class RedDotStore {
    private _nodes: Map<string, RedDotNode> = new Map();
    private _dirty: Set<string> = new Set();
    private _listeners: Set<RedDotListener> = new Set();
    private _emitting: boolean = false;
    private _batchDepth: number = 0;

    private static readonly MAX_NOTIFICATION_ROUNDS = 100;

    public Register(id: string, parent: string | null = null, initialCount: number = 0): boolean {
        const res = this._register(id, parent, initialCount);
        this._flushChanges();
        return res;
    }

    private _register(id: string, parent: string | null = null, initialCount: number = 0): boolean {
        if (!isValidId(id)) {
            Log.error(`RedDotStore: register id is invalid`, { tag: 'RedDot' } as LogOptions);
            return false;
        }
        const existing = this._nodes.get(id);
        if (existing) {
            if (existing.parent === parent) {
                Log.warn(`RedDotStore: register id ${id} already exists`, { tag: 'RedDot' } as LogOptions);
                return false;
            } else {
                Log.error(`RedDotStore: register id ${id} already exists with different parent`, { tag: 'RedDot' } as LogOptions);
                return false;
            }
        }
        if (parent != null && !isValidId(parent)) {
            Log.error(`RedDotStore: register id ${id} parent is invalid`, { tag: 'RedDot' } as LogOptions);
            return false;
        }
        if (parent != null && !this._nodes.has(parent)) {
            Log.error(`RedDotStore: register id ${id} parent ${parent} not found`, { tag: 'RedDot' } as LogOptions);
            return false;
        }
        if (id === parent) {
            Log.error(`RedDotStore: register id ${id} cannot be its own parent`, { tag: 'RedDot' } as LogOptions);
            return false;
        }
        // 检查是否有环型依赖
        let current = parent;
        while (current) {
            if (current === id) {
                Log.error(`RedDotStore: register id ${id} creates a cycle with parent ${parent}`, { tag: 'RedDot' } as LogOptions);
                return false;
            }
            const parentNode = this._nodes.get(current);
            current = parentNode?.parent ?? null;
        }
        initialCount = normalizeCount(initialCount);
        this._nodes.set(id, new RedDotNode(id, parent, initialCount));
        if (parent) {
            let parentNode = this._nodes.get(parent);
            if (parentNode) {
                parentNode.children.push(id);
            }
            if (initialCount > 0) {
                while (parentNode) {
                    parentNode.total += initialCount;
                    this._markDirty(parentNode.id ?? null);
                    parentNode = parentNode.parent === null
                        ? undefined
                        : this._nodes.get(parentNode.parent);
                }
            }
        }
        this._markDirty(id);
        return true;
    }

    public Unregister(id: string): void {
        this._unregister(id);
        this._flushChanges();
    }

    private _unregister(id: string): void {
        const node = this._nodes.get(id);
        if (!node) {
            // Log.warn(`RedDotStore: unregister id ${id} not found`, { tag: 'RedDot' } as LogOptions);
            return;
        }
        const copy = [...node.children];
        if (copy.length > 0) {
            for (const child of copy) {
                this._unregister(child);
            }
        }
        if (node.parent) {
            let parentNode = this._nodes.get(node.parent);
            if (parentNode) {
                parentNode.children = parentNode.children.filter(child => child !== id);
            }
            if (node.total != 0) {
                while (parentNode) {
                    parentNode.total -= node.total;
                    this._markDirty(parentNode?.id ?? null);
                    parentNode = parentNode.parent === null
                        ? undefined
                        : this._nodes.get(parentNode.parent);
                }
            }
        }
        node.Unregister();
        this._markDirty(id);
        this._nodes.delete(id);
    }

    public Set(id: string, count: number): void {
        this._set(id, count);
        this._flushChanges();
    }

    private _set(id: string, count: number): void {
        const node = this._nodes.get(id);
        if (!node) {
            Log.error(`RedDotStore: set id ${id} not found`, { tag: 'RedDot' } as LogOptions);
            return;
        }
        count = normalizeCount(count);
        const diff = count - node.own;
        node.total += diff;
        node.own = count;
        if (diff == 0) return;
        if (node.parent) {
            let parent = this._nodes.get(node.parent);
            while (parent) {
                parent.total += diff;
                this._markDirty(parent.id ?? null);
                parent = parent.parent === null
                    ? undefined
                    : this._nodes.get(parent.parent);
            }
        }
        this._markDirty(id);
    }

    public Get(id: string): number {
        const node = this._nodes.get(id);
        if (!node) {
            // Log.warn(`RedDotStore: get id ${id} not found`, { tag: 'RedDot' } as LogOptions);
            return 0;
        }
        return node.total;
    }

    public GetOwn(id: string): number {
        const node = this._nodes.get(id);
        if (!node) {
            // Log.warn(`RedDotStore: getOwn id ${id} not found`, { tag: 'RedDot' } as LogOptions);
            return 0;
        }
        return node.own;
    }

    public Clear(id: string): void {
        this._clear(id);
        this._flushChanges();
    }

    private _clear(id: string): void {
        const node = this._nodes.get(id);
        if (!node) {
            // Log.warn(`RedDotStore: clear id ${id} not found`, { tag: 'RedDot' } as LogOptions);
            return;
        }
        if (node.own == 0) return;
        if (node.parent) {
            let parent = this._nodes.get(node.parent);
            while (parent) {
                parent.total -= node.own;
                this._markDirty(parent.id ?? null);
                parent = parent.parent === null
                    ? undefined
                    : this._nodes.get(parent.parent);
            }
        }
        node.total -= node.own;
        node.own = 0;
        this._markDirty(id);
    }

    public ClearTree(id: string): void {
        this._clearTree(id);
        this._flushChanges();
    }

    private _clearTree(id: string): void {
        const node = this._nodes.get(id);
        if (!node) {
            // Log.warn(`RedDotStore: clearTree id ${id} not found`, { tag: 'RedDot' } as LogOptions);
            return;
        }
        if (node.children.length > 0) {
            const copy = [...node.children];
            for (const child of copy) {
                this._clearTree(child);
            }
        }
        this._clear(id);
    }

    public ResetCounts(): void {
        for (const node of this._nodes.values()) {
            if (node.total != 0) this._markDirty(node.id);
            node.own = 0;
            node.total = 0;
        }
        this._flushChanges();
    }

    public Dispose(): void {
        this._nodes.clear();
        this._listeners.clear();
        this._dirty.clear();
    }

    public IsRegistered(id: string): boolean {
        return this._nodes.has(id);
    }

    public Has(id: string): boolean {
        return (this._nodes.get(id)?.total ?? 0) > 0;
    }

    public Snapshot(): readonly IRedDotNodeInfo[] {
        return Array.from(this._nodes.values()).map(node => ({
            id: node.id,
            parent: node.parent,
            own: node.own,
            total: node.total,
        }));
    }

    public OnChanged(listener: RedDotListener): () => void {
        const subscription: RedDotListener = change => listener(change);
        this._listeners.add(subscription);
        return () => {
            this._listeners.delete(subscription);
        };
    }

    private _markDirty(id: string): void {
        if (!id) return;
        this._dirty.add(id);
    }

    private _flushChanges(): void {
        if (this._emitting || this._batchDepth > 0 || this._dirty.size <= 0) return;

        this._emitting = true;
        let rounds = 0;

        try {
            while (this._dirty.size > 0) {
                if (rounds >= RedDotStore.MAX_NOTIFICATION_ROUNDS) {
                    Log.error(`RedDot notification loop exceeded ${RedDotStore.MAX_NOTIFICATION_ROUNDS} rounds`, { tag: 'RedDot' } as LogOptions);
                    break;
                }

                rounds++;

                const change: RedDotChange = {
                    ids: new Set(this._dirty),
                };
                this._dirty.clear();

                for (const listener of [...this._listeners]) {
                    try {
                        listener(change);
                    } catch (e) {
                        Log.error(`RedDot listener failed: ${String(e)}`, { tag: 'RedDot' } as LogOptions);
                    }
                }
            }
        } finally {
            this._emitting = false;
        }
    }

    public Batch(fn: () => void): void {
        this._batchDepth++;
        try {
            fn();
        } finally {
            this._batchDepth--;
            this._flushChanges();
        }
    }

    public Add(id: string, delta: number): void {
        this._add(id, delta);
        this._flushChanges();
    }

    private _add(id: string, delta: number): void {
        const node = this._nodes.get(id);
        if (!node) {
            Log.error(`RedDot node not found: ${id}`, { tag: 'RedDot' } as LogOptions);
            return;
        }
        if (!Number.isFinite(delta)) delta = 0;
        if (delta == 0) return;
        this._set(id, node.own + delta);
    }
}

export interface IRedDotNodeInfo {
    readonly id: string;
    readonly parent: string | null;
    readonly own: number;
    readonly total: number;
}

export interface RedDotChange {
    readonly ids: ReadonlySet<string>;
}

export type RedDotListener = (change: RedDotChange) => void;