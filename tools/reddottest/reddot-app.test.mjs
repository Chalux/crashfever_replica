/**
 * 红点任务 4（主界面接入 + 动态列表）的应用层验收。
 *
 * 运行方式：npm run test:reddot
 * 前置：`tsc -p tools/reddottest/tsconfig.json` 会把 `AppRedDotTree.ts` 一起编译到
 *      `.reddottest-out/`（该文件必须保持不依赖 `cc`）。
 *
 * 说明：
 * - 主界面按钮清红点、AppEntry 启动接线的验收是静态源码检查（Node 里跑不了 Cocos 场景）；
 * - `seedDemoRedDots()` 尚未实现时相关用例自动 skip，实现后自动转正；
 * - 动态列表的注册/注销/全量重建用门面 API 模拟，不依赖界面。
 */
import { afterEach, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const ROOT = new URL('../../', import.meta.url);
const OUT = '../../.reddottest-out';

const { RedDot } = require(`${OUT}/assets/Scripts/Frame/RedDot/RedDot.js`);
const appTree = require(`${OUT}/assets/Scripts/Model/App/RedDot/AppRedDotTree.js`);
const { appRedDotId } = appTree;

const hasSeed = typeof appTree.seedDemoRedDots === 'function';
const seedOptions = hasSeed ? {} : { skip: 'seedDemoRedDots 尚未实现（任务 4）' };

const readSource = (path) => readFileSync(new URL(path, ROOT), 'utf8');
const mainWinSource = readSource('assets/Scripts/Model/App/UI/MainWin.ts');
const appEntrySource = readSource('assets/Scripts/Model/App/AppEntry.ts');

const hasTeamClear = /RedDot\.ClearTree\(\s*appRedDotId\.team\s*\)/.test(mainWinSource);
const hasStageClear = /RedDot\.ClearTree\(\s*appRedDotId\.stage\s*\)/.test(mainWinSource);
const hasAppEntry = /seedDemoRedDots\(\)/.test(appEntrySource);
const hasDevGuard = /if\s*\(\s*DEV\s*\)\s*\{?\s*seedDemoRedDots\(\)/.test(appEntrySource);
const hasSeedInMainWin = /seedDemoRedDots/.test(mainWinSource);

function sortedSnapshotIds() {
    return [...RedDot.Snapshot()].map((node) => node.id).sort();
}

beforeEach(() => {
    RedDot.Dispose();
});

afterEach(() => {
    RedDot.Dispose();
});

// ---------------------------------------------------------------------------
// 注册树与演示数据
// ---------------------------------------------------------------------------

test('验收：registerAppRedDots 注册 main/team/stage/setting', () => {
    appTree.registerAppRedDots();

    const nodes = new Map([...RedDot.Snapshot()].map((node) => [node.id, node]));
    assert.deepEqual([...nodes.keys()].sort(), ['main', 'main/setting', 'main/stage', 'main/team']);
    assert.equal(nodes.get(appRedDotId.main).parent, null);
    for (const key of ['team', 'stage', 'setting']) {
        assert.equal(nodes.get(appRedDotId[key]).parent, appRedDotId.main, `${key} 必须挂在 main 下`);
    }
});

test('验收：重复调用 registerAppRedDots 幂等', () => {
    appTree.registerAppRedDots();
    appTree.registerAppRedDots();
    assert.equal(RedDot.Snapshot().length, 4, '重复注册不能产生重复节点');
});

test('验收：seedDemoRedDots 写入演示数据（编队 2 / 关卡 120 / 设置 0 / 父 122）', seedOptions, () => {
    appTree.registerAppRedDots();
    appTree.seedDemoRedDots();

    assert.equal(RedDot.Get(appRedDotId.team), 2);
    assert.equal(RedDot.Get(appRedDotId.stageOf('1001')), 100);
    assert.equal(RedDot.Get(appRedDotId.stageOf('1002')), 20);
    assert.equal(RedDot.Get(appRedDotId.stage), 120);
    assert.equal(RedDot.Get(appRedDotId.setting), 0);
    assert.equal(RedDot.Get(appRedDotId.main), 122);
});

// ---------------------------------------------------------------------------
// 进入入口清红点（模拟 MainWin 的处理逻辑）
// ---------------------------------------------------------------------------

test('验收：进入编队后该入口清零、父节点同步（main 122 → 120）', seedOptions, () => {
    appTree.registerAppRedDots();
    appTree.seedDemoRedDots();

    RedDot.ClearTree(appRedDotId.team);
    assert.equal(RedDot.Get(appRedDotId.team), 0);
    assert.equal(RedDot.Get(appRedDotId.main), 120);
});

test('验收：进入关卡后该入口清零、父节点同步（main → 2）', seedOptions, () => {
    appTree.registerAppRedDots();
    appTree.seedDemoRedDots();

    RedDot.ClearTree(appRedDotId.stage);
    assert.equal(RedDot.Get(appRedDotId.stage), 0);
    assert.equal(RedDot.Get(appRedDotId.team), 2, '清关卡不能影响编队');
    assert.equal(RedDot.Get(appRedDotId.main), 2);
});

// ---------------------------------------------------------------------------
// 动态列表（不依赖界面，用门面 API 模拟列表生命周期）
// ---------------------------------------------------------------------------

test('验收：动态列表注册 / 注销 / 全量重建后父计数同步且无残留', () => {
    appTree.registerAppRedDots();
    RedDot.Batch(() => {
        RedDot.Register('main/stage/1001', appRedDotId.stage, 100);
        RedDot.Register('main/stage/1002', appRedDotId.stage, 20);
    });
    assert.equal(RedDot.Get(appRedDotId.stage), 120);
    assert.equal(RedDot.Get(appRedDotId.main), 120);

    // 列表项移除
    RedDot.Unregister('main/stage/1001');
    assert.equal(RedDot.Get(appRedDotId.stage), 20);
    assert.equal(RedDot.Get(appRedDotId.main), 20);

    // 新增列表项
    RedDot.Register('main/stage/1003', appRedDotId.stage, 5);
    assert.equal(RedDot.Get(appRedDotId.stage), 25);

    // 全量重建：清旧项再注册新项，注册表不能残留旧 ID
    RedDot.Batch(() => {
        RedDot.Unregister('main/stage/1002');
        RedDot.Unregister('main/stage/1003');
        RedDot.Register('main/stage/2001', appRedDotId.stage, 100);
        RedDot.Register('main/stage/2002', appRedDotId.stage, 20);
    });
    assert.deepEqual(sortedSnapshotIds(), [
        'main',
        'main/setting',
        'main/stage',
        'main/stage/2001',
        'main/stage/2002',
        'main/team',
    ]);
    assert.equal(RedDot.Get(appRedDotId.stage), 120);
    assert.equal(RedDot.Get(appRedDotId.main), 120);
});

// ---------------------------------------------------------------------------
// MainWin / AppEntry 接线（静态检查；Node 里无法启动 Cocos 场景）
// ---------------------------------------------------------------------------

test('验收：AppEntry 在 register 之后、打开标题之前调用 seedDemoRedDots（仅 DEV）', { skip: hasAppEntry && hasDevGuard ? false : 'AppEntry 尚未接入 seedDemoRedDots' }, () => {
    assert.ok(hasAppEntry, 'AppEntry.start 必须调用 seedDemoRedDots()');
    assert.ok(hasDevGuard, '演示数据必须用 if (DEV) 包裹');

    const registerIndex = appEntrySource.indexOf('registerAppRedDots()');
    const seedIndex = appEntrySource.indexOf('seedDemoRedDots()');
    const titleOpenIndex = appEntrySource.search(/\(\s*'TitleWin'/);
    assert.ok(registerIndex >= 0, 'AppEntry 必须调用 registerAppRedDots()');
    assert.ok(titleOpenIndex >= 0, 'AppEntry 必须打开 TitleWin');
    assert.ok(registerIndex < seedIndex, 'seedDemoRedDots 必须在 registerAppRedDots 之后');
    assert.ok(seedIndex < titleOpenIndex, 'seedDemoRedDots 必须在打开标题之前');
});

test('验收：MainWin 点击编队时调用 ClearTree(team)', { skip: hasTeamClear ? false : 'MainWin 尚未接入编队清红点' }, () => {
    assert.match(mainWinSource, /RedDot\.ClearTree\(\s*appRedDotId\.team\s*\)/);
});

test('验收：MainWin 点击关卡时调用 ClearTree(stage)（可选，推荐）', { skip: hasStageClear ? false : 'MainWin 尚未接入关卡清红点' }, () => {
    assert.match(mainWinSource, /RedDot\.ClearTree\(\s*appRedDotId\.stage\s*\)/);
});

test('验收：MainWin 不能包含 seedDemoRedDots（避免缓存重开重播）', () => {
    assert.equal(hasSeedInMainWin, false, '演示数据不能放进 MainWin.onOpen');
});

test('验收：MainWin 不能对父入口 main 无脑 ClearTree', () => {
    assert.doesNotMatch(mainWinSource, /ClearTree\(\s*appRedDotId\.main\s*\)/);
});
