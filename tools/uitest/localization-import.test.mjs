import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const root = new URL('../../', import.meta.url);
const bundles = ['electron-main/main', 'electron-main/scene', 'electron-renderer/default', 'electron-renderer/builder', 'electron-renderer/l10n-label-inspector']
    .map(name => [name, fs.readFileSync(new URL(`extensions/localization-editor/webpack-dist/${name}.js`, root), 'utf8')]);
const bytes = fs.readFileSync(new URL('assets/Translation/zh-Hans-CN.xlsx', root));

test('CSV and XLSX contain the same complete Chinese key/value set', () => {
    const bundle = bundles[0][1];
    const marker = bundle.indexOf('/***/ "./node_modules/csv-parse/dist/cjs/sync.cjs":');
    const start = bundle.indexOf('"use strict";', marker);
    const end = bundle.indexOf('\n/***/ })', start);
    assert.ok(marker >= 0 && end > start);
    const exported = {};
    vm.runInNewContext(bundle.slice(start, end), { exports: exported, Buffer, TextDecoder });
    const csvRows = exported.parse(fs.readFileSync(new URL('assets/Translation/zh-Hans-CN.csv', root)));
    assert.equal(csvRows[1][0], 'LanguageTag');
    const xlsx = loadSheetJs(bundle);
    const workbook = xlsx.read(bytes, { type: 'buffer' });
    const rows = xlsx.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);
    const expected = new Map(rows.map(row => [row.key, row.targetValue]));
    const actual = new Map(csvRows.slice(1).map(row => [row[0], row[2]]));
    assert.equal(actual.size, csvRows.length - 1, 'CSV must not contain duplicate keys');
    assert.equal(actual.size, expected.size);
    for (const [key, value] of expected) assert.equal(actual.get(key), value, key);
});

// Use the exact SheetJS version shipped in the extension, without loading Editor APIs.
function loadSheetJs(bundle) {
    const marker = bundle.indexOf('/***/ "./node_modules/xlsx/xlsx.mjs":');
    assert.ok(marker >= 0, 'bundled SheetJS module must exist');
    const start = bundle.indexOf('"use strict";', marker);
    const end = bundle.indexOf('\n/***/ })', start);
    assert.ok(end > start);
    const exported = {};
    const webpack = {
        r() {},
        d(target, definitions) {
            for (const [name, get] of Object.entries(definitions)) Object.defineProperty(target, name, { get });
        },
    };
    vm.runInNewContext(bundle.slice(start, end), {
        __webpack_exports__: exported,
        __webpack_require__: webpack,
        Buffer, ArrayBuffer, Uint8Array, Uint16Array, Int32Array,
        TextDecoder, TextEncoder, console, process,
    });
    return exported;
}

for (const [name, bundle] of bundles) {
    const xlsx = loadSheetJs(bundle);
    const expression = bundle.match(/if \(data\[0\] !== 0x50[\s\S]*?workbook = \(0, _xlsx\.read\)\([\s\S]*?\}\);/);
    assert.ok(expression, `${name}: XLSXReader.read call must exist`);
    const parse = data => vm.runInNewContext(`var workbook; ${expression[0]} workbook;`, {
        _xlsx: xlsx, data, Uint8Array, filePath: 'invalid.xlsx',
    });

    test(`${name}: invalid input reports the import path instead of LOTUS`, () => {
        assert.throws(() => parse(Buffer.from('[not an xlsx]')), /原生读取校验失败.*invalid\.xlsx/);
    });

    test(`${name}: complete XLSXReader reads the actual file with native fs`, async () => {
        const marker = bundle.indexOf('/***/ "./src/lib/core/reader/XLSXReader.ts":');
        const start = bundle.indexOf('"use strict";', marker);
        const end = bundle.indexOf('\n/***/ })', start);
        const exported = {};
        class CSVReader { generateTranslateData(rows) { return rows; } }
        const modules = {
            './src/lib/core/reader/CSVReader.ts': { default: CSVReader, __esModule: true },
            './node_modules/tsyringe/dist/esm5/index.js': { singleton: () => value => value },
            './node_modules/xlsx/xlsx.mjs': xlsx,
            './src/lib/core/error/Errors.ts': {},
            './src/lib/core/entity/messages/MainMessage.ts': {},
            './src/lib/core/type/type.ts': { TranslateFileType: { XLSX: 1 } },
            './node_modules/fs-extra/lib/index.js': { readFile() { throw new Error('must not use fs-extra read bridge'); } },
            fs: {
                ...fs,
                readFileSync() { throw new Error('must not use editor readFileSync wrapper'); },
            },
        };
        vm.runInNewContext(bundle.slice(start, end), {
            exports: exported, Uint8Array, Buffer, process,
            __webpack_require__(id) { assert.ok(id in modules, id); return modules[id]; },
        });
        const reader = new exported.default();
        const rows = await reader.read(new URL('assets/Translation/zh-Hans-CN.xlsx', root));
        assert.equal(rows.find(row => row.key === 'common.retry')?.targetValue, '重试');
    });

    for (const pooled of [false, true]) {
        test(`${name}: imports Chinese translations from ${pooled ? 'an offset Buffer' : 'the XLSX file'}`, () => {
            let data = bytes;
            if (pooled) {
                // Simulate a Node Buffer view sharing unrelated leading/trailing bytes.
                const slab = Buffer.alloc(bytes.length + 128, 0);
                slab[2] = 91;
                bytes.copy(slab, 64);
                data = slab.subarray(64, 64 + bytes.length);
                assert.ok(data.byteOffset > 0);
            }
            const workbook = parse(data);
            assert.equal(workbook.SheetNames[0], 'zh-Hans-CN');
            const rows = xlsx.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);
            assert.equal(rows[0].key, 'LanguageTag');
            assert.equal(rows[0].targetValue, 'zh-Hans-CN');
            assert.equal(rows.find(row => row.key === 'title.hint')?.targetValue, '点击屏幕进入');
            assert.equal(rows.find(row => row.key === 'common.retry')?.targetValue, '重试');
        });
    }
}
