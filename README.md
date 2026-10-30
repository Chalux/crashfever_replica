# CrashFever Replica

以学习开发为目的，基于 Cocos Creator 3.8.8 / TypeScript 重制日服 CrashFever 的离线单人核心体验，支持 Windows、Android 和浏览器。

- [已确认需求总纲](docs/项目总纲.md)：项目范围、页面流程、编队、战斗恢复、存档、开发顺序与待核实项。
- [模块边界](docs/模块边界.md)：当前目录、依赖方向、界面归属和测试落点。
- [当前实现与检查结果](docs/当前实现.md)：已实现内容、验证边界和待补缺口。
- [下一任务](docs/下一任务.md)：2.2 编队页 `TeamWin` 骨架的范围、实施顺序与验收。
- [角色与编队数据底座（归档）](docs/archive/2026-10-30/角色与编队数据底座.md)：角色配置、30 套编队和独立存档；2.1 已完成，见归档说明。
- [标题进入与恢复检查（归档）](docs/archive/2026-10-30/标题进入与恢复检查.md)：已完成代码与自动检查，待 Cocos/三平台手工验收。
- [加载进度与失败重试（归档）](docs/archive/2026-10-30/加载进度与失败重试.md)：启动流程的历史任务说明。
- [红点系统当前契约](docs/红点系统设计.md)：已实现 API、角标与主界面接入。
- [现有 UI 框架](assets/Scripts/Frame/UI/README.md)：界面接入与生命周期。
- [UI 冒烟驱动](tools/uitest/README.md)：现有框架验证方式。
- [本地设置存储](docs/本地设置存储.md)：设置保存、备份恢复与验证方式。

用户负责游戏功能与界面实现；助手负责拆任务、讲解 Cocos、设计建议与代码审查，并维护必要工具、测试代码/用例和验收文档。开发顺序为启动界面、角色编队、战斗与关卡选择。原作具体规则与界面细节须以提供资料和逆向结果核实。

## 工程脚本与测试

### 界面维护

界面以 `assets/resources/ui/` 下按模块分目录的 Prefab 为准，直接在 Cocos 编辑器中维护；现有应用壳界面在 `ui/app/`，角色和编队等新模块使用 `ui/character/`、`ui/team/`，不再把新玩法塞进 `ui/app/`。一次性 Python 界面生成脚本在生成完成后删除，不保留为中间层，也不重跑覆盖编辑器修改。原包资源提取工具独立保留。

### 测试与检查

| 命令 | 内容 |
| --- | --- |
| `npm run test:reddot` | 红点核心 Store、门面生命周期、badge 组件行为、prefab 结构、任务 4 应用层（81 项） |
| `npm run test:log` / `test:save` / `test:confirm` / `test:team` | 日志、存档、确认弹窗、角色与编队模型/控制器 |
| `npm run test:entry` | 标题进入与恢复分支、防连点、销毁中断（10 项） |
| `npm run test:team` | 角色配置与校验、编队模型/控制器、真实主备存档（37 项：角色 8、编队 14、存档 15） |
| `npx tsc -p tools/uitest/tsconfig.json --noEmit` | UI 框架类型检查 |
| `npm run lint` | 全项目 ESLint |

2026-10-30 复核：标题进入与恢复检查、角色与编队数据底座（2.1）的代码和自动测试已完成：进入流程 10 项、UI 组合 46 项、角色/编队/存档 37 项通过；`TeamSaveService` 完成主备存档与版本保护，`TeamStorage` 只做 `sys.localStorage` 适配、待 2.2 编队页接入。待 Cocos 预览和三平台手工验收。下一任务为 2.2 `TeamWin` 骨架，界面使用 `ui/team`、`ownerModId: team`，不再把新玩法塞进 `Model/App`/`ui/app`。2026-10-29 的 MainWin 嵌套红点修复仍有效；旧任务书和设计评审已移至 [2026-10-29 历史归档](docs/archive/2026-10-29/README.md)，标题进入与启动任务说明已移至 [2026-10-30 历史归档](docs/archive/2026-10-30/README.md)，均不作为当前待办。

测试代码与用例由助手维护；实现与测试冲突时先核对设计稿/任务书，不要为了变绿改测试。编译产物 `.reddottest-out/`、`.reddottest-badge-out/`、`.uitest-out/` 等已 gitignore，不提交。

## 代码命名检查

运行 `npm run lint` 检查项目脚本和工具代码，运行 `npm run lint:app` 只检查启动模块。

- 局部变量、参数、public 字段（包括省略 public 的字段）使用小驼峰，不加前导下划线。
- 静态字段使用大驼峰 `PascalCase` 或全大写 `UPPER_CASE`，不加前导下划线，包括 private 静态字段。
- 非静态 private 字段使用 `_camelCase`，包含构造参数属性。
- protected 字段使用普通小驼峰；方法、类名、类型名和导入名不在这次变量命名规则范围内。
- 违规级别为 warning，不自动重命名。第三方插件及生成目录不参与检查。

VS Code 中安装工作区推荐的 ESLint 扩展，即可在输入时看到黄色波浪线及“问题”面板警告；这不是 Cocos 运行时弹窗。其他编辑器需启用相应 ESLint 支持。

Cocos 的 `@property` 字段改名后，需要在编辑器重新绑定并保存场景/Prefab，或通过 `formerlySerializedAs` 迁移旧字段，避免丢失序列化引用。
