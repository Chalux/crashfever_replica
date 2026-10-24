import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { Log, LogBus, LogChannel, LogLevel } = require('../../.logtest-out/assets/Scripts/Frame/Log/index.js');
const consoleChannel = LogChannel.Console;
const futureChannel = 1 << 1;

test('routes combined masks once per subscription and supports unsubscribe', () => {
    const bus = new LogBus();
    const received = [];
    const remove = bus.subscribe(consoleChannel | futureChannel, entry => { received.push(entry); });
    bus.publish(LogLevel.Info, 'both', { channels: consoleChannel | futureChannel });
    bus.publish(LogLevel.Info, 'unmatched', { channels: 1 << 2 });
    bus.publish(LogLevel.Info, 'none', { channels: LogChannel.None });
    assert.equal(received.length, 1);
    remove();
    remove();
    bus.publish(LogLevel.Info, 'removed');
    assert.equal(received.length, 1);
});

test('shares immutable envelopes while preserving original error data', () => {
    const bus = new LogBus();
    const received = [];
    bus.subscribe(consoleChannel, entry => { received.push(entry); });
    bus.subscribe(consoleChannel, entry => { received.push(entry); });
    const error = new Error('original');
    const entry = bus.publish(LogLevel.Error, 'failed', { tag: 'UI', data: error });
    assert.equal(received[0], entry);
    assert.equal(received[1], entry);
    assert.ok(Object.isFrozen(entry));
    assert.equal(entry.data, error);
    assert.equal(entry.tag, 'UI');
    assert.ok(entry.timestamp > 0);
    assert.equal(bus.publish(LogLevel.Info, 'next').sequence, entry.sequence + 1);
});

test('subscription changes apply to the next record', () => {
    const bus = new LogBus();
    const received = [];
    let added = false;
    let remove;
    bus.subscribe(consoleChannel, () => {
        if (!added) {
            added = true;
            remove();
            bus.subscribe(consoleChannel, entry => { received.push(`new:${entry.message}`); });
        }
    });
    remove = bus.subscribe(consoleChannel, entry => { received.push(`old:${entry.message}`); });
    bus.publish(LogLevel.Info, 'first');
    bus.publish(LogLevel.Info, 'second');
    assert.deepEqual(received, ['old:first', 'new:second']);
});

test('isolates synchronous failures, rejected promises and diagnostic failures', async () => {
    const errors = [];
    const bus = new LogBus((error, entry) => {
        errors.push([error.message, entry.message]);
        throw new Error('diagnostic failed');
    });
    bus.subscribe(consoleChannel, () => { throw new Error('sync'); });
    bus.subscribe(consoleChannel, async () => { throw new Error('async'); });
    let delivered = false;
    bus.subscribe(consoleChannel, () => { delivered = true; });
    bus.publish(LogLevel.Warn, 'test');
    assert.ok(delivered);
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(errors, [['sync', 'test'], ['async', 'test']]);
});

test('queues nested logs in order and prevents synchronous sink feedback loops', () => {
    const bus = new LogBus();
    const received = [];
    bus.subscribe(consoleChannel, () => { bus.publish(LogLevel.Info, 'from A'); });
    bus.subscribe(consoleChannel, () => { bus.publish(LogLevel.Info, 'from B'); });
    bus.subscribe(consoleChannel, entry => { received.push(entry.message); });
    bus.publish(LogLevel.Info, 'root');
    assert.deepEqual(received, ['root', 'from A', 'from B', 'from B', 'from A']);
});

test('rejects invalid channel masks and empty subscriptions', () => {
    const bus = new LogBus();
    for (const channels of [-1, 0.5, NaN, 0x80000000]) {
        assert.throws(() => bus.publish(LogLevel.Info, 'bad', { channels }), RangeError);
        assert.throws(() => bus.subscribe(channels, () => {}), RangeError);
    }
    assert.throws(() => bus.subscribe(LogChannel.None, () => {}));
});

test('console adapter preserves legacy calls, severity and original error objects', () => {
    const calls = [];
    const methods = ['log', 'debug', 'warn', 'error'];
    const originals = methods.map(method => console[method]);
    const previousVerbose = Log.verbose;
    const received = [];
    const remove = Log.subscribe(consoleChannel, entry => { received.push(entry); });
    try {
        methods.forEach(method => { console[method] = (...args) => calls.push([method, ...args]); });
        Log.verbose = false;
        Log.info('hidden', 'UI');
        assert.equal(calls.length, 0);
        assert.equal(received.length, 1);
        Log.verbose = true;
        Log.info('ready', 'UI');
        Log.debug('detail');
        Log.warn('warning');
        const error = new Error('original');
        Log.error('failed', { tag: 'Battle', data: error });
        assert.deepEqual(calls, [
            ['log', '[UI] ready'], ['debug', '[Frame] detail'],
            ['warn', '[Frame] warning'], ['error', '[Battle] failed', error],
        ]);
    } finally {
        remove();
        Log.verbose = previousVerbose;
        methods.forEach((method, index) => { console[method] = originals[index]; });
    }
});
