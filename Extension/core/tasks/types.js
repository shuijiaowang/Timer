/** @typedef {'schedule' | 'countdown'} TaskType */

/** @typedef {'pending' | 'scheduled' | 'completed' | 'cancelled'} TaskStatus */

/**
 * @typedef {object} ScheduleTask
 * @property {string} id
 * @property {'schedule'} type
 * @property {string} title
 * @property {number} hour 0-23
 * @property {number} minute 0-59
 * @property {TaskStatus} status
 * @property {number} fireAtMs 目标触发时间戳（一次性）
 * @property {number} createdAt
 */

/**
 * @typedef {object} CountdownTask
 * @property {string} id
 * @property {'countdown'} type
 * @property {string} title
 * @property {number} durationMs
 * @property {TaskStatus} status
 * @property {number} [startedAt]
 * @property {number} [targetAt] 墙钟目标时间，关闭浏览器后仍按此时间到期
 * @property {number} createdAt
 */

/** @typedef {ScheduleTask | CountdownTask} TimerTask */

export const TaskType = {
    SCHEDULE: 'schedule',
    COUNTDOWN: 'countdown',
};

export const TaskStatus = {
    PENDING: 'pending',
    SCHEDULED: 'scheduled',
    COMPLETED: 'completed',
    CANCELLED: 'cancelled',
};
