import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const root = '../../.teamtest-out/assets/Scripts/';
const { teamCount, teamSlotCount } = require(root + 'Model/Team/TeamData.js');
const { TeamSaveService } = require(root + 'Model/Team/TeamSaveService.js');

const primary = TeamSaveService.PrimaryKey;
const backup = TeamSaveService.BackupKey;

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

/** 内存存储替身，同时记录读写过的键，便于断言存储隔离。 */
function createFixture(options = {}) {
    const entries = new Map(options.entries ?? []);
    const warnings = [];
    const calls = { get: [], set: [] };
    const storage = {
        getItem(key) {
            calls.get.push(key);
            return entries.get(key) ?? null;
        },
        setItem(key, value) {
            calls.set.push(key);
            if (options.throwOnSet) {
                throw new Error('QuotaExceededError');
            }
            entries.set(key, value);
        },
    };

    return {
        entries,
        warnings,
        calls,
        service: new TeamSaveService(storage, message => warnings.push(message)),
    };
}

function reuse(fixture) {
    return new TeamSaveService({
        getItem: key => fixture.entries.get(key) ?? null,
        setItem: (key, value) => fixture.entries.set(key, value),
    }, message => fixture.warnings.push(message));
}

test('first launch returns the complete default teams and never writes on load', () => {
    const { service, entries, calls } = createFixture();

    const result = service.Load();

    assert.equal(result.source, 'default');
    assert.equal(result.canSave, true);
    assert.deepEqual(result.data, createData());
    assert.equal(entries.size, 0);
    assert.deepEqual(calls.set, []);
});

test('saved data survives a new service instance', () => {
    const fixture = createFixture();
    const data = fixture.service.Load().data;
    data.selectedTeam = 3;
    data.teams[0].name = '主力队';
    data.teams[0].slots[0] = 'char_001';

    assert.equal(fixture.service.Save(data), true);

    const restored = reuse(fixture).Load();
    assert.equal(restored.source, 'primary');
    assert.equal(restored.canSave, true);
    assert.deepEqual(restored.data, data);
});

test('first save does not create a backup', () => {
    const fixture = createFixture();

    assert.equal(fixture.service.Save(fixture.service.Load().data), true);

    assert.equal(fixture.entries.has(primary), true);
    assert.equal(fixture.entries.has(backup), false);
});

test('saving again copies the previous valid primary into the backup key', () => {
    const fixture = createFixture();
    const first = fixture.service.Load().data;
    first.selectedTeam = 1;
    assert.equal(fixture.service.Save(first), true);

    const second = fixture.service.Load().data;
    second.selectedTeam = 5;
    assert.equal(fixture.service.Save(second), true);

    assert.deepEqual(JSON.parse(fixture.entries.get(primary)), second);
    assert.deepEqual(JSON.parse(fixture.entries.get(backup)), first);
});

test('a corrupt primary falls back to the valid backup without overwriting it on save', () => {
    const good = createData();
    good.selectedTeam = 7;
    const fixture = createFixture({
        entries: [[primary, '{broken'], [backup, JSON.stringify(good)]],
    });

    const result = fixture.service.Load();
    assert.equal(result.source, 'backup');
    assert.equal(result.canSave, true);
    assert.equal(result.data.selectedTeam, 7);

    assert.equal(fixture.service.Save(result.data), true);
    assert.deepEqual(JSON.parse(fixture.entries.get(backup)), good);
});

test('valid JSON with an invalid structure is treated as corrupt and falls back to backup', () => {
    const good = createData();
    good.selectedTeam = 4;
    const fixture = createFixture({
        entries: [
            [primary, JSON.stringify({ version: 1, selectedTeam: 0, teams: [] })],
            [backup, JSON.stringify(good)],
        ],
    });

    const result = fixture.service.Load();
    assert.equal(result.source, 'backup');
    assert.equal(result.data.selectedTeam, 4);
});

test('out-of-range selectedTeam and non-string slots are treated as corrupt', () => {
    const invalidSelected = createData();
    invalidSelected.selectedTeam = teamCount;
    const selectedFixture = createFixture({ entries: [[primary, JSON.stringify(invalidSelected)]] });
    assert.equal(selectedFixture.service.Load().source, 'default');

    const invalidSlot = createData();
    invalidSlot.teams[0].slots[0] = 123;
    const slotFixture = createFixture({ entries: [[primary, JSON.stringify(invalidSlot)]] });
    assert.equal(slotFixture.service.Load().source, 'default');

    const shortSlots = createData();
    shortSlots.teams[2].slots.pop();
    const slotsFixture = createFixture({ entries: [[primary, JSON.stringify(shortSlots)]] });
    assert.equal(slotsFixture.service.Load().source, 'default');
});

test('both primary and backup corrupt fall back to the default without writing immediately', () => {
    const fixture = createFixture({
        entries: [[primary, '{broken'], [backup, 'null']],
    });

    const result = fixture.service.Load();

    assert.equal(result.source, 'default');
    assert.equal(result.canSave, true);
    assert.deepEqual(result.data, createData());
    assert.equal(fixture.entries.get(primary), '{broken');
    assert.equal(fixture.entries.get(backup), 'null');
    assert.deepEqual(fixture.calls.set, []);
});

test('a future primary version falls back to default, disables saving, and is not overwritten', () => {
    const future = JSON.stringify({ ...createData(), version: 2 });
    const fixture = createFixture({ entries: [[primary, future]] });

    const result = fixture.service.Load();
    assert.equal(result.source, 'default');
    assert.equal(result.canSave, false);
    assert.deepEqual(result.data, createData());
    assert.ok(fixture.warnings.length > 0);

    assert.equal(fixture.service.Save(result.data), false);
    assert.equal(fixture.entries.get(primary), future);
});

test('a future backup version also disables saving when the primary is absent', () => {
    const future = JSON.stringify({ ...createData(), version: 2 });
    const fixture = createFixture({ entries: [[backup, future]] });

    const result = fixture.service.Load();
    assert.equal(result.source, 'default');
    assert.equal(result.canSave, false);

    assert.equal(fixture.service.Save(result.data), false);
    assert.equal(fixture.entries.get(backup), future);
});

test('Save stops when a higher version appears after loading', () => {
    const fixture = createFixture();
    fixture.service.Load();

    const future = JSON.stringify({ ...createData(), version: 2 });
    fixture.entries.set(primary, future);

    assert.equal(fixture.service.Save(createData()), false);
    assert.equal(fixture.entries.get(primary), future);
    assert.ok(fixture.warnings.length > 0);
});

test('a version other than 1 is treated as corrupt', () => {
    const good = createData();
    good.selectedTeam = 6;
    const fixture = createFixture({
        entries: [
            [primary, JSON.stringify({ ...createData(), version: 0 })],
            [backup, JSON.stringify(good)],
        ],
    });

    assert.equal(fixture.service.Load().source, 'backup');
});

test('Save rejects invalid data instead of writing it', () => {
    const fixture = createFixture();
    fixture.service.Load();

    const missingTeam = createData();
    missingTeam.teams.pop();
    assert.equal(fixture.service.Save(missingTeam), false);

    const missingSlot = createData();
    missingSlot.teams[0].slots.pop();
    assert.equal(fixture.service.Save(missingSlot), false);

    const invalidSelected = createData();
    invalidSelected.selectedTeam = teamCount;
    assert.equal(fixture.service.Save(invalidSelected), false);

    assert.equal(fixture.entries.has(primary), false);
    assert.ok(fixture.warnings.length > 0);
});

test('a throwing storage returns false instead of propagating the exception', () => {
    const fixture = createFixture({ throwOnSet: true });

    assert.equal(fixture.service.Save(fixture.service.Load().data), false);
    assert.ok(fixture.warnings.length > 0);
});

test('only the team save keys are read or written', () => {
    const fixture = createFixture();
    const data = fixture.service.Load().data;
    fixture.service.Save(data);

    const keys = [...fixture.calls.get, ...fixture.calls.set];
    assert.ok(keys.length > 0);
    assert.ok(keys.every(key => key === primary || key === backup));
    assert.equal(keys.includes('crashfever.settings'), false);
});
