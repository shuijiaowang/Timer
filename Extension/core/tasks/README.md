# Timer 任务引擎

面向 README 产品模型：可复用预设、置顶排序、定时周重复/指定日期、多实例倒计时、队列循环、内置模板。

## 概念

| 概念 | 说明 |
|------|------|
| **preset** | 各页面保存的配置，可编辑、置顶、启用/禁用，可反复 `restart` / `start` |
| **instance** | 由倒计时预设 `spawn` 的运行实例，支持多个并行倒计时 |
| **idle** | 预设未在计时（队列/循环/倒计时预设的默认态） |
| **scheduled** | 已注册 `browser.alarms`，等待触发 |

## 任务类型

| 类型 | 预设行为 | 运行 |
|------|----------|------|
| `schedule` | `repeatDays` 周重复，或 `date` 指定年月日一次性 | `enabled` 控制开关，到期后自动算下次 `fireAtMs` |
| `countdown` | 保存 `durationMs`、`isFavorite` | `startCountdown` / `spawnCountdown` 创建 **instance** |
| `loop` | 每轮 `durationMs`；可选 `windowStart` / `windowEnd` / `repeatDays` | `startLoop` 后持续循环；设时段则每日自动开始、到点结束 |
| `queue` | `steps[]`、`repeat`（整组循环）；可选时段字段 | `startQueue` 按步推进；时段内自动运行 |

共用字段：`enabled`、`pinned`、`reminderMode`（`quick` | `blocking`）、`triggerAtMs`（一次性定时引爆）。

循环/队列时段：`windowStart`（如 09:00 自动上班开始）、`windowEnd`（如 18:00 下班停止）、`repeatDays`（默认每天）。保存后若仅设开始时间，会进入 `pending` 等待次日开始；时段内按间隔/步骤提醒，结束后等待下一日开始。

## 消息 API（`timer_task`）

| action | payload 要点 |
|--------|----------------|
| `createSchedule` | `time`, `repeatDays?`, `date?`, `enabled?` |
| `createCountdown` | `durationMs`, `startNow?`（true 会 spawn 实例）, `isFavorite?` |
| `createLoop` / `createQueue` | 同前；`queue` 增加 `repeat?`；二者均可传 `windowStart?`, `windowEnd?`（`HH:mm` 或 `{hour,minute}`）, `repeatDays?` |
| `createFromTemplate` | `templateId`, `overrides?` |
| `spawnCountdown` | `id`（预设 id）, `options?` |
| `startCountdown` / `pauseCountdown` / `resumeCountdown` / `startLoop` / `startQueue` | `id` |
| `restart` | `id`（预设） |
| `update` | `id`, `patch` |
| `setEnabled` / `setPinned` | `id`, `enabled` / `pinned` |
| `delete` / `cancel` | `id` |
| `list` | `type?`, `role?`, `status?` — 返回已排序列表 |
| `listTemplates` | — |
| `get` | `id` |

## 内置模板

- `qq_farm` — 倒计时收菜；可用 `qqFarmDurationMs(baseHours, speedBonus)` 算时长

## 迁移

启动时 `loadTasks()` 自动把旧 MVP 数据补上 `role`、`idle`、`repeatDays` 等字段。

## 文件

- `types.js` — 数据模型
- `scheduleUtils.js` — `nextScheduleFireAt`、日期解析
- `taskEngine.js` — 业务逻辑
- `taskStore.js` — `local:timer-tasks`
- `templates.js` — 内置模板
- `migrateTasks.js` — 旧数据迁移
- `taskSort.js` — 列表排序（置顶 → 启用 → 状态）
