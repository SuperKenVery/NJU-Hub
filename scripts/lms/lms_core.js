/**
 * scripts/lms/lms_core.js
 *
 * 共享命名空间与配置层：window.__LMS__ 挂载点、DEFAULT_CONFIG、loadConfig
 * 依赖：chrome.storage.local
 * 导出：window.__LMS__ = { Config, loadConfig, ... }
 */

(function () {
    'use strict';

    // 全局命名空间：所有 lms/* 模块共享的状态与工具都挂在这里，
    // 加载顺序见 manifest.json（core → styles → utils → download → worker → main）
    window.__LMS__ = {};

    const DEFAULT_CONFIG = {
        video: { autoJump: false, removeRestrictions: true },
        download: { defaultSelectAll: false, showCheckbox: true },
        appearance: { opacity: 0.85, blur: 10, radius: 14 }
    };

    let Config = JSON.parse(JSON.stringify(DEFAULT_CONFIG));

    const loadConfig = async () => {
        const data = await chrome.storage.local.get([
            'ui_theme_color',
            'lms_video_autojump', 'lms_video_remove_restrict',
            'lms_dl_default_all', 'lms_dl_show_checkbox'
        ]);

        if (typeof data.lms_video_autojump === 'boolean') Config.video.autoJump = data.lms_video_autojump;
        if (typeof data.lms_video_remove_restrict === 'boolean') Config.video.removeRestrictions = data.lms_video_remove_restrict;
        if (typeof data.lms_dl_default_all === 'boolean') Config.download.defaultSelectAll = data.lms_dl_default_all;
        if (typeof data.lms_dl_show_checkbox === 'boolean') Config.download.showCheckbox = data.lms_dl_show_checkbox;

        const themeColor = typeof data.ui_theme_color === 'string' && data.ui_theme_color.trim() ? data.ui_theme_color.trim() : '#0ea5e9';
        return { themeColor };
    };

    Object.assign(window.__LMS__, {
        DEFAULT_CONFIG,
        getConfig: () => Config,
        loadConfig
    });
})();
