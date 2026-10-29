/**
 * 红点 prefab 结构验收（对应任务 3 §4 / §6）。
 *
 * 运行方式：npm run test:reddot
 * 本文件只解析 prefab/meta JSON，不需要打开 Cocos 编辑器，也不依赖 cc；
 * 覆盖：数字角标 prefab、圆点角标 prefab、MainWin 三个入口的嵌套 prefab 实例、
 *      `_redDotId` 属性覆盖、节点顺序、Mask 规避、点击穿透（无 Button/BlockInputEvents）。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const ROOT = new URL('../../', import.meta.url);
const readText = (path) => readFileSync(new URL(path, ROOT), 'utf8');
const readJson = (path) => JSON.parse(readText(path));
const readMeta = (path) => readJson(`${path}.meta`);

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** 由脚本 meta uuid 推导 Cocos 压缩 class id。 */
function classIdOf(metaUuid) {
    const identifier = metaUuid.replace(/-/g, '');
    let result = identifier.slice(0, 5);
    for (let i = 5; i < 32; i += 3) {
        const value = parseInt(identifier.slice(i, i + 3), 16);
        result += ALPHABET[value >> 6] + ALPHABET[value & 63];
    }
    return result;
}

const refId = (value) => (value && typeof value === 'object' && '__id__' in value ? value.__id__ : null);

function loadPrefab(path) {
    const items = readJson(path);
    const nodeIdByName = (name) => items.findIndex((item) => item.__type__ === 'cc.Node' && item._name === name);
    const componentsOf = (id) => (items[id]?._components ?? []).map((component) => items[refId(component)]);
    return { items, nodeIdByName, componentsOf };
}

const BADGE_PREFAB = 'assets/resources/ui/app/RedDotBadge.prefab';
const DOT_ONLY_PREFAB = 'assets/resources/ui/app/RedDotBadgeDotOnly.prefab';
const MAIN_PREFAB = 'assets/resources/ui/app/MainWin.prefab';
const BADGE_SCRIPT_META = 'assets/Scripts/Frame/RedDot/RedDotBadge.ts';
const CIRCLE_META = 'assets/resources/ui/original/controls/solidRedCircle.png';

function badgeClassId() {
    return classIdOf(readMeta(BADGE_SCRIPT_META).uuid);
}

function circleFrameUuid() {
    return `${readMeta(CIRCLE_META).uuid}@f9941`;
}

function findCustomComponent(items, classId) {
    return items.find((item) => item.__type__ === classId);
}

function findSprite(items, nodeId) {
    return (items[nodeId]?._components ?? [])
        .map((component) => items[refId(component)])
        .find((component) => component?.__type__ === 'cc.Sprite');
}

function assertNotInteractive(items, label) {
    const forbidden = items.filter((item) => item.__type__ === 'cc.Button' || item.__type__ === 'cc.BlockInputEvents');
    assert.equal(forbidden.length, 0, `${label} 不能挂 Button/BlockInputEvents（会挡住按钮点击）`);
}

// ---------------------------------------------------------------------------
// 角标 prefab
// ---------------------------------------------------------------------------

test('验收：RedDotBadge.prefab 数字角标结构', () => {
    assert.ok(existsSync(new URL(CIRCLE_META, ROOT)), '圆形底图必须存在');
    const { items } = loadPrefab(BADGE_PREFAB);
    const root = items[1];
    assert.equal(root._active, true, '组件节点必须默认 active');

    const component = findCustomComponent(items, badgeClassId());
    assert.ok(component, '必须挂 RedDotBadge 组件');
    assert.equal(component._enabled, true);
    assert.equal(component._redDotId, '', '实例化时通过属性覆盖填 ID');
    assert.equal(component._dotOnly, false);
    assert.equal(component._maxCount, 99);

    const rootWidget = (root._components ?? [])
        .map((entry) => items[refId(entry)])
        .find((entry) => entry?.__type__ === 'cc.Widget');
    assert.ok(rootWidget, '根节点必须有 Widget（贴按钮右上角）');
    assert.equal(rootWidget._alignFlags, 33, 'Widget 必须是 TOP | RIGHT');
    assert.equal(rootWidget._alignMode, 2, 'Widget 必须使用 ALWAYS');

    const visualId = refId(component._visual);
    assert.ok(visualId !== null, '必须绑定 _visual');
    assert.equal(refId(items[visualId]._parent), 1, 'Visual 必须是根节点的子节点');
    const sprite = findSprite(items, visualId);
    assert.ok(sprite, 'Visual 上必须有 Sprite');
    assert.equal(sprite._spriteFrame?.__uuid__, circleFrameUuid(), 'Visual 必须使用裁剪好的圆形底图');
    assert.equal(sprite._type, 0, '圆形底图使用 SIMPLE 渲染');

    const labelId = refId(component._countLabel);
    assert.ok(labelId !== null, '数字模式必须绑定 _countLabel');
    const label = items[labelId];
    assert.equal(label.__type__, 'cc.Label');
    assert.equal(refId(items[refId(label.node)]._parent), visualId, 'Count 必须是 Visual 的子节点');
    assert.ok(label._fontSize > 0);

    assertNotInteractive(items, '数字角标');
});

test('验收：RedDotBadgeDotOnly.prefab 圆点角标结构', () => {
    const { items } = loadPrefab(DOT_ONLY_PREFAB);
    assert.equal(items[1]._active, true);

    const rootWidget = (items[1]._components ?? [])
        .map((entry) => items[refId(entry)])
        .find((entry) => entry?.__type__ === 'cc.Widget');
    assert.ok(rootWidget, '根节点必须有 Widget（贴按钮右上角）');
    assert.equal(rootWidget._alignFlags, 33);
    assert.equal(rootWidget._alignMode, 2);

    const component = findCustomComponent(items, badgeClassId());
    assert.ok(component, '必须挂 RedDotBadge 组件');
    assert.equal(component._dotOnly, true, '圆点变体必须开启 _dotOnly');
    assert.equal(refId(component._countLabel), null, '圆点模式不绑定 Count');
    assert.equal(component._redDotId, '');

    const visualId = refId(component._visual);
    assert.ok(visualId !== null);
    const sprite = findSprite(items, visualId);
    assert.ok(sprite);
    assert.equal(sprite._spriteFrame?.__uuid__, circleFrameUuid());
    assert.equal(sprite._type, 0);
    assert.ok(!items.some((item) => item.__type__ === 'cc.Label'), '圆点 prefab 不应有 Label');
    assertNotInteractive(items, '圆点角标');
});

// ---------------------------------------------------------------------------
// MainWin 接线
// ---------------------------------------------------------------------------

test('验收：MainWin.prefab 三个入口的角标实例与属性覆盖', () => {
    const badgePrefabUuid = readMeta(BADGE_PREFAB).uuid;
    const { items, nodeIdByName } = loadPrefab(MAIN_PREFAB);

    const instances = [];
    for (let id = 0; id < items.length; id++) {
        const item = items[id];
        if (item.__type__ !== 'cc.Node') continue;

        const infoId = refId(item._prefab);
        const info = infoId !== null ? items[infoId] : null;
        if (info?.__type__ !== 'cc.PrefabInfo') continue;
        if (info.asset?.__uuid__ !== badgePrefabUuid) continue;

        const prefabInstance = info.instance ? items[refId(info.instance)] : null;
        const overrides = {};
        for (const overrideRef of prefabInstance?.propertyOverrides ?? []) {
            const override = items[refId(overrideRef)];
            if (override?.__type__ === 'CCPropertyOverrideInfo' && override.propertyPath?.[0]) {
                overrides[override.propertyPath[0]] = override.value;
            }
        }
        instances.push({ id, parentId: refId(item._parent), redDotId: overrides._redDotId });
    }

    const expected = [
        ['TeamButton', 'main/team'],
        ['StageButton', 'main/stage'],
        ['SettingButton', 'main/setting'],
    ];
    assert.equal(instances.length, expected.length, '三个入口各一个角标实例');

    for (const [buttonName, redDotId] of expected) {
        const buttonId = nodeIdByName(buttonName);
        assert.ok(buttonId >= 0, `${buttonName} 必须存在`);

        const instance = instances.find((candidate) => candidate.parentId === buttonId);
        assert.ok(instance, `${buttonName} 下必须有角标实例`);
        assert.equal(instance.redDotId, redDotId, `${buttonName} 的红点 ID`);

        const children = (items[buttonId]._children ?? []).map(refId);
        assert.equal(children[children.length - 1], instance.id, '角标必须是按钮的最后一个子节点');

        // 角标及其祖先都不能带 cc.Mask（否则会被裁剪）。
        let current = instance.id;
        let guard = 0;
        while (current !== null && guard++ < 32) {
            const node = items[current];
            const hasMask = (node._components ?? [])
                .map((component) => items[refId(component)])
                .some((component) => component?.__type__ === 'cc.Mask');
            assert.equal(hasMask, false, `${buttonName} 的角标不能位于带 cc.Mask 的容器内`);
            current = refId(node._parent);
        }
    }

    const mainClassId = classIdOf(readMeta('assets/Scripts/Model/App/UI/MainWin.ts').uuid);
    const mainComponent = findCustomComponent(items, mainClassId);
    assert.ok(mainComponent, 'MainWin 组件必须存在');
    for (const key of ['_teamEditBtn', '_stagePickBtn', '_settingBtn']) {
        assert.ok(refId(mainComponent[key]) !== null, `${key} 引用不能丢`);
    }
    assert.equal(Object.prototype.hasOwnProperty.call(mainComponent, '_confirmTestBtn'), false, 'MainWin 不应再序列化临时 _confirmTestBtn');
    assert.equal(
        items.some((item) => item.__type__ === 'cc.Node' && item._name === 'ConfirmTestButton'),
        false,
        '临时 ConfirmTestButton 已清理，不应再生成',
    );
});

// ---------------------------------------------------------------------------
// 任务 3 尚未闭环的收尾项（skip：输出里会带原因，补齐后可去掉 skip 转为正式断言）
// ---------------------------------------------------------------------------

test('验收：MainWin 登记全部嵌套角标，覆盖目标对应真实组件', () => {
    const items = readJson(MAIN_PREFAB);
    const badge = readJson(BADGE_PREFAB);
    const root = items[refId(items[0].data)];
    const rootInfo = items[refId(root._prefab)];
    const nested = items.flatMap((item, id) => item.__type__ === 'cc.Node'
        && items[refId(item._prefab)]?.asset?.__uuid__ === readMeta(BADGE_PREFAB).uuid ? [id] : []);
    assert.equal(nested.length, 3);
    assert.deepEqual(rootInfo.nestedPrefabInstanceRoots?.map(refId).sort((a, b) => a - b), nested);
    const component = findCustomComponent(badge, badgeClassId());
    const componentFileId = badge[refId(component.__prefab)].fileId;
    for (const id of nested) {
        const info = items[refId(items[id]._prefab)];
        assert.equal(refId(info.root), id);
        assert.equal(info.fileId, badge[refId(badge[1]._prefab)].fileId);
        const instance = items[refId(info.instance)];
        const override = instance.propertyOverrides.map(refId).map(index => items[index])
            .find(entry => entry.propertyPath?.[0] === '_redDotId');
        assert.ok(override);
        assert.deepEqual(items[refId(override.targetInfo)].localID, [componentFileId]);
    }
});

test('验收：RedDotBadge 组件契约（BinderCount / _loaded / 回退）', () => {
    const source = readText('assets/Scripts/Frame/RedDot/RedDotBadge.ts');
    assert.match(source, /get BinderCount\(\)/);
    assert.match(source, /private _loaded/);
    assert.match(source, /this\._visual \?\?= this\.node/);
});

test('验收：Count 标签使用 Overflow.NONE（2026-10-29 确认）', () => {
    const { items } = loadPrefab(BADGE_PREFAB);
    const label = items.find((item) => item.__type__ === 'cc.Label');
    assert.equal(label._overflow, 0, '文本不裁剪/不缩放，99+ 依赖宽度与字号保证');
    assert.ok(label._fontSize > 0);
});
