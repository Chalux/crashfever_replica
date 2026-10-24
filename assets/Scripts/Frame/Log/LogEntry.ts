import type { LogLevel } from './LogLevel';

export interface LogOptions {
    /** Destination mask. Defaults to LogChannel.Console. */
    readonly channels?: number;
    /** Module/category label, independent of output channels. */
    readonly tag?: string;
    /** Optional original Error or structured context. Not converted to a string. */
    readonly data?: unknown;
}

export interface LogEntry {
    readonly sequence: number;
    /** Unix timestamp in milliseconds. */
    readonly timestamp: number;
    readonly level: LogLevel;
    readonly message: string;
    readonly tag: string;
    readonly channels: number;
    /** The entry is shallow-frozen; data remains owned by the caller. */
    readonly data?: unknown;
}

export type LogSink = (entry: LogEntry) => void | Promise<void>;
export type LogSinkErrorHandler = (error: unknown, entry: LogEntry) => void;
