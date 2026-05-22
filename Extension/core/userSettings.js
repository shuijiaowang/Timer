import {storage} from '#imports';

/**
 * @typedef {object} UserSettings
 * @property {{ sound: boolean, manualClose: boolean }} notification
 * @property {{ darkMode: boolean }} appearance
 */

export const DEFAULT_USER_SETTINGS = {
    notification: {
        sound: true,
        manualClose: false,
    },
    appearance: {
        darkMode: true,
    },
};

const settingsStorage = storage.defineItem('local:timer_user_settings', {
    fallback: DEFAULT_USER_SETTINGS,
});

/** @returns {Promise<UserSettings>} */
export async function getUserSettings() {
    const raw = await settingsStorage.getValue();
    return mergeUserSettings(raw);
}

/** @param {Partial<UserSettings>} patch */
export async function saveUserSettings(patch) {
    const current = await getUserSettings();
    const next = mergeUserSettings({...current, ...patch});
    await settingsStorage.setValue(next);
    return next;
}

/** @param {unknown} raw */
export function mergeUserSettings(raw) {
    const base = structuredClone(DEFAULT_USER_SETTINGS);
    if (!raw || typeof raw !== 'object') return base;
    const src = /** @type {Partial<UserSettings>} */ (raw);
    return {
        notification: {
            ...base.notification,
            ...(src.notification ?? {}),
        },
        appearance: {
            ...base.appearance,
            ...(src.appearance ?? {}),
        },
    };
}

/** @param {UserSettings} settings */
export function reminderModeFromSettings(settings) {
    return settings.notification.manualClose ? 'blocking' : 'quick';
}

export async function resetUserSettings() {
    await settingsStorage.setValue(structuredClone(DEFAULT_USER_SETTINGS));
    return structuredClone(DEFAULT_USER_SETTINGS);
}
