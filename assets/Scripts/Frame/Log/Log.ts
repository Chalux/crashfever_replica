import { ConsoleLogSink } from './ConsoleLogSink';
import { LogBus } from './LogBus';
import { LogChannel } from './LogChannel';
import type { LogEntry, LogOptions, LogSink } from './LogEntry';
import { LogLevel } from './LogLevel';

/** Unified game log entry point. Legacy Log.error(message, 'UI') stays valid. */
export class Log {
    /** Preserve legacy console verbosity. Broadcast always receives every level. */
    public static verbose = false;

    private static readonly _bus = Log._createBus();

    public static subscribe(channels: number, sink: LogSink): () => void {
        return Log._bus.subscribe(channels, sink);
    }

    public static write(level: LogLevel, message: string, options: LogOptions = {}): LogEntry {
        return Log._bus.publish(level, message, options);
    }

    public static debug(message: string, tagOrOptions: string | LogOptions = 'Frame'): void {
        Log._write(LogLevel.Debug, message, tagOrOptions);
    }

    public static info(message: string, tagOrOptions: string | LogOptions = 'Frame'): void {
        Log._write(LogLevel.Info, message, tagOrOptions);
    }

    public static warn(message: string, tagOrOptions: string | LogOptions = 'Frame'): void {
        Log._write(LogLevel.Warn, message, tagOrOptions);
    }

    public static error(message: string, tagOrOptions: string | LogOptions = 'Frame'): void {
        Log._write(LogLevel.Error, message, tagOrOptions);
    }

    private static _write(level: LogLevel, message: string, tagOrOptions: string | LogOptions): void {
        Log.write(level, message, typeof tagOrOptions === 'string' ? { tag: tagOrOptions } : tagOrOptions);
    }

    private static _createBus(): LogBus {
        const bus = new LogBus((error, entry) => ConsoleLogSink.reportFailure(error, entry));
        bus.subscribe(LogChannel.Console, entry => ConsoleLogSink.write(entry, Log.verbose));
        return bus;
    }
}
