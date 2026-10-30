# 日志广播

`Log` 是游戏日志的统一入口，无需初始化。`LogBus` 不依赖 Cocos，可以独立测试。

```ts
import { Log, LogChannel } from '../../../Frame/Log';

Log.verbose = true; // console 默认输出 info/debug；设为 false 可静默这两级
Log.info('进入界面', 'UI'); // 旧调用方式仍然有效
Log.error('加载失败', { tag: 'Resource', data: error }); // 保留原始 Error 和堆栈
Log.info('回合开始', {
    tag: 'Battle',
    channels: LogChannel.Console,
    data: { turn: 1 },
});
```

`tag` 是模块标签，`channels` 是输出目的地掩码，两者独立。未指定频道时使用 Console；None 不分发。支持 debug、info、warn、error 四个等级。`verbose` 只控制内置 console 的 info/debug 输出（默认开启），其他接收端始终能收到所有等级。

## 添加输出频道

首版只内置 Console。后续在 `LogChannel` 中添加 `Toast = 1 << 1`、`Banner = 1 << 2` 等独立位，再注册对应接收端：

```ts
// 添加上述枚举值之后：
const unsubscribe = Log.subscribe(LogChannel.Toast, entry => {
    // 将 entry.message 加入飘字队列
});

Log.info('攻击提升', {
    tag: 'Battle',
    channels: LogChannel.Console | LogChannel.Toast,
});

unsubscribe(); // 接收端销毁时退订；可重复调用
```

一个订阅可以监听多个频道，同一条日志只调用该订阅一次。界面订阅可使用 `this.binder.add(Log.subscribe(mask, handler))` 登记生命周期清理。频道使用非负 31 位整数，最多 31 个独立位。

每条记录包含递增序号、毫秒时间戳、等级、文本、标签、频道和可选 data。记录浅冻结，data 保留原始引用，不会深拷贝或持久化。订阅修改从下一条记录生效。

广播同步按顺序调用接收端，嵌套日志排队，避免同步回调互相产生日志导致无限递归。接收端异常相互隔离，异步拒绝也会捕获并直接输出 console；广播不会等待异步接收端完成。接收端应负责展示或入队，避免在 await 后再次向同一日志链写入日志。

游戏脚本统一使用 Log；ESLint 会对直接使用 console 发出警告。仅 console 适配器直接调用 console。引擎、第三方库的日志和未捕获异常不会自动拦截。

验证：项目根目录执行 `npm run test:log`。
