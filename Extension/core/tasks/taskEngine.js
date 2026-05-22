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

/**
 * 队列任务：按顺序执行多段倒计时，上一段结束后自动开始下一段
 * @param {{ title?: string, steps: { title?: string, durationMs: number }[], startNow?: boolean }} options
 */
export async function createQueueTask({title = '队列任务', steps, startNow = true}) {
    if (!steps?.length) {
        throw new Error('steps 不能为空');
    }
    const normalized = steps.map((step, i) => {
        if (!step.durationMs || step.durationMs <= 0) {
            throw new Error(`第 ${i + 1} 步 durationMs 必须大于 0`);
        }
        return {
            title: step.title?.trim() || `步骤 ${i + 1}`,
            durationMs: step.durationMs,
        };
    });
    const now = Date.now();
    /** @type {import('./types.js').QueueTask} */
    const task = {
        id: createId(),
        type: TaskType.QUEUE,
        title,
        steps: normalized,
        currentStepIndex: 0,
        status: startNow ? TaskStatus.SCHEDULED : TaskStatus.PENDING,
        createdAt: now,
    };
    if (startNow) {
        task.startedAt = now;
        task.targetAt = countdownTargetAt(normalized[0].durationMs, now);
        await upsertTask(task);
        await scheduleAlarm(task.id, task.targetAt);
    } else {
        await upsertTask(task);
    }
    return task;
}

/** 启动尚未开始的队列任务（从第一步开始） */
export async function startQueueTask(id) {
    const task = await getTask(id);
    if (!task || task.type !== TaskType.QUEUE) {
        throw new Error(`队列任务不存在: ${id}`);
    }
    if (task.status === TaskStatus.COMPLETED || task.status === TaskStatus.CANCELLED) {
        throw new Error(`任务已结束: ${task.status}`);
    }
    const now = Date.now();
    const step = task.steps[task.currentStepIndex];
    const targetAt = countdownTargetAt(step.durationMs, now);
    const updated = await patchTask(id, {
        status: TaskStatus.SCHEDULED,
        startedAt: task.startedAt ?? now,
        targetAt,
    });
    await scheduleAlarm(id, targetAt);
    return updated;
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
        if (task.type === TaskType.COUNTDOWN || task.type === TaskType.QUEUE) dueAt = task.targetAt;

        while (dueAt != null && dueAt <= now) {
            await completeTask(task.id, {fromReconcile: true});
            changed = true;
            const fresh = await getTask(task.id);
            if (!fresh || fresh.status !== TaskStatus.SCHEDULED) break;
            if (fresh.type === TaskType.QUEUE) {
                dueAt = fresh.targetAt;
            } else {
                break;
            }
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

    if (task.type === TaskType.QUEUE) {
        const step = task.steps[task.currentStepIndex];
        const stepLabel = formatDurationLabel(step.durationMs);
        const stepMessage = options.fromReconcile
            ? `「${step.title}」${stepLabel} 已结束（恢复时补发）`
            : `「${step.title}」${stepLabel} 已结束`;

        const nextIndex = task.currentStepIndex + 1;
        if (nextIndex < task.steps.length) {
            showReminderNotification(
                {title: task.title, message: stepMessage},
                {requireInteraction: false, silent: false},
            );
            const now = Date.now();
            const nextStep = task.steps[nextIndex];
            const targetAt = countdownTargetAt(nextStep.durationMs, now);
            await scheduleAlarm(taskId, targetAt);
            return patchTask(taskId, {
                currentStepIndex: nextIndex,
                targetAt,
            });
        }

        showReminderNotification(
            {
                title: task.title,
                message: options.fromReconcile
                    ? `队列已全部完成（恢复时补发）`
                    : `队列已全部完成`,
            },
            {requireInteraction: false, silent: false},
        );
        return patchTask(taskId, {status: TaskStatus.COMPLETED});
    }

    let message = '';
    if (task.type === TaskType.SCHEDULE) {
        const pad = (n) => String(n).padStart(2, '0');
        message = `定时 ${pad(task.hour)}:${pad(task.minute)} 已到`;
    } else if (task.type === TaskType.COUNTDOWN) {
        message = options.fromReconcile
            ? `倒计时 ${formatDurationLabel(task.durationMs)} 已结束（恢复时补发）`
            : `倒计时 ${formatDurationLabel(task.durationMs)} 已结束`;
    }

    showReminderNotification(
        {title: task.title, message},
        {requireInteraction: false, silent: false},
    );

    return patchTask(taskId, {status: TaskStatus.COMPLETED});
}

/** @param {number} durationMs */
function formatDurationLabel(durationMs) {
    const totalSec = Math.round(durationMs / 1000);
    if (totalSec < 60) return `${totalSec} 秒`;
    const mins = Math.round(durationMs / 60000);
    return `${mins} 分钟`;
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

/** 便捷：秒 -> 毫秒 */
export function seconds(n) {
    return n * 1000;
}

export {remainingMs, parseTimeOfDay, nextFireAt};
