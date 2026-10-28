/**
 * 红点核心逻辑单测（对应设计稿 v3 §3.3 / §3.4 / §5.1 / §5.3）。
 *
 * 运行方式：npm run test:reddot
 * 前置：先由 tsc 把 Frame/RedDot 的核心文件编译到 .reddottest-out/，本文件 require 编译产物。
 * 本文件不依赖 Cocos，也不依赖任何界面资源。
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const { RedDotStore } = require('../../.reddottest-out/assets/Scripts/Frame/RedDot/RedDotStore.js');
const { normalizeCount, formatRedDotCount } = require('../../.reddottest-out/assets/Scripts/Frame/RedDot/RedDotFormat.js');
const { Log, LogChannel, LogLevel } = require('../../.reddottest-out/assets/Scripts/Frame/Log/index.js');

test('验收：核心源文件不依赖 cc', () => {
    for (const name of ['RedDotStore', 'RedDotNode', 'RedDotFormat']) {
        const source = readFileSync(new URL(`../../assets/Scripts/Frame/RedDot/${name}.ts`, import.meta.url), 'utf8');
        assert.doesNotMatch(source, /(?:from\s*|import\s*\(|require\s*\()\s*['"]cc['"]/);
    }
});

test('验收：Add 负小数、非有限增量与父节点自身计数', () => {
    const store = createStore();
    store.Register('root', null, 5);
    store.Register('child', 'root', 3);
    store.Add('root', -1.7);
    assert.equal(store.GetOwn('root'), 3);
    assert.equal(store.Get('root'), 6);
    const tracker = track(store);
    for (const delta of [NaN, Infinity, -Infinity, 0]) store.Add('root', delta);
    assert.equal(tracker.changes.length, 0);
});

test('验收：快照是独立数据副本', () => {
    const store = createStore();
    store.Register('root', null, 5);
    const snapshot = store.Snapshot();
    store.Set('root', 7);
    assert.equal(snapshot[0].own, 5);
    snapshot[0].total = 999;
    assert.equal(store.Get('root'), 7);
});

test('验收：重入 100 轮停止、保留脏集并可恢复', { timeout: 2000 }, () => {
    const store = createStore();
    store.Register('a');
    store.Register('b');
    let calls = 0;
    const unsubscribe = store.OnChanged(() => {
        calls++;
        store.Add('a', 1);
    });
    const logs = captureLogs(() => store.Set('a', 1));
    assert.equal(calls, 100);
    assert.equal(store.Get('a'), 101);
    assert.equal(countLevel(logs, LogLevel.Error), 1);
    unsubscribe();
    const tracker = track(store);
    store.Set('b', 1);
    assert.equal(tracker.changes.length, 1);
    assert.deepEqual(tracker.lastIds(), new Set(['a', 'b']));
});

// ---------------------------------------------------------------------------
// 测试辅助
// ---------------------------------------------------------------------------

const createStore = () => new RedDotStore();

/** 订阅变更事件并收集原始载荷；返回 changes 数组、退订函数与最近一次脏集。 */
function track(store) {
    const changes = [];
    const unsubscribe = store.OnChanged((change) => changes.push(change));
    return {
        changes,
        unsubscribe,
        idsAt(index) {
            const change = changes.at(index);
            return change ? new Set(change.ids) : new Set();
        },
        lastIds() {
            return this.idsAt(changes.length - 1);
        },
    };
}

/** snapshot 按 id 排序，避免依赖实现内部顺序。 */
function sortedNodes(store) {
    return [...store.Snapshot()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

function nodeMap(store) {
    return new Map(sortedNodes(store).map((node) => [node.id, node]));
}

/** 捕获 Log 广播（Console 通道即默认通道），只断言级别，不耦合文案。 */
function captureLogs(fn) {
    const entries = [];
    const unsubscribe = Log.subscribe(LogChannel.Console, (entry) => entries.push(entry));
    try {
        fn();
    } finally {
        unsubscribe();
    }
    return entries;
}

function countLevel(entries, level) {
    return entries.filter((entry) => entry.level === level).length;
}

/** §3.4 的示例树；不设置任何计数。 */
function createSampleTree() {
    const store = createStore();
    store.Register('main', null);
    store.Register('main/team', 'main');
    store.Register('main/stage', 'main');
    store.Register('main/stage/1001', 'main/stage');
    store.Register('main/stage/1002', 'main/stage');
    return store;
}

function setSampleCounts(store) {
    store.Set('main/team', 2);
    store.Set('main/stage/1001', 100);
    store.Set('main/stage/1002', 20);
}

// ---------------------------------------------------------------------------
// §5.3 归一与格式化
// ---------------------------------------------------------------------------

describe('§5.3 计数归一与格式化', () => {
    test('normalizeCount：非有限、负数、小数', () => {
        assert.equal(normalizeCount(0), 0);
        assert.equal(normalizeCount(5), 5);
        assert.equal(normalizeCount(2.9), 2);
        assert.equal(normalizeCount(2.0), 2);
        assert.equal(normalizeCount(-3), 0);
        assert.equal(normalizeCount(-0.5), 0);
        assert.equal(normalizeCount(Number.NaN), 0);
        assert.equal(normalizeCount(Number.POSITIVE_INFINITY), 0);
        assert.equal(normalizeCount(Number.NEGATIVE_INFINITY), 0);
    });

    test('formatRedDotCount：0 隐藏由调用方负责，函数本身返回 "0"', () => {
        assert.equal(formatRedDotCount(0), '0');
        assert.equal(formatRedDotCount(1), '1');
        assert.equal(formatRedDotCount(99), '99');
        assert.equal(formatRedDotCount(100), '99+');
        assert.equal(formatRedDotCount(122), '99+');
    });

    test('formatRedDotCount：等于上限不封顶，超过才加号', () => {
        assert.equal(formatRedDotCount(50, 50), '50');
        assert.equal(formatRedDotCount(51, 50), '50+');
        assert.equal(formatRedDotCount(1, 1), '1');
        assert.equal(formatRedDotCount(2, 1), '1+');
    });

    test('formatRedDotCount：非法输入归一', () => {
        assert.equal(formatRedDotCount(99.9), '99');
        assert.equal(formatRedDotCount(-1), '0');
        assert.equal(formatRedDotCount(Number.NaN), '0');
        assert.equal(formatRedDotCount(Number.POSITIVE_INFINITY), '0');
        assert.equal(formatRedDotCount(100, 0), '99+');
        assert.equal(formatRedDotCount(100, Number.NaN), '99+');
        assert.equal(formatRedDotCount(100, Number.POSITIVE_INFINITY), '99+');
        assert.equal(formatRedDotCount(100, -1), '99+');
        assert.equal(formatRedDotCount(5, 1.9), '1+');
    });
});

// ---------------------------------------------------------------------------
// §3.1 / §5.1 注册与查询
// ---------------------------------------------------------------------------

describe('§3.1 注册树与查询契约', () => {
    test('根节点、子节点注册成功并可查询', () => {
        const store = createStore();
        assert.equal(store.Register('main', null), true);
        assert.equal(store.Register('main/team', 'main'), true);
        assert.equal(store.Register('main/stage', 'main'), true);

        assert.equal(store.IsRegistered('main'), true);
        assert.equal(store.IsRegistered('main/team'), true);
        assert.equal(store.IsRegistered('main/nope'), false);
        assert.equal(store.Get('main'), 0);
        assert.equal(store.GetOwn('main'), 0);
    });

    test('父节点不存在：注册失败并记错误', () => {
        const store = createStore();
        const entries = captureLogs(() => {
            assert.equal(store.Register('main/team', 'main'), false);
        });
        assert.equal(store.IsRegistered('main/team'), false);
        assert.equal(store.Snapshot().length, 0);
        assert.equal(countLevel(entries, LogLevel.Error), 1);
    });

    test('parentId 等于自身被拒绝，保留原关系', () => {
        const store = createStore();
        store.Register('main', null);
        const entries = captureLogs(() => {
            assert.equal(store.Register('main', 'main'), false);
        });
        const root = nodeMap(store).get('main');
        assert.equal(root.parent, null);
        assert.equal(countLevel(entries, LogLevel.Error), 1);
    });

    test('同父重复注册：幂等、忽略 initialCount、记 warn', () => {
        const store = createStore();
        store.Register('main', null);
        store.Register('main/team', 'main', 2);

        const entries = captureLogs(() => {
            store.Register('main/team', 'main', 5);
        });

        assert.equal(store.GetOwn('main/team'), 2);
        assert.equal(store.Get('main'), 2);
        assert.equal(store.Snapshot().length, 2);
        assert.equal(countLevel(entries, LogLevel.Warn), 1);
    });

    test('异父重复注册：失败、保留第一次关系、记错误', () => {
        const store = createStore();
        store.Register('main', null);
        store.Register('battle', null);
        store.Register('main/a', 'main', 1);

        const entries = captureLogs(() => {
            assert.equal(store.Register('main/a', 'battle', 9), false);
        });

        assert.equal(store.Get('main'), 1);
        assert.equal(store.Get('battle'), 0);
        assert.equal(countLevel(entries, LogLevel.Error), 1);
    });

    test('非法 ID：所有入口安全拒绝，不抛异常', () => {
        const store = createStore();
        for (const invalid of ['', ' ', ' a', 'a ', 42, null]) {
            assert.equal(store.Register(invalid, null), false, `register(${String(invalid)})`);
            assert.equal(store.IsRegistered(invalid), false);
            assert.equal(store.Get(invalid), 0);
            assert.equal(store.GetOwn(invalid), 0);
            assert.equal(store.Has(invalid), false);
            store.Set(invalid, 1);
            store.Add(invalid, 1);
            store.Clear(invalid);
            store.ClearTree(invalid);
            store.Unregister(invalid);
        }
        assert.equal(store.Snapshot().length, 0);
    });

    test('unregister 未知 ID 静默忽略且不广播', () => {
        const store = createStore();
        const tracker = track(store);
        store.Unregister('nope');
        assert.equal(tracker.changes.length, 0);
        assert.equal(store.Snapshot().length, 0);
    });

    test('unregister 移除整棵子树并广播被移除节点', () => {
        const store = createSampleTree();
        setSampleCounts(store);
        assert.equal(store.Get('main'), 122);

        const tracker = track(store);
        store.Unregister('main/stage');

        assert.equal(store.IsRegistered('main/stage'), false);
        assert.equal(store.IsRegistered('main/stage/1001'), false);
        assert.equal(store.IsRegistered('main/stage/1002'), false);
        assert.equal(store.Get('main/stage'), 0);
        assert.equal(store.Get('main/stage/1001'), 0);
        assert.equal(store.Get('main'), 2);
        assert.equal(tracker.changes.length, 1);

        const ids = tracker.lastIds();
        for (const id of ['main/stage', 'main/stage/1001', 'main/stage/1002']) {
            assert.ok(ids.has(id), `脏集应包含被移除节点 ${id}`);
        }
    });

    test('允许多个根节点各自成树', () => {
        const store = createStore();
        store.Register('main', null);
        store.Register('battle', null);
        store.Set('main', 1);
        store.Set('battle', 5);
        assert.equal(store.Get('main'), 1);
        assert.equal(store.Get('battle'), 5);
    });
});

// ---------------------------------------------------------------------------
// §3.4 聚合
// ---------------------------------------------------------------------------

describe('§3.4 聚合规则', () => {
    test('total = own + Σ children.total', () => {
        const store = createSampleTree();
        setSampleCounts(store);

        assert.equal(store.GetOwn('main/team'), 2);
        assert.equal(store.GetOwn('main/stage'), 0);
        assert.equal(store.GetOwn('main/stage/1001'), 100);
        assert.equal(store.GetOwn('main/stage/1002'), 20);
        assert.equal(store.Get('main/stage'), 120);
        assert.equal(store.Get('main'), 122);
        assert.equal(store.Has('main'), true);
        assert.equal(store.Has('main/stage'), true);
    });

    test('未注册 ID 查询安全返回零值', () => {
        const store = createStore();
        assert.equal(store.Get('missing'), 0);
        assert.equal(store.GetOwn('missing'), 0);
        assert.equal(store.Has('missing'), false);
    });

    test('clear 只清自身，clearTree 清整棵子树', () => {
        const store = createSampleTree();
        store.Set('main/team', 2);
        store.Set('main/stage', 5);
        store.Set('main/stage/1001', 100);
        store.Set('main/stage/1002', 20);
        assert.equal(store.Get('main'), 127);

        store.Clear('main/stage');
        assert.equal(store.GetOwn('main/stage'), 0);
        assert.equal(store.Get('main/stage/1001'), 100);

        store.ClearTree('main/stage');
        assert.equal(store.Get('main/stage'), 0);
        assert.equal(store.Get('main/stage/1001'), 0);
        assert.equal(store.Get('main/stage/1002'), 0);
        assert.equal(store.Get('main'), 2);
    });
});

// ---------------------------------------------------------------------------
// §5.1 写入与计数归一
// ---------------------------------------------------------------------------

describe('§5.1 写入与计数归一', () => {
    test('set：负数按 0、小数向下取整、NaN/Infinity 按 0', () => {
        const store = createStore();
        store.Register('a', null);

        store.Set('a', -5);
        assert.equal(store.GetOwn('a'), 0);
        store.Set('a', 2.9);
        assert.equal(store.GetOwn('a'), 2);
        store.Set('a', Number.NaN);
        assert.equal(store.GetOwn('a'), 0);
        store.Set('a', Number.POSITIVE_INFINITY);
        assert.equal(store.GetOwn('a'), 0);
        store.Set('a', Number.NEGATIVE_INFINITY);
        assert.equal(store.GetOwn('a'), 0);
        store.Set('a', 3);
        assert.equal(store.GetOwn('a'), 3);
    });

    test('Add：有限 delta 保留符号，结果统一归一', () => {
        const store = createStore();
        store.Register('a', null);

        store.Add('a', 2.9);
        assert.equal(store.GetOwn('a'), 2);
        store.Add('a', -5);
        assert.equal(store.GetOwn('a'), 0);

        store.Set('a', 5);
        store.Add('a', Number.NaN);
        assert.equal(store.GetOwn('a'), 5);
        store.Add('a', Number.POSITIVE_INFINITY);
        assert.equal(store.GetOwn('a'), 5);

        store.Add('a', 1.7);
        assert.equal(store.GetOwn('a'), 6);
    });

    test('register(initialCount) 归一，父聚合不为负', () => {
        const store = createStore();
        store.Register('main', null);
        store.Register('main/x', 'main', -5);
        store.Register('main/y', 'main', 3);

        assert.equal(store.GetOwn('main/x'), 0);
        assert.equal(store.Get('main'), 3);
        assert.equal(store.Has('main'), true);

        store.Register('main/z', 'main', Number.NaN);
        assert.equal(store.GetOwn('main/z'), 0);
        store.Register('main/w', 'main', 2.9);
        assert.equal(store.GetOwn('main/w'), 2);
        assert.equal(store.Get('main'), 5);
    });

    test('set/add 未注册 ID：记错误并忽略', () => {
        const store = createStore();
        const entries = captureLogs(() => {
            store.Set('missing', 5);
            store.Add('missing', 1);
        });
        assert.equal(store.Get('missing'), 0);
        assert.equal(countLevel(entries, LogLevel.Error), 2);
    });

    test('clear/clearTree 未注册 ID 静默且不广播', () => {
        const store = createStore();
        const tracker = track(store);
        store.Clear('missing');
        store.ClearTree('missing');
        assert.equal(tracker.changes.length, 0);
    });
});

// ---------------------------------------------------------------------------
// §5.1 / §6.1 脏集与事件
// ---------------------------------------------------------------------------

describe('§6.1 脏集与事件', () => {
    test('单次 set：脏集为自身 + 全部祖先，兄弟不在其中', () => {
        const store = createSampleTree();
        const tracker = track(store);
        store.Set('main/stage/1001', 100);

        assert.equal(tracker.changes.length, 1);
        const ids = tracker.lastIds();
        for (const id of ['main/stage/1001', 'main/stage', 'main']) {
            assert.ok(ids.has(id), `脏集应包含 ${id}`);
        }
        assert.equal(ids.has('main/team'), false, '兄弟节点 total 未变，不应进脏集');
    });

    test('写入相同值不广播', () => {
        const store = createSampleTree();
        store.Set('main/team', 2);
        const tracker = track(store);
        store.Set('main/team', 2);
        assert.equal(tracker.changes.length, 0);
    });

    test('clearTree：脏集包含所有变化的子孙', () => {
        const store = createSampleTree();
        setSampleCounts(store);
        const tracker = track(store);
        store.ClearTree('main/stage');

        assert.equal(tracker.changes.length, 1);
        const ids = tracker.lastIds();
        for (const id of ['main/stage', 'main/stage/1001', 'main/stage/1002', 'main']) {
            assert.ok(ids.has(id), `脏集应包含 ${id}`);
        }
    });

    test('注册 0 计数节点也广播（结构变化）', () => {
        const store = createStore();
        store.Register('main', null);
        const tracker = track(store);
        store.Register('main/a', 'main', 0);

        assert.equal(tracker.changes.length, 1);
        assert.ok(tracker.lastIds().has('main/a'));
    });

    test('注销全零子树也广播（视图需要隐藏）', () => {
        const store = createStore();
        store.Register('main', null);
        store.Register('main/a', 'main', 0);
        const tracker = track(store);
        store.Unregister('main/a');

        assert.equal(tracker.changes.length, 1);
        assert.ok(tracker.lastIds().has('main/a'));
    });

    test('批量写入只广播一次，值正确', () => {
        const store = createSampleTree();
        const tracker = track(store);
        store.Batch(() => {
            store.Set('main/team', 2);
            store.Set('main/stage/1001', 100);
            store.Set('main/stage/1002', 20);
        });

        assert.equal(tracker.changes.length, 1);
        assert.equal(store.Get('main'), 122);
    });

    test('嵌套 batch 仍只广播一次', () => {
        const store = createSampleTree();
        const tracker = track(store);
        store.Batch(() => {
            store.Set('main/team', 2);
            store.Batch(() => {
                store.Set('main/stage/1001', 100);
            });
        });

        assert.equal(tracker.changes.length, 1);
        assert.equal(store.Get('main'), 102);
    });

    test('batch 净变化为 0：a/b 仍须通知（main 是否剔除由实现决定）', () => {
        const store = createStore();
        store.Register('main', null);
        store.Register('main/a', 'main');
        store.Register('main/b', 'main');
        store.Set('main/a', 2);
        store.Set('main/b', 3);

        const tracker = track(store);
        store.Batch(() => {
            store.Set('main/a', 1);
            store.Set('main/b', 4);
        });

        assert.equal(tracker.changes.length, 1);
        const ids = tracker.lastIds();
        assert.ok(ids.has('main/a'));
        assert.ok(ids.has('main/b'));
        // main 的 total 净变化为 0：做过 batch 基线复核的实现应剔除，未做则多一次无害刷新。
    });

    test('batch 内抛异常：异常透传、深度恢复、后续写入仍能广播', () => {
        const store = createSampleTree();
        const tracker = track(store);

        assert.throws(() => {
            store.Batch(() => {
                store.Set('main/team', 2);
                throw new Error('boom');
            });
        }, /boom/);

        assert.equal(store.Get('main/team'), 2);
        const before = tracker.changes.length;
        store.Set('main/team', 3);
        assert.ok(tracker.changes.length > before, '异常后必须恢复事件泵');
        assert.equal(store.Get('main/team'), 3);
    });

    test('监听器抛异常不影响其他监听器', () => {
        const store = createSampleTree();
        const seen = [];
        store.OnChanged(() => {
            throw new Error('listener boom');
        });
        store.OnChanged((change) => seen.push(change));

        const entries = captureLogs(() => {
            store.Set('main/team', 1);
        });

        assert.equal(seen.length, 1);
        assert.ok(countLevel(entries, LogLevel.Error) >= 1, '监听器异常应记日志');
    });

    test('退订后不再收到事件，重复退订安全', () => {
        const store = createSampleTree();
        const seen = [];
        const off = store.OnChanged((change) => seen.push(change));
        off();
        off();
        store.Set('main/team', 1);
        assert.equal(seen.length, 0);
    });

    test('广播载荷是独立快照，不会被下一轮改写', () => {
        const store = createSampleTree();
        const captured = [];
        store.OnChanged((change) => captured.push(change.ids));

        store.Set('main/team', 1);
        const first = captured[0];
        const firstSize = first.size;
        assert.ok(first.has('main/team'));

        store.Set('main/stage/1001', 5);
        assert.equal(first.size, firstSize, '上一轮的 ids 不应被下一轮复用改写');
        assert.ok(first.has('main/team'));
    });

    test('监听器内写红点进入下一轮，不递归', () => {
        const store = createSampleTree();
        const rounds = [];
        store.OnChanged((change) => {
            rounds.push(new Set(change.ids));
            if (change.ids.has('main/team')) {
                store.Set('main/stage/1001', 2);
            }
        });

        store.Set('main/team', 1);

        assert.equal(rounds.length, 2, '初始事件 + 监听器写入产生的一轮');
        assert.equal(store.Get('main/stage/1001'), 2);
    });

    test('resetCounts：全树归零、保留注册树、只广播一次', () => {
        const store = createSampleTree();
        setSampleCounts(store);
        assert.equal(store.Get('main'), 122);

        const tracker = track(store);
        store.ResetCounts();

        assert.equal(tracker.changes.length, 1);
        for (const node of store.Snapshot()) {
            assert.equal(node.total, 0, `${node.id} 的 total 应清零`);
            assert.equal(node.own, 0, `${node.id} 的 own 应清零`);
        }
        assert.equal(store.Get('main'), 0);
        assert.equal(store.IsRegistered('main'), true);
        assert.equal(store.IsRegistered('main/stage/1001'), true);
    });
});

// ---------------------------------------------------------------------------
// §5.1 snapshot / dispose
// ---------------------------------------------------------------------------

describe('§5.1 快照与销毁', () => {
    test('snapshot 结构、父引用与聚合不变式', () => {
        const store = createSampleTree();
        setSampleCounts(store);

        const nodes = sortedNodes(store);
        assert.deepEqual(
            nodes.map((node) => node.id),
            ['main', 'main/stage', 'main/stage/1001', 'main/stage/1002', 'main/team'],
        );

        const byId = nodeMap(store);
        assert.equal(byId.get('main').parent, null);
        assert.equal(byId.get('main/stage').parent, 'main');
        assert.equal(byId.get('main/stage/1001').parent, 'main/stage');
        assert.equal(byId.get('main/stage/1001').own, 100);
        assert.equal(byId.get('main/stage').own, 0);
        assert.equal(byId.get('main/stage').total, 120);
        assert.equal(byId.get('main').total, 122);

        for (const node of nodes) {
            const childSum = nodes
                .filter((candidate) => candidate.parent === node.id)
                .reduce((sum, candidate) => sum + candidate.total, 0);
            assert.equal(node.total, node.own + childSum, `${node.id} 的聚合不变式被破坏`);
        }
    });

    test('dispose 清空树与计数，重复调用安全', () => {
        const store = createSampleTree();
        setSampleCounts(store);

        store.Dispose();
        assert.equal(store.IsRegistered('main'), false);
        assert.equal(store.Get('main'), 0);
        assert.equal(store.Snapshot().length, 0);
        store.Dispose();
    });
});
