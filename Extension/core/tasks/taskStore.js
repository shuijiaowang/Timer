import {storage} from '#imports';
import {TaskStatus} from './types.js';

const tasksStorage = storage.defineItem('local:timer-tasks', {
    fallback: [],
});

/** @returns {Promise<import('./types.js').TimerTask[]>} */
export async function loadTasks() {
    return /** @type {import('./types.js').TimerTask[]} */ (await tasksStorage.getValue());
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
    const updated = {...tasks[index], ...patch};
    tasks[index] = updated;
    await saveTasks(tasks);
    return updated;
}

/** @returns {import('./types.js').TimerTask[]} */
export function listActiveTasks(tasks) {
    return tasks.filter((t) => t.status === TaskStatus.SCHEDULED || t.status === TaskStatus.PENDING);
}
