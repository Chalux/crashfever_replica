import type { LogEntry } from './LogEntry';
import { LogLevel } from './LogLevel';

/** The only game-code adapter allowed to call console directly. */
export class ConsoleLogSink {
    public static write(entry: LogEntry, verbose: boolean): void {
        if (!verbose && (entry.level === LogLevel.Info || entry.level === LogLevel.Debug)) return;
        const message = `[${entry.tag}] ${entry.message}`;
        const args: unknown[] = entry.data === undefined ? [message] : [message, entry.data];
        switch (entry.level) {
            case LogLevel.Debug:
                console.debug(...args);
                break;
            case LogLevel.Info:
                console.log(...args);
                break;
            case LogLevel.Warn:
                console.warn(...args);
                break;
            case LogLevel.Error:
                console.error(...args);
                break;
        }
    }

    /** Direct fallback; never feed adapter errors back into the failed adapter. */
    public static reportFailure(error: unknown, entry: LogEntry): void {
        console.error(`[Log] 输出日志 #${entry.sequence} 失败 [${entry.tag}] ${entry.message}`, error);
    }
}
