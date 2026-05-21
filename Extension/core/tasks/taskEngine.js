import {showReminderNotification} from '../reminderNotification.js';
import {clearAlarm, scheduleAlarm, syncAlarmsForTasks, taskIdFromAlarmName} from './alarmBridge.js';
import {countdownTargetAt, nextFireAt, parseTimeOfDay, remainingMs} from './scheduleUtils.js';
import {getTask, listActiveTasks, loadTasks, patchTask, removeTask, upsertTask} from './taskStore.js';
import {TaskStatus, TaskType} from './types.js';

function createId() {
    return globalThis.crypto?.randomUUID?.() ?? `task-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * 定时任务：在下一个 HH:mm 提醒一次
 * @param {{ title?: string, time: string | { hour: number, minute: number } }} options
 */
export async function createScheduleTask({title = '定时提醒', time}) {
    const {hour, minute} = parseTimeOfDay(time);
    const fireAtMs = nextFireAt(hour, minute);
    /** @type {import('./types.js').ScheduleTask} */
    const task = {
        id: createId(),
        type: TaskType.SCHEDULE,
        title,
        hour,
        minute,
        status: TaskStatus.SCHEDULED,
        fireAtMs,
        createdAt: Date.now(),
    };
    await upsertTask(task);
    await scheduleAlarm(task.id, fireAtMs);
    return task;
}

/**
 * 倒计时任务：从创建时刻起按墙钟计时，关闭浏览器后仍继续
 * @param {{ title?: string, durationMs: number, startNow?: boolean }} options durationMs 毫秒
 */
export async function createCountdownTask({title = '倒计时', durationMs, startNow = true}) {
    if (!durationMs || durationMs <= 0) {
        throw new Error('durationMs 必须大于 0');
    }
    const now = Date.now();
    /** @type {import('./types.js').CountdownTask} */
    const task = {
        id: createId(),
        type: TaskType.COUNTDOWN,
        title,
        durationMs,
        status: startNow ? TaskStatus.SCHEDULED : TaskStatus.PENDING,
        createdAt: now,
    };
    if (startNow) {
        task.startedAt = now;
        task.targetAt = countdownTargetAt(durationMs, now);
        await upsertTask(task);
        await scheduleAlarm(task.id, task.targetAt);
    } else {
        await upsertTask(task);
    }
    return task;
}

/** 启动尚未开始的倒计时 */
export async function startCountdownTask(id) {
    const task = await getTask(id);
    if (!task || task.type !== TaskType.COUNTDOWN) {
        throw new Error(`倒计时任务不存在: ${id}`);
    }
    if (task.status === TaskStatus.COMPLETED || task.status === TaskStatus.CANCELLED) {
        throw new Error(`任务已结束: ${task.status}`);
    }
    const now = Date.now();
    const startedAt = now;
    const targetAt = countdownTargetAt(task.durationMs, startedAt);
    const updated = await patchTask(id, {
        status: TaskStatus.SCHEDULED,
        startedAt,
        targetAt,
    });
    await scheduleAlarm(id, targetAt);
    return updated;
}

/** @param {string} id */
export async function cancelTask(id) {
    const task = await getTask(id);
    if (!task) return null;
    await clearAlarm(id);
    return patchTask(id, {status: TaskStatus.CANCELLED});
}

export async function listTasks() {
    return loadTasks();
}

/** @param {string} id */
export function getTaskSnapshot(id) {
    return getTask(id);
}

/**
 * 恢复：处理已过期但未触发的任务（alarms 未响或扩展刚安装）
 */
export async function reconcileTasksOnStartup() {
    const tasks = await loadTasks();
    const now = Date.now();
    let changed = false;

    for (const task of tasks) {
        if (task.status !== TaskStatus.SCHEDULED) continue;

        let dueAt = null;
        if (task.type === TaskType.SCHEDULE) dueAt = task.fireAtMs;
        if (task.type === TaskType.COUNTDOWN) dueAt = task.targetAt;

        if (dueAt != null && dueAt <= now) {
            await completeTask(task.id, {fromReconcile: true});
            changed = true;
        }
    }

    const fresh = changed ? await loadTasks() : tasks;
    await syncAlarmsForTasks(listActiveTasks(fresh));
    return fresh;
}

/**
 * @param {string} taskId
 * @param {{ fromReconcile?: boolean }} [options]
 */
export async function completeTask(taskId, options = {}) {
    const task = await getTask(taskId);
    if (!task) return null;
    if (task.status === TaskStatus.COMPLETED || task.status === TaskStatus.CANCELLED) {
        return task;
    }

    await clearAlarm(taskId);

    let message = '';
    if (task.type === TaskType.SCHEDULE) {
        const pad = (n) => String(n).padStart(2, '0');
        message = `定时 ${pad(task.hour)}:${pad(task.minute)} 已到`;
    } else if (task.type === TaskType.COUNTDOWN) {
        const mins = Math.round(task.durationMs / 60000);
        message = options.fromReconcile
            ? `倒计时 ${mins} 分钟已结束（恢复时补发）`
            : `倒计时 ${mins} 分钟已结束`;
    }

    showReminderNotification(
        {title: task.title, message},
        {requireInteraction: false, silent: false},
    );

    return patchTask(taskId, {status: TaskStatus.COMPLETED});
}

/** @param {{ name: string }} alarm */
export async function onAlarmFired(alarm) {
    const taskId = taskIdFromAlarmName(alarm.name);
    if (!taskId) return;
    await completeTask(taskId);
}

export function initTaskEngine() {
    browser.alarms.onAlarm.addListener((alarm) => {
        onAlarmFired(alarm).catch((err) => console.error('[Timer] alarm handler failed', err));
    });

    reconcileTasksOnStartup().catch((err) => console.error('[Timer] startup reconcile failed', err));
}

/** 便捷：分钟 -> 毫秒 */
export function minutes(n) {
    return n * 60 * 1000;
}

export {remainingMs, parseTimeOfDay, nextFireAt};
