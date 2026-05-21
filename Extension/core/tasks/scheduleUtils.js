/**
 * 解析 "HH:mm" 或 { hour, minute }
 * @param {string | { hour: number, minute: number }} input
 */
export function parseTimeOfDay(input) {
    if (typeof input === 'object' && input !== null) {
        return {hour: input.hour, minute: input.minute};
    }
    const match = String(input).trim().match(/^(\d{1,2}):(\d{2})$/);
    if (!match) {
        throw new Error(`无效时间格式，应为 HH:mm，收到: ${input}`);
    }
    const hour = Number(match[1]);
    const minute = Number(match[2]);
    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
        throw new Error(`时间超出范围: ${input}`);
    }
    return {hour, minute};
}

/**
 * 计算「下一次」在指定时刻触发的时间戳（今日未到则用今日，否则明日）
 * @param {number} hour
 * @param {number} minute
 * @param {number} [nowMs]
 */
export function nextFireAt(hour, minute, nowMs = Date.now()) {
    const now = new Date(nowMs);
    const candidate = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate(),
        hour,
        minute,
        0,
        0,
    );
    if (candidate.getTime() <= nowMs) {
        candidate.setDate(candidate.getDate() + 1);
    }
    return candidate.getTime();
}

/**
 * @param {number} durationMs
 * @param {number} [startedAtMs]
 */
export function countdownTargetAt(durationMs, startedAtMs = Date.now()) {
    return startedAtMs + durationMs;
}

/**
 * @param {number} targetAtMs
 * @param {number} [nowMs]
 */
export function remainingMs(targetAtMs, nowMs = Date.now()) {
    return Math.max(0, targetAtMs - nowMs);
}
