// docs/review/probe/probe-reddot.mjs
// ---------------------------------------------------------------------------
// 评审取证：按 docs/红点系统设计.md 的字面规格跑边界用例，打印「调用序列 → 期望 → 实际」。
// 运行：node docs/review/probe/probe-reddot.mjs
// 说明：本文件只用于评审，不属于生产代码；不修改 assets/ 与 package.json。
// 期望值来源写在各 check 的 spec 字段里（文档行号），实际值由 SpecStore 字面实现产生。
// ---------------------------------------------------------------------------
import { SpecStore, formatRedDotCount } from './spec-store.mjs';

let passCount = 0;
let failCount = 0;
const failures = [];

function fmt(v) {
    if (typeof v === 'number') {
        if (Number.isNaN(v)) return 'NaN';
        if (v === Infinity) return 'Infinity';
        if (v === -Infinity) return '-Infinity';
        return String(v);
    }
    if (Array.isArray(v)) return '[' + v.map(fmt).join(', ') + ']';
    if (v && typeof v === 'object') return '{' + Object.entries(v).map(([k, x]) => `${k}: ${fmt(x)}`).join(', ') + '}';
    return JSON.stringify(v);
}

function same(a, b) {
    if (Object.is(a, b)) return true;
    if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((x, i) => same(x, b[i]));
    if (a && b && typeof a === 'object' && typeof b === 'object' && !Array.isArray(a) && !Array.isArray(b)) {
        const ka = Object.keys(a), kb = Object.keys(b);
        return ka.length === kb.length && ka.every((k) => same(a[k], b[k]));
    }
    return false;
}

function check(tag, label, expected, actual, spec, note) {
    const ok = same(expected, actual);
    if (ok) passCount++; else { failCount++; failures.push({ tag, label, expected, actual, spec }); }
    console.log(`[${ok ? 'PASS' : 'FAIL'}] ${tag} ${label}`);
    console.log(`        依据: ${spec}`);
    console.log(`        期望: ${fmt(expected)}`);
    console.log(`        实际: ${fmt(actual)}`);
    if (note) console.log(`        说明: ${note}`);
}

function sorted(ids) { return [...ids].sort(); }

function makeDemoStore() {
    const s = new SpecStore();
    s.batch(() => {
        s.register('main');
        s.register('main/team', 'main', 2);
        s.register('main/stage', 'main', 0);
        s.register('main/stage/1001', 'main/stage', 100);
        s.register('main/stage/1002', 'main/stage', 20);
    });
    s.events.length = 0;
    return s;
}

function section(title) { console.log('\n=== ' + title + ' ==='); }

// ===========================================================================
section('0. 文档 §3.4 示例树（main/team=2，1001=100，1002=20，stage/main 自身 0）');
const s0 = makeDemoStore();
check('§3.4', '聚合结果与示例表逐格核对',
    { main: 122, stage: 120, team: 2, c1001: 100, c1002: 20 },
    { main: s0.get('main'), stage: s0.get('main/stage'), team: s0.get('main/team'), c1001: s0.get('main/stage/1001'), c1002: s0.get('main/stage/1002') },
    '§3.4 L85-99 示例表：100+20=120，120+2=122',
    '§3.4 的算术本身正确（这条是基线，不是问题）。');
check('§3.4', '示例显示值', ['2', '99+', '20', '99+', '99+'],
    [formatRedDotCount(s0.get('main/team')), formatRedDotCount(s0.get('main/stage/1001')),
     formatRedDotCount(s0.get('main/stage/1002')), formatRedDotCount(s0.get('main/stage')),
     formatRedDotCount(s0.get('main'))],
    '§3.4 L93-99 显示列 + §5.3 L259-263',
    '显示与 §3.4/§5.4 一致。');

// ===========================================================================
section('1. formatRedDotCount 边界（§5.3 L259-263 原文照抄 + §5.4 L350-358 显示规则表）');
const fmtCases = [
    [2, 99, '2'], [99, 99, '99'], [100, 99, '99+'], [122, 99, '99+'], [99.9, 99, '99'],
    [-1, 99, '0'], [0, 99, '0'], [NaN, 99, '0'], [Infinity, 99, '0'], [1000, 99, '99+'],
    [2, 1, '1+'], [1, 1, '1'], [5, 0, '5'], [100, 0, '99+'], [100, NaN, '99+'], [100, Infinity, '99+'],
    [98.9, 50, '50+'], [50, 50, '50'],
];
for (const [c, m, exp] of fmtCases) {
    check('F10', `formatRedDotCount(${fmt(c)}, ${fmt(m)})`, exp, formatRedDotCount(c, m),
        '§5.3 L259-263 代码即规格', '');
}
check('F10', 'count=0 返回 "0"（而不是空串）；调用方必须自己隐藏',
    '0', formatRedDotCount(0, 99), '§5.3 L259-263 未约定「0 时返回什么」的契约',
    '§5.4 L324-327 的 _refresh 在 total=0 时提前 return，所以现状可用；但若直接拿返回值填 Label 会显示 "0"，需要文档写明契约。');

// ===========================================================================
section('2. 一次 Set 相同值 / 兄弟节点（§6.1 L426-430、L397 的正例核对）');
const s1 = makeDemoStore();
s1.events.length = 0;
s1.set('main/stage/1001', 100); // 与当前值相同
check('§6.1', 'Set 写入相同值不广播', 0, s1.events.length, '§6.1 L426-430', '与文档一致。');
s1.events.length = 0;
s1.set('main/stage/1001', 130);
check('§6.1', '一次 Set 只发一次事件且脏集为 当前节点 + 祖先', ['main', 'main/stage', 'main/stage/1001'],
    sorted(s1.events[0] || []), '§6.1 L391-406', '与文档一致（兄弟节点不在脏集）。');
check('§6.1', '一次 Set 后聚合值正确', { c1001: 130, stage: 150, main: 152 },
    { c1001: s1.get('main/stage/1001'), stage: s1.get('main/stage'), main: s1.get('main') },
    '§3.4 L88 + §6.1 L401-404', '与文档一致。');

// ===========================================================================
section('3. ClearTree：§5.1 L212-213「只沿父链向上重算」+ §6.1 L408-415「重算：main.total」字面实现');
const s2 = makeDemoStore();
s2.events.length = 0;
s2.clearTree('main/stage');
check('F1', 'ClearTree 后 Get 应为 0（1001/1002/stage）且 main 应为 2',
    { c1001: 0, c1002: 0, stage: 0, main: 2 },
    { c1001: s2.get('main/stage/1001'), c1002: s2.get('main/stage/1002'), stage: s2.get('main/stage'), main: s2.get('main') },
    '§6.1 L408-415：清零 stage、1001、1002；重算 main.total',
    '按 §6.1 字面（只重算 main.total）实现时，子树的 total 缓存没有被重算：Get 仍返回旧值，而且事件虽然发了（脏集 4 个 ID），视图读到 120/122 后仍会保持红点——「整个模块清零」实际不生效。');
check('F1', 'ClearTree 的事件次数', 1, s2.events.length, '§6.1 L414「emit 一次」', '');
check('F1', 'ClearTree 独集的 ID 集合', ['main', 'main/stage', 'main/stage/1001', 'main/stage/1002'],
    sorted(s2.events[0] || []), '§6.1 L413',
    '注意：文档同时声称「只有 total 真的变了才进脏集」（§5.1 L213 / §6.1 L392），但字面步骤并没有重算子树的 total，于是「stage 进脏集」这件事本身就无法由该规则推出——示例与规则自相矛盾。');

// 对照：把子树里每个节点也当成一次独立写入（= 每个节点都走「写前旧值 / 写后比较 / 向上重算」）
const s3 = makeDemoStore();
s3.events.length = 0;
s3.batch(() => s3.clearTreePerWrite('main/stage'));
check('F1', '对照实现（每个节点一次写入 + batch）：Get 全为 0、main=2',
    { c1001: 0, c1002: 0, stage: 0, main: 2 },
    { c1001: s3.get('main/stage/1001'), c1002: s3.get('main/stage/1002'), stage: s3.get('main/stage'), main: s3.get('main') },
    '§5.1 L212-213 逐写重算 + §5.1 L215 批量合并',
    '正确实现能同时满足「Get 清零」与「一次事件」，说明 §6.1 缺的只是一句「ClearTree 必须自底向上重算子树 total」，以及 §5.1 的「只沿父链向上」对 ClearTree 不成立。');
check('F1', '对照实现的事件 ID 集合（应与文档示例一致）', ['main', 'main/stage', 'main/stage/1001', 'main/stage/1002'],
    sorted(s3.events[0] || []), '§6.1 L413', '');

// ===========================================================================
section('4. batch 内「净变化为 0」仍会广播（§5.1 L213 声称要避免的正是这种刷新）');
const s4 = new SpecStore();
s4.batch(() => { s4.register('main'); s4.register('main/a', 'main', 2); s4.register('main/b', 'main', 3); });
s4.events.length = 0;
s4.batch(() => { s4.set('main/a', 1); s4.set('main/b', 4); }); // main: 2+3=5 → 1+4=5，净不变
check('F3', 'batch 结束后 main 的聚合值没变', 5, s4.get('main'), '§3.4 L88', '');
check('F3', 'batch 内净变化为 0 的祖先是否被广播（§5.1 L213 声称应避免）', ['main/a', 'main/b'],
    sorted(s4.events[0] || []), '§5.1 L213「避免自身 2 变 1、子节点补 1 这种总数不变的无效刷新」',
    `main 在第一次写入时（5→4）进了脏集，第二次写回后没有出队，最终仍被广播；实际脏集 = [${sorted(s4.events[0] || []).join(', ')}]。文档的「写前比较」机制只能保证「单次写入」不广播，不能保证「batch 净效果」不广播。`);
check('F3', '事件次数', 1, s4.events.length, '§5.1 L215', '次数是对的（1 次），只是脏集里多了 main。');

// ===========================================================================
section('5. batch 内 fn 抛异常（文档完全未规定）');
const s5 = new SpecStore();
s5.register('main');
s5.register('main/a', 'main', 0);
s5.events.length = 0;
let thrown = null;
try {
    s5.batch(() => { s5.set('main/a', 3); throw new Error('boom'); });
} catch (e) { thrown = e.message; }
check('F2', 'fn 抛出的异常是否向上传播（文档未规定）', 'boom', thrown,
    '§5.1 L194 只写「batch(fn)」，异常语义空白',
    '原型未吞异常。无论最终选择吞掉还是抛出，都必须先用 try/finally 恢复 batchDepth 并决定 pending 是否 flush。');
check('F2', 'fn 抛异常后 batch 的嵌套深度应回到 0', 0, s5.batchDepth,
    '§5.1 L194「batch(fn) 支持嵌套」+ L215「最外层 batch 结束时统一发送」（未规定异常路径）',
    '字面实现没有 try/finally：深度停在 1。');
check('F2', 'fn 抛异常已写入的脏 ID 应被 flush（或至少下次写入能发事件）', 1, s5.events.length,
    '§5.1 L215', `异常前 set('main/a',3) 已把 [${sorted(s5.pending).join(', ')}] 放进 pending，但没有 flush。`);
s5.set('main/a', 7);
s5.set('main/a', 9);
check('F2', '异常之后所有后续写入仍然发不出事件（实际上永久失聪）', 1, s5.events.length,
    '§5.1 L215', 'batchDepth 永远 > 0，之后每次写入都只进 pending；界面红点从此不再更新，直到进程重启。');
check('F2', '异常后 Get 仍返回新值（数据在变、事件不发 → 界面与数据不一致）', 9, s5.get('main/a'), '§5.1 L185', '');
s5.batch(() => s5.set('main/a', 10));
check('F2', '再套一层 batch 也救不回来（深度 1→2→1）', 1, s5.batchDepth, '§5.1 L194', '');

// ===========================================================================
section('6. register / unregister 的脏集：与「只有 total 变了才进脏集」冲突（§5.1 L213 vs L214 / §6.1 L392）');
const s6 = new SpecStore();
s6.register('main');
s6.events.length = 0;
s6.register('main/a', 'main', 0); // 新节点，但所有 total 都没变（0）
check('F4', 'register(initialCount=0) 是否发事件：按 §5.1 L214 应发 1 次', 1, s6.events.length,
    '§5.1 L214「register 也要进入脏集：新节点需要让已存在的视图刷新一次」', '');
check('F4', '同一场景按 §6.1 L392/L429「total 没变 → 不广播」应为 0 次', 0, s6.events.length,
    '§6.1 L392 脏集 =「total 真的变了」的节点；L429「total 没变 → 脏集为空 → 不广播」',
    '同一次 register，两条规则给出相反结论；事件次数不可测，§11 L594「总数不变不发事件」的验收用例也会互相打架。');
check('F4', 'register(0) 的脏集内容', ['main/a'], sorted(s6.events[0] || []), '§5.1 L214', '祖先 main 的 total 没变，所以不在脏集里。');
s6.events.length = 0;
s6.unregister('main/a'); // 零计数子树被移除，所有 total 都没变
check('F4', 'unregister 零计数子树后事件次数（文档两条规则仍相反）', 1, s6.events.length,
    '§5.1 L214「被移除的节点需要让视图归零隐藏」 vs §6.1 L392', '被移除节点必须进脏集（否则视图不会隐藏），但它并没有「total 变化」；这说明 §6.1 L392 的规则需要改写为「变化 OR 注册/注销/移除」。');
check('F4', 'unregister 零计数子树的脏集', ['main/a'], sorted(s6.events[0] || []), '§5.1 L146、L214', '');

// 有计数的子树整体注销：正向核对（§5.1 L146 + §6.1 L417-424）
const s7 = makeDemoStore();
s7.events.length = 0;
s7.unregister('main/stage');
check('F4', 'Unregister 子树：被移除的子孙 + 变化祖先都在脏集，且只发一次',
    ['main', 'main/stage', 'main/stage/1001', 'main/stage/1002'],
    sorted(s7.events[0] || []), '§5.1 L146、§6.1 L417-424',
    `事件次数实际=${s7.events.length}；Get(main)=${s7.get('main')}（= team 的 2）。`);
check('F4', 'Unregister 后父节点正确重算', 2, s7.get('main'), '§3.1 L63', '');

// ===========================================================================
section('7. resetCounts：§5.1 L203 只有一句「所有计数归零，保留注册树」，未规定重算/脏集/事件');
const s8 = makeDemoStore();
s8.events.length = 0;
s8.resetCounts();
check('F5', 'resetCounts 后所有 Get 应为 0', { main: 0, stage: 0, c1001: 0, c1002: 0, team: 0 },
    { main: s8.get('main'), stage: s8.get('main/stage'), c1001: s8.get('main/stage/1001'), c1002: s8.get('main/stage/1002'), team: s8.get('main/team') },
    '§5.1 L203「所有计数归零」',
    '字面实现只把 own 置 0、不重算 total：Get 仍返回旧值，§9 L553「导入存档后先 ResetCounts」之后界面不会清零。');
check('F5', 'resetCounts 后 snapshot 里的 total 应为 0', 0, s8.snapshot().reduce((m, n) => Math.max(m, n.total), 0),
    '§5.1 L200 snapshot、L203', '');
check('F5', 'resetCounts 应发 1 次事件（否则已存在的视图不刷新）', 1, s8.events.length,
    '§5.1 L214（视图靠事件刷新）+ §11 L594',
    '文档对 resetCounts 的脏集与事件没有任何规定；实现者很可能只清 own 不发事件，界面残留。');

// ===========================================================================
section('8. 计数入参校验：set 有规则，add / register(initialCount) 没有（§5.1 L172-176、L165）');
const s9 = new SpecStore();
s9.register('main');
s9.register('main/a', 'main', 0);
s9.add('main/a', 5);
check('F6', '前置：add 5 后 Get 正常', { a: 5, main: 5 }, { a: s9.get('main/a'), main: s9.get('main') }, '§5.1 L176', '');
s9.add('main/a', NaN);
check('F6', 'add(NaN) 后数据应为 5（NaN 按 set 的规则归一），实际被污染成 NaN', { a: 5, main: 5, has: true },
    { a: s9.get('main/a'), main: s9.get('main'), has: s9.has('main') },
    '§5.1 L172 只规定了 set 的 NaN/Infinity；L176 add 无规则',
    'NaN 会沿祖先链污染聚合值；has() 用 total>0 判断，NaN>0 为 false → 真实存在的 5 个红点被隐藏。');
s9.add('main/a', -1);
check('F6', '基线：NaN 之后 add 任何数都无法恢复（Math.max(0, NaN)=NaN）', NaN, s9.get('main/a'),
    '§5.1 L176「结果不会小于 0」', 'NaN 不满足「不小于 0」，文档对 add 的该承诺对 NaN 不成立，且无法用 add 自救。');
s9.set('main/a', 5); // set 能归一，说明只有 add 缺规则
check('F6', '用 set 可恢复 → 问题定位在 add/register 缺校验规则', 5, s9.get('main/a'), '§5.1 L172', '');
const s10 = new SpecStore();
s10.register('main');
s10.register('main/a', 'main', 0);
s10.add('main/a', Infinity);
check('F6', 'add(Infinity)：聚合值 Infinity（显示 99+，但 Get 返回 Infinity）', Infinity, s10.get('main'),
    '§5.1 L176', '');
s10.add('main/a', -Infinity);
check('F6', 'add(Infinity) 后再 add(-Infinity) → NaN（Infinity + -Infinity）', NaN, s10.get('main'), '§5.1 L176',
    '一次加减抵消就把红点永久污染。');
const s11 = new SpecStore();
s11.register('main');
s11.register('main/a', 'main', 0);
s11.add('main/a', 2.5);
check('F6', 'add(2.5)：若与 set 对齐（小数向下取整）应为 2，实际允许 2.5 进入 own/get',
    { get: 2, own: 2, display: '2' },
    { get: s11.get('main/a'), own: s11.getOwn('main/a'), display: formatRedDotCount(s11.get('main/a')) },
    '§5.1 L172 set「小数向下取整」；L176 add 未规定',
    '同一条计数，经 set 与经 add 得到的内部值不同（2 vs 2.5），显示层 floor 后都是 2 → 数据/显示口径不一致。');
const s12 = new SpecStore();
s12.register('main');
s12.register('main/x', 'main', -5); // 负的 initialCount
s12.register('main/y', 'main', 3);  // 真实存在的 3 个红点
check('F6', '负 initialCount：若与 set 对齐（负数按 0）父节点应为 3、可见；实际被拉成负数并掩盖兄弟红点',
    { x: 0, main: 3, has: true, display: '3' },
    { x: s12.get('main/x'), main: s12.get('main'), has: s12.has('main'), display: formatRedDotCount(s12.get('main')) },
    '§5.1 L165 initialCount 无规则；L172 set 负数按 0',
    'y 上明明有 3 个待处理，父节点 Get=-2 → has=false → 红点隐藏。这是「入参校验缺规则」里后果最重的一条。');
check('F6', '对照：set 的入参归一规则完整（-3→0、2.9→2、NaN→0、Infinity→0）', { neg: 0, frac: 2, nan: 0, inf: 0 },
    (() => { const s = new SpecStore(); s.register('r'); s.register('r/a', 'r', 0);
        s.set('r/a', -3); const neg = s.get('r/a'); s.set('r/a', 2.9); const frac = s.get('r/a');
        s.set('r/a', NaN); const nan = s.get('r/a'); s.set('r/a', Infinity); const inf = s.get('r/a');
        return { neg, frac, nan, inf }; })(),
    '§5.1 L172-173',
    'set 的规则是自洽的；问题在于 add / register(initialCount) 没有对齐。');

// ===========================================================================
section('9. 未注册 ID 的 Get/GetOwn/Has/Clear/ClearTree（§5.1 L185-191 未规定，§5.4 L355 又依赖它=0）');
const s13 = new SpecStore();
s13.register('main');
s13.register('main/a', 'main', 5);
s13.unregister('main/a');
check('F7', '注销后 Get(已移除 ID) 的返回值（文档未规定，原型假设 0）', 0, s13.get('main/a'),
    '§5.1 L185 没有「未注册返回什么」；§5.1 L146「注销时视图归零隐藏」；§5.4 L355「未注册 → 隐藏」',
    '若实现选择「-1 / undefined / throw」，§5.4 的 Badge 在收到注销事件后会读到非 0 值，显示逻辑就不再由文档保证。');
check('F7', '注销后 GetOwn/Has/IsRegistered', { own: 0, has: false, registered: false },
    { own: s13.getOwn('main/a'), has: s13.has('main/a'), registered: s13.isRegistered('main/a') },
    '§5.1 L188/L190/L170', '原型假设；文档未规定。');
s13.clear('main/a');
s13.clearTree('main/a');
check('F7', '对未注册 ID 调 Clear/ClearTree 的行为（文档未规定；原型记 error 并忽略）', 2, s13.errors.length,
    '§5.1 L179/L182 未规定未知 ID；L168 只规定 unregister 静默忽略',
    '同类操作口径不一致：unregister 未知 ID 静默忽略（L168），set/add 未注册记 error（L558），clear/clearTree 完全没写。');

// ===========================================================================
section('10. §10-15「界面隐藏期间的事件会丢」是否与 §5.4 订阅常驻/§5.1 矛盾（重点核查项）');
class BadgeSim {
    // 严格按 §5.4 L299-339：onLoad 订阅、onDestroy 退订、onEnable 补刷新、事件里 _refresh
    constructor(store, id) { this.store = store; this.id = id; this.active = false; this.subscribed = false; this.refreshes = 0; this.unsub = null; }
    onLoad() { this.subscribed = true; this.unsub = this.store.onChanged((change) => { if (change.ids.has(this.id)) this.refresh(); }); }
    onEnable() { this.refresh(); }
    hide() { this.active = false; } // 界面隐藏：node.active=false，但组件未销毁 → 不会走 onDestroy
    onDestroy() { this.subscribed = false; this.unsub && this.unsub(); }
    refresh() { this.refreshes++; this.active = this.store.get(this.id) > 0; }
}
const s14 = new SpecStore();
s14.register('main');
s14.register('main/a', 'main', 0);
s14.events.length = 0;
const badge = new BadgeSim(s14, 'main/a');
badge.onLoad();
badge.onEnable();
badge.hide(); // 界面隐藏
s14.set('main/a', 5); // 隐藏期间数据变化
check('F8', '隐藏期间的事件是否真的会丢（§10-15 的说法 vs §5.4 订阅常驻）', { delivered: true, active: true, events: 1 },
    { delivered: badge.subscribed, active: badge.active, events: s14.events.length },
    '§5.4 L299-306 用 onLoad 订阅、L313-315 只在 onDestroy 退订、L345-346 明确否定了 onDisable 退订；§6.2 L444',
    '节点 inactive 不会触发 onDestroy，闭包监听仍在 dispatcher 里 → 事件照常送达，_refresh 还把节点重新点亮。所以「界面隐藏期间的事件会丢」与本文档自己的组件规格相反。');
badge.onEnable(); // 重新激活时补刷新
check('F8', '重新激活时 onEnable 补刷新的值正确（即使假设事件丢了，也能从当前状态重建）', { active: true, value: 5 },
    { active: badge.active, value: s14.get('main/a') },
    '§5.4 L308-311', '结论没错（要按当前状态重建），但理由是错的：事件没丢，丢事件只发生在组件已销毁（onDestroy 退订）之后，而销毁后的重建由 onLoad+onEnable 负责。');

// ===========================================================================
section('11. 嵌套 batch 一次事件（§5.1 L194/L215 正例）');
const s15 = new SpecStore();
s15.batch(() => { s15.register('main'); s15.register('main/a', 'main', 0); s15.register('main/b', 'main', 0); });
s15.events.length = 0;
s15.batch(() => { s15.set('main/a', 1); s15.batch(() => { s15.set('main/b', 2); }); });
check('§5.1', '嵌套 batch 只发一次事件', 1, s15.events.length, '§5.1 L194/L215', '与文档一致。');
check('§5.1', '嵌套 batch 的脏集与聚合值', { ids: ['main', 'main/a', 'main/b'], total: 3 },
    { ids: sorted(s15.events[0] || []), total: s15.get('main') }, '§6.1 L394', '');
check('§5.1', '未注册 ID 上 Set 记 error 且不发事件', 0, (() => {
    const s = new SpecStore(); s.register('r'); s.events.length = 0; s.set('nope', 1); return s.events.length;
})(), '§10 L558', '');

// ===========================================================================
section('12. batch 内 dispose / 监听器内再写红点（文档未规定，供实现者注意）');
const s16 = new SpecStore();
s16.register('main');
s16.register('main/a', 'main', 0);
s16.events.length = 0;
s16.batch(() => { s16.set('main/a', 3); s16.dispose(); });
check('F9', 'batch 内 dispose：pending 仍会在 batch 结束时 flush 一次（空转），监听已清（文档未规定）', { events: 1, pending: 0, listeners: 0 },
    { events: s16.events.length, pending: s16.pending.size, listeners: s16.listeners.size },
    '§5.1 L206/L215；§3.6 L118 只说 Dispose 用于退出',
    '原型行为：dispose 清树/计数/监听，但不清 batchDepth/pending，于是 dispose 前累积的脏 ID 仍被 flush（无监听时是空转）。若 dispose 后仍在 batch 内 register/set，会走「未注册」分支。文档需要约定「batch 内禁止 dispose」或写明语义。');
const s17 = new SpecStore();
s17.register('main');
s17.register('main/a', 'main', 0);
s17.register('main/b', 'main', 0);
s17.events.length = 0;
let once = true;
s17.onChanged((change) => {
    if (once && change.ids.has('main/a')) { once = false; s17.batch(() => s17.set('main/b', 2)); } // 监听器内写红点
});
s17.set('main/a', 1);
check('F9', '监听器内写红点：事件轮次（§6.2 L444 只说排队，未定义次数/顺序）', { rounds: 2, ids: ['main', 'main/a', 'main/b'] },
    { rounds: s17.events.length, ids: sorted([...new Set(s17.events.flat())]) },
    '§6.2 L444「用 _emitting 标记把新脏 ID 排队，当前一轮发完后再发下一轮」',
    'batch 与 _emitting 两个规则的交点没有任何规定：batch 结束「统一发送」时若 _emitting 为 true，是排队还是递归广播？例子里是 2 轮；不同实现可能合成 1 轮或递归同步广播，事件次数不确定。');

// ===========================================================================
console.log('\n================ 汇总 ================');
console.log(`\n用例断言：${passCount} 通过 / ${failCount} 未通过（未通过 ≠ 原型实现错误，而是文档规格给出的行为与期望不符或文档未规定）`);
if (failures.length) {
    console.log('未通过断言（按发现编号）：');
    for (const f of failures) console.log(`  [${f.tag}] ${f.label}`);
}
process.exitCode = 0; // 评审脚本：FAIL 是证据，不作为脚本故障
console.log('退出码：0（FAIL 表示规格与期望不符，不是脚本故障）');
