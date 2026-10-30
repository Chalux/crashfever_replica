import { Singleton } from "../../../Utils/Singleton";

export enum RecoveryState {
    none,
    available,
    incompatible
}

export interface IRecoveryCheckResult {
    state: RecoveryState;
}

export interface IRecoveryService {
    check(): Promise<IRecoveryCheckResult>;
    discard(): Promise<void>;
}

export class RecoveryService extends Singleton implements IRecoveryService {
    async check(): Promise<IRecoveryCheckResult> {
        return { state: RecoveryState.none };
    }

    async discard(): Promise<void> {
        // 当前没有正式恢复存储，正常流程不会走到这里。
        // 真正接入存档后，这里必须等清除成功后再 resolve，失败直接抛错。
        throw new Error('没有可放弃的恢复记录');
    }
}