# CrashFever Replica

以学习开发为目的，基于 Cocos Creator 3.8.8 / TypeScript 重制日服 CrashFever 的离线单人核心体验，支持 Windows、Android 和浏览器。

- [已确认需求总纲](docs/项目总纲.md)：项目范围、页面流程、编队、战斗恢复、存档、开发顺序与待核实项。
- [当前实现与检查结果](docs/当前实现.md)：已实现内容、验证边界和待补缺口。
- [下一任务：第一阶段收尾](docs/下一任务.md)：实施顺序、分工和验收条件。
- [当前任务：标题进入与恢复检查](docs/标题进入与恢复检查.md)：启动后的恢复分支、标题解锁与占位验收。
- [加载进度与失败重试](docs/加载进度与失败重试.md)：已实现启动流程的任务说明。
- [红点系统当前契约](docs/红点系统设计.md)：已实现 API、角标与主界面接入。
- [现有 UI 框架](assets/Scripts/Frame/UI/README.md)：界面接入与生命周期。
- [UI 冒烟驱动](tools/uitest/README.md)：现有框架验证方式。
- [本地设置存储](docs/本地设置存储.md)：设置保存、备份恢复与验证方式。

用户负责游戏功能与界面实现；助手负责拆任务、讲解 Cocos、设计建议与代码审查，并维护必要工具、测试代码/用例和验收文档。开发顺序为启动界面、角色编队、战斗与关卡选择。原作具体规则与界面细节须以提供资料和逆向结果核实。

## 工程脚本与测试

### 界面维护

界面以 `assets/resources/ui/app/` 中的 Prefab 为准，直接在 Cocos 编辑器中维护。一次性 Python 界面生成脚本在生成完成后删除，不保留为中间层，也不重跑覆盖编辑器修改。原包资源提取工具独立保留。

### 测试与检查

| 命令 | 内容 |
| --- | --- |
| `npm run test:reddot` | 红点核心 Store、门面生命周期、badge 组件行为、prefab 结构、任务 4 应用层（81 项） |
| `npm run test:log` / `test:save` / `test:confirm` | 日志、存档、确认弹窗 |
| `npx tsc -p tools/uitest/tsconfig.json --noEmit` | UI 框架类型检查 |
| `npm run lint` | 全项目 ESLint |

2026-10-29 复核：已修复 MainWin 嵌套红点展开登记缺失，红点结构与确认弹窗相关测试 11 项通过；当前状态详见实现记录。旧任务书和设计评审已移至 [历史归档](docs/archive/2026-10-29/README.md)，不再作为当前待办。

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
