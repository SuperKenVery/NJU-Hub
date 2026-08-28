/**
 * scripts/lms/lms_styles.js
 *
 * 样式层：注入全局 CSS、主题色 CSS 变量更新、滑块填充
 * 依赖：lms_core.js (Config)
 * 导出：injectStyles, updateThemeVariables, updateSliderFill
 */

(function () {
    'use strict';

    const { getConfig } = window.__LMS__;

    const updateThemeVariables = (themeColor) => {
        const root = document.documentElement;
        const hexToRgb = (hex) => {
            const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
            return result ? `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}` : '0, 123, 255';
        };
        const rgb = hexToRgb(themeColor);
        const Config = getConfig();

        root.style.setProperty('--lms-main', themeColor);
        root.style.setProperty('--lms-rgb', rgb);
        root.style.setProperty('--lms-panel-bg', `rgba(255, 255, 255, ${Config.appearance.opacity})`);
        root.style.setProperty('--lms-blur', `${Config.appearance.blur}px`);
        root.style.setProperty('--lms-radius', `${Config.appearance.radius}px`);
    };

    const updateSliderFill = (input) => {
        const val = (input.value - input.min) / (input.max - input.min) * 100;
        input.style.background = `linear-gradient(to right, var(--lms-main) ${val}%, #e5e5e5 ${val}%)`;
    };

    const injectStyles = () => {
        const css = `
            :root {
                --lms-main: #007bff;
                --lms-green: #28BD6E;
                --lms-shadow: 0 12px 40px rgba(0,0,0,0.12);
                --lms-radius: 14px;
                --lms-panel-bg: rgba(255, 255, 255, 0.85);
                --lms-blur: 10px;
                --lms-ease: cubic-bezier(0.25, 0.8, 0.25, 1);
                --lms-spring: cubic-bezier(0.175, 0.885, 0.32, 1.275);
                --lms-color-trans: background-color 0.4s ease, border-color 0.4s ease, color 0.4s ease, box-shadow 0.4s ease;
            }

            .lms-close { width: 28px; height: 28px; background: #f0f2f5; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: #666; font-size: 18px; cursor: pointer; transition: all 0.2s var(--lms-ease); line-height: 1; }
            .lms-close:hover { background: #e4e6e9; color: #333; transform: rotate(90deg); }

            .lms-ios-checkbox {
                position: absolute; left: 20px; top: 50%; transform: translateY(-50%);
                z-index: 2147483647; appearance: none; -webkit-appearance: none;
                width: 22px; height: 22px; border: 2px solid #ccc; border-radius: 6px;
                cursor: pointer; outline: none; transition: all 0.3s var(--lms-spring), var(--lms-color-trans);
                background: rgba(255,255,255,0.9); margin: 0; display: block !important;
            }
            .lms-ios-checkbox:checked { background: var(--lms-main); border-color: var(--lms-main); }
            .lms-ios-checkbox::after { content: ''; position: absolute; left: 6px; top: 2px; width: 5px; height: 10px; border: solid white; border-width: 0 2px 2px 0; transform: rotate(45deg) scale(0); transition: transform 0.2s var(--lms-ease); opacity: 0; }
            .lms-ios-checkbox:checked::after { transform: rotate(45deg) scale(1); opacity: 1; }

            .lms-ios-switch { appearance: none; -webkit-appearance: none; width: 50px; height: 30px; background: #e9e9ea; border-radius: 20px; position: relative; cursor: pointer; outline: none; transition: background 0.3s var(--lms-ease), var(--lms-color-trans); flex-shrink: 0; }
            .lms-ios-switch::after { content: ''; position: absolute; top: 2px; left: 2px; width: 26px; height: 26px; border-radius: 50%; background: white; box-shadow: 0 3px 8px rgba(0,0,0,0.15), 0 1px 1px rgba(0,0,0,0.06); transition: transform 0.3s var(--lms-spring); }
            .lms-ios-switch:checked { background: var(--lms-main); }
            .lms-ios-switch:checked::after { transform: translateX(20px); }

            .lms-ios-slider { -webkit-appearance: none; appearance: none; width: 140px; height: 6px; background: #e5e5e5; border-radius: 3px; outline: none; cursor: pointer; transition: background 0.3s ease; }
            .lms-ios-slider::-webkit-slider-thumb { -webkit-appearance: none; width: 22px; height: 22px; border-radius: 50%; background: white; box-shadow: 0 3px 8px rgba(0,0,0,0.2), 0 1px 3px rgba(0,0,0,0.1); transition: transform 0.1s; margin-top: -1px; }
            .lms-ios-slider::-webkit-slider-thumb:active { transform: scale(1.15); }

            .lms-scrollable::-webkit-scrollbar { width: 5px; height: 5px; }
            .lms-scrollable::-webkit-scrollbar-track { background: transparent; }
            .lms-scrollable::-webkit-scrollbar-thumb { background: #d1d1d1; border-radius: 3px; transition: background 0.4s; }
            .lms-scrollable::-webkit-scrollbar-thumb:hover { background: var(--lms-main); }

            .lms-ball-cont-fixed { position: fixed !important; z-index: 100000 !important; }
            .lms-circle-ball { width: 50px; height: 50px; border-radius: 50%; color: white; border: none; font-weight: bold; font-size: 14px; box-shadow: 0 8px 20px rgba(0,0,0,0.15); display: flex; align-items: center; justify-content: center; cursor: pointer; transition: transform 0.4s var(--lms-spring), box-shadow 0.4s var(--lms-ease), var(--lms-color-trans); user-select: none; }
            .lms-circle-ball:hover { transform: scale(1.15); box-shadow: 0 12px 30px rgba(0,0,0,0.25); }
            .lms-circle-ball:active { transform: scale(0.9); }

            #lms-cfg-cont { bottom: 30px; left: 30px; }
            #lms-dl-ball-cont { bottom: 30px; right: 30px; }
            .lms-ball-white { background: white; border: 1px solid rgba(0,0,0,0.1); color: #333; font-size: 22px; }
            .lms-ball-green { background: var(--lms-green); font-size: 20px; }
            .lms-ball-main { background: var(--lms-main); }

            .lms-mask { position: fixed; top:0; left:0; width:100%; height:100%; background: rgba(0,0,0,0.25); z-index: 200000; display: flex; align-items: center; justify-content: center; backdrop-filter: blur(var(--lms-blur)); -webkit-backdrop-filter: blur(var(--lms-blur)); animation: lmsFadeIn 0.3s var(--lms-ease) forwards; }
            .lms-mask.lms-closing { animation: lmsFadeOut 0.3s var(--lms-ease) forwards; pointer-events: none; }

            .lms-panel { background: var(--lms-panel-bg); backdrop-filter: blur(var(--lms-blur)); -webkit-backdrop-filter: blur(var(--lms-blur)); border-radius: var(--lms-radius); box-shadow: 0 20px 60px rgba(0,0,0,0.2); border: 1px solid rgba(255,255,255,0.6); width: 500px; height: 580px; display: flex; flex-direction: column; animation: lmsZoomIn 0.4s var(--lms-spring) forwards; }
            .lms-panel.lms-closing { animation: lmsZoomOut 0.25s var(--lms-ease) forwards; }

            @keyframes lmsFadeIn { from { opacity: 0; } to { opacity: 1; } }
            @keyframes lmsFadeOut { from { opacity: 1; } to { opacity: 0; } }
            @keyframes lmsZoomIn { from { opacity: 0; transform: scale(0.9); } to { opacity: 1; transform: scale(1); } }
            @keyframes lmsZoomOut { from { opacity: 1; transform: scale(1); } to { opacity: 0; transform: scale(0.95); } }

            .lms-header { padding: 18px 24px; border-bottom: 1px solid rgba(0,0,0,0.06); display: flex; justify-content: space-between; align-items: center; background: rgba(255,255,255,0.5); flex-shrink: 0; border-radius: var(--lms-radius) var(--lms-radius) 0 0; }
            .lms-header h3 { margin: 0; font-size: 18px; color: #333; font-weight: 700; letter-spacing: -0.5px; }

            .lms-tabs { display: flex; position: relative; background: rgba(0,0,0,0.02); border-bottom: 1px solid rgba(0,0,0,0.06); flex-shrink: 0; overflow: hidden; }
            .lms-tab {
                flex: 1; padding: 14px; text-align: center; cursor: pointer; font-weight: 600; color: #777; transition: color 0.4s var(--lms-ease), transform 0.3s var(--lms-spring); z-index: 1;
            }
            .lms-tab.active { color: var(--lms-main); font-weight: 800; transform: scale(1.05); }
            .lms-tab-line { position: absolute; bottom: 0; left: 0; height: 3px; width: 0; background: var(--lms-main); border-radius: 3px 3px 0 0; transition: left 0.4s var(--lms-spring), width 0.4s var(--lms-spring), background-color 0.4s ease; }

            /* 内容切换动画 */
            .lms-tab-content-anim { animation: lmsContentFadeSlide 0.35s var(--lms-ease) forwards; }
            @keyframes lmsContentFadeSlide { 0% { opacity: 0; transform: translateY(10px); } 100% { opacity: 1; transform: translateY(0); } }

            .lms-opt-row { display: flex; justify-content: space-between; align-items: center; padding: 18px 24px; border-bottom: 1px solid rgba(0,0,0,0.04); }
            .lms-opt-info { flex: 1; padding-right: 20px; }
            .lms-opt-title { font-size: 15px; font-weight: 600; color: #333; }
            .lms-opt-desc { font-size: 13px; color: #888; margin-top: 4px; line-height: 1.4; }

            .lms-footer { padding: 16px 24px; border-top: 1px solid rgba(0,0,0,0.06); display: flex; justify-content: space-between; align-items: center; background: rgba(0,0,0,0.02); margin-top: auto; flex-shrink: 0; border-radius: 0 0 var(--lms-radius) var(--lms-radius); }
            .lms-btn { padding: 0 20px; height: 36px; border-radius: 8px; border: 1px solid rgba(0,0,0,0.1); background: white; color: #555; cursor: pointer; font-weight: 600; font-size: 13px; transition: 0.2s; display: flex; align-items: center; justify-content: center; box-sizing: border-box; box-shadow: 0 1px 2px rgba(0,0,0,0.05); }
            .lms-btn:hover { background: #f9f9f9; transform: translateY(-1px); box-shadow: 0 4px 10px rgba(0,0,0,0.08); }
            .lms-btn-prime { background: var(--lms-main); color: white; border: none; transition: transform 0.2s, filter 0.2s, var(--lms-color-trans); }
            .lms-btn-prime:hover { background: var(--lms-main); filter: brightness(1.1); box-shadow: 0 4px 12px rgba(var(--lms-rgb), 0.3); }
            .lms-btn-danger { color: #ff4d4f; border-color: #ffccc7; }
            .lms-btn-danger:hover { background: #fff1f0; border-color: #ff4d4f; }

            .lms-progress-panel { height: auto; min-height: 280px; }
            .lms-progress-body { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 34px 36px 30px; text-align: center; }
            .lms-progress-icon { width: 54px; height: 54px; border: 4px solid rgba(var(--lms-rgb), 0.18); border-top-color: var(--lms-main); border-radius: 50%; animation: lmsProgressSpin 0.9s linear infinite; margin-bottom: 22px; }
            .lms-progress-icon.done { border-color: var(--lms-green); animation: none; position: relative; }
            .lms-progress-icon.done::after { content: '✓'; position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; color: var(--lms-green); font-size: 30px; font-weight: 800; }
            .lms-progress-title { font-size: 20px; color: #333; font-weight: 700; margin-bottom: 12px; }
            .lms-progress-subtitle { max-width: 360px; color: #888; font-size: 14px; line-height: 1.7; }
            .lms-progress-count { margin-top: 22px; color: var(--lms-main); font-size: 13px; font-weight: 700; }
            .lms-progress-current { max-width: 380px; margin-top: 8px; color: #666; font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
            .lms-complete-body { justify-content: flex-start; overflow-y: auto; }
            .lms-download-errors { width: 100%; max-width: 520px; margin-top: 20px; text-align: left; }
            .lms-download-error { padding: 11px 13px; margin-bottom: 8px; border-radius: 9px; background: rgba(255, 245, 245, 0.78); border: 1px solid rgba(255, 77, 79, 0.16); color: #555; font-size: 12px; line-height: 1.6; }
            .lms-download-error-name { color: #333; font-weight: 700; margin-bottom: 3px; overflow-wrap: anywhere; }
            .lms-download-error-solution { color: #777; margin-top: 3px; }
            .lms-download-error-technical { color: #999; margin-top: 4px; overflow-wrap: anywhere; }
            .lms-complete-footer { background: transparent !important; border-top: none !important; }
            @keyframes lmsProgressSpin { to { transform: rotate(360deg); } }


            /* 下载列表 */
            .lms-list-container { padding: 5px 0; overflow-y: auto; flex: 1; }
            .lms-dl-item {
                position: relative; display: flex; align-items: center;
                padding: 14px 24px; padding-left: 60px;
                border-bottom: 1px solid rgba(0,0,0,0.04); cursor: pointer;
                transition: background 0.25s var(--lms-ease); border-left: 4px solid transparent;
            }
            .lms-dl-item:hover { background: rgba(0,0,0,0.02); }
            .lms-dl-item.selected { box-shadow: inset 0 0 0 2000px rgba(var(--lms-rgb), 0.12) !important; border-left-color: var(--lms-main) !important; }
            .lms-dl-item.selected .lms-dl-name { font-weight: 600; color: var(--lms-main); }
            .lms-dl-item input[type="checkbox"] { display: none; }
            .lms-dl-item.no-cb { padding-left: 24px; }

            .lms-dl-name { font-size: 14px; color: #333; flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; line-height: 1.5; margin-left: 12px; }
            .lms-file-tag { font-size: 10px; font-weight: 800; color: white; padding: 3px 6px; border-radius: 6px; text-transform: uppercase; min-width: 36px; text-align: center; margin-left: 10px; box-shadow: 0 2px 5px rgba(0,0,0,0.1); flex-shrink: 0; }
            .tag-pdf { background: #ff4d4f; } .tag-doc { background: #40a9ff; } .tag-ppt { background: #fa8c16; } .tag-xls { background: #52c41a; } .tag-code { background: #722ed1; } .tag-file { background: #bfbfbf; }

            .color-dot { width: 26px; height: 26px; border-radius: 50%; cursor: pointer; border: 2px solid transparent; transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1); display: inline-block; margin-right: 8px; box-shadow: 0 2px 6px rgba(0,0,0,0.1); }
            .color-dot.selected { border-color: #333; transform: scale(1.2); }
            .lms-input-text { border: 1px solid #ddd; padding: 0 12px; border-radius: 8px; outline: none; font-size: 14px; width: 100%; height: 36px; box-sizing: border-box; background: rgba(255,255,255,0.8); transition: border 0.2s; }
            .lms-input-text:focus { border-color: var(--lms-main); background: white; }
        `;
        const style = document.createElement('style');
        style.textContent = css;
        document.head.appendChild(style);
    };

    Object.assign(window.__LMS__, {
        injectStyles,
        updateThemeVariables,
        updateSliderFill
    });
})();
