import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const root = new URL('../../', import.meta.url);
const read = path => fs.readFileSync(new URL(path, root), 'utf8');
const language = read('localization-editor/translate-data/zh-Hans-CN.yaml');
const textEntries = new Map(language.split(/(?=^  - - )/m)
    .filter(block => /^      type: 2$/m.test(block))
    .map(block => [block.match(/^    - key: (.+)$/m)[1], block]));

test('all Chinese text entries have semantic keys and nonempty translations', () => {
    for (const [key, block] of textEntries) {
        assert.match(key, /^[a-z][a-zA-Z0-9]*(?:\.[a-zA-Z0-9]+)+$/);
        const value = block.match(/^      value: (.+)$/m)?.[1];
        assert.ok(value && value !== '""' && value !== "''", key);
    }
});

test('prefab and application translation keys resolve to Chinese entries', () => {
    for (const file of fs.readdirSync(new URL('assets/resources/ui/app/', root)).filter(name => name.endsWith('.prefab'))) {
        const items = JSON.parse(read(`assets/resources/ui/app/${file}`));
        for (const item of items) {
            if (typeof item._key === 'string') assert.ok(textEntries.has(item._key), `${file}: ${item._key}`);
        }
    }
    for (const file of ['AppEntry.ts', 'UI/BootLoadingWin.ts', 'UI/SettingDlg.ts', 'UI/ConfirmDlg.ts', 'UI/MainWin.ts']) {
        const source = read(`assets/Scripts/Model/App/${file}`).replace(/^\s*\/\/.*$/gm, '');
        for (const match of source.matchAll(/l10n\.t\(['"]([^'"]+)['"]/g)) {
            assert.ok(textEntries.has(match[1]), `${file}: ${match[1]}`);
        }
    }
});

test('dynamic labels are not overwritten by L10nLabel.start', () => {
    const scene = JSON.parse(read('assets/Scenes/Boot.scene'));
    const app = scene.find(item => item && '_bootHint' in item);
    const hintNode = scene[scene[app._bootHint.__id__].node.__id__];
    assert.equal(hintNode.__editorExtras__.localizationManagedByCode, true);
    assert.ok(hintNode._components.every(ref => typeof scene[ref.__id__]._key !== 'string'));
    for (const file of ['BootLoadingWin', 'BaseDlgFrame', 'ConfirmDlg', 'SettingDlg', 'RedDotBadge']) {
        const items = JSON.parse(read(`assets/resources/ui/app/${file}.prefab`));
        for (const item of items.filter(entry => typeof entry._key === 'string')) {
            const node = items[item.node.__id__];
            assert.ok(!['BaseDlgFrame', 'ConfirmDlg', 'RedDotBadge'].includes(file), file);
            if (file === 'BootLoadingWin') assert.ok(!['LoadingText', 'PercentLabel'].includes(node._name));
            if (file === 'SettingDlg') {
                const label = node._components.map(ref => items[ref.__id__]).find(component => component.__type__ === 'cc.Label');
                assert.ok(!['请确认', '确认', '取消', ''].includes(label._string));
            }
        }
    }
});
