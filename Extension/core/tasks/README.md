# Timer 任务引擎（MVP）

## 已实现

| 类型 | 说明 |
|------|------|
| **定时任务** `schedule` | 指定 `HH:mm`，在**下一次**该时刻触发系统通知，**仅一次** |
| **倒计时** `countdown` | 从创建/启动起按**墙钟** `targetAt` 计时；关闭浏览器后仍继续，依赖 `browser.alarms` |

## 数据模型

- 定时：`fireAtMs` = 下次触发的绝对时间戳
- 倒计时：`targetAt = startedAt + durationMs`，到期由 alarm 触发通知

## 代码入口

- `taskEngine.js` — 创建 / 取消 / 完成 / 启动恢复
- `taskStore.js` — `local:timer-tasks` 持久化
- `alarmBridge.js` — 与 `browser.alarms` 同步

## 在控制台测试（Service Worker）

```js
import { createScheduleTask, createCountdownTask, listTasks, minutes } from './core/tasks/index.js';

await createScheduleTask({ title: '吃药', time: '14:30' });
await createCountdownTask({ title: '休息', durationMs: minutes(15) });
await listTasks();
```

## 通过消息调用（任意页面 / popup）

```js
await browser.runtime.sendMessage({
  type: 'timer_task',
  action: 'createSchedule',
  payload: { title: '吃药', time: '14:30' },
});

await browser.runtime.sendMessage({
  type: 'timer_task',
  action: 'createCountdown',
  payload: { title: '休息', durationMs: 15 * 60 * 1000 },
});

await browser.runtime.sendMessage({ type: 'timer_task', action: 'list' });
```

`action`: `createSchedule` | `createCountdown` | `startCountdown` | `cancel` | `list` | `get`
