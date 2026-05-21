const ALARM_PREFIX = 'timer-task:';

/** @param {string} taskId */
export function alarmNameForTask(taskId) {
    return `${ALARM_PREFIX}${taskId}`;
}

/** @param {string} alarmName */
export function taskIdFromAlarmName(alarmName) {
    if (!alarmName?.startsWith(ALARM_PREFIX)) return null;
    return alarmName.slice(ALARM_PREFIX.length);
}

/** @param {string} taskId @param {number} whenMs */
export async function scheduleAlarm(taskId, whenMs) {
    const name = alarmNameForTask(taskId);
    const when = Math.max(whenMs, Date.now() + 1000);
    await browser.alarms.clear(name);
    await browser.alarms.create(name, {when});
}

/** @param {string} taskId */
export async function clearAlarm(taskId) {
    await browser.alarms.clear(alarmNameForTask(taskId));
}

/** 启动时把仍应触发的任务重新注册到 alarms */
export async function syncAlarmsForTasks(tasks) {
    const {TaskStatus, TaskType} = await import('./types.js');
    for (const task of tasks) {
        if (task.status !== TaskStatus.SCHEDULED) continue;
        if (task.type === TaskType.SCHEDULE && task.fireAtMs) {
            await scheduleAlarm(task.id, task.fireAtMs);
        } else if (task.type === TaskType.COUNTDOWN && task.targetAt) {
            await scheduleAlarm(task.id, task.targetAt);
        }
    }
}
