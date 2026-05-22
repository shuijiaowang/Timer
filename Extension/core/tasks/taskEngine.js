import {showReminderNotification} from '../reminderNotification.js';
import {getUserSettings} from '../userSettings.js';
import {
    clearAlarm,
    scheduleAlarm,
    scheduleTriggerAlarm,
    syncAlarmsForTasks,
    taskIdFromAlarmName,
    clearAllAlarms,
} from './alarmBridge.js';
import {
    countdownTargetAt,
    nextScheduleFireAt,
    normalizeRepeatDays,
    parseCalendarDate,
    parseTimeOfDay,
    remainingMs,
} from './scheduleUtils.js';
import {BUILTIN_TEMPLATES, getTemplateBuildPayload, listBuiltinTemplates} from './templates.js';
import {
    getTask,
    listActiveTasks,
    listTasksFiltered,
    loadTasks,
    patchTask,
    removeInstancesOfPreset,
    removeTask,
    upsertTask,
    clearAllTasks,
} from './taskStore.js';
import {
    ALL_WEEKDAYS,
    ReminderMode,
    TaskRole,
    TaskStatus,
    TaskType,
} from './types.js';

function createId() {
    return globalThis.crypto?.randomUUID?.() ?? `task-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/** @param {import('./types.js').TimerTask} task */
async function notifyOptions() {
    const settings = await getUserSettings();
    return {
        requireInteraction: settings.notification.manualClose,
        silent: !settings.notification.sound,
    };
}

/** @param {Partial<import('./types.js').TimerTask>} extra */
function baseFields(extra = {}) {
    const now = Date.now();
    return {
        enabled: true,
        pinned: false,
        reminderMode: ReminderMode.QUICK,
        createdAt: now,
        updatedAt: now,
        ...extra,
    };
}

/**
 * @param {import('./types.js').ScheduleTask} task
 */
async function applyScheduleTiming(task) {
    if (!task.enabled) {
        await clearAlarm(task.id);
        return patchTask(task.id, {
            status: TaskStatus.IDLE,
            fireAtMs: null,
        });
    }

    const fireAtMs = nextScheduleFireAt({
        hour: task.hour,
        minute: task.minute,
        repeatDays: task.repeatDays,
        date: task.date,
    });

    if (fireAtMs == null) {
        await clearAlarm(task.id);
        return patchTask(task.id, {
            status: TaskStatus.IDLE,
            fireAtMs: null,
        });
    }

    await scheduleAlarm(task.id, fireAtMs);
    return patchTask(task.id, {
        status: TaskStatus.SCHEDULED,
        fireAtMs,
    });
}

/**
 * @param {import('./types.js').TimerTask} task
 */
async function applyTriggerAlarm(task) {
    if (
        task.triggerAtMs &&
        task.triggerAtMs > Date.now() &&
        task.enabled &&
        (task.status === TaskStatus.IDLE || task.status === TaskStatus.PENDING)
    ) {
        await scheduleTriggerAlarm(task.id, task.triggerAtMs);
        return patchTask(task.id, {status: TaskStatus.PENDING});
    }
    await clearAlarm(task.id);
    return task;
}

/**
 * 定时任务预设
 * @param {{
 *   title?: string,
 *   time: string | { hour: number, minute: number },
 *   repeatDays?: number[],
 *   date?: { year: number, month: number, day: number } | null,
 *   enabled?: boolean,
 *   pinned?: boolean,
 *   reminderMode?: import('./types.js').ReminderMode,
 * }} options
 */
export async function createScheduleTask({
    title = '定时提醒',
    time,
    repeatDays = ALL_WEEKDAYS,
    date = null,
    enabled = true,
    pinned = false,
    reminderMode = ReminderMode.QUICK,
}) {
    const {hour, minute} = parseTimeOfDay(time);
    const parsedDate = date ? parseCalendarDate(date) : null;
    /** @type {import('./types.js').ScheduleTask} */
    const task = {
        id: createId(),
        type: TaskType.SCHEDULE,
        role: TaskRole.PRESET,
        title,
        hour,
        minute,
        repeatDays: normalizeRepeatDays(repeatDays),
        date: parsedDate,
        status: TaskStatus.IDLE,
        fireAtMs: null,
        lastFiredAtMs: null,
        ...baseFields({enabled, pinned, reminderMode}),
    };

    await upsertTask(task);
    if (enabled) {
        return applyScheduleTiming(task);
    }
    return task;
}

/**
 * 倒计时预设（默认 idle；startNow 会额外创建并启动一个实例）
 * @param {{
 *   title?: string,
 *   durationMs: number,
 *   startNow?: boolean,
 *   isFavorite?: boolean,
 *   enabled?: boolean,
 *   pinned?: boolean,
 *   triggerAtMs?: number | null,
 *   reminderMode?: import('./types.js').ReminderMode,
 *   sourceTemplateId?: string,
 * }} options
 */
export async function createCountdownTask({
    title = '倒计时',
    durationMs,
    startNow = false,
    isFavorite = false,
    enabled = true,
    pinned = false,
    triggerAtMs = null,
    reminderMode = ReminderMode.QUICK,
    sourceTemplateId,
}) {
    if (!durationMs || durationMs <= 0) {
        throw new Error('durationMs 必须大于 0');
    }
    /** @type {import('./types.js').CountdownTask} */
    const task = {
        id: createId(),
        type: TaskType.COUNTDOWN,
        role: TaskRole.PRESET,
        title,
        durationMs,
        isFavorite,
        status: TaskStatus.IDLE,
        triggerAtMs: triggerAtMs ?? null,
        ...baseFields({enabled, pinned, reminderMode, sourceTemplateId}),
    };
    await upsertTask(task);
    if (triggerAtMs && triggerAtMs > Date.now() && enabled) {
        await applyTriggerAlarm(task);
    }
    if (startNow) {
        return spawnCountdownInstance(task.id, {startImmediately: true});
    }
    return task;
}

/**
 * @param {import('./types.js').CountdownTask} preset
 * @param {{ startImmediately?: boolean }} [options]
 */
export async function spawnCountdownInstance(presetId, options = {}) {
    const preset = await getTask(presetId);
    if (!preset || preset.type !== TaskType.COUNTDOWN || preset.role !== TaskRole.PRESET) {
        throw new Error(`倒计时预设不存在: ${presetId}`);
    }
    if (!preset.enabled) {
        throw new Error('该倒计时已禁用');
    }
    const now = Date.now();
    /** @type {import('./types.js').CountdownTask} */
    const instance = {
        id: createId(),
        type: TaskType.COUNTDOWN,
        role: TaskRole.INSTANCE,
        presetId: preset.id,
        title: preset.title,
        durationMs: preset.durationMs,
        status: options.startImmediately ? TaskStatus.SCHEDULED : TaskStatus.PENDING,
        ...baseFields({
            enabled: true,
            pinned: false,
            reminderMode: preset.reminderMode,
        }),
    };
    if (options.startImmediately) {
        instance.startedAt = now;
        instance.targetAt = countdownTargetAt(preset.durationMs, now);
    }
    await upsertTask(instance);
    if (options.startImmediately && instance.targetAt) {
        await scheduleAlarm(instance.id, instance.targetAt);
    }
    return instance;
}

/**
 * 循环任务预设
 */
export async function createLoopTask({
    title = '循环提醒',
    durationMs,
    startNow = false,
    enabled = true,
    pinned = false,
    triggerAtMs = null,
    reminderMode = ReminderMode.QUICK,
    sourceTemplateId,
}) {
    if (!durationMs || durationMs <= 0) {
        throw new Error('durationMs 必须大于 0');
    }
    /** @type {import('./types.js').LoopTask} */
    const task = {
        id: createId(),
        type: TaskType.LOOP,
        role: TaskRole.PRESET,
        title,
        durationMs,
        cycleCount: 0,
        status: TaskStatus.IDLE,
        triggerAtMs: triggerAtMs ?? null,
        ...baseFields({enabled, pinned, reminderMode, sourceTemplateId}),
    };
    await upsertTask(task);
    if (triggerAtMs && triggerAtMs > Date.now() && enabled) {
        await applyTriggerAlarm(task);
    }
    if (startNow) {
        return startLoopTask(task.id);
    }
    return task;
}

/**
 * 队列任务预设
 */
export async function createQueueTask({
    title = '队列任务',
    steps,
    repeat = false,
    startNow = false,
    enabled = true,
    pinned = false,
    triggerAtMs = null,
    reminderMode = ReminderMode.QUICK,
    sourceTemplateId,
}) {
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
    /** @type {import('./types.js').QueueTask} */
    const task = {
        id: createId(),
        type: TaskType.QUEUE,
        role: TaskRole.PRESET,
        title,
        steps: normalized,
        repeat: Boolean(repeat),
        currentStepIndex: 0,
        cycleCount: 0,
        status: TaskStatus.IDLE,
        triggerAtMs: triggerAtMs ?? null,
        ...baseFields({enabled, pinned, reminderMode, sourceTemplateId}),
    };
    await upsertTask(task);
    if (triggerAtMs && triggerAtMs > Date.now() && enabled) {
        await applyTriggerAlarm(task);
    }
    if (startNow) {
        return startQueueTask(task.id);
    }
    return task;
}

/** 从内置模板创建 preset */
export async function createTaskFromTemplate(templateId, overrides = {}) {
    const tpl = BUILTIN_TEMPLATES[templateId];
    if (!tpl) {
        throw new Error(`未知模板: ${templateId}`);
    }
    const payload = getTemplateBuildPayload(templateId, overrides);
    const common = {
        title: payload.title,
        enabled: overrides.enabled ?? true,
        pinned: overrides.pinned ?? false,
        startNow: overrides.startNow ?? false,
        triggerAtMs: overrides.triggerAtMs ?? null,
        reminderMode: overrides.reminderMode ?? ReminderMode.QUICK,
        sourceTemplateId: templateId,
    };

    if (tpl.type === TaskType.QUEUE) {
        return createQueueTask({
            ...common,
            steps: payload.steps,
            repeat: payload.repeat ?? false,
        });
    }
    if (tpl.type === TaskType.LOOP) {
        return createLoopTask({
            ...common,
            durationMs: payload.durationMs,
        });
    }
    return createCountdownTask({
        ...common,
        durationMs: payload.durationMs,
    });
}

/** @param {string} id */
export async function startCountdownTask(id) {
    const task = await getTask(id);
    if (!task || task.type !== TaskType.COUNTDOWN) {
        throw new Error(`倒计时任务不存在: ${id}`);
    }
    if (task.role === TaskRole.PRESET) {
        return spawnCountdownInstance(id, {startImmediately: true});
    }
    if (task.status === TaskStatus.COMPLETED || task.status === TaskStatus.CANCELLED) {
        throw new Error(`任务已结束: ${task.status}`);
    }
    const now = Date.now();
    const targetAt = countdownTargetAt(task.durationMs, now);
    const updated = await patchTask(id, {
        status: TaskStatus.SCHEDULED,
        startedAt: now,
        targetAt,
    });
    await scheduleAlarm(id, targetAt);
    return updated;
}

/** @param {string} id */
export async function pauseCountdownTask(id) {
    const task = await getTask(id);
    if (!task || task.type !== TaskType.COUNTDOWN) {
        throw new Error(`倒计时任务不存在: ${id}`);
    }
    if (task.status !== TaskStatus.SCHEDULED) {
        throw new Error('只能暂停进行中的倒计时');
    }
    if (task.targetAt == null) {
        throw new Error('倒计时未启动');
    }
    const remain = remainingMs(task.targetAt);
    await clearAlarm(id);
    return patchTask(id, {
        status: TaskStatus.PAUSED,
        remainingMs: remain,
        targetAt: undefined,
    });
}

/** @param {string} id */
export async function resumeCountdownTask(id) {
    const task = await getTask(id);
    if (!task || task.type !== TaskType.COUNTDOWN) {
        throw new Error(`倒计时任务不存在: ${id}`);
    }
    if (task.status !== TaskStatus.PAUSED) {
        throw new Error('只能继续已暂停的倒计时');
    }
    const remain = task.remainingMs ?? task.durationMs;
    if (remain <= 0) {
        throw new Error('剩余时间无效');
    }
    const now = Date.now();
    const targetAt = now + remain;
    const updated = await patchTask(id, {
        status: TaskStatus.SCHEDULED,
        remainingMs: undefined,
        targetAt,
        startedAt: task.startedAt ?? now,
    });
    await scheduleAlarm(id, targetAt);
    return updated;
}

/** @param {string} id */
export async function startLoopTask(id) {
    const task = await getTask(id);
    if (!task || task.type !== TaskType.LOOP || task.role !== TaskRole.PRESET) {
        throw new Error(`循环任务不存在: ${id}`);
    }
    if (!task.enabled) throw new Error('该循环任务已禁用');
    if (task.status === TaskStatus.CANCELLED) {
        throw new Error(`任务已结束: ${task.status}`);
    }
    const now = Date.now();
    const targetAt = countdownTargetAt(task.durationMs, now);
    const updated = await patchTask(id, {
        status: TaskStatus.SCHEDULED,
        startedAt: task.startedAt ?? now,
        targetAt,
        cycleCount: task.cycleCount ?? 0,
    });
    await scheduleAlarm(id, targetAt);
    return updated;
}

/** @param {string} id */
export async function startQueueTask(id) {
    const task = await getTask(id);
    if (!task || task.type !== TaskType.QUEUE || task.role !== TaskRole.PRESET) {
        throw new Error(`队列任务不存在: ${id}`);
    }
    if (!task.enabled) throw new Error('该队列任务已禁用');
    if (task.status === TaskStatus.CANCELLED) {
        throw new Error(`任务已结束: ${task.status}`);
    }
    const now = Date.now();
    const step = task.steps[task.currentStepIndex ?? 0];
    const targetAt = countdownTargetAt(step.durationMs, now);
    const updated = await patchTask(id, {
        status: TaskStatus.SCHEDULED,
        startedAt: task.startedAt ?? now,
        targetAt,
        currentStepIndex: task.currentStepIndex ?? 0,
    });
    await scheduleAlarm(id, targetAt);
    return updated;
}

/**
 * 复用预设重新启动（队列/循环重置；倒计时新建实例）
 * @param {string} id preset id
 */
export async function restartTask(id) {
    const task = await getTask(id);
    if (!task) throw new Error(`任务不存在: ${id}`);

    await cancelTask(id);

    if (task.type === TaskType.COUNTDOWN && task.role === TaskRole.PRESET) {
        return spawnCountdownInstance(id, {startImmediately: true});
    }
    if (task.type === TaskType.LOOP) {
        await patchTask(id, {cycleCount: 0, startedAt: undefined, targetAt: undefined});
        return startLoopTask(id);
    }
    if (task.type === TaskType.QUEUE) {
        await patchTask(id, {
            currentStepIndex: 0,
            cycleCount: 0,
            startedAt: undefined,
            targetAt: undefined,
        });
        return startQueueTask(id);
    }
    if (task.type === TaskType.SCHEDULE) {
        return applyScheduleTiming(/** @type {import('./types.js').ScheduleTask} */ (task));
    }
    throw new Error('该任务类型不支持 restart');
}

/**
 * @param {string} id
 * @param {object} patch
 */
export async function updateTask(id, patch) {
    const task = await getTask(id);
    if (!task) throw new Error(`任务不存在: ${id}`);

    /** @type {Record<string, unknown>} */
    const next = {updatedAt: Date.now()};

    if (patch.title != null) next.title = String(patch.title).trim() || task.title;
    if (patch.enabled != null) next.enabled = Boolean(patch.enabled);
    if (patch.pinned != null) next.pinned = Boolean(patch.pinned);
    if (patch.reminderMode != null) next.reminderMode = patch.reminderMode;
    if (patch.isFavorite != null) next.isFavorite = Boolean(patch.isFavorite);
    if (patch.triggerAtMs !== undefined) next.triggerAtMs = patch.triggerAtMs;

    if (task.type === TaskType.SCHEDULE && task.role === TaskRole.PRESET) {
        if (patch.time != null) {
            const {hour, minute} = parseTimeOfDay(patch.time);
            next.hour = hour;
            next.minute = minute;
        }
        if (patch.hour != null) next.hour = patch.hour;
        if (patch.minute != null) next.minute = patch.minute;
        if (patch.repeatDays != null) {
            next.repeatDays = normalizeRepeatDays(patch.repeatDays);
        }
        if (patch.date !== undefined) {
            next.date = patch.date ? parseCalendarDate(patch.date) : null;
        }
    }

    if (task.type === TaskType.COUNTDOWN && patch.durationMs != null) {
        if (patch.durationMs <= 0) throw new Error('durationMs 必须大于 0');
        next.durationMs = patch.durationMs;
    }

    if (task.type === TaskType.LOOP && patch.durationMs != null) {
        if (patch.durationMs <= 0) throw new Error('durationMs 必须大于 0');
        next.durationMs = patch.durationMs;
    }

    if (task.type === TaskType.QUEUE) {
        if (patch.repeat != null) next.repeat = Boolean(patch.repeat);
        if (patch.steps != null) {
            if (!patch.steps.length) throw new Error('steps 不能为空');
            next.steps = patch.steps.map((step, i) => {
                if (!step.durationMs || step.durationMs <= 0) {
                    throw new Error(`第 ${i + 1} 步 durationMs 必须大于 0`);
                }
                return {
                    title: step.title?.trim() || `步骤 ${i + 1}`,
                    durationMs: step.durationMs,
                };
            });
        }
    }

    const updated = await patchTask(id, next);

    if (patch.enabled === false && updated.status === TaskStatus.SCHEDULED) {
        await clearAlarm(id);
        if (updated.type !== TaskType.SCHEDULE) {
            return patchTask(id, {
                status: TaskStatus.IDLE,
                startedAt: undefined,
                targetAt: undefined,
                currentStepIndex: 0,
            });
        }
    }

    if (task.type === TaskType.SCHEDULE) {
        return applyScheduleTiming(/** @type {import('./types.js').ScheduleTask} */ (updated));
    }

    if (
        updated.triggerAtMs &&
        updated.triggerAtMs > Date.now() &&
        updated.enabled &&
        (updated.status === TaskStatus.IDLE || updated.status === TaskStatus.PENDING)
    ) {
        return applyTriggerAlarm(updated);
    }

    return updated;
}

/** @param {string} id @param {boolean} enabled */
export async function setTaskEnabled(id, enabled) {
    return updateTask(id, {enabled});
}

/** @param {string} id @param {boolean} pinned */
export async function setTaskPinned(id, pinned) {
    return updateTask(id, {pinned});
}

/** @param {string} id */
export async function deleteTask(id) {
    const task = await getTask(id);
    if (!task) return null;
    await clearAlarm(id);
    if (task.role === TaskRole.PRESET) {
        await removeInstancesOfPreset(id);
    }
    await removeTask(id);
    return task;
}

/** @param {string} id */
export async function cancelTask(id) {
    const task = await getTask(id);
    if (!task) return null;
    await clearAlarm(id);

    if (task.role === TaskRole.INSTANCE) {
        return patchTask(id, {status: TaskStatus.CANCELLED});
    }

    if (task.type === TaskType.SCHEDULE) {
        return patchTask(id, {
            status: TaskStatus.IDLE,
            fireAtMs: null,
        });
    }

    if (
        task.type === TaskType.COUNTDOWN ||
        task.type === TaskType.LOOP ||
        task.type === TaskType.QUEUE
    ) {
        return patchTask(id, {
            status: TaskStatus.IDLE,
            startedAt: undefined,
            targetAt: undefined,
            currentStepIndex: 0,
        });
    }

    return patchTask(id, {status: TaskStatus.CANCELLED});
}

/**
 * @param {object} [options]
 * @param {import('./types.js').TaskType} [options.type]
 * @param {import('./types.js').TaskRole} [options.role]
 * @param {import('./types.js').TaskStatus} [options.status]
 */
export async function listTasks(options = {}) {
    return listTasksFiltered(options);
}

/** @param {string} id */
export function getTaskSnapshot(id) {
    return getTask(id);
}

/** 定时引爆 alarm 到时自动启动 */
export async function activateTriggeredTask(taskId) {
    const task = await getTask(taskId);
    if (!task || !task.enabled) return null;

    await patchTask(taskId, {triggerAtMs: null});

    if (task.type === TaskType.COUNTDOWN && task.role === TaskRole.PRESET) {
        return spawnCountdownInstance(taskId, {startImmediately: true});
    }
    if (task.type === TaskType.LOOP) {
        return startLoopTask(taskId);
    }
    if (task.type === TaskType.QUEUE) {
        return startQueueTask(taskId);
    }
    return null;
}

export async function reconcileTasksOnStartup() {
    const tasks = await loadTasks();
    const now = Date.now();
    let changed = false;

    for (const task of tasks) {
        if (task.status !== TaskStatus.SCHEDULED) continue;

        let dueAt = null;
        if (task.type === TaskType.SCHEDULE) dueAt = task.fireAtMs;
        if (
            task.type === TaskType.COUNTDOWN ||
            task.type === TaskType.QUEUE ||
            task.type === TaskType.LOOP
        ) {
            dueAt = task.targetAt;
        }

        while (dueAt != null && dueAt <= now) {
            await completeTask(task.id, {fromReconcile: true});
            changed = true;
            const fresh = await getTask(task.id);
            if (!fresh || fresh.status !== TaskStatus.SCHEDULED) break;
            if (fresh.type === TaskType.QUEUE || fresh.type === TaskType.LOOP) {
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
    const notify = await notifyOptions();

    if (task.type === TaskType.SCHEDULE) {
        const pad = (n) => String(n).padStart(2, '0');
        showReminderNotification(
            {
                title: task.title,
                message: options.fromReconcile
                    ? `定时 ${pad(task.hour)}:${pad(task.minute)} 已到（恢复时补发）`
                    : `定时 ${pad(task.hour)}:${pad(task.minute)} 已到`,
            },
            notify,
        );

        const now = Date.now();
        const isOneShot = Boolean(task.date);
        const next = isOneShot
            ? null
            : nextScheduleFireAt({
                  hour: task.hour,
                  minute: task.minute,
                  repeatDays: task.repeatDays,
                  date: null,
              });

        if (next != null && task.enabled) {
            await scheduleAlarm(taskId, next);
            return patchTask(taskId, {
                status: TaskStatus.SCHEDULED,
                fireAtMs: next,
                lastFiredAtMs: now,
            });
        }

        return patchTask(taskId, {
            status: TaskStatus.IDLE,
            fireAtMs: null,
            lastFiredAtMs: now,
        });
    }

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
                notify,
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

        const cycles = (task.cycleCount ?? 0) + 1;
        showReminderNotification(
            {
                title: task.title,
                message: options.fromReconcile
                    ? `队列第 ${cycles} 轮已全部完成（恢复时补发）`
                    : `队列第 ${cycles} 轮已全部完成`,
            },
            notify,
        );

        if (task.repeat && task.enabled) {
            const now = Date.now();
            const first = task.steps[0];
            const targetAt = countdownTargetAt(first.durationMs, now);
            await scheduleAlarm(taskId, targetAt);
            return patchTask(taskId, {
                status: TaskStatus.SCHEDULED,
                currentStepIndex: 0,
                cycleCount: cycles,
                targetAt,
            });
        }

        return patchTask(taskId, {
            status: TaskStatus.IDLE,
            currentStepIndex: 0,
            cycleCount: cycles,
            startedAt: undefined,
            targetAt: undefined,
        });
    }

    if (task.type === TaskType.LOOP) {
        const cycle = (task.cycleCount ?? 0) + 1;
        const label = formatDurationLabel(task.durationMs);
        const message = options.fromReconcile
            ? `第 ${cycle} 轮 ${label} 已到（恢复时补发，下一轮已开始）`
            : `第 ${cycle} 轮 ${label} 已到`;

        showReminderNotification({title: task.title, message}, notify);

        if (!task.enabled) {
            return patchTask(taskId, {
                status: TaskStatus.IDLE,
                cycleCount: cycle,
                startedAt: undefined,
                targetAt: undefined,
            });
        }

        const now = Date.now();
        const targetAt = countdownTargetAt(task.durationMs, now);
        await scheduleAlarm(taskId, targetAt);
        return patchTask(taskId, {
            status: TaskStatus.SCHEDULED,
            cycleCount: cycle,
            targetAt,
        });
    }

    if (task.type === TaskType.COUNTDOWN) {
        const label = formatDurationLabel(task.durationMs);
        showReminderNotification(
            {
                title: task.title,
                message: options.fromReconcile
                    ? `倒计时 ${label} 已结束（恢复时补发）`
                    : `倒计时 ${label} 已结束`,
            },
            notify,
        );

        if (task.role === TaskRole.INSTANCE) {
            return patchTask(taskId, {status: TaskStatus.COMPLETED});
        }

        return patchTask(taskId, {
            status: TaskStatus.IDLE,
            startedAt: undefined,
            targetAt: undefined,
        });
    }

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
    const parsed = taskIdFromAlarmName(alarm.name);
    if (!parsed) return;
    if (parsed.kind === 'trigger') {
        await activateTriggeredTask(parsed.taskId);
        return;
    }
    await completeTask(parsed.taskId);
}

export function initTaskEngine() {
    browser.alarms.onAlarm.addListener((alarm) => {
        onAlarmFired(alarm).catch((err) => console.error('[Timer] alarm handler failed', err));
    });

    reconcileTasksOnStartup().catch((err) =>
        console.error('[Timer] startup reconcile failed', err),
    );
}

export function minutes(n) {
    return n * 60 * 1000;
}

export function seconds(n) {
    return n * 1000;
}

export {remainingMs, parseTimeOfDay, nextFireAt, nextScheduleFireAt} from './scheduleUtils.js';

export async function clearAllData() {
    await clearAllAlarms();
    await clearAllTasks();
}
