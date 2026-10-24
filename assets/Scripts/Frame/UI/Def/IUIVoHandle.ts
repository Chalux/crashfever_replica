import { EUIType } from './EUIType';
import { UIOpenOpt } from './UIOpenOpt';

/**
 * UIVo 对外暴露的最小接口，避免 Def 与 UI 运行时循环引用。
 *
 * 回调里拿到它就能读到 id / 类型 / 载荷 / 打开参数，但改不了生命周期。
 */
export interface IUIVoHandle {
    readonly id: string;
    readonly type: EUIType;
    readonly payload: unknown;
    readonly openOpt: UIOpenOpt;
}
