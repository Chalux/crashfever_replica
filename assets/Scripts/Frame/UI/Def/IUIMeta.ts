import { EUIType } from './EUIType';

/** 界面元信息：由 BaseUI 实现，框架用它做路径推导与类型校验。 */
export interface IUIMeta {
    readonly uiId: string;
    readonly uiDir: string;
    readonly uiType: EUIType;
}
