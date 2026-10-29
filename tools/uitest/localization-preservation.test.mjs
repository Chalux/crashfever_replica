import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const root = new URL('../../', import.meta.url);
const bundlePaths = ['electron-main/main', 'electron-main/scene', 'electron-renderer/default', 'electron-renderer/builder', 'electron-renderer/l10n-label-inspector'];

class Item {
    constructor(key, value, type = 2) { this.key = key; this.value = value; this.type = type; this.associations = ['original-node']; }
    clone() { const item = new Item(this.key, this.value, this.type); item.associations = [...this.associations]; return item; }
    clearValue() { this.value = ''; return this; }
    clearVariant() { return this; }
    clearAssociation() { this.associations = []; return this; }
    merge(other) { this.value = other.value; return this; }
}

for (const path of bundlePaths) {
    const source = fs.readFileSync(new URL(`extensions/localization-editor/webpack-dist/${path}.js`, root), 'utf8');
    const marker = source.indexOf('/***/ "./src/lib/core/service/persistent/TranslateDataSourceService.ts":');
    if (marker < 0) continue;
    const module = source.slice(marker, source.indexOf('\n/***/ })', marker));
    const parsed = ts.createSourceFile('service.js', module, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
    let functionSource;
    function visit(node) {
        if (ts.isFunctionExpression(node) && node.name?.text === 'updateTranslateData') functionSource = node.getText(parsed);
        ts.forEachChild(node, visit);
    }
    visit(parsed);
    assert.ok(functionSource);
    const update = vm.runInNewContext(`(${functionSource})`, {
        _TranslateItemType: { default: { External: 4 } },
        _sliced_to_array: value => value,
        Map, Set,
    });

    test(`${path}: import preserves distinct keys with equal text, existing translations and media`, () => {
        const confirm = new Item('common.confirm', '确认');
        const media = new Item('image-uuid', 'image-uuid', 1);
        const index = { items: new Map([[confirm.key, confirm.clone()], [media.key, media.clone()]]) };
        const data = {
            locale: 'zh-Hans-CN', items: new Map([[confirm.key, confirm], [media.key, media]]),
            transformToValueMap() { return new Map([...this.items.values()].map(item => [item.value, item])); },
            statisticsTotal() {}, statisticsFinished() {},
        };
        const service = {
            _getIndexData: () => index, _getTranslateData: () => data, _getLocalTranslateData: () => data,
            globalConfigService: { getLocalLanguage: () => 'zh-Hans-CN' },
            translateDataMap: new Map([['zh-Hans-CN', data]]),
        };
        update.call(service, 'zh-Hans-CN', [new Item('button.accept', '确认', 4)]);
        assert.equal(data.items.get('button.accept')?.value, '确认', 'new key must not be collapsed into common.confirm');
        assert.ok(index.items.has('button.accept'));
        assert.equal(data.items.get('common.confirm'), confirm);
        assert.deepEqual(confirm.associations, ['original-node']);
        assert.equal(data.items.get('image-uuid'), media);
        update.call(service, 'zh-Hans-CN', [new Item('button.accept', '接受', 4)]);
        assert.equal(data.items.get('button.accept').value, '接受');
        assert.equal(confirm.value, '确认');
    });
}

test('scene scanner honors the marker on programmatic labels', () => {
    const source = fs.readFileSync(new URL('extensions/localization-editor/webpack-dist/electron-main/scene.js', root), 'utf8');
    const marker = source.indexOf('labels.forEach(function(label) {');
    const end = source.indexOf('var sameValueItem', marker);
    const guard = source.slice(marker + 'labels.forEach(function(label) {'.length, end);
    let touched = false;
    const scan = vm.runInNewContext(`(function(label) { ${guard} touched(); })`, { touched: () => { touched = true; } });
    scan({ node: { __editorExtras__: { localizationManagedByCode: true }, getComponent() { throw new Error('marked label must be skipped first'); } } });
    assert.equal(touched, false);
});
