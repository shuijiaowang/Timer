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
    createLoop: (payload) => callTimerTask('createLoop', payload),
    createQueue: (payload) => callTimerTask('createQueue', payload),
    createFromTemplate: (payload) => callTimerTask('createFromTemplate', payload),
    spawnCountdown: (payload) => callTimerTask('spawnCountdown', payload),
    startCountdown: (id) => callTimerTask('startCountdown', {id}),
    startLoop: (id) => callTimerTask('startLoop', {id}),
    startQueue: (id) => callTimerTask('startQueue', {id}),
    restart: (id) => callTimerTask('restart', {id}),
    update: (id, patch) => callTimerTask('update', {id, patch}),
    setEnabled: (id, enabled) => callTimerTask('setEnabled', {id, enabled}),
    setPinned: (id, pinned) => callTimerTask('setPinned', {id, pinned}),
    delete: (id) => callTimerTask('delete', {id}),
    cancel: (id) => callTimerTask('cancel', {id}),
    list: (payload) => callTimerTask('list', payload),
    listTemplates: () => callTimerTask('listTemplates'),
    get: (id) => callTimerTask('get', {id}),
};

export function taskDueAt(task) {
    if (task.type === 'schedule') return task.fireAtMs;
    if (
        (task.type === 'countdown' || task.type === 'queue' || task.type === 'loop') &&
        task.targetAt
    ) {
        return task.targetAt;
    }
    return null;
}

export function formatDurationParts(durationMs) {
    const totalSec = Math.max(0, Math.floor(durationMs / 1000));
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    if (m > 0 && s > 0) return `${m} 分 ${s} 秒`;
    if (m > 0) return `${m} 分钟`;
    return `${s} 秒`;
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

export function formatClock(nowMs = Date.now()) {
    const d = new Date(nowMs);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
}

export function msFromMinSec(minutes, seconds) {
    return (Number(minutes) || 0) * 60_000 + (Number(seconds) || 0) * 1000;
}

/** QQ 农场增益计算（与 templates.js 一致） */
export function qqFarmDurationMs(baseHours = 8, speedBonus = 0) {
    const hours = baseHours * (1 - Math.min(Math.max(speedBonus, 0), 0.9));
    return Math.round(hours * 60 * 60 * 1000);
}

export const WEEKDAY_LABELS = [
    {value: 0, label: '日'},
    {value: 1, label: '一'},
    {value: 2, label: '二'},
    {value: 3, label: '三'},
    {value: 4, label: '四'},
    {value: 5, label: '五'},
    {value: 6, label: '六'},
];

export const statusLabel = {
    idle: '已保存',
    pending: '待启动',
    scheduled: '进行中',
    completed: '已完成',
    cancelled: '已取消',
};

export const typeLabel = {
    schedule: '定时',
    countdown: '倒计时',
    loop: '循环',
    queue: '队列',
};
