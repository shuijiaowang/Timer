import {TaskType} from './types.js';

/**
 * 内置模板（只读元数据）；创建时生成对应类型的 preset
 * @type {Record<string, { id: string, title: string, description: string, type: import('./types.js').TaskType, build: () => object }>}
 */
export const BUILTIN_TEMPLATES = {
    pomodoro: {
        id: 'pomodoro',
        title: '番茄闹钟',
        description: '工作 45 分钟，休息 15 分钟，可循环',
        type: TaskType.QUEUE,
        build: () => ({
            title: '番茄闹钟',
            steps: [
                {title: '工作', durationMs: 45 * 60 * 1000},
                {title: '休息', durationMs: 15 * 60 * 1000},
            ],
            repeat: true,
        }),
    },
    water_hourly: {
        id: 'water_hourly',
        title: '喝水提醒',
        description: '每一小时提醒一次',
        type: TaskType.LOOP,
        build: () => ({
            title: '喝水提醒',
            durationMs: 60 * 60 * 1000,
        }),
    },
    qq_farm: {
        id: 'qq_farm',
        title: 'QQ 农场收菜',
        description: '基础 8 小时成熟；可配增益缩短',
        type: TaskType.COUNTDOWN,
        build: () => ({
            title: 'QQ 农场收菜',
            durationMs: 8 * 60 * 60 * 1000,
            meta: {baseHours: 8, speedBonus: 0},
        }),
    },
};

/** @returns {{ id: string, title: string, description: string, type: string }[]} */
export function listBuiltinTemplates() {
    return Object.values(BUILTIN_TEMPLATES).map(({id, title, description, type}) => ({
        id,
        title,
        description,
        type,
    }));
}

/**
 * @param {string} templateId
 * @param {object} [overrides] 如 qq_farm: { durationMs, meta: { speedBonus } }
 */
export function getTemplateBuildPayload(templateId, overrides = {}) {
    const tpl = BUILTIN_TEMPLATES[templateId];
    if (!tpl) {
        throw new Error(`未知模板: ${templateId}`);
    }
    return {...tpl.build(), ...overrides, sourceTemplateId: templateId};
}

/** QQ 农场：基础时长（小时）与增益 0 / 0.1 / 0.2 / 自定义 */
export function qqFarmDurationMs(baseHours = 8, speedBonus = 0) {
    const hours = baseHours * (1 - Math.min(Math.max(speedBonus, 0), 0.9));
    return Math.round(hours * 60 * 60 * 1000);
}
