import { Log } from '../Log/Log';
import type { BaseMask } from './Base/BaseMask';
import type { BaseWin } from './Base/BaseWin';
import type { IUILifecycleInvoker } from './Base/IUILifecycleInvoker';
import { EAnimType } from './Def/EAnimType';
import { EUIAnimState } from './Def/EUIAnimState';
import type { OpenTransitionData } from './Def/OpenTransitionData';
import { UIManager } from './UIManager';

/**
 * 动画目标：BaseWin / BaseMask 都实现 IUILifecycleInvoker 并带 animState。
 * 用交叉类型统一描述，避免这里再分别依赖两个基类的具体成员。
 */
type AnimTarget = IUILifecycleInvoker & { animState: EUIAnimState };

/** 把 unknown 异常转成日志文案（C# 里直接取 ex.Message）。 */
function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

/**
 * 一次动画的取消账本（移植自 UIAnimController.AnimationSlot）。
 *
 * 规则：callbacks 只能完成「当前这一轮」动画，且只能完成一次。
 * version 是唯一的权威：每次 Clear / Play 都会自增；异步回调醒来时比对
 * 自己启动时拿到的 version，不相等就说明这一轮已作废。
 */
class AnimationSlot {
    private cancel: (() => void) | null = null;
    private version = 0;

    public setCallback(callback: (() => void) | null): void {
        const version = this.clear();
        // Clear 过程中若被重入（回调里又启动了一轮），旧调用不能覆盖新回调。
        if (version === this.version) this.cancel = callback;
    }

    /** 作废当前动画并调用其取消句柄；返回作废后的版本号。 */
    public clear(): number {
        const version = ++this.version;
        const cancel = this.cancel;
        this.cancel = null;
        try {
            cancel?.();
        } catch (ex) {
            Log.error(`UI 动画取消失败：${errorMessage(ex)}`, 'UI');
        }
        return version;
    }

    /**
     * 播放一轮动画。
     *
     * @param play 注册动画并返回「取消句柄」；done 由动画实现回调（可能同步）。
     * @param onDone 本轮动画真正完成时调用。
     */
    public play(play: (done: () => void) => (() => void) | null, onDone: () => void): void {
        const version = this.clear();
        if (version !== this.version) return;

        let completed = false;
        const cancel = play(() => {
            if (version !== this.version || completed) return;
            completed = true;
            onDone();
        });

        if (version === this.version) {
            this.cancel = cancel ?? null;
        } else {
            // 同步完成回调可能启动了另一轮动画；旧取消句柄不能覆盖它，必须就地释放。
            try {
                cancel?.();
            } catch (ex) {
                Log.error(`UI 动画取消失败：${errorMessage(ex)}`, 'UI');
            }
        }
    }
}

/**
 * 集中管理 UI 与遮罩的动画状态及回调生命周期（移植自 UIAnimController.cs）。
 *
 * 把「取消上一轮动画 + 设置 AnimState + 调用业务动画 + 完成后推进状态机」
 * 收在一处，避免散落在各个状态处理器里出现「旧动画回调把新动画覆盖掉」的问题。
 */
export class UIAnimController {
    private readonly uiAnimation = new AnimationSlot();
    private readonly maskAnimation = new AnimationSlot();

    /** 注册 UI 动画清除回调（由界面在 OnOpenAnim 里返回的 cancel）。 */
    public setAnimCallback(callback: (() => void) | null): void {
        this.uiAnimation.setCallback(callback);
    }

    /** 注册 Mask 动画清除回调。 */
    public setMaskAnimCallback(callback: (() => void) | null): void {
        this.maskAnimation.setCallback(callback);
    }

    public clearAnim(): void {
        this.uiAnimation.clear();
    }

    public clearMaskAnim(): void {
        this.maskAnimation.clear();
    }

    /** 开始打开动画；返回时 AnimState 已复位为 None。 */
    public startOpenAnim(animType: EAnimType, transition: OpenTransitionData, win: BaseWin, onDone: () => void): void {
        // SkipReOpen 只在「重开」时跳过；首次打开仍然播放。
        if (animType === EAnimType.None || (animType === EAnimType.SkipReOpen && transition?.isReopen === true)) {
            this.clearAnim();
            (win as unknown as AnimTarget).animState = EUIAnimState.None;
            onDone();
            return;
        }

        const target = win as unknown as AnimTarget;
        this.uiAnimation.play((done) => {
            target.animState = EUIAnimState.Open;
            return target.invokeOpenAnim(done);
        }, () => {
            target.animState = EUIAnimState.None;
            target.invokeOpenAnimDone();
            onDone();
        });
    }

    /** 开始 Mask 打开动画。 */
    public startMaskOpenAnim(mask: BaseMask, onDone: () => void): void {
        const target = mask as unknown as AnimTarget;
        this.maskAnimation.play((done) => {
            target.animState = EUIAnimState.Open;
            return target.invokeMaskOpenAnim(done);
        }, () => {
            target.animState = EUIAnimState.None;
            target.invokeMaskOpenAnimDone();
            onDone();
        });
    }

    /** 开始关闭动画。 */
    public startCloseAnim(animType: EAnimType, win: BaseWin, onDone: () => void): void {
        if (animType === EAnimType.None) {
            this.clearAnim();
            (win as unknown as AnimTarget).animState = EUIAnimState.None;
            onDone();
            return;
        }

        const target = win as unknown as AnimTarget;
        this.uiAnimation.play((done) => {
            target.animState = EUIAnimState.Close;
            return target.invokeCloseAnim(done);
        }, () => {
            target.animState = EUIAnimState.None;
            onDone();
        });
    }

    /** 开始 Mask 关闭动画。 */
    public startMaskCloseAnim(mask: BaseMask, onCloseDone: () => void): void {
        const target = mask as unknown as AnimTarget;
        this.maskAnimation.play((done) => {
            target.animState = EUIAnimState.Close;
            return target.invokeMaskCloseAnim(done);
        }, () => {
            target.animState = EUIAnimState.None;
            // 顺序不能反：先让业务处理「遮罩已关闭」，再推进状态机（C# 版语义）。
            // 回调异常只记日志，不能阻断关闭流程。
            const maskId = (mask as unknown as { uiVo?: { id: string } | null }).uiVo?.id ?? 'Mask';
            UIManager.invokeCallback(() => target.invokeMaskClose(), maskId, '遮罩关闭回调');
            onCloseDone();
        });
    }
}
