/** @typedef {'schedule' | 'countdown' | 'queue' | 'loop'} TaskType */

/** @typedef {'preset' | 'instance'} TaskRole */

/**
 * idle — 已保存的预设，未在计时
 * pending — 已创建实例或队列等待手动/定时触发
 * scheduled — 已注册 alarm，等待到期
 * paused — 倒计时已暂停，剩余时长保存在 remainingMs
 * completed — 本次运行结束（实例）
 * cancelled — 已取消
 * @typedef {'idle' | 'pending' | 'scheduled' | 'paused' | 'completed' | 'cancelled'} TaskStatus
 */

/** @typedef {'quick' | 'blocking'} ReminderMode quick=闪提醒；blocking=需手动关闭 */

/**
 * @typedef {object} TaskBase
 * @property {string} id
 * @property {TaskType} type
 * @property {TaskRole} role
 * @property {string} title
 * @property {TaskStatus} status
 * @property {boolean} enabled 定时=闹钟开关；其它类型=是否允许启动
 * @property {boolean} pinned 置顶排序
 * @property {ReminderMode} reminderMode
 * @property {number} createdAt
 * @property {number} updatedAt
 * @property {string} [presetId] 实例指向的预设 id
 * @property {string} [sourceTemplateId] 从内置模板创建时记录
 */

/**
 * @typedef {object} CalendarDate
 * @property {number} year
 * @property {number} month 1-12
 * @property {number} day 1-31
 */

/**
 * @typedef {TaskBase & object} ScheduleTask
 * @property {'schedule'} type
 * @property {'preset'} role
 * @property {number} hour 0-23
 * @property {number} minute 0-59
 * @property {number[]} repeatDays 0=周日…6=周六；空数组且未设 date 时按每日处理
 * @property {CalendarDate | null} date 指定年月日一次性；与 repeatDays 二选一为主
 * @property {number | null} fireAtMs 下次触发时间戳
 * @property {number | null} [lastFiredAtMs]
 */

/**
 * @typedef {TaskBase & object} CountdownTask
 * @property {'countdown'} type
 * @property {number} durationMs
 * @property {boolean} [isFavorite] 常用倒计时标记
 * @property {number} [startedAt]
 * @property {number} [targetAt]
 * @property {number} [remainingMs] 暂停时记录的剩余毫秒
 * @property {number | null} [triggerAtMs] 定时引爆：到点自动 start
 */

/**
 * @typedef {object} QueueStep
 * @property {string} title
 * @property {number} durationMs
 */

/**
 * @typedef {object} TimeOfDay
 * @property {number} hour 0-23
 * @property {number} minute 0-59
 */

/**
 * @typedef {TaskBase & object} LoopTask
 * @property {'loop'} type
 * @property {number} durationMs
 * @property {number} [startedAt]
 * @property {number} [targetAt]
 * @property {number} cycleCount
 * @property {number | null} [triggerAtMs] 一次性定时引爆
 * @property {TimeOfDay | null} [windowStart] 每日自动开始时刻
 * @property {TimeOfDay | null} [windowEnd] 每日自动结束时刻
 * @property {number[]} [repeatDays] 时段生效的星期 0=周日…6=周六
 * @property {number | null} [nextWindowStartAtMs] 下次自动开始时间戳
 */

/**
 * @typedef {TaskBase & object} QueueTask
 * @property {'queue'} type
 * @property {QueueStep[]} steps
 * @property {boolean} repeat 跑完所有步骤后是否从头循环
 * @property {number} currentStepIndex
 * @property {number} cycleCount 队列完整跑完的次数
 * @property {number} [startedAt]
 * @property {number} [targetAt]
 * @property {number | null} [triggerAtMs]
 * @property {TimeOfDay | null} [windowStart]
 * @property {TimeOfDay | null} [windowEnd]
 * @property {number[]} [repeatDays]
 * @property {number | null} [nextWindowStartAtMs]
 */

/** @typedef {ScheduleTask | CountdownTask | QueueTask | LoopTask} TimerTask */

export const TaskType = {
    SCHEDULE: 'schedule',
    COUNTDOWN: 'countdown',
    QUEUE: 'queue',
    LOOP: 'loop',
};

export const TaskRole = {
    PRESET: 'preset',
    INSTANCE: 'instance',
};

export const TaskStatus = {
    IDLE: 'idle',
    PENDING: 'pending',
    SCHEDULED: 'scheduled',
    PAUSED: 'paused',
    COMPLETED: 'completed',
    CANCELLED: 'cancelled',
};

export const ReminderMode = {
    QUICK: 'quick',
    BLOCKING: 'blocking',
};

/** @type {number[]} */
export const ALL_WEEKDAYS = [0, 1, 2, 3, 4, 5, 6];

