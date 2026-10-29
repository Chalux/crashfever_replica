// docs/review/probe/spec-store.mjs
// ---------------------------------------------------------------------------
// 评审取证专用：按 docs/红点系统设计.md 的【字面规格】实现的最小 RedDotStore。
// 不是生产代码，不写入 assets/。仅用于跑出「文档规格 → 实际行为」的反例。
//
// 规格依据（行号对应 docs/红点系统设计.md）：
//   §5.1 L210-217 实现要点：
//     - 内部维护 nodes / children / total 三张表；写入后沿父链向上重算；
//     - 写入前记录「当前节点 + 祖先」旧聚合值，写入后比较，只有聚合值变化才进脏集；
//     - register / unregister 也要进入脏集（新节点刷新一次；被移除节点归零隐藏）；
//     - 批量期间只累积脏 ID，最外层 batch 结束时统一发送；
//     - 单个监听抛异常只记日志，不影响其他监听。
//   §6.1 L387-397：脏集 = 变化节点 + 全部祖先；ClearTree / Unregister 向下收集子孙；
//                  最后只发一次事件；兄弟节点不收到通知。
//   §6.2 L443-445：事件载荷只带 ID；监听器里再写红点时用 _emitting 标记排队，本轮发完再发下一轮。
//   §5.3 L259-263：formatRedDotCount（原文照抄）。
//   其余文档未规定的地方，本原型采用「最自然的字面实现」，并在注释里标明【文档未规定】。
// ---------------------------------------------------------------------------

/** §5.3 L259-263 原文照抄 */
export function formatRedDotCount(count, maxCount = 99) {
    const safeMax = Number.isFinite(maxCount) && maxCount >= 1 ? Math.floor(maxCount) : 99;
    const safe = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
    return safe > safeMax ? `${safeMax}+` : String(safe);
}

export class SpecStore {
    constructor() {
        this.nodes = new Map();      // id -> { parentId, own, total }
        this.children = new Map();   // id -> Set<childId>
        this.listeners = new Set();
        this.errors = [];            // 模拟 Log.error
        this.events = [];            // 每次广播记录一份 ids 快照，便于断言
        this.batchDepth = 0;
        this.pending = new Set();    // 批量期间累积的脏 ID
        this.emitting = false;       // §6.2 L444
        this.nextRound = new Set();  // _emitting 期间排队的脏 ID
    }

    // ---------------- 查询 ----------------
    // 【文档未规定】未注册 ID 的 Get 返回值。§5.4 L355 的显示规则要求「未注册 → 隐藏」，
    // 且 §5.1 L146 要求注销后视图归零隐藏，因此原型采用 0（最保守、唯一可用的选择）。
    get(id) { const n = this.nodes.get(id); return n ? n.total : 0; }
    getOwn(id) { const n = this.nodes.get(id); return n ? n.own : 0; }
    has(id) { return this.get(id) > 0; }
    isRegistered(id) { return this.nodes.has(id); }
    snapshot() {
        return [...this.nodes].map(([id, n]) => ({ id, parentId: n.parentId, own: n.own, total: n.total }));
    }

    // ---------------- 内部工具 ----------------
    _parentPath(id) { // [id, parent, grandparent, ...]
        const out = [];
        let cur = id;
        while (cur != null && this.nodes.has(cur)) { out.push(cur); cur = this.nodes.get(cur).parentId; }
        return out;
    }
    _subtree(id) { // 前序：自身 + 全部子孙
        const out = [];
        const walk = (x) => { out.push(x); for (const c of (this.children.get(x) || [])) walk(c); };
        walk(id);
        return out;
    }
    _recomputeUp(id) { // §5.1 L212：写入后沿父链向上重算
        let cur = id;
        while (cur != null && this.nodes.has(cur)) {
            const n = this.nodes.get(cur);
            let sum = n.own;
            for (const c of (this.children.get(cur) || [])) { const cn = this.nodes.get(c); sum += cn ? cn.total : 0; }
            n.total = sum;
            cur = n.parentId;
        }
    }
    _totalSnapshot(ids) {
        const m = new Map();
        for (const id of ids) { const n = this.nodes.get(id); if (n) m.set(id, n.total); }
        return m;
    }
    _emit(ids) { // 一次广播（§6.2：发完检查下一轮）
        if (!ids.size) return;
        this.emitting = true;
        const payload = { ids: new Set(ids) };
        this.events.push([...ids]);
        for (const l of [...this.listeners]) {
            try { l(payload); } catch (e) { this.errors.push(String(e)); }
        }
        this.emitting = false;
        if (this.nextRound.size) {
            const next = this.nextRound;
            this.nextRound = new Set();
            this._emit(next);
        }
    }
    _deliver(dirty) {
        if (!dirty.size) return;
        if (this.batchDepth > 0) { for (const id of dirty) this.pending.add(id); return; } // §5.1 L215
        if (this.emitting) { for (const id of dirty) this.nextRound.add(id); return; }    // §6.2 L444
        this._emit(dirty);
    }

    // ---------------- 监听 ----------------
    onChanged(listener) {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    // ---------------- 注册树 ----------------
    register(id, parentId = null, initialCount = 0) {
        // 【文档未规定】initialCount 的非法值规则（set 有，register 没有）。
        if (this.nodes.has(id)) return false; // §3.1 L61 重复注册：同父幂等（简化：一律 false，不比较父）
        if (parentId != null && !this.nodes.has(parentId)) {
            this.errors.push(`register: parent not found, id=${id}, parent=${parentId}`); // §3.1 L60
            return false;
        }
        const affected = parentId != null ? this._parentPath(parentId) : [];
        const old = this._totalSnapshot(affected);
        this.nodes.set(id, { parentId: parentId ?? null, own: initialCount, total: 0 });
        this.children.set(id, new Set());
        if (parentId != null) this.children.get(parentId).add(id);
        this._recomputeUp(id);
        const dirty = new Set([id]); // §5.1 L214：新节点也进脏集
        for (const a of affected) if (this.nodes.get(a).total !== old.get(a)) dirty.add(a);
        this._deliver(dirty);
        return true;
    }

    unregister(id) {
        if (!this.nodes.has(id)) return; // §5.1 L168：未知 ID 静默忽略
        const node = this.nodes.get(id);
        const removed = this._subtree(id);
        const parentId = node.parentId;
        const old = this._totalSnapshot(parentId != null ? this._parentPath(parentId) : []);
        for (const rid of removed) this.nodes.delete(rid);
        if (parentId != null && this.children.has(parentId)) this.children.get(parentId).delete(id);
        for (const rid of removed) this.children.delete(rid);
        if (parentId != null) this._recomputeUp(parentId);
        const dirty = new Set(removed); // §5.1 L146：注销时包含被移除的子孙
        for (const a of old.keys()) { const n = this.nodes.get(a); if (n && n.total !== old.get(a)) dirty.add(a); }
        this._deliver(dirty);
    }

    // ---------------- 计数写入 ----------------
    set(id, count) {
        const n = this.nodes.get(id);
        if (!n) { this.errors.push(`set on unregistered: ${id}`); return; } // §10 L558
        const norm = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0; // §5.1 L172
        const path = this._parentPath(id);
        const old = this._totalSnapshot(path);
        n.own = norm;
        this._recomputeUp(id);
        const dirty = new Set();
        for (const a of path) if (this.nodes.get(a).total !== old.get(a)) dirty.add(a);
        this._deliver(dirty);
    }

    add(id, delta) {
        const n = this.nodes.get(id);
        if (!n) { this.errors.push(`add on unregistered: ${id}`); return; }
        n.own = Math.max(0, n.own + delta); // 【文档未规定】NaN / Infinity / 小数 / 负 delta 的归一规则
        const path = this._parentPath(id);
        const old = this._totalSnapshot(path);
        this._recomputeUp(id);
        const dirty = new Set();
        for (const a of path) if (this.nodes.get(a).total !== old.get(a)) dirty.add(a);
        this._deliver(dirty);
    }

    clear(id) { this.set(id, 0); }

    // §6.1 L408-415 的【字面】实现：清零子树 own → 只重算 main.total → 脏集向下收集。
    clearTree(id) {
        const n = this.nodes.get(id);
        if (!n) { this.errors.push(`clearTree on unregistered: ${id}`); return; } // 【文档未规定】
        const sub = this._subtree(id);
        for (const sid of sub) this.nodes.get(sid).own = 0;
        const parentId = n.parentId;
        if (parentId != null) this._recomputeUp(parentId); // 字面：示例只点名「重算：main.total」
        const dirty = new Set(sub);                        // §6.1 L413：向下收集
        if (parentId != null) for (const a of this._parentPath(parentId)) dirty.add(a);
        this._deliver(dirty);
    }

    // 对照实现：把每个子节点也当成一次独立写入（走「写前旧值 / 写后比较 + 向上重算」）。
    clearTreePerWrite(id) {
        const sub = this._subtree(id);
        for (const sid of [...sub].reverse()) this.set(sid, 0);
    }

    resetCounts() {
        // 【文档未规定】resetCounts 的重算 / 脏集 / 事件。字面：只把计数归零（§5.1 L203）。
        for (const n of this.nodes.values()) n.own = 0;
    }

    dispose() { // §5.1 L206：清空注册树、计数、监听
        this.nodes.clear();
        this.children.clear();
        this.listeners.clear();
    }

    batch(fn) {
        // 【文档未规定】fn 抛异常时的退出 / flush 语义。字面实现（没有 try/finally）：
        this.batchDepth++;
        fn();
        this.batchDepth--;
        if (this.batchDepth === 0 && this.pending.size) {
            const pending = this.pending;
            this.pending = new Set();
            this._deliver(pending);
        }
    }
}
