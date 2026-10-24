/**
 * 按归属解析功能模块暴露给「自家界面」的门面。
 *
 * 之所以做成「提供者」而不是让功能模块实例直接暴露：有些模块是会话级对象
 * （每次开局重建），而界面注册只在启动期发生一次——只有动态解析才能让界面
 * 每次都拿到当前会话的门面。
 */
export interface IUiFacadeProvider {
    /**
     * 解析指定功能模块的门面。
     *
     * @param ownerModId 功能模块 id（来自 UIVo.ownerModId）。
     * @returns 门面实例；无此功能或无门面时返回 null。
     */
    resolveUiFacade(ownerModId: string): unknown | null;
}
