<script setup>
import {onMounted, ref, watch} from 'vue';
import {DEFAULT_USER_SETTINGS, mergeUserSettings} from '../../core/userSettings.js';
import {timerApi} from '../../entrypoints/popup_true/timerApi.js';
import ToggleRow from './ToggleRow.vue';

const emit = defineEmits(['saved', 'close', 'reset']);

const notification = ref({...DEFAULT_USER_SETTINGS.notification});
const appearance = ref({...DEFAULT_USER_SETTINGS.appearance});
const saving = ref(false);
const confirmReset = ref(false);
let ready = false;

async function load() {
    const res = await timerApi.getSettings();
    const merged = mergeUserSettings(res.settings);
    notification.value = {...merged.notification};
    appearance.value = {...merged.appearance};
}

async function persist() {
    if (!ready || saving.value) return;
    saving.value = true;
    try {
        const res = await timerApi.saveSettings({
            notification: {...notification.value},
            appearance: {...appearance.value},
        });
        const merged = mergeUserSettings(res.settings);
        notification.value = {...merged.notification};
        appearance.value = {...merged.appearance};
        emit('saved', merged);
    } finally {
        saving.value = false;
    }
}

async function handleClearAllData() {
    if (!confirmReset.value) {
        confirmReset.value = true;
        return;
    }
    try {
        await timerApi.clearAllData();
        emit('reset');
    } catch (e) {
        console.error('清空数据失败', e);
    } finally {
        confirmReset.value = false;
    }
}

function cancelReset() {
    confirmReset.value = false;
}

watch([notification, appearance], persist, {deep: true});

onMounted(async () => {
    await load();
    ready = true;
});
</script>

<template>
    <div class="settings-popover" role="dialog" aria-label="设置">
        <header class="popover-head">
            <span class="popover-title">设置</span>
            <button type="button" class="btn-close" aria-label="关闭" @click="emit('close')">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                    <path
                        d="M2 2l10 10M12 2L2 12"
                        stroke="currentColor"
                        stroke-width="1.6"
                        stroke-linecap="round"
                    />
                </svg>
            </button>
        </header>

        <section class="settings-section">
            <h3 class="section-label">外观</h3>
            <ToggleRow
                v-model="appearance.darkMode"
                label="黑夜模式"
                hint="深色背景，减轻夜间用眼负担"
            />
        </section>

        <section class="settings-section">
            <h3 class="section-label">提醒</h3>
            <ToggleRow
                v-model="notification.sound"
                label="声音提醒"
                hint="关闭后通知静音"
            />
            <ToggleRow
                v-model="notification.manualClose"
                label="手动关闭"
                hint="开启后通知需点击关闭"
            />
        </section>
        <section class="settings-section">
            <h3 class="section-label">数据</h3>
            <div class="reset-row">
                <template v-if="!confirmReset">
                    <button type="button" class="btn-reset" @click="handleClearAllData">
                        清空所有数据
                    </button>
                </template>
                <template v-else>
                    <span class="reset-warn">确定要清空？</span>
                    <button type="button" class="btn-reset confirm" @click="handleClearAllData">确定</button>
                    <button type="button" class="btn-reset cancel" @click="cancelReset">取消</button>
                </template>
            </div>
        </section>
    </div>
</template>

<style scoped>
.settings-popover {
    position: absolute;
    top: 100%;
    right: 0;
    z-index: 60;
    margin-top: 8px;
    min-width: 268px;
    padding: 12px 14px 10px;
    border-radius: 12px;
    border: 1px solid var(--border-strong);
    background: var(--bg-elevated);
    box-shadow: var(--shadow-md);
    animation: pop-in 0.18s ease-out;
}

@keyframes pop-in {
    from {
        opacity: 0;
        transform: translateY(-6px) scale(0.97);
    }
    to {
        opacity: 1;
        transform: translateY(0) scale(1);
    }
}

.popover-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 6px;
    padding-bottom: 8px;
    border-bottom: 1px solid var(--border);
}

.popover-title {
    font-size: 0.92rem;
    font-weight: 600;
    color: var(--text);
}

.btn-close {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    padding: 0;
    border: none;
    border-radius: 8px;
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
    transition: background 0.15s, color 0.15s;
}

.btn-close:hover {
    background: var(--accent-soft);
    color: var(--text);
}

.settings-section:last-child .toggle-row:last-child {
    padding-bottom: 2px;
}

.section-label {
    margin: 0 0 2px;
    font-size: 0.72rem;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--text-muted);
}

.settings-section + .settings-section {
    margin-top: 4px;
    padding-top: 8px;
    border-top: 1px solid var(--border);
}

.reset-row {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 0;
}

.btn-reset {
    padding: 4px 10px;
    font-size: 0.78rem;
    border: 1px solid var(--danger);
    border-radius: 6px;
    background: transparent;
    color: var(--danger);
    cursor: pointer;
    transition: background 0.15s, color 0.15s;
}

.btn-reset:hover {
    background: var(--danger-soft);
}

.btn-reset.confirm {
    border-color: var(--danger);
    background: var(--danger);
    color: var(--danger-text);
}

.btn-reset.confirm:hover {
    opacity: 0.85;
}

.btn-reset.cancel {
    border-color: var(--border-strong);
    color: var(--text-muted);
}

.btn-reset.cancel:hover {
    background: var(--surface-hover);
}

.reset-warn {
    font-size: 0.76rem;
    color: var(--danger);
}
</style>
