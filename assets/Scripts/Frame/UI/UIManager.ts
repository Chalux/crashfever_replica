import { Node, UITransform, Widget, isValid } from 'cc';
import { Log } from '../Log/Log';
import { EventDispatcher } from '../Event/EventDispatcher';
import type { IStateHandler } from '../StateMachine/StateMachine';
import { DefaultUIOpenOpt } from './Def/DefaultUIOpenOpt';
import { EUILayer } from './Def/EUILayer';
import { EUIState } from './Def/EUIState';
import { EUIType } from './Def/EUIType';
import { toUiIdString, UiId } from './Def/UiId';
import { UIOpenOpt } from './Def/UIOpenOpt';
import { BaseWin } from './Base/BaseWin';
import type { IUIStateContext } from './IUIStateContext';
import type { IUiFacadeProvider } from './IUiFacadeProvider';
import { OpenRequest } from './OpenRequest';
import { UIStack } from './UIStack';
import { UILayer } from './UILayer';
import { UILayerManager } from './UILayerManager';
import { UIOpenCoordinator } from './UIOpenCoordinator';
import { UIRuntimeEntry } from './UIRuntimeEntry';
import { UIRuntimeRegistry } from './UIRuntimeRegistry';
import { UIVo } from './UIVo';
import { UIVoRegistry } from './UIVoRegistry';
import { UIManagerTicker } from './UIManagerTicker';
import { createDefaultStateHandlers } from './DefaultStateHandlers';

/** 管理器的初始化参数。组合根（启动流程）负责装配并调用一次 {@link UIManager.init}。 */
export interface UIManagerInitOptions {
    /** 普通层级的挂载根。框架会在其下建一层一个节点。 */
    root: Node;

    /** 顶层（Debug / Notice 之类永远压在最上面的层）的挂载根；缺省时自动建一个与 root 同级的全屏节点。 */
    topRoot?: Node | null;

    /** 普通层级，按「由下到上」的顺序排列。 */
    layers: readonly EUILayer[];

    /** 顶层层级，顺序同样由下到上，全部渲染在普通层级之上。 */
    topLayers?: readonly EUILayer[];

    /** 每个层级的默认打开参数（例如 Dlg 层统一加遮罩）。 */
    layerOpenOpts?: Partial<Record<EUILayer, UIOpenOpt>> | null;

    /** 路由表（界面 Id → prefab 路径 / 默认参数）。 */
    registry: UIRuntimeRegistry;

    /** 自定义状态处理器；缺省用框架自带的 7 个。 */
    stateHandlers?: readonly IStateHandler<EUIState, IUIStateContext>[] | null;

    /** 归属门面提供者：界面通过它拿「自己模块」的门面对象。 */
    facadeProvider?: IUiFacadeProvider | null;

    /** 已装配的模块 id 清单，用于启动期归属校验；传空则跳过该项校验。 */
    knownOwnerModIds?: readonly string[] | null;
}

/**
 * UI 管理器（门面）：对外只暴露「打开 / 关闭 / 查询」，内部委托给
 * UILayerManager（层级与可见性）、UIVoRegistry（界面实例池）、UIOpenCoordinator（串行打开队列）。
 *
 * 与 C# 版的差异：
 * - Godot 里管理器是 Node，靠 _Process 驱动；Cocos 里改由 {@link UIManagerTicker} 组件每帧回调 {@link tick}。
 * - Godot 的 `TaskCompletionSource` 换成 {@link OpenRequest}（一次性 promise）。
 * - 没有 CancellationTokenSource，取消语义由 UILoadContext 的 flag 承担。
 */
export class UIManager {
    private static _instance: UIManager | null = null;

    /** 全局唯一实例；未初始化时为 null，调用方必须判空。 */
    public static get instance(): UIManager | null {
        return UIManager._instance;
    }

    /** 框架内部广播的界面事件（打开完成 / 关闭完成）。 */
    public readonly eventDispatcher: EventDispatcher = new EventDispatcher();

    /** 导航栈：HideBelow 的全屏界面打开时入栈，Back 时出栈。 */
    public readonly navStack: UIStack = new UIStack();

    private readonly layerManager: UILayerManager = new UILayerManager();
    private _voRegistry: UIVoRegistry | null = null;
    private _coordinator: UIOpenCoordinator | null = null;
    private registry: UIRuntimeRegistry = new UIRuntimeRegistry();
    private facadeProvider: IUiFacadeProvider | null = null;

    private inited = false;
    private updatingLayers = false;
    /** 重入期间收到的「需要再算一轮」标记；外层跑完后补跑，避免丢掉那次状态变化。 */
    private updateLayersPending = false;
    private tickerNode: Node | null = null;

    public get isInited(): boolean {
        return this.inited;
    }

    /** 界面实例池；未初始化时抛错，避免调用方拿到 null 继续用。 */
    public get voRegistry(): UIVoRegistry {
        if (!this._voRegistry) throw new Error('UI 管理器尚未初始化');
        return this._voRegistry;
    }

    public get coordinator(): UIOpenCoordinator {
        if (!this._coordinator) throw new Error('UI 管理器尚未初始化');
        return this._coordinator;
    }

    public get layerManagerInternal(): UILayerManager {
        return this.layerManager;
    }

    /**
     * 初始化。重复调用只记日志（与 C# 版一致），不会重建内部组件。
     *
     * 注意：必须在场景树已经就绪之后调用——层节点会被挂到 root 下，
     * 且 ticker 也挂在这里，过早调用会导致本帧之后都没人推进队列。
     */
    public init(opt: UIManagerInitOptions): void {
        if (this.inited) {
            Log.error('UI 管理器已初始化，请勿重复初始化.', 'UI');
            return;
        }

        this.inited = true;
        UIManager._instance = this;

        this.registry = opt.registry;
        this.facadeProvider = opt.facadeProvider ?? null;

        const handlers = opt.stateHandlers ?? createDefaultStateHandlers();
        this._voRegistry = new UIVoRegistry(this, handlers);
        this._coordinator = new UIOpenCoordinator(this);

        const uiRoot = opt.root;
        const uiTopRoot = opt.topRoot ?? UIManager.createFullScreenRoot(uiRoot, 'UITopRoot');

        this.layerManager.init(uiRoot, uiTopRoot, opt.layers, opt.topLayers ?? [], opt.layerOpenOpts ?? null);

        // 顶层容器的层级必须在普通层之后：Cocos 同父节点按 siblingIndex 决定渲染与命中顺序。
        // 若 topRoot 先于 Layer-Win/Layer-Dlg 建出来，它会排在 index 0，顶层层反而被普通层盖住。
        if (uiTopRoot.parent === uiRoot) {
            uiTopRoot.setSiblingIndex(uiRoot.children.length - 1);
        }

        this.ensureTicker(uiRoot);

        // 归属校验需要组合根的已装配模块清单（OwnerModId 必须能在其中找到）。
        this.registry.validate(opt.knownOwnerModIds ?? undefined);
    }

    /** 释放管理器：停 ticker、清空静态单例。界面节点由场景卸载负责，不在这里逐个销毁。 */
    public dispose(): void {
        if (this.tickerNode && isValid(this.tickerNode)) {
            this.tickerNode.destroy();
        }
        this.tickerNode = null;
        this._voRegistry = null;
        this._coordinator = null;
        this.inited = false;
        if (UIManager._instance === this) UIManager._instance = null;
    }

    /** 每帧由 {@link UIManagerTicker} 调用：推进超时与缓存回收。 */
    public tick(dt: number): void {
        if (!this.inited || !this._coordinator || !this._voRegistry) return;
        this._coordinator.checkLoadTimeout();
        this._voRegistry.tick(dt);
    }

    // #region 打开

    /**
     * 打开界面。
     *
     * 返回值在「界面真正打开」时解析为 VO；被后来的请求取代、路由缺失、层级解析失败、
     * SkipOpenCheck 拦截时为 null。调用方必须判空——不要假设「注册过就一定能打开」。
     */
    public open<T = unknown>(idOrUiId: string | UiId<T>, payload: T | null = null, openOpt: UIOpenOpt | null = null): Promise<UIVo | null> {
        const id = toUiIdString(idOrUiId as string | UiId<unknown>);
        const request = new OpenRequest();

        // 未初始化时 registry 是空表：宁可返回失败 + 明确日志，也不要后面某处空引用。
        if (!this.inited) {
            Log.error(`UI 管理器: 尚未初始化，无法打开UI<${id}>。`, 'UI');
            UIManager.invokeCallback(openOpt?.onFail ?? null, id, '打开失败回调');
            request.resolve(null);
            return request.promise;
        }

        const entry = this.registry.get(id);
        if (!entry) {
            Log.error(`UI 管理器: 打开UI<${id}> 失败, 路由未注册`, 'UI');
            UIManager.invokeOpenFail(null, null, openOpt, id);
            request.resolve(null);
            return request.promise;
        }

        const resolved = this.resolveLayer(entry, openOpt);
        if (resolved.failReason) {
            Log.error(resolved.failReason, 'UI');
            UIManager.invokeOpenFail(entry, resolved.layer, openOpt, id);
            request.resolve(null);
            return request.promise;
        }

        const finalOpt = UIManager.mergeOpenOpt(entry, resolved.layer, openOpt);

        if (finalOpt.skipOpenCheck?.(payload) === true) {
            UIManager.invokeCallback(finalOpt.onFail ?? null, id, '打开失败回调');
            request.resolve(null);
            return request.promise;
        }

        const vo = this._voRegistry.getOrCreate(id, entry.type, entry.ownerModId, payload);

        // 被后续请求取代不等于成功打开：先以 null 收尾旧请求，再登记新请求。
        vo.completeOpen(null);
        vo.load.beginRequest();
        vo.anim.clearAnim();
        vo.anim.clearMaskAnim();

        // 必须写回：状态处理器（挂载 / 遮罩 / 动画 / 缓存 / 回调）统一读 vo.openOpt，
        // 不写回会丢掉 merge 结果，整个打开参数体系失效，且 await 永不返回。
        vo.openOpt = finalOpt;
        vo.payload = payload;
        vo.openTaskSource = request;

        const userOnOpen = finalOpt.onOpen;
        const userOnFail = finalOpt.onFail;
        finalOpt.onOpen = (opened) => {
            finalOpt.onOpen = null;
            finalOpt.onFail = null;
            vo.completeOpen(vo, request);
            UIManager.invokeCallback(userOnOpen ? () => userOnOpen(opened) : null, id, '打开成功回调');
        };
        finalOpt.onFail = () => {
            finalOpt.onOpen = null;
            finalOpt.onFail = null;
            vo.completeOpen(null, request);
            UIManager.invokeCallback(userOnFail, id, '打开失败回调');
        };

        // Pge / Pop 由调用方指定父节点，属于「立即挂载」的局部界面，不进串行队列。
        if (entry.type === EUIType.Pge || entry.type === EUIType.Pop) {
            vo.stateMachine.transitionTo(EUIState.Load, vo);
            return request.promise;
        }

        this._coordinator.enqueueOpen(vo);
        return request.promise;
    }

    /**
     * 打开子页面：沿路由的 ParentId 链向上找到「最外层父界面」，
     * 一次性打开父界面并把子界面 Id 塞进它的载荷（{ pgeId }）。
     */
    public openChildAsync<T = unknown>(childId: string, payload: T | null = null, openOpt: UIOpenOpt | null = null): Promise<UIVo | null> {
        if (!this.inited) {
            Log.error(`UI 管理器: 尚未初始化，无法打开子UI<${childId}>。`, 'UI');
            return Promise.resolve(null);
        }

        const parent = this.registry.getParentId(childId);
        if (parent === null) {
            Log.error(`UI 管理器: 打开子UI<${childId}> 失败，无父路由。回退为普通 open`, 'UI');
            return this.open(childId, payload, openOpt);
        }

        const visited = new Set<string>();
        let cur = childId;
        let voForCur: unknown = payload ?? {};
        // 不要把 DefaultUIOpenOpt.value 当成「调用方参数」传下去：它是全字段有值的基线，
        // mergeFrom 会把它逐字段压到父界面已注册的参数上（例如把 Win 的 layer 改回 Dlg）。
        const optForRoot = openOpt;

        while (true) {
            if (visited.has(cur)) {
                Log.error(`UI 管理器: 路由存在环，终止于：<${childId}> 。`, 'UI');
                return Promise.resolve(null);
            }
            visited.add(cur);

            const curMeta = this.registry.get(cur)?.routeMeta ?? null;
            const curParent = this.registry.getParentId(cur);
            if (curParent === null) {
                return this.open(cur, voForCur, optForRoot);
            }

            // 必须复制：ParentOpenPayload 是启动期注册的共享实例，就地写 pgeId 会污染同路由的后续打开；
            // 非字典载荷原样透传（不能替换成空字典，否则父界面拿不到载荷）。
            const sharedPayload = curMeta?.parentOpenPayload;
            if (sharedPayload !== null && sharedPayload !== undefined
                && typeof sharedPayload === 'object' && !Array.isArray(sharedPayload)) {
                // 无条件写 pgeId：这是「打开父界面并翻到子页」的唯一传参通道，
                // 只在字典里已有同名键时才写，会让没预置该键的父界面永远停在默认页。
                voForCur = { ...(sharedPayload as Record<string, unknown>), pgeId: cur };
            } else if (sharedPayload !== null && sharedPayload !== undefined) {
                voForCur = sharedPayload;
            }

            const grand = this.registry.getParentId(curParent);
            if (grand === null) {
                // 必须 clone：DefaultUIOpenOpt.value 是共享实例，直接当合并目标会跨次打开污染全局默认值。
                const finalOpt = curMeta?.parentOpenOpt?.clone() ?? DefaultUIOpenOpt.value.clone();
                finalOpt.mergeFrom(optForRoot);
                return this.open(curParent, voForCur, finalOpt);
            }

            cur = curParent;
        }
    }

    // #endregion

    // #region 关闭

    public close(id: string): void {
        if (!this.inited) return;

        const vo = this._voRegistry.get(id);
        if (!vo) return;

        this._coordinator.resetCurrentOpening(vo);
        this._coordinator.removeFromQueue(vo);

        vo.completeOpen(null);
        vo.load.cancel();

        // isClose 覆盖 Close/CloseDone/Cache/Destroy：对缓存态界面再 Close 是幂等的，
        // 不会把已经离树的节点拖进关闭动画（审阅 H3 的结论）。
        if (!vo.isClose) {
            vo.stateMachine.transitionTo(EUIState.Close, vo);
        }

        this._coordinator.openNext();
    }

    public closeAllPop(): void {
        // 快照：Close → Destroy 会同步从实例池删除条目，直接遍历会漏项或读到半销毁状态。
        for (const vo of this.snapshotOpenVos()) {
            if (vo.type === EUIType.Pop) this.close(vo.id);
        }
    }

    public closeAllByType(type: EUIType): void {
        for (const vo of this.snapshotOpenVos()) {
            if (vo.type === type) this.close(vo.id);
        }
    }

    /** 关闭除白名单外的全部界面；位于顶层层级（如 Debug / Notice）的界面默认保留。 */
    public closeAllExclude(excludeIds: readonly string[] = []): void {
        const excludes = new Set(excludeIds);
        for (const vo of this.snapshotOpenVos()) {
            if (vo.runtime.layer?.isTop === true) continue;
            if (excludes.has(vo.id)) continue;
            this.close(vo.id);
        }
    }

    /** 关闭某个模块的全部界面；destroy=true 时连缓存实例一起销毁。 */
    public closeByOwner(ownerModId: string, destroy: boolean = false): void {
        for (const vo of this.snapshotVosByOwner(ownerModId)) {
            // Cache 的界面已经离树、Destroy 的界面正在销毁，都不该再走关闭流程。
            if (vo.stateMachine.currentState === EUIState.Cache || vo.stateMachine.currentState === EUIState.Destroy) continue;
            if (destroy) vo.openOpt.cacheTime = 0;
            this.close(vo.id);
        }
    }

    /**
     * 注销某个模块的全部界面（连 VO 一起移除），用于模块卸载。
     * 订阅解绑由各节点离场时的 BindingScope 负责，这里不额外清理。
     */
    public unregisterOwner(ownerModId: string): void {
        if (!ownerModId) throw new Error('ownerModId 不能为空');

        const vos = this.snapshotVosByOwner(ownerModId);
        // 先删声明与所有调度项：清理回调不能重新排入这个 owner。
        this.registry.unregisterOwner(ownerModId);
        for (const vo of vos) {
            this._coordinator.resetCurrentOpening(vo);
            this._coordinator.removeFromQueue(vo);
        }

        try {
            for (const vo of vos) {
                vo.completeOpen(null);
                if (vo.isOpen) {
                    vo.openOpt.cacheTime = 0;
                    vo.load.cancel();
                    vo.stateMachine.transitionTo(EUIState.Close, vo);
                } else if (vo.stateMachine.currentState !== EUIState.Destroy) {
                    vo.stateMachine.transitionTo(EUIState.Destroy, vo);
                }
            }
        } finally {
            this._coordinator.openNext();
        }
    }

    /** 返回上一级：关闭当前界面，恢复导航栈里的上一层。栈不足两层时返回 null。 */
    public async back(): Promise<UIVo | null> {
        if (this.navStack.count < 2) return null;

        const currentId = this.navStack.top;
        const prevId = this.navStack.back();

        if (currentId) this.close(currentId);

        const existing = prevId ? this._voRegistry.get(prevId) : null;
        if (existing && existing.isOpen) return existing;

        if (prevId === null) return null;
        if (!this.registry.get(prevId)) return null;

        return this.open(prevId, null, null);
    }

    // #endregion

    // #region 查询

    public getUIVo(id: string): UIVo | null {
        return this._voRegistry?.get(id) ?? null;
    }

    public getWin(id: string): BaseWin | null {
        const vo = this._voRegistry?.get(id) ?? null;
        return vo && vo.isOpen ? vo.runtime.ui : null;
    }

    public getWinAs<T extends BaseWin>(id: string): T | null {
        const vo = this._voRegistry?.get(id) ?? null;
        return vo && vo.isOpen ? (vo.runtime.ui as T | null) : null;
    }

    public getLayer(layer: EUILayer): UILayer | null {
        return this.layerManager.getLayer(layer);
    }

    public isUITop(id: string): boolean {
        const vo = this._voRegistry?.get(id) ?? null;
        if (!vo || !vo.runtime.layer) return false;

        const allLayers = this.layerManager.getAllLayers();
        const layerIdx = allLayers.indexOf(vo.runtime.layer.type);
        if (layerIdx < 0 || !vo.isOpen) return false;

        // 更高层只要还有一个「会遮挡」的界面，就不是顶。
        for (let i = layerIdx + 1; i < allLayers.length; i++) {
            const layer = this.layerManager.getLayer(allLayers[i]);
            if (layer && layer.uiSort.some((ui) => ui.uiVo?.openOpt?.effectiveNoCover !== true)) return false;
        }

        const layerUis = vo.runtime.layer.uiSort.filter((ui) => ui.uiVo?.openOpt?.effectiveNoCover !== true);
        return layerUis.length > 0 && UIManager.idOf(layerUis[layerUis.length - 1]) === id;
    }

    /** 界面 prefab 的 resources 相对路径；未注册时返回空串。 */
    public getPath(id: string): string {
        return this.registry.get(id)?.prefabPath ?? '';
    }

    /** 由 ownerModId 解析该模块的门面；未注入 provider 时返回 null。 */
    public resolveUiFacade(ownerModId: string): unknown | null {
        return this.facadeProvider?.resolveUiFacade(ownerModId) ?? null;
    }

    // #endregion

    // #region 内部方法

    /** 让协调器推进到队列里的下一个界面（UIVo.openNext 与状态处理器的 finally 都走这里）。 */
    public openNext(): void {
        this._coordinator?.openNext();
    }

    /**
     * 立即重算层级可见性。
     *
     * 必须同步：打开/关闭动画结束、销毁、重新挂载等调用点都要「本轮内」看到最终可见性，
     * 否则同一次 open 的后续逻辑（isUITop、下一次打开、业务在 await 之后读 active）会读到过期状态。
     * 重入时直接返回——当前这一轮会基于最新状态重算，不需要嵌套执行。
     */
    public updateLayers(): void {
        if (this.updatingLayers) {
            // 嵌套调用（典型来源：hideBool.onChange → invokeLayerVisibleUpdate → 业务又改了显隐）
            // 不能直接丢弃：外层那轮用的是调用前的快照，新挂载/新隐藏的界面不在里面。
            // 记一笔，等外层跑完再补跑一轮，保证最终状态与最后一次调用一致。
            this.updateLayersPending = true;
            return;
        }

        this.updatingLayers = true;
        try {
            let rounds = 0;
            do {
                this.updateLayersPending = false;
                this.layerManager.updateLayers();
                rounds++;
            } while (this.updateLayersPending && rounds < 3);
        } finally {
            this.updatingLayers = false;
        }
    }

    /** 统一的回调保护：业务回调抛异常只记日志，不能把框架状态机带崩。 */
    public static invokeCallback(action: (() => void) | null, id: string, stage: string): void {
        if (!action) return;
        try {
            action();
        } catch (ex) {
            Log.error(`UI<${id}> ${stage}失败：${String(ex)}`, 'UI');
        }
    }

    /**
     * 早期失败（路由查不到 / 层级解析失败）也要回调「合并后」的 onFail：
     * 调用点那份只是 merge 的一层，注册表与层级的默认值同样可能声明了失败处理。
     */
    private static invokeOpenFail(entry: UIRuntimeEntry | null, layer: UILayer | null, openOpt: UIOpenOpt | null, id: string): void {
        const merged = entry ? UIManager.mergeOpenOpt(entry, layer, openOpt) : (openOpt ?? DefaultUIOpenOpt.value);
        UIManager.invokeCallback(merged.onFail ?? null, id, '打开失败回调');
    }

    private static mergeOpenOpt(entry: UIRuntimeEntry, layer: UILayer | null, openOpt: UIOpenOpt | null): UIOpenOpt {
        // 顺序即优先级：全局默认 < 注册表基类默认 < 层级默认 < 注册表条目 < 调用点。
        const result = DefaultUIOpenOpt.value.clone();
        result.mergeFrom(entry.baseOpenOpt);
        result.mergeFrom(layer?.openOpt ?? null);
        result.mergeFrom(entry.openOpt);
        result.mergeFrom(openOpt);
        if (layer) result.layer = layer.type;
        return result;
    }

    private resolveLayer(entry: UIRuntimeEntry, openOpt: UIOpenOpt | null): { layer: UILayer | null; failReason: string | null } {
        switch (entry.type) {
            case EUIType.Win:
            case EUIType.Dlg: {
                const layerId = openOpt?.layer ?? entry.openOpt?.layer ?? entry.baseOpenOpt?.layer ?? DefaultUIOpenOpt.value.layer ?? EUILayer.Dlg;
                const layer = this.layerManager.getLayer(layerId);
                if (!layer) return { layer: null, failReason: `UI 管理器: 打开UI<${entry.id}> 失败，层级<${layerId}> 不存在。` };
                return { layer, failReason: null };
            }
            case EUIType.Pge:
                // Pge 由父界面自己挂载，不需要层级；缺 Parent 时无法打开。
                if (openOpt?.parent == null) return { layer: null, failReason: `UI 管理器: 打开UI<${entry.id}> 失败，父UI不存在。` };
                return { layer: null, failReason: null };
            case EUIType.Pop: {
                if (openOpt?.pop?.target == null) {
                    return { layer: null, failReason: `UI 管理器: 打开UI<${entry.id}> 失败，气泡参数Target不存在。` };
                }
                const layerId = openOpt.layer ?? entry.openOpt?.layer ?? entry.baseOpenOpt?.layer ?? null;
                if (layerId !== null) return { layer: this.layerManager.getLayer(layerId), failReason: null };
                return { layer: UILayerManager.findLayerForNode(openOpt.pop.target) ?? this.layerManager.getLayer(EUILayer.Pop), failReason: null };
            }
            default:
                return { layer: null, failReason: `UI 管理器: 打开UI<${entry.id}> 失败，类型<${entry.type}> 不支持打开。` };
        }
    }

    private snapshotOpenVos(): UIVo[] {
        return this._voRegistry.snapshot().filter((vo) => vo.isOpen);
    }

    private snapshotVosByOwner(ownerModId: string): UIVo[] {
        return this._voRegistry.snapshot().filter((vo) => vo.ownerModId === ownerModId);
    }

    /** 界面标识统一取 UIVo.id；未绑定 VO 时才退回 BaseUI.uiId。 */
    private static idOf(ui: BaseWin): string {
        return ui.uiVo?.id ?? ui.uiId;
    }

    private ensureTicker(root: Node): void {
        const node = new Node('UIManagerTicker');
        const ticker = node.addComponent(UIManagerTicker);
        ticker.manager = this;
        node.parent = root;
        this.tickerNode = node;
    }

    private static createFullScreenRoot(parent: Node, name: string): Node {
        const node = new Node(name);
        node.parent = parent;
        node.layer = parent.layer;

        const transform = node.addComponent(UITransform);
        transform.setContentSize(0, 0);

        // Cocos 没有 Godot 的 FullRect 预设，用四边对齐的 Widget 达到同样效果。
        const widget = node.addComponent(Widget);
        widget.isAlignTop = true;
        widget.isAlignBottom = true;
        widget.isAlignLeft = true;
        widget.isAlignRight = true;
        widget.top = 0;
        widget.bottom = 0;
        widget.left = 0;
        widget.right = 0;
        widget.alignMode = Widget.AlignMode.ALWAYS;

        return node;
    }

    // #endregion
}
