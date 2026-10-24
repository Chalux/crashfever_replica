/**
 * UI 框架冒烟驱动（在 Node.js 里用 cc-stub 跑真实状态机）。
 *
 * 覆盖最容易出移植事故的几条路径：打开 → HideBelow 遮挡 → Back 返回 →
 * 关闭销毁 → 缓存重开 → 缓存到期销毁 → 遮罩挂载顺序 → 资源缺失 → 批量关闭。
 *
 * 运行方式见同目录 README。
 */

import { Node, Prefab, __registerPrefab } from './cc-stub';
import { BaseDlg } from '../../assets/Scripts/Frame/UI/Base/BaseDlg';
import { BaseMask } from '../../assets/Scripts/Frame/UI/Base/BaseMask';
import { BaseWin } from '../../assets/Scripts/Frame/UI/Base/BaseWin';
import { EUILayer } from '../../assets/Scripts/Frame/UI/Def/EUILayer';
import { EUIState } from '../../assets/Scripts/Frame/UI/Def/EUIState';
import { UIMaskOpt, UIOpenOpt } from '../../assets/Scripts/Frame/UI/Def/UIOpenOpt';
import { UIManager } from '../../assets/Scripts/Frame/UI/UIManager';
import { UIRegistration } from '../../assets/Scripts/Frame/UI/UIRegistration';
import { UIRuntimeRegistry } from '../../assets/Scripts/Frame/UI/UIRuntimeRegistry';

// ---- 被测界面：只记录生命周期被调了几次，不做任何渲染 ----

class TestDlg extends BaseDlg {
    public openCount = 0;

    protected onOpen(): void {
        this.openCount++;
    }

    protected updateView(): void {
        // 无内容可刷。
    }
}

class SecondDlg extends BaseDlg {
    public openCount = 0;

    protected onOpen(): void {
        this.openCount++;
    }

    protected updateView(): void {
        // 无内容可刷。
    }
}

class MaskDlg extends BaseDlg {
    public openCount = 0;

    protected onOpen(): void {
        this.openCount++;
    }

    protected updateView(): void {
        // 无内容可刷。
    }
}

class CacheDlg extends BaseDlg {
    public openCount = 0;

    protected onOpen(): void {
        this.openCount++;
    }

    protected updateView(): void {
        // 无内容可刷。
    }
}

class TestWin extends BaseWin {
    public openCount = 0;

    protected onOpen(): void {
        this.openCount++;
    }

    protected updateView(): void {
        // 无内容可刷。
    }
}

class SecondWin extends BaseWin {
    public openCount = 0;

    protected onOpen(): void {
        this.openCount++;
    }

    protected updateView(): void {
        // 无内容可刷。
    }
}

class TestMask extends BaseMask {}

// ---- 断言与工具 ----

const failures: string[] = [];

function check(name: string, condition: boolean, detail: string = ''): void {
    if (condition) {
        console.log(`PASS ${name}`);
    } else {
        failures.push(name);
        console.log(`FAIL ${name}${detail ? ` — ${detail}` : ''}`);
    }
}

function registerPrefab(path: string, make: () => Node): void {
    const prefab = new Prefab();
    prefab.factory = make;
    __registerPrefab(path, prefab);
}

function sleep(ms: number): Promise<void> {
    return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function dlgNode<T extends BaseWin | BaseMask>(id: string, ctor: new () => T): Node {
    const node = new Node(id);
    node.addComponent(ctor);
    return node;
}

/** CacheTime = 0 的打开参数：关闭即销毁。 */
function noCacheOpt(): UIOpenOpt {
    const opt = new UIOpenOpt();
    opt.cacheTime = 0;
    return opt;
}

// ---- 场景 ----

async function main(): Promise<void> {
    registerPrefab('ui/test/TestDlg', () => dlgNode('TestDlg', TestDlg));
    registerPrefab('ui/test/SecondDlg', () => dlgNode('SecondDlg', SecondDlg));
    registerPrefab('ui/test/MaskDlg', () => dlgNode('MaskDlg', MaskDlg));
    registerPrefab('ui/test/CacheDlg', () => dlgNode('CacheDlg', CacheDlg));
    registerPrefab('ui/test/TestMask', () => dlgNode('TestMask', TestMask));
    registerPrefab('ui/test/TestWin', () => dlgNode('TestWin', TestWin));
    registerPrefab('ui/test/SecondWin', () => dlgNode('SecondWin', SecondWin));

    const registry = new UIRuntimeRegistry();
    registry.registerRange([
        UIRegistration.dialog('modA', 'TestDlg', 'ui/test'),
        UIRegistration.dialog('modA', 'SecondDlg', 'ui/test'),
        UIRegistration.dialog('modA', 'MaskDlg', 'ui/test'),
        UIRegistration.dialog('modA', 'CacheDlg', 'ui/test'),
        UIRegistration.dialog('modA', 'NoSuchPrefab', 'ui/test'),
        UIRegistration.window('modA', 'TestWin', 'ui/test'),
        UIRegistration.window('modA', 'SecondWin', 'ui/test'),
    ]);

    const manager = new UIManager();
    manager.init({
        root: new Node('UIRoot'),
        layers: [EUILayer.Win, EUILayer.Dlg, EUILayer.Loading, EUILayer.Pop],
        registry,
        knownOwnerModIds: ['modA'],
    });

    // 1. 打开：任务完成、状态、payload、挂载位置。
    const payload = { hp: 3 };
    const vo = await manager.open('TestDlg', payload);
    const dlg = manager.getWin('TestDlg') as TestDlg | null;
    check('open 返回 UIVo', vo !== null);
    check('open 后状态为 Open', vo?.stateMachine.currentState === EUIState.Open);
    check('payload 已传给界面', (dlg?.payload as { hp?: number } | null)?.hp === 3);
    check('onOpen 只调一次', dlg?.openCount === 1);
    check('界面挂在 Layer-Dlg 下', dlg?.node.parent?.name === 'Layer-Dlg');
    check('界面可见', dlg?.node.active === true);
    check('isUITop 为真', manager.isUITop('TestDlg'));

    // 2. HideBelow：同层里后打开且 hideBelow 的界面遮盖住下层界面。
    const secondDlgOpt = new UIOpenOpt();
    secondDlgOpt.hideBelow = true;
    const secondDlgVo = await manager.open('SecondDlg', null, secondDlgOpt);
    const secondDlg = manager.getWin('SecondDlg') as SecondDlg | null;
    check('SecondDlg 打开成功', secondDlgVo?.stateMachine.currentState === EUIState.Open);
    check('HideBelow 隐藏同层下层界面', dlg?.node.active === false);
    check('HideBelow 不影响自身可见性', secondDlg?.node.active === true);
    check('Dlg 层本身不被隐藏', manager.getLayer(EUILayer.Dlg)?.node.active === true);
    manager.close('SecondDlg');
    check('关闭后下层界面恢复可见', dlg?.node.active === true);

    // 3. Win 层在最底层：打开 Win 不应遮挡上层的 Dlg。
    const winVo = await manager.open('TestWin', null, noCacheOpt());
    const win = manager.getWin('TestWin') as TestWin | null;
    check('Win 打开成功', winVo?.stateMachine.currentState === EUIState.Open);
    check('底层 Win 不遮挡上层 Dlg', dlg?.node.active === true);
    check('Win 挂在 Layer-Win 下', win?.node.parent?.name === 'Layer-Win');

    // 4. Back：关掉栈顶并回到上一层全屏界面。
    const secondWinVo = await manager.open('SecondWin', null, noCacheOpt());
    check('第二个 Win 打开成功', secondWinVo?.stateMachine.currentState === EUIState.Open);
    const backVo = await manager.back();
    check('back 返回到上一层', backVo?.id === 'TestWin');
    check('back 后栈顶界面仍打开', backVo?.stateMachine.currentState === EUIState.Open);
    check('back 关闭的界面已销毁（CacheTime=0）', manager.getUIVo('SecondWin') === null);

    // 5. 关闭：CacheTime = 0 时走 Destroy，实例与节点都不留。
    const winNode = win?.node ?? null;
    manager.close('TestWin');
    check('关闭后实例被移除', manager.getUIVo('TestWin') === null);
    check('CacheTime=0 的节点被销毁', winNode !== null && winNode.isValid === false);

    // 6. 缓存：关闭进 Cache，节点离树；重开复用同一个实例。
    const cacheOpt = new UIOpenOpt();
    cacheOpt.cacheTime = 30000;
    await manager.open('CacheDlg', null, cacheOpt);
    const cachedWin = manager.getWin('CacheDlg') as CacheDlg | null;
    const cachedNode = cachedWin?.node ?? null;
    manager.close('CacheDlg');
    const cacheVo = manager.getUIVo('CacheDlg');
    check('关闭后进入 Cache', cacheVo?.stateMachine.currentState === EUIState.Cache);
    check('缓存界面已离树', cachedNode?.parent === null);
    const reopened = await manager.open('CacheDlg', null, cacheOpt);
    check('重开复用同一个界面实例', manager.getWin('CacheDlg') === cachedWin);
    check('重开状态为 Open', reopened?.stateMachine.currentState === EUIState.Open);
    check('重开重新挂回层', cachedNode?.parent?.name === 'Layer-Dlg');
    check('重开再次触发 onOpen', cachedWin?.openCount === 2);

    // 7. 缓存到期：超过 CacheTime 后由 tick 自动销毁。
    const shortOpt = new UIOpenOpt();
    shortOpt.cacheTime = 20;
    await manager.open('CacheDlg', null, shortOpt);
    manager.close('CacheDlg');
    check('短缓存关闭后仍在实例池', manager.getUIVo('CacheDlg') !== null);
    await sleep(40);
    manager.tick(1.1);
    check('缓存到期后被销毁', manager.getUIVo('CacheDlg') === null);

    // 8. 遮罩：加载后挂到界面同一父节点，且排在界面之前（画在下方）。
    const maskOpt = new UIOpenOpt();
    maskOpt.mask = new UIMaskOpt();
    maskOpt.mask.runtime = 'ui/test/TestMask';
    const maskVo = await manager.open('MaskDlg', null, maskOpt);
    const maskWin = manager.getWin('MaskDlg');
    const mask = maskVo?.mask ?? null;
    check('遮罩已创建', mask !== null);
    check('遮罩与界面同父', mask?.node.parent === maskWin?.node.parent);
    check(
        '遮罩排在界面之前',
        mask !== null && maskWin !== null && mask.node.getSiblingIndex() < maskWin.node.getSiblingIndex(),
    );

    // 9. 资源缺失：打开失败应 resolve(null) 而不是挂住或抛异常。
    const missing = await manager.open('NoSuchPrefab');
    check('资源缺失时 open 返回 null', missing === null);
    check('资源缺失后实例被清理', manager.getUIVo('NoSuchPrefab') === null);

    // 10. 批量关闭：closeByOwner(destroy) 关掉该模块所有「已打开」的界面。
    //     缓存态按设计保留（C# 的 CloseByOwner 也跳过 Cache），要连缓存一起清应走 unregisterOwner。
    await manager.open('CacheDlg', null, cacheOpt);
    manager.close('CacheDlg');
    check('批量关闭前缓存界面在池中', manager.getUIVo('CacheDlg') !== null);
    manager.closeByOwner('modA', true);
    check('closeByOwner 关闭已打开界面', manager.getUIVo('TestDlg') === null && manager.getUIVo('MaskDlg') === null);
    check('closeByOwner 保留缓存界面', manager.getUIVo('CacheDlg') !== null);

    manager.dispose();
}

main()
    .then(() => {
        if (failures.length > 0) {
            console.log(`SMOKE_RESULT failed=${failures.length}；未通过：${failures.join(' | ')}`);
            process.exit(1);
        }
        console.log('SMOKE_RESULT failed=0');
        process.exit(0);
    })
    .catch((ex: unknown) => {
        console.log(`SMOKE_RESULT crashed=${String(ex)}`);
        process.exit(1);
    });
