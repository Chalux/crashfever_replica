/**
 * RedDotBadge 行为验收（对应任务 3 §3 组件契约 / §6 手工验收中可自动化的部分）。
 *
 * 运行方式：npm run test:reddot
 * 前置：`tsc -p tools/reddottest/tsconfig.badge.json` 把 RedDotBadge 及其依赖编译到
 *      `.reddottest-badge-out/`（`cc` 由 tools/uitest/cc-stub.ts 提供）。
 * 本文件在 Node 里实例化组件，模拟 onLoad/onEnable/事件/销毁，不依赖 Cocos 编辑器。
 */
import { afterEach, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import Module, { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const OUT = '../../.reddottest-badge-out';
const ccStubPath = fileURLToPath(new URL(`${OUT}/tools/uitest/cc-stub.js`, import.meta.url));

// RedDotBadge 的编译产物 require('cc')，这里把 cc 指到 cc-stub。
const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request, ...args) {
    if (request === 'cc') return ccStubPath;
    return originalResolveFilename.call(this, request, ...args);
};

const { Label, Node } = require(ccStubPath);
const { RedDotBadge } = require(`${OUT}/assets/Scripts/Frame/RedDot/RedDotBadge.js`);
const { RedDot } = require(`${OUT}/assets/Scripts/Frame/RedDot/RedDot.js`);

const liveBadges = [];

function registerAppTree() {
    RedDot.Batch(() => {
        RedDot.Register('main');
        RedDot.Register('main/team', 'main');
        RedDot.Register('main/stage', 'main');
        RedDot.Register('main/setting', 'main');
    });
}

/**
 * 按 prefab 的结构造一个 badge：
 * RedDot(组件节点) → Visual → Count(Label)。
 * `visual: null` 用于验证“回退组件节点自身”的分支。
 */
function createBadge(options = {}) {
    const root = new Node('RedDot');
    const visual = new Node('Visual');
    root.addChild(visual);
    const labelNode = new Node('Count');
    visual.addChild(labelNode);
    const label = new Label();
    label.node = labelNode;

    const badge = new RedDotBadge();
    badge.node = root;
    badge._redDotId = options.redDotId ?? 'main/team';
    badge._visual = options.visual === undefined ? visual : options.visual;
    badge._countLabel = options.countLabel === undefined ? label : options.countLabel;
    badge._dotOnly = options.dotOnly ?? false;
    badge._maxCount = options.maxCount ?? 99;

    const handle = { badge, root, visual, label, labelNode };
    liveBadges.push(handle);
    return handle;
}

function startBadge(handle) {
    handle.badge.onLoad();
    handle.badge.onEnable();
}

beforeEach(() => {
    RedDot.Dispose();
});

afterEach(() => {
    for (const handle of liveBadges.splice(0)) {
        try {
            handle.badge.onDestroy();
        } catch {
            // 清理失败不应掩盖用例结果。
        }
    }
    RedDot.Dispose();
});

// ---------------------------------------------------------------------------
// 基本刷新
// ---------------------------------------------------------------------------

test('验收：onLoad 只订阅一次，onEnable 按当前计数刷新', () => {
    RedDot.Register('main/team');
    const handle = createBadge();

    startBadge(handle);
    assert.equal(handle.badge._binder.count, 1, '订阅数应为 1');
    assert.equal(handle.visual.active, false, '计数 0 时 Visual 隐藏');

    RedDot.Set('main/team', 3);
    assert.equal(handle.visual.active, true);
    assert.equal(handle.label.string, '3');
});

test('验收：0 隐藏、2 显示 2、>99 显示 99+、99 显示 99', () => {
    registerAppTree();
    const handle = createBadge();
    startBadge(handle);

    RedDot.Set('main/team', 2);
    assert.equal(handle.visual.active, true);
    assert.equal(handle.label.string, '2');

    RedDot.Set('main/team', 99);
    assert.equal(handle.label.string, '99');

    RedDot.Set('main/team', 120);
    assert.equal(handle.label.string, '99+');

    RedDot.Clear('main/team');
    assert.equal(handle.visual.active, false);
});

test('验收：_maxCount 参数化（9 → 10 显示 9+）', () => {
    registerAppTree();
    const handle = createBadge({ maxCount: 9 });
    startBadge(handle);

    RedDot.Set('main/team', 9);
    assert.equal(handle.label.string, '9');

    RedDot.Set('main/team', 10);
    assert.equal(handle.label.string, '9+');
});

test('验收：_dotOnly 只显示圆点，隐藏数字', () => {
    registerAppTree();
    const handle = createBadge({ dotOnly: true });
    startBadge(handle);

    RedDot.Set('main/team', 5);
    assert.equal(handle.visual.active, true);
    assert.equal(handle.labelNode.active, false, '圆点模式必须隐藏 Count');
    assert.equal(handle.label.string, '', '圆点模式不写数字');
});

// ---------------------------------------------------------------------------
// 回退组件节点 / 生命周期
// ---------------------------------------------------------------------------

test('验收：_visual 留空时回退组件节点自身，并能随事件恢复', () => {
    registerAppTree();
    const handle = createBadge({ visual: null, countLabel: null });
    startBadge(handle);
    assert.equal(handle.root.active, false, '计数 0 时隐藏组件节点自身');

    RedDot.Set('main/team', 2);
    assert.equal(handle.root.active, true, '事件到达后必须能重新显示');

    RedDot.Clear('main/team');
    assert.equal(handle.root.active, false);
});

test('验收：缓存重开 onEnable 只补刷新、不重复订阅', () => {
    registerAppTree();
    const handle = createBadge();
    startBadge(handle);

    RedDot.Set('main/team', 4);
    handle.visual.active = false; // 模拟窗口隐藏后的状态
    handle.badge.onEnable();
    assert.equal(handle.visual.active, true);
    assert.equal(handle.badge._binder.count, 1, 'onEnable 不能重复订阅');
});

test('验收：onDestroy 退订，之后的事件不再刷新', () => {
    registerAppTree();
    const handle = createBadge();
    startBadge(handle);
    assert.equal(handle.badge._binder.count, 1);

    const visualBefore = handle.visual.active;
    const labelBefore = handle.label.string;
    handle.badge.onDestroy();
    assert.equal(handle.badge._binder.count, 0);

    RedDot.Set('main/team', 7);
    assert.equal(handle.visual.active, visualBefore);
    assert.equal(handle.label.string, labelBefore);
});

// ---------------------------------------------------------------------------
// 尚未实现的组件契约（skip：输出里带原因，补齐后去掉 skip 转为正式断言）
// ---------------------------------------------------------------------------

test('验收：BinderCount 暴露订阅数', () => {
    registerAppTree();
    const handle = createBadge();
    startBadge(handle);
    assert.equal(handle.badge.BinderCount, 1);
});

test('验收：onLoad 前 setter 只记录 ID，不隐藏组件节点', () => {
    registerAppTree();
    const handle = createBadge({ visual: null, countLabel: null });

    handle.badge.RedDotId = 'main/team';
    assert.equal(handle.root.active, true, 'onLoad 前不能隐藏节点，否则永久失聪');

    handle.badge.onLoad();
    handle.badge.onEnable();
    assert.equal(handle.root.active, false, 'onLoad 后按当前计数刷新（0 时隐藏）');
});
