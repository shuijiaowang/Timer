<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import {
    formatClock,
    formatDurationParts,
    formatFireAt,
    formatRemaining,
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

// —— QQ 农场模板 ——
const farmBaseHours = ref(8);
const farmSpeed = ref(0);
const farmCustomSpeed = ref('');

let tickTimer = null;

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
            (t.status === 'scheduled' || t.status === 'pending'),
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
    const durationMs = msFromMinSec(cdMin.value, cdSec.value);
    if (durationMs <= 0) {
        error.value = '时长必须大于 0';
        return;
    }
    await run(() =>
        timerApi.createCountdown({
            title: cdTitle.value.trim() || '倒计时',
            durationMs,
            isFavorite: cdFavorite.value,
        }),
    );
}

async function createLoopPreset() {
    const durationMs = msFromMinSec(loopMin.value, loopSec.value);
    if (durationMs <= 0) {
        error.value = '间隔必须大于 0';
        return;
    }
    await run(() =>
        timerApi.createLoop({
            title: loopTitle.value.trim() || '循环提醒',
            durationMs,
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
    await run(() =>
        timerApi.createQueue({
            title: queueTitle.value.trim() || '队列任务',
            steps,
            repeat: queueRepeat.value,
        }),
    );
}

async function addFromTemplate(templateId, overrides = {}) {
    await run(() => timerApi.createFromTemplate({templateId, overrides}));
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
    await addFromTemplate('qq_farm', {
        title: `收菜 ${farmBaseHours.value}h`,
        durationMs,
    });
}

function remainingFor(task) {
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
const editDurationMin = ref(0);
const editDurationSec = ref(0);
const editFavorite = ref(false);
const editRepeat = ref(false);
const editSteps = ref([]);

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
        editDurationMin.value = Math.floor(totalSec / 60);
        editDurationSec.value = totalSec % 60;
        editFavorite.value = Boolean(task.isFavorite);
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
        patch.durationMs = msFromMinSec(editDurationMin.value, editDurationSec.value);
        if (patch.durationMs <= 0) {
            error.value = '时长必须大于 0';
            return;
        }
    }
    if (task.type === 'countdown') {
        patch.isFavorite = editFavorite.value;
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
        return `${n} 步 · ${rep}`;
    }
    if (task.type === 'loop') {
        return `每 ${formatDurationParts(task.durationMs)}`;
    }
    return formatDurationParts(task.durationMs);
}

onMounted(() => {
    schTime.value = defaultTime();
    schDate.value = todayStr.value;
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
            <h1>Timer</h1>
            <button type="button" class="btn ghost" :disabled="loading" @click="refresh">
                {{ loading ? '…' : '刷新' }}
            </button>
        </header>

        <nav class="tabs">
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
                    <input v-model="schTime" type="text" placeholder="08:30" />
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
                <div class="row2">
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
                            v-if="task.status === 'scheduled' && taskDueAt(task)"
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
                <h2>番茄闹钟</h2>
                <p class="desc">工作 45 分钟，休息 15 分钟，可循环</p>
                <button
                    type="button"
                    class="btn primary"
                    @click="addFromTemplate('pomodoro', {startNow: false})"
                >
                    添加到我的任务
                </button>
            </div>

            <div class="card">
                <h2>喝水提醒</h2>
                <p class="desc">每一小时提醒一次</p>
                <button type="button" class="btn primary" @click="addFromTemplate('water_hourly')">
                    添加到我的任务
                </button>
            </div>

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

                <template v-if="editingTask.type === 'countdown' || editingTask.type === 'loop'">
                    <div class="row2">
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
    max-width: 400px;
    margin: 0 auto;
    padding: 10px 12px 24px;
    text-align: left;
    font-size: 14px;
}

.top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 8px;
}

.top h1 {
    margin: 0;
    font-size: 1.15rem;
}

.tabs {
    display: flex;
    gap: 4px;
    margin-bottom: 10px;
    border-bottom: 1px solid rgba(128, 128, 128, 0.25);
    padding-bottom: 6px;
}

.tab {
    flex: 1;
    padding: 6px 4px;
    border: none;
    border-radius: 6px;
    background: transparent;
    color: inherit;
    font-size: 0.8rem;
    cursor: pointer;
    opacity: 0.65;
}

.tab.active {
    background: rgba(100, 108, 255, 0.2);
    opacity: 1;
    font-weight: 600;
}

.error {
    margin: 0 0 8px;
    padding: 8px;
    border-radius: 6px;
    background: #3d1f1f;
    color: #ffb4b4;
    font-size: 0.82rem;
}

.clock {
    font-size: 2.2rem;
    font-weight: 300;
    letter-spacing: 0.05em;
    text-align: center;
    margin: 4px 0;
}

.sub {
    text-align: center;
    margin: 0 0 12px;
    font-size: 0.78rem;
    opacity: 0.55;
}

.card {
    padding: 10px 12px;
    margin-bottom: 10px;
    border: 1px solid rgba(128, 128, 128, 0.2);
    border-radius: 8px;
    background: rgba(128, 128, 128, 0.06);
}

.card h2 {
    margin: 0 0 8px;
    font-size: 0.92rem;
}

.desc {
    margin: 0 0 8px;
    font-size: 0.8rem;
    opacity: 0.7;
}

.hint {
    margin: 6px 0;
    font-size: 0.75rem;
    opacity: 0.6;
}

.field {
    display: flex;
    flex-direction: column;
    gap: 3px;
    margin-bottom: 8px;
    font-size: 0.78rem;
}

.field span {
    opacity: 0.7;
}

.field input,
.field select,
.full {
    padding: 6px 8px;
    border: 1px solid rgba(128, 128, 128, 0.3);
    border-radius: 6px;
    background: rgba(0, 0, 0, 0.15);
    color: inherit;
    font: inherit;
}

.row2 {
    display: flex;
    gap: 8px;
}

.row2 .field {
    flex: 1;
}

.check {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 8px;
    font-size: 0.85rem;
    cursor: pointer;
}

.weekdays {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px;
    margin-bottom: 10px;
}

.weekdays .lbl {
    font-size: 0.78rem;
    opacity: 0.7;
    margin-right: 4px;
}

.wd {
    width: 28px;
    height: 28px;
    padding: 0;
    border: 1px solid rgba(128, 128, 128, 0.35);
    border-radius: 50%;
    background: transparent;
    color: inherit;
    font-size: 0.75rem;
    cursor: pointer;
}

.wd.on {
    background: #646cff;
    border-color: #646cff;
    color: #fff;
}

.seg {
    display: flex;
    gap: 6px;
    margin-bottom: 10px;
}

.seg-btn {
    flex: 1;
    padding: 8px;
    border: 1px solid rgba(128, 128, 128, 0.3);
    border-radius: 6px;
    background: transparent;
    color: inherit;
    cursor: pointer;
}

.seg-btn.active {
    background: rgba(100, 108, 255, 0.25);
    border-color: #646cff;
}

.step {
    margin-bottom: 8px;
    padding: 8px;
    border-radius: 6px;
    background: rgba(0, 0, 0, 0.12);
    font-size: 0.8rem;
}

.step input {
    width: 100%;
    margin-top: 4px;
    padding: 5px 6px;
    border-radius: 4px;
    border: 1px solid rgba(128, 128, 128, 0.3);
    background: rgba(0, 0, 0, 0.1);
    color: inherit;
}

.sec-title {
    margin: 12px 0 6px;
    font-size: 0.85rem;
    opacity: 0.75;
}

.list {
    list-style: none;
    margin: 0;
    padding: 0;
}

.item {
    padding: 10px 0;
    border-bottom: 1px solid rgba(128, 128, 128, 0.15);
    cursor: pointer;
}

.item:hover {
    background: rgba(100, 108, 255, 0.06);
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
}

.fav {
    font-style: normal;
    font-size: 0.7rem;
    color: #f0c040;
    margin-left: 4px;
}

.meta {
    font-size: 0.78rem;
    opacity: 0.65;
}

.row-sub {
    display: flex;
    gap: 8px;
    margin-top: 4px;
    font-size: 0.75rem;
}

.due {
    color: #7dcea0;
}

.remain {
    flex: 1;
    color: #7dcea0;
    font-variant-numeric: tabular-nums;
}

.tag {
    padding: 1px 5px;
    border-radius: 4px;
    background: rgba(100, 108, 255, 0.2);
    font-size: 0.72rem;
}

.row-act {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    margin-top: 6px;
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
}

.pin.on {
    opacity: 1;
    color: #f0c040;
}

.empty {
    padding: 16px 0;
    text-align: center;
    opacity: 0.5;
    font-size: 0.85rem;
    cursor: default;
}

.running {
    border-color: rgba(125, 206, 160, 0.4);
}

.btn {
    padding: 6px 12px;
    border-radius: 6px;
    border: 1px solid rgba(128, 128, 128, 0.35);
    background: rgba(0, 0, 0, 0.2);
    color: inherit;
    font-size: 0.85rem;
    cursor: pointer;
}

.btn:disabled {
    opacity: 0.45;
    cursor: not-allowed;
}

.btn.primary {
    background: #646cff;
    border-color: #646cff;
    color: #fff;
}

.btn.ghost {
    background: transparent;
    font-size: 0.8rem;
    padding: 4px 10px;
}

.btn.small {
    padding: 3px 8px;
    font-size: 0.75rem;
}

.btn.danger {
    color: #ffb4b4;
    border-color: rgba(255, 120, 120, 0.4);
}

.btn.block {
    width: 100%;
    margin-top: 8px;
}

.edit-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.55);
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
    padding: 14px;
    border-radius: 12px 12px 0 0;
    background: #1e1e1e;
    border: 1px solid rgba(128, 128, 128, 0.3);
}

.edit-sheet header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 10px;
}

.edit-sheet h2 {
    margin: 0;
    font-size: 0.95rem;
}

.tpl-meta {
    margin-top: 12px;
    padding-left: 18px;
    font-size: 0.75rem;
    opacity: 0.5;
}

@media (prefers-color-scheme: light) {
    .error {
        background: #ffe8e8;
        color: #a02020;
    }

    .field input,
    .field select,
    .full {
        background: #fff;
    }

    .edit-sheet {
        background: #fafafa;
    }

    .step {
        background: rgba(0, 0, 0, 0.04);
    }
}
</style>
