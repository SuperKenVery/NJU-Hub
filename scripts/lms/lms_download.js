/**
 * scripts/lms/lms_download.js
 *
 * 下载 UI 层：下载球渲染、文件列表弹窗、下载进度/完成弹窗
 * 依赖：lms_core.js (Config), lms_utils.js
 * 导出：renderDownloadBall, showDownloadModal, showDownloadProgress,
 *       updateDownloadProgress, showDownloadComplete, getFileTag
 */

(function () {
    'use strict';

    const {
        getConfig, gracefulClose, toggleScrollLock, escapeHtml, explainDownloadError
    } = window.__LMS__;

    const DL_ICON = '<svg width="24" height="24" viewBox="0 0 24 24" style="display:block"><path fill="currentColor" d="M5 20h14v-2H5v2zM19 9h-4V3H9v6H5l7 7 7-7z"/></svg>';

    function getFileTag(filename) {
        const ext = filename.split('.').pop().toLowerCase();
        let type = 'file';
        if (['pdf'].includes(ext)) type = 'pdf';
        else if (['doc', 'docx', 'wps'].includes(ext)) type = 'doc';
        else if (['ppt', 'pptx', 'dps'].includes(ext)) type = 'ppt';
        else if (['xls', 'xlsx', 'csv'].includes(ext)) type = 'xls';
        else if (['c', 'cpp', 'py', 'java', 'js', 'json'].includes(ext)) type = 'code';
        return `<span class="lms-file-tag tag-${type}">${ext.toUpperCase().substring(0,4)}</span>`;
    }

    function renderDownloadBall(onClick) {
        if (!location.pathname.includes('/course/')) return;
        const container = document.createElement('div');
        container.id = 'lms-dl-ball-cont';
        container.className = 'lms-ball-cont-fixed';
        container.innerHTML = `<div class="lms-circle-ball lms-ball-green" id="ball-dl">${DL_ICON}</div>`;
        container.onclick = onClick;
        document.body.appendChild(container);
    }

    function showDownloadModal(files, onConfirm) {
        const Config = getConfig();
        toggleScrollLock(true);
        const mask = document.createElement('div');
        mask.className = 'lms-mask';

        const checkboxHtml = (i) => Config.download.showCheckbox ?
            `<input type="checkbox" class="lms-ios-checkbox" id="f-${i}" ${Config.download.defaultSelectAll ? 'checked' : ''}>` :
            `<input type="checkbox" id="f-${i}" ${Config.download.defaultSelectAll ? 'checked' : ''} style="display:none">`;

        mask.innerHTML = `
            <div class="lms-panel">
                <div class="lms-header"><h3>课件下载 (${files.length})</h3><div class="lms-close" id="lms-dl-close">×</div></div>
                <div class="lms-list-container lms-scrollable">
                    ${files.map((f, i) => `
                        <div class="lms-dl-item ${Config.download.showCheckbox?'':'no-cb'}" data-idx="${i}">
                            ${checkboxHtml(i)}
                            ${getFileTag(f.name)}
                            <label class="lms-dl-name">${f.name}</label>
                        </div>
                    `).join('')}
                </div>
                <div class="lms-footer">
                    <div style="display:flex; gap:10px;">
                        <button class="lms-btn" id="lms-all">全选</button>
                        <button class="lms-btn" id="lms-inv">反选</button>
                    </div>
                    <button class="lms-btn lms-btn-prime" id="lms-do">下载所选</button>
                </div>
            </div>
        `;
        document.body.appendChild(mask);

        const updateRowStyle = () => {
            mask.querySelectorAll('.lms-dl-item').forEach(row => {
                const cb = row.querySelector('input');
                if (cb.checked) row.classList.add('selected');
                else row.classList.remove('selected');
            });
        };
        if(Config.download.defaultSelectAll) updateRowStyle();

        mask.querySelectorAll('.lms-dl-item').forEach(row => {
            row.onclick = (e) => {
                if (e.target.tagName !== 'INPUT') {
                    const cb = row.querySelector('input');
                    cb.checked = !cb.checked;
                }
                updateRowStyle();
            };
        });

        mask.querySelector('#lms-dl-close').onclick = () => gracefulClose(mask);
        mask.querySelector('#lms-all').onclick = () => {
            mask.querySelectorAll('input[type=checkbox]').forEach(c => c.checked = true);
            updateRowStyle();
        };
        mask.querySelector('#lms-inv').onclick = () => {
            mask.querySelectorAll('input[type=checkbox]').forEach(c => c.checked = !c.checked);
            updateRowStyle();
        };
        mask.querySelector('#lms-do').onclick = async () => {
            await onConfirm(files, mask);
        };
        mask.onclick = (e) => { if(e.target === mask) gracefulClose(mask); };
    }

    function showDownloadProgress(mask, total) {
        mask.classList.remove('lms-closing');
        mask.innerHTML = `
            <div class="lms-panel lms-progress-panel">
                <div class="lms-header"><h3>课件下载</h3></div>
                <div class="lms-progress-body">
                    <div class="lms-progress-icon" aria-hidden="true"></div>
                    <div class="lms-progress-title">正在下载中，这可能需要一些时间。</div>
                    <div class="lms-progress-subtitle">下载过程中可能会打开新标签页，是正常现象。请勿关闭新标签页。</div>
                    <div class="lms-progress-count" data-progress-count>准备下载 0 / ${total}</div>
                    <div class="lms-progress-current" data-progress-current></div>
                </div>
            </div>
        `;
        mask.onclick = () => {};
    }

    function updateDownloadProgress(mask, completed, total, currentName) {
        const count = mask.querySelector('[data-progress-count]');
        const current = mask.querySelector('[data-progress-current]');
        if (count) count.textContent = completed >= total ? `正在整理下载结果（${total} / ${total}）` : `已处理 ${completed} / ${total}`;
        if (current) current.textContent = completed >= total ? '' : `当前文件：${currentName || ''}`;
    }

    function showDownloadComplete(mask, results) {
        const successCount = results.filter(result => result.ok).length;
        const failed = results.filter(result => !result.ok);
        mask.classList.remove('lms-closing');
        mask.innerHTML = `
            <div class="lms-panel lms-progress-panel">
                <div class="lms-header"><h3>课件下载</h3><div class="lms-close" data-download-close>×</div></div>
                <div class="lms-progress-body lms-complete-body">
                    <div class="lms-progress-icon done" aria-hidden="true"></div>
                    <div class="lms-progress-title">下载完成</div>
                    <div class="lms-progress-subtitle">成功下载 ${successCount} 个文件${failed.length ? `，${failed.length} 个文件失败。` : '。'}</div>
                    ${failed.length ? `
                        <div class="lms-download-errors">
                            ${failed.map(item => {
                                const detail = explainDownloadError(item.reason);
                                return `<div class="lms-download-error">
                                    <div class="lms-download-error-name">${escapeHtml(item.file.name)}</div>
                                    <div>原因：${escapeHtml(detail.cause)}</div>
                                    <div class="lms-download-error-solution">解决方案：${escapeHtml(detail.solution)}</div>
                                    <div class="lms-download-error-technical">技术信息：${escapeHtml(detail.technical)}</div>
                                </div>`;
                            }).join('')}
                        </div>
                    ` : ''}
                    <div class="lms-footer lms-complete-footer" style="width:100%; box-sizing:border-box; margin-top:28px;">
                        <span style="color:#888;font-size:12px;">可以安全关闭此窗口</span>
                        <button class="lms-btn lms-btn-prime" data-download-close>关闭</button>
                    </div>
                </div>
            </div>
        `;
        mask.querySelectorAll('[data-download-close]').forEach(element => {
            element.onclick = () => gracefulClose(mask);
        });
        mask.onclick = (event) => { if (event.target === mask) gracefulClose(mask); };
    }

    Object.assign(window.__LMS__, {
        DL_ICON,
        getFileTag,
        renderDownloadBall,
        showDownloadModal,
        showDownloadProgress,
        updateDownloadProgress,
        showDownloadComplete
    });
})();
