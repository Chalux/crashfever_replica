import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const root = '../../.teamtest-out/assets/Scripts/';
const {
    EElement,
    ERace,
    validateCharacterConfigs,
} = require(root + 'Model/Character/CharacterConfig.js');
const { CharacterModel, characterEvent } = require(root + 'Model/Character/CharacterModel.js');
const { CharacterController } = require(root + 'Model/Character/CharacterController.js');

function createConfigs() {
    return [
        { id: 'char_001', name: '测试角色1', element: EElement.red, race: ERace.human },
        { id: 'char_002', name: '测试角色2', element: EElement.blue, race: ERace.animal },
        { id: 'char_003', name: '测试角色3', element: EElement.green, race: ERace.dragon },
        { id: 'char_004', name: '测试角色4', element: EElement.yellow, race: ERace.human | ERace.machine, icon: 'icon/char_004' },
    ];
}

function createLoader(configs = createConfigs()) {
    let loadCount = 0;
    return {
        get loadCount() {
            return loadCount;
        },
        async Load() {
            loadCount++;
            return configs;
        },
    };
}

function setup() {
    const model = new CharacterModel();
    const controller = new CharacterController(model);
    return { model, controller };
}

function deferred() {
    let resolve;
    const promise = new Promise(done => {
        resolve = done;
    });
    return { promise, resolve };
}

test('validateCharacterConfigs accepts valid data and preserves combined race bits', () => {
    const result = validateCharacterConfigs(createConfigs());

    assert.deepEqual(result.errors, []);
    assert.equal(result.characters.length, 4);
    assert.equal(result.characters[3].race, ERace.human | ERace.machine);
    assert.equal(result.characters[3].icon, 'icon/char_004');
});

test('validateCharacterConfigs rejects the whole config on duplicate or invalid entries', () => {
    const duplicate = createConfigs();
    duplicate.push({ id: 'char_001', name: '重复角色', element: EElement.red, race: ERace.human });
    const duplicateResult = validateCharacterConfigs(duplicate);
    assert.equal(duplicateResult.characters.length, 0);
    assert.ok(duplicateResult.errors.some(error => error.includes('重复')));

    const invalidElement = createConfigs();
    invalidElement[0].element = 99;
    const invalidElementResult = validateCharacterConfigs(invalidElement);
    assert.equal(invalidElementResult.characters.length, 0);
    assert.ok(invalidElementResult.errors.some(error => error.includes('element')));

    const missingName = createConfigs();
    delete missingName[1].name;
    const missingNameResult = validateCharacterConfigs(missingName);
    assert.equal(missingNameResult.characters.length, 0);
    assert.ok(missingNameResult.errors.some(error => error.includes('name')));
});

test('validateCharacterConfigs handles non-array and empty configs without throwing', () => {
    assert.equal(validateCharacterConfigs(null).characters.length, 0);
    assert.ok(validateCharacterConfigs(null).errors.length > 0);
    assert.deepEqual(validateCharacterConfigs([]), { characters: [], errors: [] });
});

test('CharacterController loads into the model and exposes directory queries', async () => {
    const { model, controller } = setup();
    const loader = createLoader();

    assert.equal(await controller.Initialize(loader), true);
    assert.equal(controller.IsLoaded(), true);
    assert.equal(controller.All().length, 4);
    assert.equal(controller.Get('char_002').name, '测试角色2');
    assert.equal(controller.Has('char_004'), true);
    assert.equal(controller.Get('missing'), null);
    assert.equal(controller.Has('missing'), false);
    assert.equal(Object.hasOwn(controller, '_characters'), false);
    assert.equal(controller.eventDispatcher, model.eventDispatcher);
    assert.equal(loader.loadCount, 1);
});

test('CharacterController initialization is idempotent', async () => {
    const { controller } = setup();
    const loader = createLoader();

    await controller.Initialize(loader);
    await controller.Initialize(loader);

    assert.equal(loader.loadCount, 1);
});

test('concurrent controllers share one character loading task', async () => {
    const model = new CharacterModel();
    const controllerA = new CharacterController(model);
    const controllerB = new CharacterController(model);
    const gate = deferred();
    let loadCount = 0;
    const loader = {
        async Load() {
            loadCount++;
            await gate.promise;
            return createConfigs();
        },
    };

    const first = controllerA.Initialize(loader);
    const second = controllerB.Initialize(loader);

    assert.equal(loadCount, 1);
    assert.ok(model.loading);

    gate.resolve();
    assert.deepEqual(await Promise.all([first, second]), [true, true]);

    assert.equal(loadCount, 1);
    assert.equal(model.loaded, true);
    assert.equal(controllerA.initialized, true);
    assert.equal(controllerB.initialized, true);
    assert.equal(model.loading, null);
});

test('CharacterController keeps the model unloaded when loading fails', async () => {
    const { model, controller } = setup();
    const failure = {
        async Load() {
            throw new Error('load failed');
        },
    };

    assert.equal(await controller.Initialize(failure), false);
    assert.equal(controller.IsLoaded(), false);
    assert.equal(model.loaded, false);
    assert.equal(model.loading, null);
    assert.deepEqual(controller.All(), []);
});

test('CharacterModel emits changed through its own dispatcher', () => {
    const { model, controller } = setup();
    const received = [];
    model.eventDispatcher.on(characterEvent.changed, payload => received.push(payload));

    model.setAll(createConfigs());
    assert.equal(received.length, 1);
    assert.equal(received[0].loaded, true);
    assert.equal(received[0].characters.length, 4);

    controller.dispose();
    model.clear();
    assert.equal(received.length, 2);
    assert.equal(received[1].loaded, false);
});
