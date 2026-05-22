import {TaskStatus} from './types.js';

const STATUS_ORDER = {
    [TaskStatus.SCHEDULED]: 0,
    [TaskStatus.PAUSED]: 1,
    [TaskStatus.PENDING]: 2,
    [TaskStatus.IDLE]: 3,
    [TaskStatus.COMPLETED]: 4,
    [TaskStatus.CANCELLED]: 5,
};

/**
 * 置顶 → 启用 → 进行中优先 → 最近更新
 * @param {import('./types.js').TimerTask[]} tasks
 */
export function sortTasks(tasks) {
    return [...tasks].sort((a, b) => {
        if (a.pinned !== b.pinned) return Number(b.pinned) - Number(a.pinned);
        if (a.enabled !== b.enabled) return Number(b.enabled) - Number(a.enabled);
        const sa = STATUS_ORDER[a.status] ?? 99;
        const sb = STATUS_ORDER[b.status] ?? 99;
        if (sa !== sb) return sa - sb;
        return (b.updatedAt ?? 0) - (a.updatedAt ?? 0);
    });
}
