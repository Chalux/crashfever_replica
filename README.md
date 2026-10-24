# CrashFever Replica

以学习开发为目的，基于 Cocos Creator 3.8.8 / TypeScript 重制日服 CrashFever 的离线单人核心体验，支持 Windows、Android 和浏览器。

- [已确认需求总纲](docs/项目总纲.md)：项目范围、页面流程、编队、战斗恢复、存档、开发顺序与待核实项。
- [现有 UI 框架](assets/Scripts/Frame/UI/README.md)：界面接入与生命周期。
- [UI 冒烟驱动](tools/uitest/README.md)：现有框架验证方式。
- [本地设置存储](docs/本地设置存储.md)：设置保存、备份恢复与验证方式。

用户负责实现，助手负责拆任务与指导。开发顺序为启动界面、角色编队、战斗与关卡选择。原作具体规则与界面细节须以提供资料和逆向结果核实。

## 代码命名检查

运行 `npm run lint` 检查项目脚本和工具代码，运行 `npm run lint:app` 只检查启动模块。

- 局部变量、参数、public 字段（包括省略 public 的字段）使用小驼峰，不加前导下划线。
- 静态字段使用大驼峰 `PascalCase` 或全大写 `UPPER_CASE`，不加前导下划线，包括 private 静态字段。
- 非静态 private 字段使用 `_camelCase`，包含构造参数属性。
- protected 字段使用普通小驼峰；方法、类名、类型名和导入名不在这次变量命名规则范围内。
- 违规级别为 warning，不自动重命名。第三方插件及生成目录不参与检查。

VS Code 中安装工作区推荐的 ESLint 扩展，即可在输入时看到黄色波浪线及“问题”面板警告；这不是 Cocos 运行时弹窗。其他编辑器需启用相应 ESLint 支持。

Cocos 的 `@property` 字段改名后，需要在编辑器重新绑定并保存场景/Prefab，或通过 `formerlySerializedAs` 迁移旧字段，避免丢失序列化引用。
