import { EAnimType } from './EAnimType';
import { EUIAlign } from './EUIAlign';
import { EUILayer } from './EUILayer';
import { EUIType } from './EUIType';
import { UIOpenOpt } from './UIOpenOpt';

/** 默认打开参数。 */
export class DefaultUIOpenOpt {
    /**
     * 合并基线：字段全部显式指定，保证任何合并结果都是具体值。
     * mergeFrom 只覆盖显式设置的字段，因此基线必须完整。
     *
     * 只读使用：需要修改时请 clone()，不要直接改这个实例。
     */
    public static readonly value: UIOpenOpt = DefaultUIOpenOpt.createBaseline();

    /**
     * 按界面类型给出各 Base* 基类与 UIRegistration 工厂的默认打开参数。
     * 只设置与基线不同的字段：未设置的字段保持 undefined（「未指定」），合并时不会覆盖下层来源。
     */
    public static forType(type: EUIType): UIOpenOpt {
        const opt = new UIOpenOpt();
        switch (type) {
            case EUIType.Win:
                opt.layer = EUILayer.Win;
                opt.align = EUIAlign.Full;
                opt.hideBelow = true;
                break;
            case EUIType.Dlg:
                opt.layer = EUILayer.Dlg;
                break;
            case EUIType.Pge:
                // 页面靠 Parent 挂载，不固定层级。
                opt.align = EUIAlign.Full;
                break;
            case EUIType.Pop:
                opt.layer = EUILayer.Pop;
                opt.align = EUIAlign.None;
                break;
            default:
                break;
        }
        return opt;
    }

    private static createBaseline(): UIOpenOpt {
        const opt = new UIOpenOpt();
        opt.layer = EUILayer.Dlg;
        opt.cacheTime = UIOpenOpt.DefaultCacheTime;
        opt.animType = EAnimType.SkipReOpen;
        opt.hideBelow = false;
        opt.noCover = false;
        opt.align = EUIAlign.Center;
        return opt;
    }
}
