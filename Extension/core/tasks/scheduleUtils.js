import {ALL_WEEKDAYS} from './types.js';

/**
 * 解析 "HH:mm"（支持中英文冒号 ：:）或 { hour, minute }
 * @param {string | { hour: number, minute: number }} input
 */
export function parseTimeOfDay(input) {
    if (typeof input === 'object' && input !== null) {
        return {hour: input.hour, minute: input.minute};
    }
    const normalized = String(input).trim().replace(/：/g, ':');
    const match = normalized.match(/^(\d{1,2}):(\d{2})$/);
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
 * @param {{ year: number, month: number, day: number }} date month 为 1-12
 */
export function parseCalendarDate(date) {
    if (!date || typeof date !== 'object') {
        throw new Error('date 必须为 { year, month, day }');
    }
    const year = Number(date.year);
    const month = Number(date.month);
    const day = Number(date.day);
    if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
        throw new Error('date 年月日必须为数字');
    }
    if (month < 1 || month > 12 || day < 1 || day > 31) {
        throw new Error(`date 超出范围: ${year}-${month}-${day}`);
    }
    const probe = new Date(year, month - 1, day, 12, 0, 0, 0);
    if (
        probe.getFullYear() !== year ||
        probe.getMonth() !== month - 1 ||
        probe.getDate() !== day
    ) {
        throw new Error(`无效日期: ${year}-${month}-${day}`);
    }
    return {year, month, day};
}

/**
 * @param {{ year: number, month: number, day: number }} date
 * @param {number} hour
 * @param {number} minute
 */
export function fireAtOnCalendarDate(date, hour, minute) {
    const {year, month, day} = parseCalendarDate(date);
    return new Date(year, month - 1, day, hour, minute, 0, 0).getTime();
}

/**
 * 计算「下一次」在指定时刻触发的时间戳（今日未到则用今日，否则明日）
 * @param {number} hour
 * @param {number} minute
 * @param {number} [nowMs]
 */
export function nextFireAt(hour, minute, nowMs = Date.now()) {
    return nextScheduleFireAt(
        {hour, minute, repeatDays: ALL_WEEKDAYS, date: null},
        nowMs,
    );
}

/**
 * @param {object} options
 * @param {number} options.hour
 * @param {number} options.minute
 * @param {number[]} [options.repeatDays] 0=周日…6=周六
 * @param {{ year: number, month: number, day: number } | null} [options.date]
 * @param {number} [nowMs]
 * @returns {number | null} 无法安排时返回 null（如一次性日期已过期）
 */
export function nextScheduleFireAt(
    {hour, minute, repeatDays = ALL_WEEKDAYS, date = null},
    nowMs = Date.now(),
) {
    if (date) {
        const at = fireAtOnCalendarDate(date, hour, minute);
        return at > nowMs ? at : null;
    }

    const days = normalizeRepeatDays(repeatDays);
    const now = new Date(nowMs);

    for (let offset = 0; offset <= 7; offset++) {
        const candidateDate = new Date(
            now.getFullYear(),
            now.getMonth(),
            now.getDate() + offset,
            hour,
            minute,
            0,
            0,
        );
        if (!days.includes(candidateDate.getDay())) continue;
        if (candidateDate.getTime() > nowMs) {
            return candidateDate.getTime();
        }
    }

    return null;
}

/**
 * @param {number[] | undefined} repeatDays
 * @returns {number[]}
 */
export function normalizeRepeatDays(repeatDays) {
    if (!repeatDays?.length) return [...ALL_WEEKDAYS];
    const unique = [...new Set(repeatDays.map((d) => Number(d)))].filter(
        (d) => d >= 0 && d <= 6,
    );
    return unique.length ? unique.sort((a, b) => a - b) : [...ALL_WEEKDAYS];
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

/**
 * @param {string | { hour: number, minute: number } | null | undefined} input
 * @returns {{ hour: number, minute: number } | null}
 */
export function parseWindowTime(input) {
    if (input == null || input === '') return null;
    return parseTimeOfDay(input);
}

/**
 * @param {number} hour
 * @param {number} minute
 * @param {number} [nowMs]
 */
export function todayAtMs(hour, minute, nowMs = Date.now()) {
    const now = new Date(nowMs);
    return new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, minute, 0, 0).getTime();
}

/**
 * 当日时段（start < end，不支持跨午夜）
 * @param {number} nowMs
 * @param {{ hour: number, minute: number } | null} windowStart
 * @param {{ hour: number, minute: number } | null} windowEnd
 */
export function isWithinDailyWindow(nowMs, windowStart, windowEnd) {
    if (!windowStart && !windowEnd) return true;
    if (windowStart && windowEnd) {
        const startMs = todayAtMs(windowStart.hour, windowStart.minute, nowMs);
        const endMs = todayAtMs(windowEnd.hour, windowEnd.minute, nowMs);
        if (endMs <= startMs) return false;
        return nowMs >= startMs && nowMs < endMs;
    }
    if (windowStart) {
        const startMs = todayAtMs(windowStart.hour, windowStart.minute, nowMs);
        return nowMs >= startMs;
    }
    const endMs = todayAtMs(windowEnd.hour, windowEnd.minute, nowMs);
    return nowMs < endMs;
}

/**
 * 下一次「时段开始」触发（复用周重复逻辑）
 * @param {object} options
 * @param {{ hour: number, minute: number }} options.windowStart
 * @param {number[]} [options.repeatDays]
 * @param {number} [nowMs]
 */
export function nextWindowStartAt({windowStart, repeatDays = ALL_WEEKDAYS}, nowMs = Date.now()) {
    if (!windowStart) return null;
    return nextScheduleFireAt(
        {
            hour: windowStart.hour,
            minute: windowStart.minute,
            repeatDays,
            date: null,
        },
        nowMs,
    );
}

/**
 * 今日尚未过去的结束时刻；已过则 null
 * @param {{ hour: number, minute: number }} windowEnd
 * @param {number} [nowMs]
 */
export function todayWindowEndAt(windowEnd, nowMs = Date.now()) {
    if (!windowEnd) return null;
    const endMs = todayAtMs(windowEnd.hour, windowEnd.minute, nowMs);
    return endMs > nowMs ? endMs : null;
}
