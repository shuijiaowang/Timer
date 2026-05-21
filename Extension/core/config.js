// core/config.js
import {storage} from '#imports';

export const APP_CONFIG = {
    // 快捷键配置
    KEYBOARD: {},
    // UI配置
    UI: {}
};
// ... (保留 DEFAULT_DOMAIN_CONFIG) ...
export const DEFAULT_DOMAIN_CONFIG = {
    pluginEnabled: false,
};
function getHostnameForStorage() {
    // Service Worker / background 无 window；content 脚本用当前站点 hostname
    if (typeof globalThis !== 'undefined' && globalThis.location?.hostname) {
        return globalThis.location.hostname;
    }
    return 'extension';
}

let _domainConfigStorage;
function getDomainConfigStorage() {
    if (!_domainConfigStorage) {
        _domainConfigStorage = storage.defineItem(`local:${getHostnameForStorage()}`, {
            fallback: DEFAULT_DOMAIN_CONFIG,
        });
    }
    return _domainConfigStorage;
}

export const appState = {
    //--------该网站独有的存储属性（按 hostname 分桶，background 用 extension）-------
    get domainConfigStorage() {
        return getDomainConfigStorage();
    },
    domainConfig: {
        isPluginEnabled: false, //是否启用插件
    },
    saveDomainConfig:async () => {
        await appState.domainConfigStorage.setValue(appState.domainConfig)
    }
};
