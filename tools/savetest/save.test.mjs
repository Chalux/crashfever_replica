import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import Module from 'node:module';

const require = createRequire(import.meta.url);
const root = '../../.savetest-out/assets/Scripts/';
const { createDefaultSettings, parseSettings } = require(root + 'Model/App/Save/SettingsData.js');
const { SettingsSaveService } = require(root + 'Model/App/Save/SettingsSaveService.js');
const primary = SettingsSaveService.PrimaryKey;
const backup = SettingsSaveService.BackupKey;

function fixture() {
    const entries = new Map();
    const warnings = [];
    const storage = {
        getItem: key => entries.get(key) ?? null,
        setItem: (key, value) => { entries.set(key, value); },
    };
    const service = new SettingsSaveService(storage, message => warnings.push(message));
    return { entries, storage, warnings, service };
}

test('first launch uses independent defaults; saved values survive a new service', () => {
    const { service, storage } = fixture();
    const first = service.load();
    assert.equal(first.source, 'default');
    first.data.audio.sfx = { volume: 35.5, muted: true };
    assert.equal(service.save(first.data), true);
    const restored = new SettingsSaveService(storage, () => {}).load();
    assert.deepEqual(restored.data.audio.sfx, { volume: 35.5, muted: true });
    assert.equal(createDefaultSettings().audio.sfx.volume, 100);
});

test('backup holds previous valid primary and restores after corruption', () => {
    const { service, entries } = fixture();
    const data = service.load().data;
    data.audio.sfx.volume = 25;
    service.save(data);
    data.audio.sfx.volume = 75;
    service.save(data);
    entries.set(primary, '{broken');
    const recovered = service.load();
    assert.equal(recovered.source, 'backup');
    assert.equal(recovered.data.audio.sfx.volume, 25);
    const validBackup = entries.get(backup);
    assert.equal(service.save(recovered.data), true);
    assert.equal(entries.get(backup), validBackup);
});

test('valid JSON with invalid fields falls back to backup', () => {
    const { entries, service } = fixture();
    entries.set(primary, JSON.stringify({ schemaVersion: 1, audio: {} }));
    entries.set(backup, JSON.stringify(createDefaultSettings()));
    assert.equal(service.load().source, 'backup');
});

test('invalid backup and primary use defaults without immediately writing', () => {
    const { entries, service } = fixture();
    entries.set(primary, 'null');
    entries.set(backup, '[]');
    assert.equal(service.load().source, 'default');
    assert.equal(entries.get(primary), 'null');
    assert.equal(entries.get(backup), '[]');
});

test('future version is preserved and cannot be downgraded on save', () => {
    for (const location of [primary, backup]) {
        const { entries, service } = fixture();
        const future = '{"schemaVersion":2,"futureData":true}';
        entries.set(location, future);
        const result = service.load();
        assert.equal(result.canSave, false);
        assert.equal(service.save(result.data), false);
        assert.equal(entries.get(location), future);
    }
});

test('read access failure blocks save instead of overwriting unknown data', () => {
    const { storage, service, entries } = fixture();
    storage.getItem = () => { throw new Error('access denied'); };
    assert.equal(service.load().canSave, false);
    assert.equal(service.save(createDefaultSettings()), false);
    assert.equal(entries.size, 0);
});

test('primary write failure retains previous valid primary and backup', () => {
    const { storage, service, entries } = fixture();
    const data = service.load().data;
    assert.equal(service.save(data), true);
    const original = entries.get(primary);
    storage.setItem = (key, value) => {
        if (key === primary) throw new Error('quota exceeded');
        entries.set(key, value);
    };
    data.audio.sfx.volume = 20;
    assert.equal(service.save(data), false);
    assert.equal(entries.get(primary), original);
    assert.equal(entries.get(backup), original);
});

test('backup write failure prevents primary replacement', () => {
    const { storage, service, entries } = fixture();
    const data = service.load().data;
    service.save(data);
    const original = entries.get(primary);
    storage.setItem = () => { throw new Error('quota exceeded'); };
    data.audio.sfx.volume = 10;
    assert.equal(service.save(data), false);
    assert.equal(entries.get(primary), original);
});

test('runtime validation rejects wrong types, out-of-range values and unsupported versions', () => {
    for (const value of [-1, 101, '50', null]) {
        const data = createDefaultSettings();
        data.audio.sfx.volume = value;
        assert.throws(() => parseSettings(JSON.stringify(data)));
    }
    const data = createDefaultSettings();
    data.audio.master.muted = 'false';
    assert.throws(() => parseSettings(JSON.stringify(data)));
    assert.throws(() => parseSettings('{"schemaVersion":0}'));
});

test('application restores before playback; preview rollback and confirmed persistence are distinct', () => {
    const { storage, entries } = fixture();
    const saved = createDefaultSettings();
    saved.audio.sfx = { volume: 23, muted: true };
    entries.set(primary, JSON.stringify(saved));
    const originalLoad = Module._load;
    Module._load = function (id, ...args) {
        return id === 'cc' ? { sys: { localStorage: storage } } : originalLoad.call(this, id, ...args);
    };
    let settings;
    try {
        settings = require(root + 'Model/App/Save/SettingsService.js').SettingsService;
    } finally {
        Module._load = originalLoad;
    }
    const { Sound } = require(root + 'Frame/Audio/Sound.js');
    const volumes = [0, 0, 0, 0];
    let flags = 0;
    const audio = {
        SetBusVolumePercent: (bus, value) => { volumes[bus] = value; },
        GetBusVolumePercent: bus => volumes[bus],
        SetMuteFlag: value => { flags = value; },
        GetMuteFlag: () => flags,
    };
    Sound.Configure(audio);
    try {
        settings.Initialize();
        assert.equal(volumes[2], 23);
        assert.equal(Sound.GetBusMute(2), true);
        const beforePreview = settings.CaptureAudio();
        Sound.SetBusVolumePercent(2, 60);
        Sound.SetBusMute(2, false);
        settings.Apply(beforePreview);
        assert.equal(volumes[2], 23);
        assert.equal(Sound.GetBusMute(2), true);
        assert.equal(JSON.parse(entries.get(primary)).audio.sfx.volume, 23);
        Sound.SetBusVolumePercent(2, 60);
        assert.equal(settings.SaveAudio(), true);
        settings.Initialize();
        assert.equal(volumes[2], 60);
    } finally {
        Sound.Reset(audio);
    }
});
