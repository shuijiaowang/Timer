const ALARM_PREFIX = 'timer-task:';
const TRIGGER_SUFFIX = ':trigger';
const WINDOW_END_SUFFIX = ':window-end';

/** @param {string} taskId @param {'fire' | 'trigger' | 'window-end'} [kind] */
export function alarmNameForTask(taskId, kind = 'fire') {
    if (kind === 'trigger') return `${ALARM_PREFIX}${taskId}${TRIGGER_SUFFIX}`;
    if (kind === 'window-end') return `${ALARM_PREFIX}${taskId}${WINDOW_END_SUFFIX}`;
    return `${ALARM_PREFIX}${taskId}`;
}

/** @param {string} alarmName */
export function taskIdFromAlarmName(alarmName) {
    if (!alarmName?.startsWith(ALARM_PREFIX)) return null;
    const rest = alarmName.slice(ALARM_PREFIX.length);
    if (rest.endsWith(TRIGGER_SUFFIX)) {
        return {taskId: rest.slice(0, -TRIGGER_SUFFIX.length), kind: 'trigger'};
    }
    if (rest.endsWith(WINDOW_END_SUFFIX)) {
        return {taskId: rest.slice(0, -WINDOW_END_SUFFIX.length), kind: 'window-end'};
    }
    return {taskId: rest, kind: 'fire'};
}

/** @param {string} taskId @param {number} whenMs */
export async function scheduleAlarm(taskId, whenMs) {
    const name = alarmNameForTask(taskId, 'fire');
    const when = Math.max(whenMs, Date.now() + 1000);
    await browser.alarms.clear(name);
    await browser.alarms.create(name, {when});
}

/** @param {string} taskId @param {number} whenMs */
export async function scheduleTriggerAlarm(taskId, whenMs) {
    const name = alarmNameForTask(taskId, 'trigger');
    const when = Math.max(whenMs, Date.now() + 1000);
    await browser.alarms.clear(name);
    await browser.alarms.create(name, {when});
}

/** @param {string} taskId @param {number} whenMs */
export async function scheduleWindowEndAlarm(taskId, whenMs) {
    const name = alarmNameForTask(taskId, 'window-end');
    const when = Math.max(whenMs, Date.now() + 1000);
    await browser.alarms.clear(name);
    await browser.alarms.create(name, {when});
}

/** @param {string} taskId */
export async function clearAlarm(taskId) {
    await browser.alarms.clear(alarmNameForTask(taskId, 'fire'));
    await browser.alarms.clear(alarmNameForTask(taskId, 'trigger'));
    await browser.alarms.clear(alarmNameForTask(taskId, 'window-end'));
}

/** 启动时把仍应触发的任务重新注册到 alarms */
export async function syncAlarmsForTasks(tasks) {
    const {TaskStatus, TaskType} = await import('./types.js');

    for (const task of tasks) {
        if (
            task.triggerAtMs &&
            task.triggerAtMs > Date.now() &&
            (task.status === TaskStatus.PENDING || task.status === TaskStatus.IDLE) &&
            task.enabled
        ) {
            await scheduleTriggerAlarm(task.id, task.triggerAtMs);
            continue;
        }

        if (task.status !== TaskStatus.SCHEDULED) continue;

        if (task.type === TaskType.SCHEDULE && task.fireAtMs) {
            await scheduleAlarm(task.id, task.fireAtMs);
        } else if (
            (task.type === TaskType.COUNTDOWN ||
                task.type === TaskType.QUEUE ||
                task.type === TaskType.LOOP) &&
            task.targetAt
        ) {
            await scheduleAlarm(task.id, task.targetAt);
            if (
                (task.type === TaskType.QUEUE || task.type === TaskType.LOOP) &&
                task.windowEnd
            ) {
                const {todayWindowEndAt} = await import('./scheduleUtils.js');
                const endMs = todayWindowEndAt(task.windowEnd);
                if (endMs) await scheduleWindowEndAlarm(task.id, endMs);
            }
        }
    }
}

export async function clearAllAlarms() {
    const all = await browser.alarms.getAll();
    for (const alarm of all) {
        if (alarm.name?.startsWith(ALARM_PREFIX)) {
            await browser.alarms.clear(alarm.name);
        }
    }
}
