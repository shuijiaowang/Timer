import {appState} from "./config.js";

/**
 * 统一的系统通知（browser.notifications.create）
 * @param {object} content 展示内容
 * @param {string} [content.title] 标题
 * @param {string} [content.message] 正文
 * @param {string} [content.iconUrl] 图标；不传则暂用外链占位（可改为 browser.runtime.getURL('/wxt.svg')）
 * @param {object} [notifyConfig] 通知行为，后续可与任务 config / 全局设置合并
 * @param {string} [notifyConfig.type='basic'] basic | image | list | progress 等
 * @param {boolean} [notifyConfig.requireInteraction=true] 是否常驻到用户手动关闭
 * @param {boolean} [notifyConfig.silent=false] 是否静音
 * @param {number} [notifyConfig.priority=0] 优先级
 */
export function showReminderNotification(content = {}, notifyConfig = {}) {
    const {
        title,
        message = '',
        iconUrl = 'https://picsum.photos/64',
        // iconUrl = browser.runtime.getURL('/wxt.svg'),
    } = content;
    const {
        type = 'basic',
        requireInteraction = true,
        silent = true,
        priority = 0,
    } = notifyConfig;
    // manifest 需含 notifications 权限
    browser.notifications.create({
        type,
        title,
        message,
        iconUrl,
        requireInteraction,
        silent,
        priority,
    });
}
