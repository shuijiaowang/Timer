import {ALL_WEEKDAYS, ReminderMode, TaskRole, TaskStatus, TaskType} from './types.js';
import {nextScheduleFireAt} from './scheduleUtils.js';

/**
 * 将旧版 MVP 任务迁移到新模型（无 role / idle / repeatDays 等字段）
 * @param {import('./types.js').TimerTask[]} tasks
 */
export function migrateTasks(tasks) {
    return tasks.map((task) => migrateOneTask(task));
}

/** @param {any} task */
function migrateOneTask(task) {
    if (task.role) {
        return touchDefaults(task);
    }

    const now = Date.now();
    const base = {
        role: TaskRole.PRESET,
        enabled: true,
        pinned: false,
        reminderMode: ReminderMode.QUICK,
        updatedAt: task.updatedAt ?? task.createdAt ?? now,
    };

    if (task.type === TaskType.SCHEDULE) {
        const repeatDays = task.repeatDays ?? [...ALL_WEEKDAYS];
        const date = task.date ?? null;
        let status = task.status;
        if (status === TaskStatus.COMPLETED || status === 'completed') {
            status = TaskStatus.IDLE;
        }
        if (status === TaskStatus.SCHEDULED || status === 'scheduled') {
            status = TaskStatus.SCHEDULED;
        } else {
            status = TaskStatus.IDLE;
        }
        let fireAtMs = task.fireAtMs ?? null;
        if (status === TaskStatus.SCHEDULED && (!fireAtMs || fireAtMs <= now)) {
            fireAtMs = nextScheduleFireAt({
                hour: task.hour,
                minute: task.minute,
                repeatDays,
                date,
            });
            if (fireAtMs == null) status = TaskStatus.IDLE;
        }
        return touchDefaults({
            ...task,
            ...base,
            role: TaskRole.PRESET,
            repeatDays,
            date,
            fireAtMs,
            status,
        });
    }

    if (task.type === TaskType.COUNTDOWN) {
        if (task.status === TaskStatus.SCHEDULED || task.status === 'scheduled') {
            return touchDefaults({
                ...task,
                ...base,
                role: task.presetId ? TaskRole.INSTANCE : TaskRole.INSTANCE,
                presetId: task.presetId,
            });
        }
        if (task.status === TaskStatus.PENDING || task.status === 'pending') {
            return touchDefaults({
                ...task,
                ...base,
                role: TaskRole.PRESET,
                status: TaskStatus.IDLE,
                startedAt: undefined,
                targetAt: undefined,
            });
        }
        return touchDefaults({
            ...task,
            ...base,
            role: TaskRole.PRESET,
            status: TaskStatus.IDLE,
            startedAt: undefined,
            targetAt: undefined,
            isFavorite: task.isFavorite ?? false,
        });
    }

    if (task.type === TaskType.LOOP) {
        const running =
            task.status === TaskStatus.SCHEDULED || task.status === 'scheduled';
        return touchDefaults({
            ...task,
            ...base,
            role: TaskRole.PRESET,
            status: running ? TaskStatus.SCHEDULED : TaskStatus.IDLE,
            cycleCount: task.cycleCount ?? 0,
            triggerAtMs: task.triggerAtMs ?? null,
            ...(running
                ? {}
                : {startedAt: undefined, targetAt: undefined}),
        });
    }

    if (task.type === TaskType.QUEUE) {
        const running =
            task.status === TaskStatus.SCHEDULED ||
            task.status === 'scheduled' ||
            task.status === TaskStatus.PENDING ||
            task.status === 'pending';
        return touchDefaults({
            ...task,
            ...base,
            role: TaskRole.PRESET,
            repeat: task.repeat ?? false,
            cycleCount: task.cycleCount ?? 0,
            status: running
                ? task.status === 'pending'
                    ? TaskStatus.PENDING
                    : TaskStatus.SCHEDULED
                : TaskStatus.IDLE,
            triggerAtMs: task.triggerAtMs ?? null,
            ...(running
                ? {}
                : {
                      currentStepIndex: 0,
                      startedAt: undefined,
                      targetAt: undefined,
                  }),
        });
    }

    return touchDefaults({...task, ...base});
}

/** @param {any} task */
function touchDefaults(task) {
    return {
        enabled: task.enabled ?? true,
        pinned: task.pinned ?? false,
        reminderMode: task.reminderMode ?? ReminderMode.QUICK,
        updatedAt: task.updatedAt ?? task.createdAt ?? Date.now(),
        ...task,
    };
}
