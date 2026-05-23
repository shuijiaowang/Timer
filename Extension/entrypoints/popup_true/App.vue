<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import SettingsPopover from '../../components/settings/SettingsPopover.vue';
import {reminderModeFromSettings} from '../../core/userSettings.js';
import {
    formatClock,
    formatDurationParts,
    formatFireAt,
    formatRemaining,
    msFromHMS,
    msFromMinSec,
    qqFarmDurationMs,
    statusLabel,
    taskDueAt,
    timerApi,
    typeLabel,
    WEEKDAY_LABELS,
} from './timerApi.js';

const TABS = [
    {id: 'schedule', label: '定时'},
    {id: 'countdown', label: '倒计时'},
    {id: 'combo', label: '循环/队列'},
    {id: 'template', label: '模板'},
];

const tab = ref('schedule');
const tasks = ref([]);
const templates = ref([]);
const loading = ref(false);
const error = ref('');
const now = ref(Date.now());
const editingId = ref(null);

// —— 定时新建 ——
const schTitle = ref('吃药提醒');
const schTime = ref('');
const schRepeatDays = ref([1, 2, 3, 4, 5]);
const schUseDate = ref(false);
const schDate = ref('');

// —— 倒计时新建 ——
const cdTitle = ref('休息');
const cdHr = ref(0);
const cdMin = ref(15);
const cdSec = ref(0);
const cdFavorite = ref(false);

// —— 循环/队列 ——
const comboMode = ref('queue');
const loopTitle = ref('喝水提醒');
const loopMin = ref(60);
const loopSec = ref(0);
const queueTitle = ref('番茄队列');
const queueRepeat = ref(true);
const queueSteps = ref([
    {title: '工作', minutes: 45, seconds: 0},
    {title: '休息', minutes: 15, seconds: 0},
]);
const comboUseWindow = ref(false);
const comboWindowStart = ref('09:00');
const comboWindowEnd = ref('18:00');
const comboWindowDays = ref([1, 2, 3, 4, 5]);

// —— QQ 农场模板 ——
const farmBaseHours = ref(8);
const farmSpeed = ref(0);
const farmCustomSpeed = ref('');

const userSettings = ref(null);
const showSettings = ref(false);
let tickTimer = null;

function applyTheme(darkMode) {
    const root = document.documentElement;
    root.classList.remove('theme-light', 'theme-dark');
    root.classList.add(darkMode ? 'theme-dark' : 'theme-light');
}

async function loadUserSettings() {
    try {
        const res = await timerApi.getSettings();
        userSettings.value = res.settings;
        applyTheme(Boolean(res.settings?.appearance?.darkMode));
    } catch (e) {
        error.value = e?.message ?? String(e);
        applyTheme(true);
    }
}

function defaultReminderMode() {
    return userSettings.value
        ? reminderModeFromSettings(userSettings.value)
        : 'quick';
}

function onSettingsSaved(settings) {
    userSettings.value = settings;
    applyTheme(Boolean(settings?.appearance?.darkMode));
}

function onSettingsReset() {
    showSettings.value = false;
    loadUserSettings();
    refresh();
}

const editingTask = computed(() => tasks.value.find((t) => t.id === editingId.value) ?? null);

const schedulePresets = computed(() =>
    tasks.value.filter((t) => t.type === 'schedule' && t.role === 'preset'),
);
const countdownPresets = computed(() =>
    tasks.value.filter((t) => t.type === 'countdown' && t.role === 'preset'),
);
const countdownRunning = computed(() =>
    tasks.value.filter(
        (t) =>
            t.type === 'countdown' &&
            t.role === 'instance' &&
            (t.status === 'scheduled' || t.status === 'paused' || t.status === 'pending'),
    ),
);
const loopPresets = computed(() =>
    tasks.value.filter((t) => t.type === 'loop' && t.role === 'preset'),
);
const queuePresets = computed(() =>
    tasks.value.filter((t) => t.type === 'queue' && t.role === 'preset'),
);

const clockText = computed(() => formatClock(now.value));
const todayStr = computed(() => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
});

function defaultTime() {
    const d = new Date();
    d.setMinutes(d.getMinutes() + 2);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function parseDateInput(str) {
    const m = String(str).trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (!m) return null;
    return {year: Number(m[1]), month: Number(m[2]), day: Number(m[3])};
}

function windowPayloadFromForm(useWindow, start, end, days) {
    if (!useWindow) return {};
    const startStr = start.trim();
    const endStr = end.trim();
    if (!startStr) {
        error.value = '请填写开始时间';
        return null;
    }
    const payload = {
        windowStart: startStr,
        repeatDays: [...days],
    };
    if (endStr) payload.windowEnd = endStr;
    return payload;
}

function windowSummary(task) {
    if (!task.windowStart && !task.windowEnd) return '';
    const s = task.windowStart ? padTime(task.windowStart.hour, task.windowStart.minute) : '—';
    const e = task.windowEnd ? padTime(task.windowEnd.hour, task.windowEnd.minute) : '—';
    const days = task.repeatDays ?? [];
    let dayLabel = '每天';
    if (days.length === 5 && [1, 2, 3, 4, 5].every((d) => days.includes(d))) {
        dayLabel = '工作日';
    } else if (days.length < 7) {
        const labels = WEEKDAY_LABELS.filter((w) => days.includes(w.value)).map((w) => w.label);
        dayLabel = labels.length ? `周${labels.join('')}` : '未设';
    }
    return `${s}–${e} · ${dayLabel}`;
}

function scheduleRepeatLabel(task) {
    if (task.date) {
        const {year, month, day} = task.date;
        return `一次性 ${year}-${month}-${day}`;
    }
    const days = task.repeatDays ?? [];
    if (days.length === 7) return '每天';
    if (days.length === 5 && [1, 2, 3, 4, 5].every((d) => days.includes(d))) return '工作日';
    const labels = WEEKDAY_LABELS.filter((w) => days.includes(w.value)).map((w) => w.label);
    return labels.length ? `周${labels.join('')}` : '未设置';
}

function padTime(h, m) {
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

async function refresh() {
    loading.value = true;
    error.value = '';
    try {
        const res = await timerApi.list();
        tasks.value = res.tasks ?? [];
    } catch (e) {
        error.value = e?.message ?? String(e);
    } finally {
        loading.value = false;
    }
}

async function loadTemplates() {
    try {
        const res = await timerApi.listTemplates();
        templates.value = res.templates ?? [];
    } catch (e) {
        error.value = e?.message ?? String(e);
    }
}

async function run(action) {
    error.value = '';
    try {
        await action();
        await refresh();
    } catch (e) {
        error.value = e?.message ?? String(e);
    }
}

async function createSchedule() {
    const payload = {
        title: schTitle.value.trim() || '定时提醒',
        time: schTime.value.trim(),
        repeatDays: schUseDate.value ? [] : [...schRepeatDays.value],
        enabled: true,
        reminderMode: defaultReminderMode(),
    };
    if (schUseDate.value) {
        const date = parseDateInput(schDate.value || todayStr.value);
        if (!date) {
            error.value = '日期格式应为 YYYY-MM-DD';
            return;
        }
        payload.date = date;
    }
    await run(() => timerApi.createSchedule(payload));
}

async function createCountdownPreset() {
    const durationMs = msFromHMS(cdHr.value, cdMin.value, cdSec.value);
    if (durationMs <= 0) {
        error.value = '时长必须大于 0';
        return;
    }
    await run(() =>
        timerApi.createCountdown({
            title: cdTitle.value.trim() || '倒计时',
            durationMs,
            isFavorite: cdFavorite.value,
            reminderMode: defaultReminderMode(),
        }),
    );
}

async function createLoopPreset() {
    const durationMs = msFromMinSec(loopMin.value, loopSec.value);
    if (durationMs <= 0) {
        error.value = '间隔必须大于 0';
        return;
    }
    const windowFields = windowPayloadFromForm(
        comboUseWindow.value,
        comboWindowStart.value,
        comboWindowEnd.value,
        comboWindowDays.value,
    );
    if (windowFields === null) return;
    await run(() =>
        timerApi.createLoop({
            title: loopTitle.value.trim() || '循环提醒',
            durationMs,
            reminderMode: defaultReminderMode(),
            ...windowFields,
        }),
    );
}

function stepMs(step) {
    return msFromMinSec(step.minutes, step.seconds);
}

async function createQueuePreset() {
    const steps = queueSteps.value.map((s, i) => ({
        title: s.title?.trim() || `步骤 ${i + 1}`,
        durationMs: stepMs(s),
    }));
    if (steps.some((s) => s.durationMs <= 0)) {
        error.value = '每一步时长必须大于 0';
        return;
    }
    const windowFields = windowPayloadFromForm(
        comboUseWindow.value,
        comboWindowStart.value,
        comboWindowEnd.value,
        comboWindowDays.value,
    );
    if (windowFields === null) return;
    await run(() =>
        timerApi.createQueue({
            title: queueTitle.value.trim() || '队列任务',
            steps,
            repeat: queueRepeat.value,
            reminderMode: defaultReminderMode(),
            ...windowFields,
        }),
    );
}

async function addQqFarm() {
    let bonus = farmSpeed.value;
    if (farmSpeed.value === 'custom') {
        bonus = Number(farmCustomSpeed.value);
        if (!Number.isFinite(bonus) || bonus < 0) {
            error.value = '自定义增益请输入 0–0.9 的小数';
            return;
        }
    }
    const durationMs = qqFarmDurationMs(farmBaseHours.value, bonus);
    await run(() =>
        timerApi.createFromTemplate({
            templateId: 'qq_farm',
            overrides: {
                title: `收菜 ${farmBaseHours.value}h`,
                durationMs,
                startNow: true,
                reminderMode: defaultReminderMode(),
            },
        }),
    );
    tab.value = 'countdown';
}

function remainingFor(task) {
    if (task.type === 'countdown' && task.status === 'paused' && task.remainingMs != null) {
        return task.remainingMs;
    }
    const due = taskDueAt(task);
    if (due == null) return null;
    return Math.max(0, due - now.value);
}

function openEdit(task) {
    editingId.value = task.id;
}

function closeEdit() {
    editingId.value = null;
}

// 编辑表单（与 editingTask 同步）
const editTitle = ref('');
const editTime = ref('');
const editRepeatDays = ref([]);
const editUseDate = ref(false);
const editDate = ref('');
const editDurationHr = ref(0);
const editDurationMin = ref(0);
const editDurationSec = ref(0);
const editFavorite = ref(false);
const editRepeat = ref(false);
const editSteps = ref([]);
const editUseWindow = ref(false);
const editWindowStart = ref('09:00');
const editWindowEnd = ref('18:00');
const editWindowDays = ref([1, 2, 3, 4, 5]);

watch(editingTask, (task) => {
    if (!task) return;
    editTitle.value = task.title ?? '';
    if (task.type === 'schedule') {
        editTime.value = padTime(task.hour, task.minute);
        editRepeatDays.value = [...(task.repeatDays ?? [])];
        editUseDate.value = Boolean(task.date);
        if (task.date) {
            const {year, month, day} = task.date;
            editDate.value = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        } else {
            editDate.value = todayStr.value;
        }
    }
    if (task.type === 'countdown' || task.type === 'loop') {
        const totalSec = Math.floor((task.durationMs ?? 0) / 1000);
        editDurationHr.value = Math.floor(totalSec / 3600);
        editDurationMin.value = Math.floor((totalSec % 3600) / 60);
        editDurationSec.value = totalSec % 60;
        editFavorite.value = Boolean(task.isFavorite);
    }
    if (task.type === 'loop' || task.type === 'queue') {
        editUseWindow.value = Boolean(task.windowStart || task.windowEnd);
        editWindowStart.value = task.windowStart
            ? padTime(task.windowStart.hour, task.windowStart.minute)
            : '09:00';
        editWindowEnd.value = task.windowEnd
            ? padTime(task.windowEnd.hour, task.windowEnd.minute)
            : '18:00';
        editWindowDays.value = [...(task.repeatDays ?? [1, 2, 3, 4, 5])];
    }
    if (task.type === 'queue') {
        editRepeat.value = Boolean(task.repeat);
        editSteps.value = (task.steps ?? []).map((s) => {
            const sec = Math.floor(s.durationMs / 1000);
            return {
                title: s.title,
                minutes: Math.floor(sec / 60),
                seconds: sec % 60,
            };
        });
    }
});

async function saveEdit() {
    const task = editingTask.value;
    if (!task) return;
    const patch = {title: editTitle.value.trim() || task.title};
    if (task.type === 'schedule') {
        patch.time = editTime.value.trim();
        if (editUseDate.value) {
            const date = parseDateInput(editDate.value);
            if (!date) {
                error.value = '日期格式应为 YYYY-MM-DD';
                return;
            }
            patch.date = date;
            patch.repeatDays = [];
        } else {
            patch.date = null;
            patch.repeatDays = [...editRepeatDays.value];
        }
    }
    if (task.type === 'countdown' || task.type === 'loop') {
        patch.durationMs = msFromHMS(
            editDurationHr.value,
            editDurationMin.value,
            editDurationSec.value,
        );
        if (patch.durationMs <= 0) {
            error.value = '时长必须大于 0';
            return;
        }
    }
    if (task.type === 'countdown') {
        patch.isFavorite = editFavorite.value;
    }
    if (task.type === 'loop' || task.type === 'queue') {
        if (editUseWindow.value) {
            const windowFields = windowPayloadFromForm(
                true,
                editWindowStart.value,
                editWindowEnd.value,
                editWindowDays.value,
            );
            if (windowFields === null) return;
            Object.assign(patch, windowFields);
        } else {
            patch.windowStart = null;
            patch.windowEnd = null;
        }
    }
    if (task.type === 'queue') {
        patch.repeat = editRepeat.value;
        patch.steps = editSteps.value.map((s, i) => ({
            title: s.title?.trim() || `步骤 ${i + 1}`,
            durationMs: msFromMinSec(s.minutes, s.seconds),
        }));
    }
    await run(async () => {
        await timerApi.update(task.id, patch);
        closeEdit();
    });
}

function toggleWeekday(list, day) {
    const i = list.indexOf(day);
    if (i >= 0) list.splice(i, 1);
    else list.push(day);
    list.sort((a, b) => a - b);
}

function addQueueStep() {
    queueSteps.value.push({title: '', minutes: 5, seconds: 0});
}

function addEditStep() {
    editSteps.value.push({title: '', minutes: 5, seconds: 0});
}

function taskSummary(task) {
    const pad = (n) => String(n).padStart(2, '0');
    if (task.type === 'schedule') {
        return `${padTime(task.hour, task.minute)} · ${scheduleRepeatLabel(task)}`;
    }
    if (task.type === 'queue') {
        const n = task.steps?.length ?? 0;
        const rep = task.repeat ? '循环' : '单次';
        const win = windowSummary(task);
        return win ? `${n} 步 · ${rep} · ${win}` : `${n} 步 · ${rep}`;
    }
    if (task.type === 'loop') {
        const win = windowSummary(task);
        const interval = `每 ${formatDurationParts(task.durationMs)}`;
        return win ? `${interval} · ${win}` : interval;
    }
    return formatDurationParts(task.durationMs);
}

onMounted(() => {
    schTime.value = defaultTime();
    schDate.value = todayStr.value;
    loadUserSettings();
    refresh();
    loadTemplates();
    tickTimer = setInterval(() => {
        now.value = Date.now();
    }, 1000);
});

onUnmounted(() => {
    if (tickTimer) clearInterval(tickTimer);
});
</script>

<template>
    <div class="app">
        <header class="top">
            <div class="brand">
                <span class="brand-icon" aria-hidden="true">⏱</span>
                <h1>Timer</h1>
            </div>
            <div class="top-actions">
                <button type="button" class="btn ghost" :disabled="loading" @click="refresh">
                    {{ loading ? '…' : '刷新' }}
                </button>
                <div class="settings-anchor">
                    <button
                        type="button"
                        class="btn ghost"
                        :class="{active: showSettings}"
                        @click="showSettings = !showSettings"
                    >
                        设置
                    </button>
                    <SettingsPopover
                        v-if="showSettings"
                        @saved="onSettingsSaved"
                        @close="showSettings = false"
                        @reset="onSettingsReset"
                    />
                </div>
            </div>
        </header>

        <main class="app-body">
        <p v-if="error" class="error">{{ error }}</p>

        <!-- 定时 -->
        <section v-show="tab === 'schedule'" class="panel">
            <div class="clock">{{ clockText }}</div>
            <p class="sub">每个闹钟可单独开关、重复日或指定日期</p>

            <div class="card form">
                <h2>新建定时</h2>
                <label class="field">
                    <span>标题</span>
                    <input v-model="schTitle" type="text" />
                </label>
                <label class="field">
                    <span>时间 HH:mm</span>
                    <input v-model="schTime" type="text" placeholder="08:30 或 08：30" />
                </label>
                <label class="check">
                    <input v-model="schUseDate" type="checkbox" />
                    指定日期（一次性）
                </label>
                <label v-if="schUseDate" class="field">
                    <span>日期</span>
                    <input v-model="schDate" type="date" />
                </label>
                <div v-else class="weekdays">
                    <span class="lbl">重复</span>
                    <button
                        v-for="w in WEEKDAY_LABELS"
                        :key="w.value"
                        type="button"
                        class="wd"
                        :class="{on: schRepeatDays.includes(w.value)}"
                        @click="toggleWeekday(schRepeatDays, w.value)"
                    >
                        {{ w.label }}
                    </button>
                </div>
                <button type="button" class="btn primary" @click="createSchedule">保存</button>
            </div>

            <ul class="list">
                <li v-if="!schedulePresets.length" class="empty">暂无定时，上方新建</li>
                <li
                    v-for="task in schedulePresets"
                    :key="task.id"
                    class="item"
                    @click="openEdit(task)"
                >
                    <div class="row-main">
                        <strong>{{ task.title }}</strong>
                        <span class="meta">{{ taskSummary(task) }}</span>
                    </div>
                    <div class="row-sub">
                        <span v-if="task.fireAtMs" class="due">
                            下次 {{ formatFireAt(task.fireAtMs) }}
                        </span>
                        <span class="tag" :data-s="task.status">{{ statusLabel[task.status] }}</span>
                    </div>
                    <div class="row-act" @click.stop>
                        <label class="sw">
                            <input
                                type="checkbox"
                                :checked="task.enabled"
                                @change="run(() => timerApi.setEnabled(task.id, $event.target.checked))"
                            />
                            启用
                        </label>
                        <button
                            type="button"
                            class="pin"
                            :class="{on: task.pinned}"
                            title="置顶"
                            @click="run(() => timerApi.setPinned(task.id, !task.pinned))"
                        >
                            ★
                        </button>
                        <button
                            type="button"
                            class="btn small danger"
                            @click="run(() => timerApi.delete(task.id))"
                        >
                            删
                        </button>
                    </div>
                </li>
            </ul>
        </section>

        <!-- 倒计时 -->
        <section v-show="tab === 'countdown'" class="panel">
            <div v-if="countdownRunning.length" class="card running">
                <h2>进行中</h2>
                <ul class="list compact">
                    <li v-for="inst in countdownRunning" :key="inst.id" class="item inst">
                        <strong>{{ inst.title }}</strong>
                        <span class="remain">{{ formatRemaining(remainingFor(inst)) }}</span>
                        <span v-if="inst.status === 'paused'" class="tag">已暂停</span>
                        <button
                            v-if="inst.status === 'scheduled'"
                            type="button"
                            class="btn small"
                            @click.stop="run(() => timerApi.pauseCountdown(inst.id))"
                        >
                            暂停
                        </button>
                        <button
                            v-if="inst.status === 'paused'"
                            type="button"
                            class="btn small primary"
                            @click.stop="run(() => timerApi.resumeCountdown(inst.id))"
                        >
                            继续
                        </button>
                        <button
                            type="button"
                            class="btn small danger"
                            @click.stop="run(() => timerApi.cancel(inst.id))"
                        >
                            停止
                        </button>
                    </li>
                </ul>
            </div>

            <div class="card form">
                <h2>新建 / 常用</h2>
                <label class="field">
                    <span>标题</span>
                    <input v-model="cdTitle" type="text" />
                </label>
                <div class="row3">
                    <label class="field">
                        <span>时</span>
                        <input v-model.number="cdHr" type="number" min="0" />
                    </label>
                    <label class="field">
                        <span>分</span>
                        <input v-model.number="cdMin" type="number" min="0" />
                    </label>
                    <label class="field">
                        <span>秒</span>
                        <input v-model.number="cdSec" type="number" min="0" />
                    </label>
                </div>
                <label class="check">
                    <input v-model="cdFavorite" type="checkbox" />
                    标为常用
                </label>
                <button type="button" class="btn primary" @click="createCountdownPreset">保存预设</button>
            </div>

            <ul class="list">
                <li v-if="!countdownPresets.length" class="empty">暂无倒计时预设</li>
                <li
                    v-for="task in countdownPresets"
                    :key="task.id"
                    class="item"
                    @click="openEdit(task)"
                >
                    <div class="row-main">
                        <strong>
                            {{ task.title }}
                            <em v-if="task.isFavorite" class="fav">常用</em>
                        </strong>
                        <span class="meta">{{ taskSummary(task) }}</span>
                    </div>
                    <div class="row-act" @click.stop>
                        <button
                            type="button"
                            class="btn small primary"
                            :disabled="!task.enabled"
                            @click="run(() => timerApi.spawnCountdown({id: task.id, options: {startImmediately: true}}))"
                        >
                            开始
                        </button>
                        <label class="sw">
                            <input
                                type="checkbox"
                                :checked="task.enabled"
                                @change="run(() => timerApi.setEnabled(task.id, $event.target.checked))"
                            />
                        </label>
                        <button
                            type="button"
                            class="pin"
                            :class="{on: task.pinned}"
                            @click="run(() => timerApi.setPinned(task.id, !task.pinned))"
                        >
                            ★
                        </button>
                        <button
                            type="button"
                            class="btn small danger"
                            @click="run(() => timerApi.delete(task.id))"
                        >
                            删
                        </button>
                    </div>
                </li>
            </ul>
        </section>

        <!-- 循环 / 队列 -->
        <section v-show="tab === 'combo'" class="panel">
            <div class="seg">
                <button
                    type="button"
                    class="seg-btn"
                    :class="{active: comboMode === 'queue'}"
                    @click="comboMode = 'queue'"
                >
                    队列
                </button>
                <button
                    type="button"
                    class="seg-btn"
                    :class="{active: comboMode === 'loop'}"
                    @click="comboMode = 'loop'"
                >
                    循环
                </button>
            </div>

            <div class="card form window-card">
                <h2>每日时段（可选）</h2>
                <p class="hint">
                    如 9:00 自动开始、18:00 自动结束，时段内按下方间隔或队列步骤提醒
                </p>
                <label class="check">
                    <input v-model="comboUseWindow" type="checkbox" />
                    启用每日开始 / 结束时间
                </label>
                <template v-if="comboUseWindow">
                    <div class="row2">
                        <label class="field">
                            <span>开始</span>
                            <input v-model="comboWindowStart" type="text" placeholder="09:00" />
                        </label>
                        <label class="field">
                            <span>结束</span>
                            <input v-model="comboWindowEnd" type="text" placeholder="18:00" />
                        </label>
                    </div>
                    <div class="weekdays">
                        <button
                            v-for="w in WEEKDAY_LABELS"
                            :key="w.value"
                            type="button"
                            class="wd"
                            :class="{on: comboWindowDays.includes(w.value)}"
                            @click="toggleWeekday(comboWindowDays, w.value)"
                        >
                            {{ w.label }}
                        </button>
                    </div>
                </template>
            </div>

            <div v-show="comboMode === 'queue'" class="card form">
                <h2>新建队列</h2>
                <label class="field">
                    <span>标题</span>
                    <input v-model="queueTitle" type="text" />
                </label>
                <label class="check">
                    <input v-model="queueRepeat" type="checkbox" />
                    跑完后循环（如 45 分工作 + 15 分休息）
                </label>
                <div v-for="(step, i) in queueSteps" :key="i" class="step">
                    <span>步骤 {{ i + 1 }}</span>
                    <input v-model="step.title" type="text" placeholder="标题" />
                    <div class="row2">
                        <input v-model.number="step.minutes" type="number" min="0" placeholder="分" />
                        <input v-model.number="step.seconds" type="number" min="0" placeholder="秒" />
                    </div>
                </div>
                <button type="button" class="btn ghost" @click="addQueueStep">+ 步骤</button>
                <button type="button" class="btn primary" @click="createQueuePreset">保存队列</button>
            </div>

            <div v-show="comboMode === 'loop'" class="card form">
                <h2>新建循环</h2>
                <label class="field">
                    <span>标题</span>
                    <input v-model="loopTitle" type="text" />
                </label>
                <div class="row2">
                    <label class="field">
                        <span>每轮 · 分</span>
                        <input v-model.number="loopMin" type="number" min="0" />
                    </label>
                    <label class="field">
                        <span>秒</span>
                        <input v-model.number="loopSec" type="number" min="0" />
                    </label>
                </div>
                <button type="button" class="btn primary" @click="createLoopPreset">保存循环</button>
            </div>

            <h3 class="sec-title">已保存</h3>
            <ul class="list">
                <li
                    v-for="task in [...queuePresets, ...loopPresets]"
                    :key="task.id"
                    class="item"
                    @click="openEdit(task)"
                >
                    <div class="row-main">
                        <strong>{{ task.title }}</strong>
                        <span class="meta">{{ typeLabel[task.type] }} · {{ taskSummary(task) }}</span>
                        <span
                            v-if="task.status === 'pending' && task.nextWindowStartAtMs"
                            class="due"
                        >
                            {{ formatFireAt(task.nextWindowStartAtMs) }} 自动开始
                        </span>
                        <span
                            v-else-if="task.status === 'scheduled' && taskDueAt(task)"
                            class="due"
                        >
                            剩余 {{ formatRemaining(remainingFor(task)) }}
                        </span>
                    </div>
                    <div class="row-act" @click.stop>
                        <button
                            v-if="task.status === 'idle' || task.status === 'pending'"
                            type="button"
                            class="btn small primary"
                            :disabled="!task.enabled"
                            @click="
                                run(() =>
                                    task.type === 'loop'
                                        ? timerApi.startLoop(task.id)
                                        : timerApi.startQueue(task.id),
                                )
                            "
                        >
                            启动
                        </button>
                        <button
                            v-if="task.status === 'scheduled'"
                            type="button"
                            class="btn small"
                            @click="run(() => timerApi.cancel(task.id))"
                        >
                            停止
                        </button>
                        <button
                            type="button"
                            class="btn small"
                            @click="run(() => timerApi.restart(task.id))"
                        >
                            重来
                        </button>
                        <button
                            type="button"
                            class="pin"
                            :class="{on: task.pinned}"
                            @click="run(() => timerApi.setPinned(task.id, !task.pinned))"
                        >
                            ★
                        </button>
                        <button
                            type="button"
                            class="btn small danger"
                            @click="run(() => timerApi.delete(task.id))"
                        >
                            删
                        </button>
                    </div>
                </li>
                <li v-if="!queuePresets.length && !loopPresets.length" class="empty">暂无任务</li>
            </ul>
        </section>

        <!-- 模板 -->
        <section v-show="tab === 'template'" class="panel">
            <div class="card">
                <h2>QQ 农场收菜</h2>
                <p class="desc">按成熟时长与增益计算倒计时</p>
                <div class="row2">
                    <label class="field">
                        <span>成熟(小时)</span>
                        <select v-model.number="farmBaseHours">
                            <option :value="4">4</option>
                            <option :value="8">8</option>
                            <option :value="16">16</option>
                            <option :value="24">24</option>
                        </select>
                    </label>
                    <label class="field">
                        <span>增益</span>
                        <select v-model="farmSpeed">
                            <option :value="0">0%</option>
                            <option :value="0.1">10%</option>
                            <option :value="0.2">20%</option>
                            <option value="custom">自定义</option>
                        </select>
                    </label>
                </div>
                <input
                    v-if="farmSpeed === 'custom'"
                    v-model="farmCustomSpeed"
                    type="number"
                    step="0.05"
                    min="0"
                    max="0.9"
                    placeholder="0.15 = 15%"
                    class="full"
                />
                <p class="hint">
                    约 {{ formatDurationParts(qqFarmDurationMs(farmBaseHours, farmSpeed === 'custom' ? Number(farmCustomSpeed) || 0 : farmSpeed)) }}
                </p>
                <button type="button" class="btn primary" @click="addQqFarm">添加收菜倒计时</button>
            </div>

            <ul v-if="templates.length" class="tpl-meta">
                <li v-for="tpl in templates" :key="tpl.id">{{ tpl.title }} — {{ tpl.description }}</li>
            </ul>
        </section>

        </main>

        <nav class="tabs tabs-bottom">
            <button
                v-for="t in TABS"
                :key="t.id"
                type="button"
                class="tab"
                :class="{active: tab === t.id}"
                @click="tab = t.id"
            >
                {{ t.label }}
            </button>
        </nav>

        <!-- 编辑层 -->
        <div v-if="editingTask" class="edit-overlay" @click.self="closeEdit">
            <div class="edit-sheet">
                <header>
                    <h2>编辑 · {{ typeLabel[editingTask.type] }}</h2>
                    <button type="button" class="btn ghost" @click="closeEdit">关闭</button>
                </header>

                <label class="field">
                    <span>标题</span>
                    <input v-model="editTitle" type="text" />
                </label>

                <template v-if="editingTask.type === 'schedule'">
                    <label class="field">
                        <span>时间</span>
                        <input v-model="editTime" type="text" />
                    </label>
                    <label class="check">
                        <input v-model="editUseDate" type="checkbox" />
                        指定日期
                    </label>
                    <input v-if="editUseDate" v-model="editDate" type="date" class="full" />
                    <div v-else class="weekdays">
                        <button
                            v-for="w in WEEKDAY_LABELS"
                            :key="w.value"
                            type="button"
                            class="wd"
                            :class="{on: editRepeatDays.includes(w.value)}"
                            @click="toggleWeekday(editRepeatDays, w.value)"
                        >
                            {{ w.label }}
                        </button>
                    </div>
                </template>

                <template v-if="editingTask.type === 'loop' || editingTask.type === 'queue'">
                    <label class="check">
                        <input v-model="editUseWindow" type="checkbox" />
                        每日开始 / 结束时间
                    </label>
                    <template v-if="editUseWindow">
                        <div class="row2">
                            <label class="field">
                                <span>开始</span>
                                <input v-model="editWindowStart" type="text" />
                            </label>
                            <label class="field">
                                <span>结束</span>
                                <input v-model="editWindowEnd" type="text" />
                            </label>
                        </div>
                        <div class="weekdays">
                            <button
                                v-for="w in WEEKDAY_LABELS"
                                :key="w.value"
                                type="button"
                                class="wd"
                                :class="{on: editWindowDays.includes(w.value)}"
                                @click="toggleWeekday(editWindowDays, w.value)"
                            >
                                {{ w.label }}
                            </button>
                        </div>
                    </template>
                </template>

                <template v-if="editingTask.type === 'countdown' || editingTask.type === 'loop'">
                    <div class="row3">
                        <label class="field">
                            <span>时</span>
                            <input v-model.number="editDurationHr" type="number" min="0" />
                        </label>
                        <label class="field">
                            <span>分</span>
                            <input v-model.number="editDurationMin" type="number" min="0" />
                        </label>
                        <label class="field">
                            <span>秒</span>
                            <input v-model.number="editDurationSec" type="number" min="0" />
                        </label>
                    </div>
                    <label v-if="editingTask.type === 'countdown'" class="check">
                        <input v-model="editFavorite" type="checkbox" />
                        常用
                    </label>
                </template>

                <template v-if="editingTask.type === 'queue'">
                    <label class="check">
                        <input v-model="editRepeat" type="checkbox" />
                        循环队列
                    </label>
                    <div v-for="(step, i) in editSteps" :key="i" class="step">
                        <input v-model="step.title" type="text" />
                        <div class="row2">
                            <input v-model.number="step.minutes" type="number" min="0" />
                            <input v-model.number="step.seconds" type="number" min="0" />
                        </div>
                    </div>
                    <button type="button" class="btn ghost" @click="addEditStep">+ 步骤</button>
                </template>

                <button type="button" class="btn primary block" @click="saveEdit">保存修改</button>
            </div>
        </div>
    </div>
</template>

<style scoped>
.app {
    display: flex;
    flex-direction: column;
    max-width: 400px;
    height: 100vh;
    margin: 0 auto;
    padding: 12px 14px 0;
    text-align: left;
    font-size: 14px;
    color: var(--text);
}

.app-body {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding-bottom: 64px;
}

.top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 10px;
    padding-bottom: 10px;
    border-bottom: 1px solid var(--border);
}

.brand {
    display: flex;
    align-items: center;
    gap: 8px;
}

.brand-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border-radius: 10px;
    background: var(--accent-soft);
    font-size: 1rem;
    line-height: 1;
}

.top h1 {
    margin: 0;
    font-size: 1.12rem;
    font-weight: 700;
    letter-spacing: -0.02em;
}

.top-actions {
    display: flex;
    align-items: center;
    gap: 4px;
}

.settings-anchor {
    position: relative;
}

.top-actions .btn.active {
    background: var(--accent-soft);
    border-color: var(--accent);
    color: var(--accent);
}

.tabs {
    display: flex;
    gap: 4px;
    padding: 4px;
    border-radius: 10px;
    background: var(--surface);
    border: 1px solid var(--border);
}

.tabs-bottom {
    position: fixed;
    left: 50%;
    bottom: 0;
    z-index: 50;
    transform: translateX(-50%);
    width: 100%;
    max-width: 400px;
    margin: 0;
    padding: 10px 14px 12px;
    border-top: 1px solid var(--border);
    background: var(--surface);
    backdrop-filter: blur(12px);
    box-shadow: var(--shadow-tab);
}

.tab {
    flex: 1;
    padding: 8px 4px;
    border: none;
    border-radius: 8px;
    background: transparent;
    color: var(--text-muted);
    font-size: 0.8rem;
    font-weight: 500;
    cursor: pointer;
    transition: background 0.15s, color 0.15s;
}

.tab:hover:not(.active) {
    color: var(--text);
    background: var(--surface-hover);
}

.tab.active {
    background: var(--accent-soft);
    color: var(--accent);
    font-weight: 600;
}

.error {
    margin: 0 0 10px;
    padding: 10px 12px;
    border-radius: 10px;
    background: var(--danger-soft);
    color: var(--danger-text);
    font-size: 0.82rem;
    border: 1px solid rgba(220, 38, 38, 0.2);
}

.clock {
    font-size: 2.5rem;
    font-weight: 200;
    letter-spacing: 0.06em;
    font-variant-numeric: tabular-nums;
    text-align: center;
    margin: 8px 0 4px;
    color: var(--text);
    text-shadow: 0 0 40px var(--clock-glow);
}

.sub {
    text-align: center;
    margin: 0 0 14px;
    font-size: 0.78rem;
    color: var(--text-muted);
}

.card {
    padding: 14px;
    margin-bottom: 12px;
    border: 1px solid var(--border);
    border-radius: 12px;
    background: var(--bg-elevated);
    box-shadow: var(--shadow-sm);
}

.card h2 {
    margin: 0 0 10px;
    font-size: 0.9rem;
    font-weight: 600;
    color: var(--text);
}

.desc {
    margin: 0 0 10px;
    font-size: 0.8rem;
    color: var(--text-muted);
    line-height: 1.45;
}

.hint {
    margin: 6px 0;
    font-size: 0.75rem;
    color: var(--text-subtle);
}

.field {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin-bottom: 10px;
    font-size: 0.78rem;
}

.field span {
    color: var(--text-muted);
    font-weight: 500;
}

.field input,
.field select,
.full {
    padding: 8px 10px;
    border: 1px solid var(--input-border);
    border-radius: 8px;
    background: var(--input-bg);
    color: var(--text);
    font: inherit;
    transition: border-color 0.15s, box-shadow 0.15s;
}

.field input:focus,
.field select:focus,
.full:focus {
    outline: none;
    border-color: var(--accent);
    box-shadow: 0 0 0 3px var(--accent-soft);
}

.row2,
.row3 {
    display: flex;
    gap: 8px;
}

.row2 .field,
.row3 .field {
    flex: 1;
    min-width: 0;
}

.row2 .field input,
.row3 .field input {
    width: 100%;
}

.check {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 10px;
    font-size: 0.85rem;
    color: var(--text);
    cursor: pointer;
}

.weekdays {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    margin-bottom: 12px;
}

.weekdays .lbl {
    font-size: 0.78rem;
    color: var(--text-muted);
    font-weight: 500;
    margin-right: 2px;
}

.wd {
    width: 30px;
    height: 30px;
    padding: 0;
    border: 1px solid var(--border-strong);
    border-radius: 50%;
    background: transparent;
    color: var(--text-muted);
    font-size: 0.75rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s ease;
}

.wd:hover:not(.on) {
    border-color: var(--accent);
    color: var(--accent);
}

.wd.on {
    background: var(--accent);
    border-color: var(--accent);
    color: var(--accent-text);
    box-shadow: 0 2px 8px var(--accent-soft);
}

.seg {
    display: flex;
    gap: 6px;
    margin-bottom: 12px;
    padding: 4px;
    border-radius: 10px;
    background: var(--surface);
    border: 1px solid var(--border);
}

.seg-btn {
    flex: 1;
    padding: 9px;
    border: none;
    border-radius: 8px;
    background: transparent;
    color: var(--text-muted);
    font-size: 0.85rem;
    font-weight: 500;
    cursor: pointer;
    transition: background 0.15s, color 0.15s;
}

.seg-btn.active {
    background: var(--accent-soft);
    color: var(--accent);
    font-weight: 600;
}

.step {
    margin-bottom: 8px;
    padding: 10px;
    border-radius: 8px;
    background: var(--surface);
    border: 1px solid var(--border);
    font-size: 0.8rem;
}

.step input {
    width: 100%;
    margin-top: 6px;
    padding: 7px 8px;
    border-radius: 6px;
    border: 1px solid var(--input-border);
    background: var(--input-bg);
    color: var(--text);
}

.sec-title {
    margin: 14px 0 8px;
    font-size: 0.82rem;
    font-weight: 600;
    color: var(--text-muted);
    letter-spacing: 0.02em;
}

.list {
    list-style: none;
    margin: 0;
    padding: 0;
    border-radius: 12px;
    border: 1px solid var(--border);
    background: var(--bg-elevated);
    overflow: hidden;
    box-shadow: var(--shadow-sm);
}

.item {
    padding: 12px 14px;
    border-bottom: 1px solid var(--border);
    cursor: pointer;
    transition: background 0.12s;
}

.item:last-child {
    border-bottom: none;
}

.item:hover {
    background: var(--surface-hover);
}

.item.inst {
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: default;
}

.row-main strong {
    display: block;
    font-size: 0.9rem;
    font-weight: 600;
}

.fav {
    font-style: normal;
    font-size: 0.7rem;
    color: var(--warning);
    margin-left: 4px;
}

.meta {
    font-size: 0.78rem;
    color: var(--text-muted);
}

.row-sub {
    display: flex;
    gap: 8px;
    margin-top: 4px;
    font-size: 0.75rem;
}

.due {
    color: var(--success);
}

.remain {
    flex: 1;
    color: var(--success);
    font-variant-numeric: tabular-nums;
    font-weight: 500;
}

.tag {
    padding: 2px 7px;
    border-radius: 6px;
    background: var(--accent-soft);
    color: var(--accent);
    font-size: 0.72rem;
    font-weight: 500;
}

.row-act {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    margin-top: 8px;
}

.sw {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 0.78rem;
    cursor: pointer;
}

.pin {
    border: none;
    background: transparent;
    color: inherit;
    opacity: 0.35;
    cursor: pointer;
    font-size: 1rem;
    transition: opacity 0.15s, color 0.15s;
}

.pin.on {
    opacity: 1;
    color: var(--warning);
}

.empty {
    padding: 20px 0;
    text-align: center;
    color: var(--text-subtle);
    font-size: 0.85rem;
    cursor: default;
}

.running {
    border-color: var(--success);
    background: var(--success-soft);
}

.btn {
    padding: 7px 14px;
    border-radius: 8px;
    border: 1px solid var(--border-strong);
    background: var(--surface);
    color: var(--text);
    font-size: 0.85rem;
    font-weight: 500;
    cursor: pointer;
    transition: background 0.15s, border-color 0.15s, transform 0.1s;
}

.btn:hover:not(:disabled) {
    border-color: var(--accent);
    background: var(--accent-soft);
}

.btn:active:not(:disabled) {
    transform: scale(0.98);
}

.btn:disabled {
    opacity: 0.45;
    cursor: not-allowed;
}

.btn.primary {
    background: var(--accent);
    border-color: var(--accent);
    color: var(--accent-text);
}

.btn.primary:hover:not(:disabled) {
    background: var(--accent-hover);
    border-color: var(--accent-hover);
}

.btn.ghost {
    background: transparent;
    border-color: transparent;
    font-size: 0.8rem;
    padding: 6px 10px;
    color: var(--text-muted);
}

.btn.ghost:hover:not(:disabled) {
    background: var(--accent-soft);
    color: var(--accent);
    border-color: transparent;
}

.btn.small {
    padding: 4px 10px;
    font-size: 0.75rem;
}

.btn.danger {
    color: var(--danger-text);
    border-color: rgba(220, 38, 38, 0.35);
}

.btn.danger:hover:not(:disabled) {
    background: var(--danger-soft);
    border-color: var(--danger);
}

.btn.block {
    width: 100%;
    margin-top: 10px;
}

.edit-overlay {
    position: fixed;
    inset: 0;
    background: var(--overlay);
    display: flex;
    align-items: flex-end;
    justify-content: center;
    z-index: 100;
}

.edit-sheet {
    width: 100%;
    max-width: 400px;
    max-height: 85vh;
    overflow-y: auto;
    padding: 16px;
    border-radius: 16px 16px 0 0;
    background: var(--bg-elevated);
    border: 1px solid var(--border-strong);
    box-shadow: var(--shadow-md);
}

.edit-sheet header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;
}

.edit-sheet h2 {
    margin: 0;
    font-size: 0.95rem;
    font-weight: 600;
}

.tpl-meta {
    margin-top: 12px;
    padding-left: 18px;
    font-size: 0.75rem;
    color: var(--text-subtle);
}
</style>
