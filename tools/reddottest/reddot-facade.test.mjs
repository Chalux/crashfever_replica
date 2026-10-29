/**
 * 红点门面（RedDot）生命周期验收（对应设计稿 v3 §5.2 / §11 任务 2）。
 *
 * 运行方式：npm run test:reddot
 * 前置：先由 tsc 把 Frame/RedDot 的门面与核心文件编译到 .reddottest-out/，本文件 require 编译产物。
 * 本文件不依赖 Cocos；可用环境变量 REDDOT_OUT_ROOT 覆盖编译产物目录（默认 .reddottest-out）。
 *
 * 覆盖：
 * - 懒初始化、Initialize 幂等（不重建 Store、不丢监听、不重复转发）；
 * - OnChanged 退订幂等、异常隔离、退订后不再回调；
 * - Dispose 幂等、Dispose → Initialize 后旧订阅仍能收到事件、Dispose 后到达的退订是 no-op；
 * - 门面聚合与 Snapshot 不变式；
 * - AppEntry 启动/销毁接线顺序（静态检查，Node 里无法启动 Cocos 场景）。
 */
import { afterEach, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const OUT_ROOT = process.env.REDDOT_OUT_ROOT ?? '../../.reddottest-out';
const { RedDot } = require(`${OUT_ROOT}/assets/Scripts/Frame/RedDot/RedDot.js`);
const { redDotEvent } = require(`${OUT_ROOT}/assets/Scripts/Frame/RedDot/RedDotEvent.js`);
const { Log, LogChannel, LogLevel } = require(`${OUT_ROOT}/assets/Scripts/Frame/Log/index.js`);

// ---------------------------------------------------------------------------
// 测试夹具：每个用例前后都恢复「无订阅、无 Store」的干净状态
// ---------------------------------------------------------------------------

/** 已登记、尚未退订的门面订阅。 */
const activeSubscriptions = new Set();

/** 订阅门面事件并登记退订；返回幂等的退订函数。 */
function subscribe(listener) {
    const rawUnsubscribe = RedDot.OnChanged(listener);
    let active = true;
    const unsubscribe = () => {
        if (!active) return;
        active = false;
        activeSubscriptions.delete(unsubscribe);
        rawUnsubscribe();
    };
    activeSubscriptions.add(unsubscribe);
    return unsubscribe;
}

function resetFacade() {
    for (const unsubscribe of [...activeSubscriptions]) {
        try {
            unsubscribe();
        } catch {
            // 清理失败不应掩盖用例本身的断言结果。
        }
    }
    activeSubscriptions.clear();
    try {
        RedDot.Dispose();
    } catch {
        // 同上。
    }
}

beforeEach(resetFacade);
afterEach(resetFacade);

const sortedIds = (ids) => [...ids].sort();

/** 捕获 Log 广播（Console 是默认通道），只断言级别，不耦合文案。 */
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

// ---------------------------------------------------------------------------
// 验收：门面不依赖 Cocos
// ---------------------------------------------------------------------------

test('验收：门面源文件不依赖 cc', () => {
    for (const name of ['RedDot', 'RedDotEvent', 'index']) {
        const source = readFileSync(new URL(`../../assets/Scripts/Frame/RedDot/${name}.ts`, import.meta.url), 'utf8');
        assert.doesNotMatch(source, /(?:from\s*|import\s*\(|require\s*\()\s*['"]cc['"]/);
    }
});

test('事件键稳定：reddot.changed 与 dispatcher 单例约定一致', () => {
    assert.equal(redDotEvent.changed.name, 'reddot.changed');
    assert.equal(String(redDotEvent.changed), 'reddot.changed');
});

// ---------------------------------------------------------------------------
// §5.2 懒初始化与 Initialize 幂等
// ---------------------------------------------------------------------------

test('懒初始化：未调用 Initialize 时 Register/Set/Get 即可用', () => {
    assert.equal(RedDot.IsRegistered('lazy'), false);
    assert.equal(RedDot.Get('lazy'), 0);

    assert.equal(RedDot.Register('lazy', null, 3), true);
    assert.equal(RedDot.GetOwn('lazy'), 3);
    assert.equal(RedDot.Get('lazy'), 3);

    RedDot.Set('lazy', 5);
    assert.equal(RedDot.Get('lazy'), 5);
    assert.equal(RedDot.Has('lazy'), true);
});

test('Initialize 幂等：重复调用不重建 Store、不丢监听、不多发事件', () => {
    RedDot.Initialize();
    RedDot.Register('root');
    RedDot.Register('main', 'root', 2);

    const changes = [];
    subscribe((change) => changes.push(change));
    assert.equal(RedDot.Get('main'), 2);

    const logs = captureLogs(() => {
        RedDot.Initialize();
        RedDot.Initialize();
    });
    assert.ok(countLevel(logs, LogLevel.Warn) >= 1, '重复 Initialize 至少记一次 warn');
    assert.equal(RedDot.Get('main'), 2, '重复 Initialize 不能重建 Store');

    changes.length = 0;
    RedDot.Set('main', 4);
    assert.equal(changes.length, 1, '同一轮写入只能广播一次');
    assert.deepEqual(sortedIds(changes[0].ids), ['main', 'root']);
});

test('懒初始化与显式 Initialize 使用同一 dispatcher，不重复转发', () => {
    const changes = [];
    subscribe((change) => changes.push(change)); // 订阅时触发懒初始化
    RedDot.Initialize(); // 幂等：不应重建 Store / 重复挂转发器
    assert.equal(changes.length, 0);

    RedDot.Register('a');
    RedDot.Set('a', 1);
    assert.equal(changes.length, 2, '注册与写入各广播一次，不能因 Initialize 重复转发');
});

// ---------------------------------------------------------------------------
// §5.2 OnChanged：退订、异常隔离、载荷
// ---------------------------------------------------------------------------

test('OnChanged 退订后不再收到回调', () => {
    const changes = [];
    const unsubscribe = subscribe((change) => changes.push(change));

    RedDot.Register('a');
    changes.length = 0;
    unsubscribe();

    RedDot.Set('a', 1);
    assert.equal(changes.length, 0);
});

test('退订函数幂等，且不影响其他监听', () => {
    const first = [];
    const second = [];
    const unsubscribeFirst = subscribe((change) => first.push(change));
    subscribe((change) => second.push(change));

    unsubscribeFirst();
    unsubscribeFirst();
    unsubscribeFirst();

    RedDot.Register('a');
    RedDot.Set('a', 1);
    assert.equal(first.length, 0);
    assert.equal(second.length, 2);
});

test('单个监听抛异常不影响其他监听，也不打断后续事件', { timeout: 2000 }, () => {
    const changes = [];
    subscribe(() => {
        throw new Error('listener boom');
    });
    subscribe((change) => changes.push(change));

    const logs = captureLogs(() => {
        RedDot.Register('a');
        RedDot.Set('a', 1);
    });

    assert.equal(changes.length, 2);
    assert.equal(countLevel(logs, LogLevel.Error), 2, '每次广播的异常各记一条 error，且不中断');
});

test('OnChanged 载荷是脏 ID 快照，视图可用 Get 读到最终值', () => {
    RedDot.Register('main');
    RedDot.Register('main/team', 'main');
    RedDot.Register('main/stage', 'main');

    const changes = [];
    subscribe((change) => changes.push(change));

    RedDot.Set('main/team', 2);
    assert.equal(changes.length, 1);
    assert.deepEqual(sortedIds(changes[0].ids), ['main', 'main/team']);
    assert.equal(RedDot.Get('main'), 2);

    RedDot.ClearTree('main');
    assert.equal(changes.length, 2);
    assert.deepEqual(sortedIds(changes[1].ids), ['main', 'main/team']);
    assert.equal(RedDot.Get('main'), 0);
});

// ---------------------------------------------------------------------------
// §5.2 Dispose / 重新 Initialize
// ---------------------------------------------------------------------------

test('Dispose 幂等、不抛异常，并允许再次 Initialize 或订阅', () => {
    RedDot.Register('a', null, 1);
    assert.equal(RedDot.Get('a'), 1);

    RedDot.Dispose();
    RedDot.Dispose();
    assert.equal(RedDot.IsRegistered('a'), false, 'Dispose 后懒初始化出空 Store');
    assert.equal(RedDot.Get('a'), 0);

    RedDot.Initialize();
    assert.equal(RedDot.Register('a'), true);
    assert.equal(RedDot.Get('a'), 0);

    const changes = [];
    subscribe((change) => changes.push(change));
    RedDot.Register('b');
    assert.equal(changes.length, 1, 'Dispose 之后重新订阅仍能收到事件');
});

test('验收：Dispose → Initialize 后，Dispose 之前订阅的监听仍能收到事件', () => {
    const changes = [];
    subscribe((change) => changes.push(change));

    RedDot.Register('a');
    RedDot.Set('a', 3);
    changes.length = 0;

    RedDot.Dispose();
    RedDot.Initialize();

    // Store 已重建，注册树需要重新注册；监听不重建，不应失聪。
    RedDot.Register('a');
    RedDot.Set('a', 2);

    assert.equal(changes.length, 2, '重建后注册与写入各广播一次，且没有重复转发');
    assert.deepEqual(sortedIds(changes[0].ids), ['a']);
    assert.deepEqual(sortedIds(changes[1].ids), ['a']);
    assert.equal(RedDot.Get('a'), 2);
});

test('Dispose 之后到达的退订是 no-op，且不影响其他监听', () => {
    const first = [];
    const second = [];
    const unsubscribeFirst = subscribe((change) => first.push(change));
    subscribe((change) => second.push(change));

    RedDot.Dispose();
    unsubscribeFirst();
    unsubscribeFirst();

    RedDot.Initialize();
    RedDot.Register('a');
    RedDot.Set('a', 1);

    assert.equal(first.length, 0);
    assert.equal(second.length, 2);
});

// ---------------------------------------------------------------------------
// §5.1 门面聚合与 Snapshot 不变式
// ---------------------------------------------------------------------------

test('验收：Snapshot 聚合不变式（total === own + Σ children.total）', () => {
    RedDot.Batch(() => {
        RedDot.Register('main');
        RedDot.Register('main/team', 'main', 2);
        RedDot.Register('main/stage', 'main');
        RedDot.Register('main/stage/1001', 'main/stage', 9);
        RedDot.Register('main/stage/1002', 'main/stage', 20);
    });

    assert.equal(RedDot.GetOwn('main'), 0);
    assert.equal(RedDot.Get('main'), 31);
    assert.equal(RedDot.Get('main/team'), 2);
    assert.equal(RedDot.Get('main/stage'), 29);
    assert.equal(RedDot.Has('main'), true);
    assert.equal(RedDot.Get('main/not-registered'), 0);

    const snapshot = [...RedDot.Snapshot()];
    for (const node of snapshot) {
        const childTotal = snapshot
            .filter((child) => child.parent === node.id)
            .reduce((sum, child) => sum + child.total, 0);
        assert.equal(node.total, node.own + childTotal, `${node.id} 聚合不变式`);
    }

    const main = snapshot.find((node) => node.id === 'main');
    assert.equal(main.parent, null);
    const team = snapshot.find((node) => node.id === 'main/team');
    assert.equal(team.parent, 'main');
});

// ---------------------------------------------------------------------------
// §11 任务 2：AppEntry 接线顺序（静态检查，Node 里无法启动 Cocos 场景）
// ---------------------------------------------------------------------------

test('验收：AppEntry 启动/销毁接线顺序', () => {
    const source = readFileSync(new URL('../../assets/Scripts/Model/App/AppEntry.ts', import.meta.url), 'utf8');

    const settingsInit = source.indexOf('SettingsService.Initialize()');
    const redDotInit = source.indexOf('RedDot.Initialize()');
    const registerTree = source.indexOf('registerAppRedDots()');
    const uiInit = source.indexOf('manager.init(');
    const loadingOpen = source.search(/\(\s*'BootLoadingWin'/);
    const titleOpen = source.search(/\(\s*'TitleWin'/);
    const obtainManager = source.indexOf('this._getOrCreateUiManager()');

    assert.ok(settingsInit >= 0, 'AppEntry 必须调用 SettingsService.Initialize()');
    assert.ok(redDotInit > settingsInit, 'RedDot.Initialize() 必须在 SettingsService.Initialize() 之后');
    assert.ok(registerTree > redDotInit, 'registerAppRedDots() 必须在 RedDot.Initialize() 之后');
    assert.ok(uiInit >= 0 && obtainManager >= 0 && loadingOpen > obtainManager, '先取得已装配的 UIManager，再打开加载页');
    assert.ok(settingsInit > loadingOpen, '加载页就绪后执行设置初始化');
    assert.ok(titleOpen > registerTree, '红点注册必须发生在打开标题之前');

    const uiDispose = source.indexOf('this._uiManager?.dispose()');
    const redDotDispose = source.indexOf('RedDot.Dispose()');
    assert.ok(uiDispose >= 0 && redDotDispose > uiDispose, 'onDestroy 必须先 UIManager.dispose() 再 RedDot.Dispose()');
});
