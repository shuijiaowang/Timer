import {storage} from '#imports';
import {migrateTasks} from './migrateTasks.js';
import {sortTasks} from './taskSort.js';
import {TaskRole, TaskStatus} from './types.js';

const tasksStorage = storage.defineItem('local:timer-tasks', {
    fallback: [],
});

/** @returns {Promise<import('./types.js').TimerTask[]>} */
export async function loadTasks() {
    const raw = /** @type {import('./types.js').TimerTask[]} */ (await tasksStorage.getValue());
    const migrated = migrateTasks(raw);
    const changed = JSON.stringify(raw) !== JSON.stringify(migrated);
    if (changed) {
        await saveTasks(migrated);
    }
    return migrated;
}

/** @param {import('./types.js').TimerTask[]} tasks */
export async function saveTasks(tasks) {
    await tasksStorage.setValue(tasks);
}

/** @param {string} id */
export async function getTask(id) {
    const tasks = await loadTasks();
    return tasks.find((t) => t.id === id) ?? null;
}

/** @param {import('./types.js').TimerTask} task */
export async function upsertTask(task) {
    const tasks = await loadTasks();
    const index = tasks.findIndex((t) => t.id === task.id);
    if (index >= 0) {
        tasks[index] = task;
    } else {
        tasks.push(task);
    }
    await saveTasks(tasks);
    return task;
}

/** @param {string} id */
export async function removeTask(id) {
    const tasks = await loadTasks();
    const next = tasks.filter((t) => t.id !== id);
    await saveTasks(next);
}

/** @param {string} id @param {Partial<import('./types.js').TimerTask>} patch */
export async function patchTask(id, patch) {
    const tasks = await loadTasks();
    const index = tasks.findIndex((t) => t.id === id);
    if (index < 0) return null;
    const updated = {
        ...tasks[index],
        ...patch,
        updatedAt: patch.updatedAt ?? Date.now(),
    };
    tasks[index] = updated;
    await saveTasks(tasks);
    return updated;
}

/** @param {string} presetId */
export async function removeInstancesOfPreset(presetId) {
    const tasks = await loadTasks();
    const next = tasks.filter((t) => t.presetId !== presetId);
    if (next.length !== tasks.length) {
        await saveTasks(next);
    }
}

/**
 * @param {object} [filter]
 * @param {import('./types.js').TaskType} [filter.type]
 * @param {import('./types.js').TaskRole} [filter.role]
 * @param {import('./types.js').TaskStatus} [filter.status]
 */
export async function listTasksFiltered(filter = {}) {
    let tasks = await loadTasks();
    if (filter.type) tasks = tasks.filter((t) => t.type === filter.type);
    if (filter.role) tasks = tasks.filter((t) => t.role === filter.role);
    if (filter.status) tasks = tasks.filter((t) => t.status === filter.status);
    return sortTasks(tasks);
}

/** @returns {import('./types.js').TimerTask[]} */
export function listActiveTasks(tasks) {
    return tasks.filter(
        (t) =>
            t.status === TaskStatus.SCHEDULED ||
            t.status === TaskStatus.PENDING,
    );
}

/** @returns {import('./types.js').TimerTask[]} */
export function listPresets(tasks) {
    return tasks.filter((t) => t.role === TaskRole.PRESET);
}

export async function clearAllTasks() {
    await saveTasks([]);
}
