import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

// Exercise the real dialog callback/lifecycle code without a rendering engine.
const source = fs.readFileSync(new URL('../../assets/Scripts/Model/App/UI/ConfirmDlg.ts', import.meta.url), 'utf8');
const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, experimentalDecorators: true },
}).outputText;
const cc = {
    _decorator: { ccclass: () => value => value, property: () => () => {} },
    Label: class {}, ScrollView: class {}, UITransform: class {},
};
class BaseDlg {
    isValid = true;
    closes = 0;
    getTypedPayload() { return this.payload; }
    close() { this.closes++; this.onClose(); }
}
const exported = {};

test('generated prefab node metadata points back to its owning prefab asset', () => {
    for (const name of ['BaseDlgFrame', 'BootLoadingWin', 'TitleWin', 'MainWin', 'SettingDlg', 'ConfirmDlg']) {
        const path = new URL(`../../assets/resources/ui/app/${name}.prefab`, import.meta.url);
        const data = JSON.parse(fs.readFileSync(path, 'utf8'));
        assert.equal(data[0].__type__, 'cc.Prefab');
        for (const node of data.filter(item => item.__type__ === 'cc.Node')) {
            const info = data[node._prefab.__id__];
            assert.equal(info.__type__, 'cc.PrefabInfo');
            assert.deepEqual(info.asset, { __id__: 0 }, `${name}/${node._name}: missing prefab asset`);
            assert.equal(data[info.root.__id__].__type__, 'cc.Node');
        }
    }
});

vm.runInNewContext(code, {
    exports: exported,
    require: name => {
        if (name === 'cc') return cc;
        if (name.endsWith('/Frame/UI')) return { BaseDlg };
        if (name.endsWith('/Frame/Log')) return { Log: { error() {} } };
        if (name === './BaseDlgFrame') return { BaseDlgFrame: class {} };
        throw new Error(name);
    },
});

function dialog(payload = {}) {
    const instance = new exported.ConfirmDlg();
    instance.payload = { message: '测试正文', ...payload };
    instance._message = { string: '', updateRenderData() {}, getComponent: () => ({ height: 120 }) };
    instance._scroll = {
        node: { getComponent: () => ({ height: 0 }) },
        content: { getComponent: () => ({ height: 0 }) }, scrollToTop() {},
    };
    instance._frame = { configure(options) { this.options = options; }, setTitle(title) { this.title = title; } };
    instance.onOpen();
    return instance;
}

test('confirm and cancel settle once per opening, cached reopening gets new payload', async () => {
    let confirms = 0;
    let cancels = 0;
    const instance = dialog({ onConfirm: () => { confirms++; }, onCancel: () => { cancels++; } });
    const callbacks = instance._frame.options;
    await callbacks.onConfirm();
    await callbacks.onConfirm();
    await callbacks.onCancel();
    assert.equal(confirms, 1);
    assert.equal(cancels, 0);
    assert.equal(instance.closes, 1);
    instance.payload = { message: '第二次', onCancel: () => { cancels++; } };
    instance.onOpen();
    await instance._frame.options.onCancel();
    assert.equal(cancels, 1);
    assert.equal(instance._message.string, '第二次');
});

test('pending action blocks confirm/cancel reentry', async () => {
    let finish;
    let calls = 0;
    const instance = dialog({ onConfirm: () => {
        calls++;
        return new Promise(resolve => { finish = resolve; });
    } });
    const callbacks = instance._frame.options;
    const pending = callbacks.onConfirm();
    await callbacks.onConfirm();
    await callbacks.onCancel();
    assert.equal(calls, 1);
    assert.equal(instance.closes, 0);
    finish();
    await pending;
    assert.equal(instance.closes, 1);
});

test('failed action stays open, shows feedback and can retry', async () => {
    let calls = 0;
    const instance = dialog({ onConfirm: () => {
        if (++calls === 1) throw new Error('save failed');
    } });
    await instance._frame.options.onConfirm();
    assert.equal(instance.closes, 0);
    assert.equal(instance._frame.title, '操作失败，请重试');
    await instance._frame.options.onConfirm();
    assert.equal(calls, 2);
    assert.equal(instance.closes, 1);
});

test('completion from an old opening cannot close a newly opened dialog', async () => {
    let finish;
    const instance = dialog({ onConfirm: () => new Promise(resolve => { finish = resolve; }) });
    const pending = instance._frame.options.onConfirm();
    instance.onClose();
    instance.payload = { message: '新请求' };
    instance.onOpen();
    finish();
    await pending;
    assert.equal(instance.closes, 0);
    await instance._frame.options.onCancel();
    assert.equal(instance.closes, 1);
});
