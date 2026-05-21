/** @param {string} action */
async function callTimerTask(action, payload = {}) {
    const res = await browser.runtime.sendMessage({
        type: 'timer_task',
        action,
        payload,
    });
    if (!res?.ok) {
        throw new Error(res?.error ?? '请求失败');
    }
    return res;
}

export const timerApi = {
    createSchedule: (payload) => callTimerTask('createSchedule', payload),
    createCountdown: (payload) => callTimerTask('createCountdown', payload),
    startCountdown: (id) => callTimerTask('startCountdown', {id}),
    cancel: (id) => callTimerTask('cancel', {id}),
    list: () => callTimerTask('list'),
    get: (id) => callTimerTask('get', {id}),
};

export function taskDueAt(task) {
    if (task.type === 'schedule') return task.fireAtMs;
    if (task.type === 'countdown' && task.targetAt) return task.targetAt;
    return null;
}

export function formatRemaining(ms) {
    if (ms == null) return '—';
    if (ms <= 0) return '已到期';
    const totalSec = Math.floor(ms / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    if (h > 0) {
        return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }
    return `${m}:${String(s).padStart(2, '0')}`;
}

export function formatFireAt(ms) {
    if (ms == null) return '—';
    return new Date(ms).toLocaleString();
}

export const statusLabel = {
    pending: '待启动',
    scheduled: '进行中',
    completed: '已完成',
    cancelled: '已取消',
};
