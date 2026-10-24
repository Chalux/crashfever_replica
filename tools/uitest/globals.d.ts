/**
 * 冒烟驱动需要的 Node.js 全局声明。
 *
 * 目标工程没有安装 @types/node（Cocos 工程通常也不需要），为了不引入额外依赖，
 * 这里只声明驱动真正用到的几个入口。
 */
declare const console: {
    log(...args: unknown[]): void;
    error(...args: unknown[]): void;
};

declare const process: {
    exit(code?: number): void;
};

declare function setTimeout(callback: () => void, ms?: number): unknown;
declare function queueMicrotask(callback: () => void): void;
