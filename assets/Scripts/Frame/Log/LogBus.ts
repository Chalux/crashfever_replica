import { LogChannel } from './LogChannel';
import type { LogEntry, LogOptions, LogSink, LogSinkErrorHandler } from './LogEntry';
import { LogLevel } from './LogLevel';

interface LogSubscription {
    readonly channels: number;
    readonly sink: LogSink;
}

interface PendingLog {
    readonly entry: LogEntry;
    readonly excludedSinkIds: ReadonlySet<number>;
}

/** Engine-independent, synchronous FIFO broadcast with isolated output adapters. */
export class LogBus {
    private readonly _subscriptions = new Map<number, LogSubscription>();
    private readonly _pending: PendingLog[] = [];
    private _nextSinkId = 1;
    private _sequence = 0;
    private _dispatching = false;
    private _activeSinkId: number | null = null;
    private _excludedSinkIds: ReadonlySet<number> = new Set<number>();

    constructor(private readonly _onSinkError?: LogSinkErrorHandler) {
    }

    /** One call per subscription, even if several destination bits match. */
    public subscribe(channels: number, sink: LogSink): () => void {
        LogBus._validateMask(channels);
        if (channels === LogChannel.None) throw new Error('Log subscription must select a channel');
        if (typeof sink !== 'function') throw new TypeError('Log sink must be a function');

        const id = this._nextSinkId++;
        this._subscriptions.set(id, { channels, sink });
        return () => {
            this._subscriptions.delete(id);
        };
    }

    public publish(level: LogLevel, message: string, options: LogOptions = {}): LogEntry {
        const channels = options.channels ?? LogChannel.Console;
        LogBus._validateMask(channels);
        if (!Object.values(LogLevel).includes(level)) throw new Error(`Unknown log level: ${level}`);

        const entry: LogEntry = Object.freeze({
            sequence: ++this._sequence,
            timestamp: Date.now(),
            level,
            message,
            tag: options.tag ?? 'Frame',
            channels,
            data: options.data,
        });

        if (channels === LogChannel.None) return entry;

        // Queue logs emitted inside a sink, excluding the originating chain.
        const excludedSinkIds = new Set(this._excludedSinkIds);
        if (this._activeSinkId !== null) excludedSinkIds.add(this._activeSinkId);
        this._pending.push({ entry, excludedSinkIds });
        this._drain();
        return entry;
    }

    private _drain(): void {
        if (this._dispatching) return;
        this._dispatching = true;
        try {
            while (this._pending.length > 0) {
                const pending = this._pending.shift()!;
                this._excludedSinkIds = pending.excludedSinkIds;
                // Changes during dispatch take effect on the next entry.
                const subscriptions = Array.from(this._subscriptions.entries());
                for (const [id, subscription] of subscriptions) {
                    if (pending.excludedSinkIds.has(id)
                        || (subscription.channels & pending.entry.channels) === 0) continue;

                    this._activeSinkId = id;
                    try {
                        const result = subscription.sink(pending.entry);
                        if (result) {
                            void Promise.resolve(result).catch(error => {
                                this._reportSinkError(error, pending.entry);
                            });
                        }
                    } catch (error) {
                        this._reportSinkError(error, pending.entry);
                    } finally {
                        this._activeSinkId = null;
                    }
                }
            }
        } finally {
            this._activeSinkId = null;
            this._excludedSinkIds = new Set<number>();
            this._dispatching = false;
        }
    }

    private _reportSinkError(error: unknown, entry: LogEntry): void {
        try {
            this._onSinkError?.(error, entry);
        } catch {
            // A broken diagnostic output must not break gameplay or other sinks.
        }
    }

    private static _validateMask(channels: number): void {
        if (!Number.isInteger(channels) || channels < 0 || channels > 0x7fffffff) {
            throw new RangeError('Log channel mask must be a non-negative 31-bit integer');
        }
    }
}
