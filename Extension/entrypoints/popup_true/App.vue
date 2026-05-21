<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue';
import {
    formatFireAt,
    formatRemaining,
    statusLabel,
    taskDueAt,
    timerApi,
} from './timerApi.js';

const tasks = ref([]);
const loading = ref(false);
const error = ref('');
const now = ref(Date.now());

const scheduleTitle = ref('吃药提醒');
const scheduleTime = ref('');

const countdownTitle = ref('休息倒计时');
const countdownMinutes = ref(1);
const countdownSeconds = ref(0);
const countdownStartNow = ref(true);

let tickTimer = null;

const countdownDurationMs = computed(
    () => (Number(countdownMinutes.value) || 0) * 60_000 + (Number(countdownSeconds.value) || 0) * 1000,
);

function defaultScheduleTime() {
    const d = new Date();
    d.setMinutes(d.getMinutes() + 2);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
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

async function createSchedule() {
    error.value = '';
    try {
        await timerApi.createSchedule({
            title: scheduleTitle.value.trim() || '定时提醒',
            time: scheduleTime.value.trim(),
        });
        await refresh();
    } catch (e) {
        error.value = e?.message ?? String(e);
    }
}

async function createCountdown() {
    error.value = '';
    const durationMs = countdownDurationMs.value;
    if (durationMs <= 0) {
        error.value = '倒计时时长必须大于 0';
        return;
    }
    try {
        await timerApi.createCountdown({
            title: countdownTitle.value.trim() || '倒计时',
            durationMs,
            startNow: countdownStartNow.value,
        });
        await refresh();
    } catch (e) {
        error.value = e?.message ?? String(e);
    }
}

async function startCountdown(id) {
    error.value = '';
    try {
        await timerApi.startCountdown(id);
        await refresh();
    } catch (e) {
        error.value = e?.message ?? String(e);
    }
}

async function cancelTask(id) {
    error.value = '';
    try {
        await timerApi.cancel(id);
        await refresh();
    } catch (e) {
        error.value = e?.message ?? String(e);
    }
}

function remainingFor(task) {
    const due = taskDueAt(task);
    if (due == null) return null;
    return Math.max(0, due - now.value);
}

function taskSummary(task) {
    if (task.type === 'schedule') {
        const pad = (n) => String(n).padStart(2, '0');
        return `定时 ${pad(task.hour)}:${pad(task.minute)}`;
    }
    const mins = Math.round(task.durationMs / 60000);
    return `倒计时 ${mins} 分钟`;
}

onMounted(() => {
    scheduleTime.value = defaultScheduleTime();
    refresh();
    tickTimer = setInterval(() => {
        now.value = Date.now();
    }, 1000);
});

onUnmounted(() => {
    if (tickTimer) clearInterval(tickTimer);
});
</script>

<template>
    <div class="page">
        <header class="header">
            <h1>Timer 任务测试</h1>
            <button type="button" class="btn ghost" :disabled="loading" @click="refresh">
                {{ loading ? '刷新中…' : '刷新列表' }}
            </button>
        </header>

        <p v-if="error" class="error">{{ error }}</p>

        <section class="card">
            <h2>定时任务（一次性）</h2>
            <label class="field">
                <span>标题</span>
                <input v-model="scheduleTitle" type="text" placeholder="吃药提醒" />
            </label>
            <label class="field">
                <span>时间 HH:mm</span>
                <input v-model="scheduleTime" type="text" placeholder="14:30" />
            </label>
            <button type="button" class="btn primary" @click="createSchedule">创建定时</button>
        </section>

        <section class="card">
            <h2>倒计时</h2>
            <label class="field">
                <span>标题</span>
                <input v-model="countdownTitle" type="text" placeholder="休息" />
            </label>
            <div class="row">
                <label class="field compact">
                    <span>分</span>
                    <input v-model.number="countdownMinutes" type="number" min="0" />
                </label>
                <label class="field compact">
                    <span>秒</span>
                    <input v-model.number="countdownSeconds" type="number" min="0" />
                </label>
            </div>
            <label class="check">
                <input v-model="countdownStartNow" type="checkbox" />
                创建后立即开始
            </label>
            <button type="button" class="btn primary" @click="createCountdown">创建倒计时</button>
            <p class="hint">快捷：设 0 分 10 秒可快速测通知</p>
        </section>

        <section class="card">
            <h2>任务列表 <span class="badge">{{ tasks.length }}</span></h2>
            <p v-if="!tasks.length" class="empty">暂无任务</p>
            <ul v-else class="task-list">
                <li v-for="task in tasks" :key="task.id" class="task-item">
                    <div class="task-main">
                        <strong>{{ task.title }}</strong>
                        <span class="meta">{{ taskSummary(task) }}</span>
                    </div>
                    <div class="task-meta">
                        <span class="tag" :data-status="task.status">{{ statusLabel[task.status] ?? task.status }}</span>
                        <span v-if="task.status === 'scheduled'" class="remain">
                            剩余 {{ formatRemaining(remainingFor(task)) }}
                        </span>
                        <span v-else-if="taskDueAt(task)" class="fire">
                            目标 {{ formatFireAt(taskDueAt(task)) }}
                        </span>
                    </div>
                    <div class="task-actions">
                        <button
                            v-if="task.type === 'countdown' && task.status === 'pending'"
                            type="button"
                            class="btn small"
                            @click="startCountdown(task.id)"
                        >
                            启动
                        </button>
                        <button
                            v-if="task.status === 'scheduled' || task.status === 'pending'"
                            type="button"
                            class="btn small danger"
                            @click="cancelTask(task.id)"
                        >
                            取消
                        </button>
                    </div>
                    <code class="id">{{ task.id.slice(0, 8) }}…</code>
                </li>
            </ul>
        </section>
    </div>
</template>

<style scoped>
.page {
    width: 100%;
    max-width: 420px;
    margin: 0 auto;
    padding: 12px 14px 20px;
    text-align: left;
}

.header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin-bottom: 12px;
}

.header h1 {
    margin: 0;
    font-size: 1.1rem;
    font-weight: 600;
}

.error {
    margin: 0 0 10px;
    padding: 8px 10px;
    border-radius: 6px;
    background: #3d1f1f;
    color: #ffb4b4;
    font-size: 0.85rem;
}

.card {
    margin-bottom: 12px;
    padding: 12px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.04);
}

.card h2 {
    margin: 0 0 10px;
    font-size: 0.95rem;
    font-weight: 600;
}

.badge {
    font-size: 0.75rem;
    font-weight: 500;
    opacity: 0.7;
}

.field {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin-bottom: 8px;
    font-size: 0.8rem;
}

.field span {
    opacity: 0.75;
}

.field input {
    padding: 6px 8px;
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 6px;
    background: rgba(0, 0, 0, 0.25);
    color: inherit;
    font: inherit;
}

.row {
    display: flex;
    gap: 8px;
}

.field.compact {
    flex: 1;
}

.check {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 10px;
    font-size: 0.85rem;
    cursor: pointer;
}

.hint {
    margin: 8px 0 0;
    font-size: 0.75rem;
    opacity: 0.55;
}

.empty {
    margin: 0;
    font-size: 0.85rem;
    opacity: 0.6;
}

.task-list {
    list-style: none;
    margin: 0;
    padding: 0;
}

.task-item {
    position: relative;
    padding: 10px 0;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.task-item:last-child {
    border-bottom: none;
    padding-bottom: 0;
}

.task-main strong {
    display: block;
    font-size: 0.9rem;
}

.meta {
    font-size: 0.78rem;
    opacity: 0.65;
}

.task-meta {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    margin-top: 4px;
    font-size: 0.78rem;
}

.tag {
    padding: 2px 6px;
    border-radius: 4px;
    background: rgba(100, 108, 255, 0.25);
}

.tag[data-status='completed'] {
    background: rgba(80, 160, 80, 0.25);
}

.tag[data-status='cancelled'] {
    background: rgba(120, 120, 120, 0.3);
}

.tag[data-status='pending'] {
    background: rgba(255, 180, 60, 0.25);
}

.remain {
    color: #8cf0a0;
}

.fire {
    opacity: 0.7;
}

.task-actions {
    display: flex;
    gap: 6px;
    margin-top: 6px;
}

.id {
    display: block;
    margin-top: 4px;
    font-size: 0.65rem;
    opacity: 0.4;
}

.btn {
    border-radius: 6px;
    border: 1px solid transparent;
    padding: 6px 12px;
    font-size: 0.85rem;
    font-weight: 500;
    font-family: inherit;
    background: #1a1a1a;
    color: inherit;
    cursor: pointer;
}

.btn:hover:not(:disabled) {
    border-color: #646cff;
}

.btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
}

.btn.primary {
    background: #646cff;
    color: #fff;
}

.btn.ghost {
    padding: 4px 10px;
    font-size: 0.8rem;
}

.btn.small {
    padding: 4px 8px;
    font-size: 0.78rem;
}

.btn.danger {
    border-color: rgba(255, 100, 100, 0.4);
    color: #ffb4b4;
}

@media (prefers-color-scheme: light) {
    .card {
        border-color: rgba(0, 0, 0, 0.1);
        background: rgba(0, 0, 0, 0.03);
    }

    .field input {
        border-color: rgba(0, 0, 0, 0.15);
        background: #fff;
    }

    .error {
        background: #ffe8e8;
        color: #a02020;
    }

    .btn {
        background: #f0f0f0;
    }

    .btn.primary {
        background: #646cff;
        color: #fff;
    }
}
</style>
