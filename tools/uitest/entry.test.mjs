import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const root = new URL('../../', import.meta.url);
const flush = () => new Promise(resolve => setImmediate(resolve));
const withTimeout = (promise, ms = 500) => Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms)),
]);

const translations = {
    'recovery.foundTitle': '发现未结束的战斗',
    'recovery.foundMessage': '上次战斗尚未结束，是否继续战斗？',
    'recovery.continue': '继续战斗',
    'recovery.discard': '放弃战斗',
    'recovery.unavailable': '战斗功能尚未实现，暂时无法继续。',
    'recovery.incompatibleTitle': '恢复数据不兼容',
    'recovery.incompatibleMessage': '恢复数据与当前配置不兼容，将前往关卡选择。',
    'main.stageUnavailable': '暂无关卡，关卡与战斗功能将在后续阶段加入。',
    'button.stagepick': '关卡选择',
    'common.confirmTitle': '请确认',
    'common.understood': '知道了',
};

function transpile(relativePath) {
    return ts.transpileModule(
        fs.readFileSync(new URL(relativePath, root), 'utf8'),
        {
            compilerOptions: {
                module: ts.ModuleKind.CommonJS,
                target: ts.ScriptTarget.ES2020,
                experimentalDecorators: true,
            },
        },
    ).outputText;
}

function loadModule(relativePath, modules) {
    const exported = {};
    vm.runInNewContext(transpile(relativePath), {
        exports: exported,
        require(name) {
            assert.ok(name in modules, `${relativePath}: missing stub ${name}`);
            return modules[name];
        },
    });
    return exported;
}

function appModules(logs) {
    class Component { }
    class Manager { }
    class BootLoadingWin { }
    class SoundManager { }
    class RecoveryService {
        static getInstance() {
            return {
                check: async () => ({ state: 0 }),
                discard: async () => {},
            };
        }
    }

    return {
        cc: {
            _decorator: { ccclass: () => value => value, property: () => () => {} },
            Component,
            Node: class { },
            Label: class { },
            Button: class { static EventType = { CLICK: 'click' }; },
            isValid: value => !value.destroyed,
        },
        '../../Frame/UI': {
            UIManager: Manager,
            UIOpenOpt: class { },
            UIRuntimeRegistry: class { registerRange() {} },
            UIRegistration: { window() {}, dialog() {} },
            EUILayer: {},
        },
        './UI/BootLoadingWin': { BootLoadingWin },
        './UI/TitleWin': { TitleWin: class { } },
        './UI/ConfirmDlg': { ConfirmDlg: class { } },
        '../../Frame/Audio/SoundManager': { SoundManager },
        '../../Frame/Audio/Sound': { Sound: { Configure() {}, PlayBgm() {} } },
        './Save/SettingsService': { SettingsService: { Initialize() {} } },
        '../ModelFactory': { registerModels() { return {}; } },
        '../Character/CharacterController': { CharacterController: class {} },
        '../Character/CharacterConfigLoader': { CharacterConfigLoader: class {} },
        '../../Frame/RedDot/index': { RedDot: { Initialize() {}, Dispose() {} } },
        './RedDot/AppRedDotTree': { registerAppRedDots() {}, seedDemoRedDots() {} },
        'cc/env': { DEV: false },
        'db://localization-editor/l10n': {
            l10n: { t: key => translations[key] ?? key },
        },
        '../../Frame/Log': {
            Log: {
                error(message) { logs.push(String(message)); },
                warn() {},
                info() {},
            },
            LogOptions: {},
        },
        './Recovery/RecoveryService': {
            RecoveryService,
            RecoveryState: { none: 0, available: 1, incompatible: 2 },
        },
    };
}

function createHarness(options = {}) {
    const logs = [];
    const exported = loadModule('assets/Scripts/Model/App/AppEntry.ts', appModules(logs));
    const calls = { checks: 0, discards: 0 };

    const manager = {
        isInited: true,
        dialogs: [],
        mainOpens: 0,
        closed: [],
        open(name, payload) {
            if (name === 'ConfirmDlg') {
                manager.dialogs.push({ payload });
                return Promise.resolve({ ui: {} });
            }
            if (name === 'MainWin') {
                manager.mainOpens++;
                if (options.mainOpen) return options.mainOpen();
                return Promise.resolve(options.mainResult === undefined ? { ui: {} } : options.mainResult);
            }
            return Promise.resolve({ ui: {} });
        },
        close(name) {
            manager.closed.push(name);
        },
        dispose() {
            manager.isInited = false;
        },
    };

    const recovery = {
        async check() {
            calls.checks++;
            if (options.checkError) throw new Error('check failed');
            return { state: options.state ?? 0 };
        },
        async discard() {
            calls.discards++;
            if (options.discard) await options.discard(calls.discards);
        },
    };

    const app = new exported.AppEntry();
    app._uiManager = manager;
    app._uiRoot = {};
    app._bootState = 3; // ready
    app._attemptId = 1;
    app._entrySeq = 0;
    app._recovery = recovery;
    app._bootHint = { node: { active: true }, string: '' };
    app._bootRetryButton = {
        node: { active: false, on() {}, off() {} },
        interactable: false,
    };
    app.destroyed = false;

    return { app, manager, calls, logs };
}

async function startEntry(app) {
    const flow = app._enterFromTitle(1);
    await flush();
    // Return an object so the async function does not adopt the still-pending flow.
    return { flow };
}

async function choose(dialog, action) {
    await dialog.payload[action === 'confirm' ? 'onConfirm' : 'onCancel']();
    await flush();
}

test('none: one check, opens main, closes title only after success', async () => {
    const { app, manager, calls } = createHarness({ state: 0 });

    const result = await app._enterFromTitle(1);

    assert.equal(result, true);
    assert.equal(calls.checks, 1);
    assert.equal(manager.mainOpens, 1);
    assert.deepEqual(manager.closed, ['TitleWin']);
    assert.equal(manager.dialogs.length, 0);
});

test('none: main failure keeps title open and returns false', async () => {
    const { app, manager, logs } = createHarness({ state: 0, mainResult: null });

    const result = await app._enterFromTitle(1);

    assert.equal(result, false);
    assert.equal(manager.mainOpens, 1);
    assert.deepEqual(manager.closed, []);
    assert.ok(logs.includes('MainWin 打开失败'));
});

test('available: continue shows the unavailable notice and stays on title', async () => {
    const { app, manager, calls } = createHarness({ state: 1 });

    const { flow } = await startEntry(app);
    assert.equal(manager.dialogs.length, 1);
    const first = manager.dialogs[0];
    assert.equal(first.payload.title, translations['recovery.foundTitle']);
    assert.equal(first.payload.message, translations['recovery.foundMessage']);
    assert.equal(first.payload.confirmText, translations['recovery.continue']);
    assert.equal(first.payload.cancelText, translations['recovery.discard']);

    await choose(first, 'confirm');
    assert.equal(manager.dialogs.length, 2);
    const second = manager.dialogs[1];
    assert.equal(second.payload.message, translations['recovery.unavailable']);
    assert.equal(second.payload.showCancel, false);
    assert.equal(calls.discards, 0);
    assert.equal(manager.mainOpens, 0);

    await choose(second, 'confirm');
    assert.equal(await flow, false);
    assert.equal(calls.discards, 0);
    assert.equal(manager.mainOpens, 0);
    assert.deepEqual(manager.closed, []);
});

test('available: discard waits for clear success before entering main', async () => {
    let releaseDiscard;
    const { app, manager, calls } = createHarness({
        state: 1,
        discard: () => new Promise(resolve => { releaseDiscard = resolve; }),
    });

    const { flow } = await startEntry(app);
    const dialog = manager.dialogs[0];
    const choosing = dialog.payload.onCancel();
    await flush();

    assert.equal(calls.discards, 1);
    assert.equal(manager.mainOpens, 0, 'must not enter main before discard resolves');

    releaseDiscard();
    await choosing;
    await flush();

    assert.equal(await flow, true);
    assert.equal(manager.mainOpens, 1);
    assert.deepEqual(manager.closed, ['TitleWin']);
});

test('available: discard failure keeps dialog open and retry enters main', async () => {
    let fail = true;
    const { app, manager, calls } = createHarness({
        state: 1,
        discard: async () => {
            if (fail) {
                fail = false;
                throw new Error('clear failed');
            }
        },
    });

    const { flow } = await startEntry(app);
    const dialog = manager.dialogs[0];

    await assert.rejects(dialog.payload.onCancel(), /clear failed/);
    await flush();
    assert.equal(manager.mainOpens, 0);
    assert.deepEqual(manager.closed, []);
    assert.equal(calls.discards, 1);

    await choose(dialog, 'cancel');
    assert.equal(await flow, true);
    assert.equal(calls.discards, 2);
    assert.equal(manager.mainOpens, 1);
    assert.deepEqual(manager.closed, ['TitleWin']);
});

test('incompatible: confirm enters main and shows the stage placeholder', async () => {
    const { app, manager, calls } = createHarness({ state: 2 });

    const { flow } = await startEntry(app);
    const incompatible = manager.dialogs[0];
    assert.equal(incompatible.payload.message, translations['recovery.incompatibleMessage']);
    assert.equal(incompatible.payload.showCancel, false);

    await choose(incompatible, 'confirm');
    assert.equal(manager.mainOpens, 1);
    assert.deepEqual(manager.closed, ['TitleWin']);
    assert.equal(manager.dialogs.length, 2);

    const placeholder = manager.dialogs[1];
    assert.equal(placeholder.payload.message, translations['main.stageUnavailable']);
    assert.equal(placeholder.payload.showCancel, false);

    await choose(placeholder, 'confirm');
    assert.equal(await flow, true);
    assert.equal(calls.discards, 0);
});

test('destroy while a dialog is pending settles the flow without navigation', async () => {
    const { app, manager } = createHarness({ state: 1 });
    const { flow } = await startEntry(app);
    assert.equal(manager.dialogs.length, 1);

    app.destroyed = true;
    app.onDestroy();

    assert.equal(await withTimeout(flow), false);
    assert.equal(manager.mainOpens, 0);
    assert.deepEqual(manager.closed, []);
});

test('check failure logs, leaves title open, and opens nothing', async () => {
    const { app, manager, logs } = createHarness({ checkError: true });

    const result = await app._enterFromTitle(1);

    assert.equal(result, false);
    assert.equal(manager.mainOpens, 0);
    assert.equal(manager.dialogs.length, 0);
    assert.deepEqual(manager.closed, []);
    assert.ok(logs.includes('恢复检查失败'));
});

function titleModules() {
    class BaseWin {
        constructor() {
            this.payload = null;
            this.binder = {};
        }

        getTypedPayload() {
            return this.payload;
        }
    }

    return {
        cc: {
            _decorator: { ccclass: () => value => value, property: () => () => {} },
            Button: class { static EventType = { CLICK: 'click' }; },
            Component: class { },
            Node: class { },
        },
        '../../../Frame/UI': {
            BaseWin,
            BindingScopeSignals: { onClick() {} },
        },
        '../../../Frame/Log': { Log: { error() {} } },
    };
}

test('TitleWin: rapid clicks run onEnter once and unlock after a stay result', async () => {
    const exported = loadModule('assets/Scripts/Model/App/UI/TitleWin.ts', titleModules());
    const win = new exported.TitleWin();
    let calls = 0;
    let release;
    const gate = new Promise(resolve => { release = resolve; });

    win.payload = {
        onEnter: async () => {
            calls++;
            await gate;
            return false;
        },
    };

    const first = win._handleEnter();
    const second = win._handleEnter();
    await Promise.resolve();
    assert.equal(calls, 1, 'a second click must be ignored while the first is pending');

    release();
    await first;
    await second;

    await win._handleEnter();
    assert.equal(calls, 2, 'the lock must be released after a stay result');
});

test('TitleWin: an onEnter rejection unlocks for retry', async () => {
    const exported = loadModule('assets/Scripts/Model/App/UI/TitleWin.ts', titleModules());
    const win = new exported.TitleWin();
    let calls = 0;

    win.payload = {
        onEnter: async () => {
            calls++;
            throw new Error('enter failed');
        },
    };

    await win._handleEnter();
    await win._handleEnter();

    assert.equal(calls, 2);
});
