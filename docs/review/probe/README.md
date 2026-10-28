# 红点核心语义评审探针（task-2）

本目录只服务于 `docs/review/reddot-core.md` 的取证，**不属于生产代码**；不写入 `assets/`，不改 `package.json`/`tools/`，不改 `docs/红点系统设计.md`。

## 文件

| 文件 | 说明 |
| --- | --- |
| `spec-store.mjs` | 按 `docs/红点系统设计.md` **字面规格**实现的最小 `SpecStore`。文档未规定处用 `【文档未规定】` 注释标出，并采用最自然的字面实现 |
| `probe-reddot.mjs` | 67 条边界断言，每条打印「依据（文档行号）→ 期望 → 实际」；FAIL 表示文档规格给出的行为与期望不符或文档未规定，脚本固定 `exit 0` |

## 运行

```powershell
$env:PATH = "C:\Users\1\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin;" + $env:PATH
node docs/review/probe/probe-reddot.mjs
```

不需要 `node_modules`（纯 `.mjs`，不依赖 tsc；项目未安装依赖时也能跑）。

## 实际运行结果（2026-10-28，danger-full-access 下由评审主持人执行）

```
67 条断言：55 通过 / 12 未通过
```

12 条 FAIL 全部对应报告 `docs/review/reddot-core.md` 中的规格问题：

| 段落 | FAIL 数 | 报告发现 |
| --- | ---: | --- |
| §3 ClearTree | 1 | F1（子树 total 残留，Get 不归零） |
| §4 batch 净零 | 1 | F3（净变化 0 仍广播） |
| §5 batch 异常 | 3 | F2（depth 卡 1、pending 不 flush、后续永久失聪） |
| §6 register/unregister 脏集 | 1 | F4（两条规则给出相反的事件次数结论） |
| §7 resetCounts | 3 | F5（不重算、不发事件） |
| §8 入参校验 | 3 | F6（NaN 污染、小数口径、负 initialCount 掩盖真实红点） |

其余 PASS 段落是「基线核对」（§3.4 算术、format 边界、Set 相同值不广播、兄弟节点不脏、嵌套 batch 一次事件、隐藏期间事件不丢等），用来证明这些问题之外的部分文档是自洽的。

## 关于「实际值」的可信度

- `spec-store.mjs` 是**按文档字面**写的，不是按「正确实现」写的；每条 FAIL 都在报告里给了「期望（文档依据）」与「修复建议」。
- 文档未规定处（未注册 ID 的 Get 返回值、register/add 的非法入参、batch 异常语义、resetCounts 的事件、dispose 在 batch 内的行为等）已用注释标出；报告把这些归为「规格缺失」，而不是「原型 bug」。
- 若后续有人改了 `docs/红点系统设计.md` 并让探针 FAIL 数变化，说明规格已被补齐/改写，属预期。
