const ALARM_PREFIX = 'timer-task:';
const TRIGGER_SUFFIX = ':trigger';

/** @param {string} taskId @param {'fire' | 'trigger'} [kind] */
export function alarmNameForTask(taskId, kind = 'fire') {
    return kind === 'trigger'
        ? `${ALARM_PREFIX}${taskId}${TRIGGER_SUFFIX}`
        : `${ALARM_PREFIX}${taskId}`;
}

/** @param {string} alarmName */
export function taskIdFromAlarmName(alarmName) {
    if (!alarmName?.startsWith(ALARM_PREFIX)) return null;
    const rest = alarmName.slice(ALARM_PREFIX.length);
    if (rest.endsWith(TRIGGER_SUFFIX)) {
        return {taskId: rest.slice(0, -TRIGGER_SUFFIX.length), kind: 'trigger'};
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

/** @param {string} taskId */
export async function clearAlarm(taskId) {
    await browser.alarms.clear(alarmNameForTask(taskId, 'fire'));
    await browser.alarms.clear(alarmNameForTask(taskId, 'trigger'));
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
