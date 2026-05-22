<script setup>
defineProps({
    label: {type: String, required: true},
    hint: {type: String, default: ''},
    modelValue: {type: Boolean, required: true},
});
defineEmits(['update:modelValue']);
</script>

<template>
    <label class="toggle-row">
        <span class="toggle-text">
            <span class="toggle-label">{{ label }}</span>
            <span v-if="hint" class="toggle-hint">{{ hint }}</span>
        </span>
        <span class="switch">
            <input
                type="checkbox"
                class="switch-input"
                :checked="modelValue"
                @change="$emit('update:modelValue', $event.target.checked)"
            />
            <span class="switch-track" aria-hidden="true">
                <span class="switch-thumb" />
            </span>
        </span>
    </label>
</template>

<style scoped>
.toggle-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 14px;
    padding: 11px 0;
    cursor: pointer;
    user-select: none;
}

.toggle-text {
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
}

.toggle-label {
    font-size: 0.88rem;
    font-weight: 500;
    color: var(--text);
}

.toggle-hint {
    font-size: 0.74rem;
    color: var(--text-muted);
    line-height: 1.35;
}

.switch {
    position: relative;
    flex-shrink: 0;
    width: 44px;
    height: 26px;
}

.switch-input {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    margin: 0;
    opacity: 0;
    cursor: pointer;
    z-index: 1;
}

.switch-track {
    display: block;
    width: 100%;
    height: 100%;
    border-radius: 999px;
    background: var(--toggle-off);
    transition: background 0.2s ease, box-shadow 0.2s ease;
}

.switch-thumb {
    position: absolute;
    top: 3px;
    left: 3px;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: #fff;
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.22);
    transition: transform 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.switch-input:checked + .switch-track {
    background: var(--toggle-on);
}

.switch-input:checked + .switch-track .switch-thumb {
    transform: translateX(18px);
}

.switch-input:focus-visible + .switch-track {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
}
</style>
