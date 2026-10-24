import { EUIType } from './EUIType';
import { UIOpenOpt } from './UIOpenOpt';

/** 载荷读取接口：界面侧只关心「我是谁、我拿到了什么参数」。 */
export interface IUIPayloadHandle {
    readonly id: string;
    readonly type: EUIType;
    readonly payload: unknown;
    readonly openOpt: UIOpenOpt;
}
