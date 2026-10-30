import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = fs.readFileSync(new URL('../../assets/Scripts/Model/App/AppEntry.ts', import.meta.url), 'utf8');
const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, experimentalDecorators: true },
}).outputText;
const flush = () => new Promise(resolve => setImmediate(resolve));

function harness({ titleFailures = 0, loadingFails = false, titleThrows = false, deferredTitle = null } = {}) {
    const calls = { managers: 0, settings: 0, models: 0, characters: 0, seed: 0, bgm: 0, title: 0, loading: 0, progress: [], failures: [], closed: [], order: [] };
    class Loading {
        ShowProgress(completed, total) { calls.progress.push([completed, total]); }
        ShowFailure(message) { calls.failures.push(message); }
    }
    class CharacterController {
        constructor() { this.loaded = false; }
        IsLoaded() { return this.loaded; }
        async Initialize() { calls.characters++; calls.order.push('characters'); this.loaded = true; }
        dispose() {}
    }
    class Manager {
        constructor() { calls.managers++; }
        init() { this.isInited = true; }
        dispose() { this.isInited = false; }
        async open(name, payload) {
            if (name === 'BootLoadingWin') {
                calls.loading++;
                calls.retry = payload.onRetry;
                return loadingFails ? null : { ui: new Loading() };
            }
            if (name === 'TitleWin') {
                calls.title++;
                if (deferredTitle) return deferredTitle;
                if (calls.title <= titleFailures) {
                    if (titleThrows) throw new Error('title failure');
                    return null;
                }
                calls.enter = payload.onEnter;
            }
            return { ui: {} };
        }
        close(name) { calls.closed.push(name); }
    }
    class Registry { registerRange() {} }
    const exported = {};
    const modules = {
        cc: { _decorator: { ccclass: () => value => value, property: () => () => {} }, Component: class {}, Node: class {}, Label: class {}, Button: { EventType: { CLICK: 'click' } }, isValid: value => !value.destroyed },
        '../../Frame/UI': { UIManager: Manager, UIOpenOpt: class {}, UIRuntimeRegistry: Registry, UIRegistration: { window() {}, dialog() {} }, EUILayer: {} },
        './UI/BootLoadingWin': { BootLoadingWin: Loading },
        './UI/TitleWin': {},
        './Recovery/RecoveryService': {
            RecoveryService: {
                getInstance: () => ({
                    check: async () => ({ state: 0 }),
                    discard: async () => {},
                }),
                clearInstance() {},
            },
            RecoveryState: { none: 0, available: 1, incompatible: 2 },
        },
        '../../Frame/Audio/SoundManager': { SoundManager: class {} },
        '../../Frame/Audio/Sound': { Sound: { Configure() {}, PlayBgm() { calls.bgm++; calls.order.push('bgm'); } } },
        './Save/SettingsService': { SettingsService: { Initialize() { calls.settings++; calls.order.push('settings'); } } },
        '../ModelFactory': { registerModels() { calls.models++; calls.order.push('models'); return {}; } },
        '../Character/CharacterController': { CharacterController },
        '../Character/CharacterConfigLoader': { CharacterConfigLoader: class {} },
        '../../Frame/RedDot/index': { RedDot: { Initialize() {}, Dispose() {} } },
        './RedDot/AppRedDotTree': { registerAppRedDots() {}, seedDemoRedDots() { calls.seed++; } },
        'cc/env': { DEV: true },
        'db://localization-editor/l10n': { l10n: { t: key => key } },
        '../../Frame/Log': { Log: { error() {} } },
    };
    vm.runInNewContext(code, { exports: exported, require(name) { assert.ok(name in modules, name); return modules[name]; } });
    const app = new exported.AppEntry();
    app._uiRoot = {};
    app._soundManager = {};
    app._bootHint = { node: { active: true }, string: '' };
    app._bootRetryButton = { node: { active: false, on() {}, off() {} }, interactable: false };
    return { app, calls };
}

test('normal boot restores settings, registers models, loads characters, and closes loading after title', async () => {
    const { app, calls } = harness();
    await app._runBootAttempt();
    assert.deepEqual(calls.order, ['settings', 'models', 'bgm', 'characters']);
    assert.equal(calls.title, 1);
    assert.ok(calls.closed.includes('BootLoadingWin'));
    assert.deepEqual(calls.progress.at(-1), [5, 5]);
});

for (const titleThrows of [false, true]) {
    test(`retry after title ${titleThrows ? 'rejection' : 'null'} succeeds without duplicate initialization`, async () => {
        const { app, calls } = harness({ titleFailures: 1, titleThrows });
        await app._runBootAttempt();
        assert.equal(calls.failures.length, 1);
        calls.retry();
        calls.retry();
        await flush();
        assert.equal(calls.title, 2, 'retry must actually start a second title attempt');
        assert.equal(calls.managers, 1);
        assert.equal(calls.settings, 1);
        assert.equal(calls.models, 1);
        assert.equal(calls.characters, 1);
        assert.equal(calls.seed, 1);
        assert.equal(calls.bgm, 1);
        assert.ok(calls.closed.includes('BootLoadingWin'));
    });
}

test('loading resource failure exposes scene fallback and its retry starts another attempt', async () => {
    const { app, calls } = harness({ loadingFails: true });
    await app._runBootAttempt();
    assert.equal(app._bootRetryButton.node.active, true);
    app._retryBoot();
    await flush();
    assert.equal(calls.loading, 2);
});

test('destroy while title is pending prevents later progress or UI close', async () => {
    let resolveTitle;
    const deferredTitle = new Promise(resolve => { resolveTitle = resolve; });
    const { app, calls } = harness({ deferredTitle });
    const run = app._runBootAttempt();
    await flush();
    assert.equal(calls.title, 1);
    app.onDestroy();
    const progressCount = calls.progress.length;
    resolveTitle({ ui: {} });
    await run;
    assert.equal(calls.progress.length, progressCount);
    assert.equal(calls.closed.length, 0);
});
