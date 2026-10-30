import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const root = '../../.teamtest-out/assets/Scripts/';
const { teamCount, teamSlotCount, cloneTeamSaveData } = require(root + 'Model/Team/TeamData.js');
const { TeamModel, teamEvent } = require(root + 'Model/Team/TeamModel.js');
const { TeamController } = require(root + 'Model/Team/TeamController.js');

function createData() {
    return {
        version: 1,
        selectedTeam: 0,
        teams: Array.from({ length: teamCount }, (_, index) => ({
            name: `编队 ${index + 1}`,
            slots: Array(teamSlotCount).fill(null),
        })),
    };
}

/**
 * 同步存档服务替身：与 ITeamSaveService 契约一致（Load 同步返回结果对象）。
 * 读取返回克隆，避免测试改动和「已保存数据」互相影响。
 */
function createService(initial = createData()) {
    let data = cloneTeamSaveData(initial);
    let loadCount = 0;
    let saveCount = 0;
    let failSave = false;

    return {
        get loadCount() {
            return loadCount;
        },
        get saveCount() {
            return saveCount;
        },
        get saved() {
            return data;
        },
        get failSave() {
            return failSave;
        },
        set failSave(value) {
            failSave = value;
        },
        Load() {
            loadCount++;
            return { data: cloneTeamSaveData(data), source: 'primary', canSave: true };
        },
        Save(next) {
            saveCount++;
            if (failSave) {
                return false;
            }
            data = cloneTeamSaveData(next);
            return true;
        },
    };
}

function setup(initial) {
    const model = new TeamModel();
    const service = createService(initial);
    const controller = new TeamController(model);
    return { model, service, controller };
}

test('TeamModel rejects incomplete or wrong-version save data', () => {
    const model = new TeamModel();
    const missingTeam = createData();
    missingTeam.teams.pop();
    assert.equal(model.load(missingTeam), false);

    const wrongVersion = createData();
    wrongVersion.version = 2;
    assert.equal(model.load(wrongVersion), false);

    const missingSlot = createData();
    missingSlot.teams[0].slots.pop();
    assert.equal(model.load(missingSlot), false);
    assert.equal(model.data, null);
});

test('Initialize loads through the synchronous save service and shares the model dispatcher', async () => {
    const { model, service, controller } = setup();
    await controller.Initialize(service);

    assert.equal(controller.model, model);
    assert.deepEqual(model.data, service.saved);
    assert.equal(service.loadCount, 1);
    assert.equal(Object.hasOwn(controller, '_teamSaveData'), false);
    assert.equal(controller.eventDispatcher, model.eventDispatcher);
});

test('Initialize is idempotent and does not overwrite unsaved changes', async () => {
    const { model, service, controller } = setup();
    await controller.Initialize(service);

    assert.equal(controller.Assign(0, 0, 'character-a'), true);
    await controller.Initialize(service);

    assert.equal(service.loadCount, 1);
    assert.equal(model.data.teams[0].slots[0], 'character-a');
});

test('a second controller on the same model reuses loaded data without reloading', async () => {
    const model = new TeamModel();
    const service = createService();
    const first = new TeamController(model);
    const second = new TeamController(model);

    await first.Initialize(service);
    await second.Initialize(service);

    assert.equal(service.loadCount, 1);
    assert.equal(first.initialized, true);
    assert.equal(second.initialized, true);
    assert.deepEqual(second.GetTeam(0), service.saved.teams[0]);
});

test('a disposed controller does not load or write the model', async () => {
    const model = new TeamModel();
    const service = createService();
    const controller = new TeamController(model);

    controller.dispose();
    await controller.Initialize(service);

    assert.equal(controller.disposed, true);
    assert.equal(service.loadCount, 0);
    assert.equal(model.data, null);
});

test('a failing Load leaves the model empty without throwing', async () => {
    const model = new TeamModel();
    const controller = new TeamController(model);
    const service = {
        Load() {
            throw new Error('storage denied');
        },
        Save() {
            return false;
        },
    };

    await assert.doesNotReject(controller.Initialize(service));
    assert.equal(model.data, null);
    assert.equal(controller.initialized, false);
});

test('the controller loads fallback default data even when canSave is false', async () => {
    const model = new TeamModel();
    const controller = new TeamController(model);
    const data = createData();
    data.teams[0].slots[0] = 'character-a';
    const service = {
        Load() {
            return { data, source: 'default', canSave: false };
        },
        Save() {
            return false;
        },
    };

    await controller.Initialize(service);

    assert.equal(model.data.teams[0].slots[0], 'character-a');
    assert.equal(controller.IsDirty(), false);
});

test('Assign fills empty slots, allows duplicate characters, and rejects invalid indexes', async () => {
    const { model, controller, service } = setup();
    await controller.Initialize(service);

    assert.equal(controller.Assign(0, 0, 'character-a'), true);
    assert.equal(controller.Assign(0, 1, 'character-a'), true);
    assert.equal(controller.Assign(0, 0, 'character-b'), true);
    assert.deepEqual(model.data.teams[0].slots, ['character-b', 'character-a', null, null]);

    assert.equal(controller.Assign(-1, 0, 'character-a'), false);
    assert.equal(controller.Assign(teamCount, 0, 'character-a'), false);
    assert.equal(controller.Assign(0, -1, 'character-a'), false);
    assert.equal(controller.Assign(0, teamSlotCount, 'character-a'), false);
    assert.equal(controller.Assign(0, 0, ''), false);
});

test('Remove clears the slot without requiring the slot to be occupied', async () => {
    const { model, controller, service } = setup();
    await controller.Initialize(service);

    controller.Assign(0, 0, 'character-a');
    assert.equal(controller.Remove(0, 0), true);
    assert.equal(model.data.teams[0].slots[0], null);
    assert.equal(controller.Remove(0, 0), true);
    assert.equal(controller.Remove(teamCount, 0), false);
});

test('Select validates the team index and marks the model dirty', async () => {
    const { model, controller, service } = setup();
    await controller.Initialize(service);

    assert.equal(controller.Select(2), true);
    assert.equal(model.data.selectedTeam, 2);
    assert.equal(controller.IsDirty(), true);
    assert.equal(controller.Select(teamCount), false);
    assert.equal(controller.Select(2), true);
});

test('Save delegates to the service, clears dirty only on success, and fails without a service', async () => {
    const { model, controller, service } = setup();
    await controller.Initialize(service);

    assert.equal(controller.Assign(0, 0, 'character-a'), true);
    assert.equal(controller.IsDirty(), true);

    service.failSave = true;
    assert.equal(controller.Save(), false);
    assert.equal(controller.IsDirty(), true);
    assert.equal(model.data.teams[0].slots[0], 'character-a');

    service.failSave = false;
    assert.equal(controller.Save(), true);
    assert.equal(controller.IsDirty(), false);
    assert.equal(service.saved.teams[0].slots[0], 'character-a');
    assert.equal(service.saveCount, 2);

    const uninitialized = new TeamController(new TeamModel());
    assert.equal(uninitialized.Save(), false);
});

test('Discard returns to the last loaded or saved snapshot', async () => {
    const { model, controller, service } = setup();
    await controller.Initialize(service);

    controller.Assign(0, 0, 'character-a');
    controller.Rename(0, '新队名');
    controller.Select(2);
    controller.Discard();

    assert.equal(controller.IsDirty(), false);
    assert.equal(model.data.teams[0].slots[0], null);
    assert.equal(model.data.teams[0].name, '编队 1');
    assert.equal(model.data.selectedTeam, 0);
});

test('CanDeploy requires at least one non-empty slot', async () => {
    const { controller, service } = setup();
    await controller.Initialize(service);

    assert.equal(controller.CanDeploy(0), false);
    controller.Assign(0, 0, 'character-a');
    assert.equal(controller.CanDeploy(0), true);
    controller.Remove(0, 0);
    assert.equal(controller.CanDeploy(0), false);
});

test('Disposing the controller does not clear the model event dispatcher', async () => {
    const { model, controller, service } = setup();
    await controller.Initialize(service);

    const received = [];
    model.eventDispatcher.on(teamEvent.changed, payload => received.push(payload));
    controller.Assign(0, 0, 'character-a');

    assert.equal(received.length, 1);
    assert.equal(received[0].dirty, true);
    assert.equal(received[0].data.teams[0].slots[0], 'character-a');

    controller.dispose();
    model.markDirty();
    assert.equal(received.length, 2);
});
