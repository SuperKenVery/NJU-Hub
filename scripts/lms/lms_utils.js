/**
 * scripts/lms/lms_utils.js
 *
 * 工具层：DOM 动画辅助、消息封装、文件名/HTML 处理、
 *         下载错误解释、响应分类、预览地址提取与捕获
 * 依赖：无（仅浏览器原生 API）
 * 导出：gracefulClose, toggleScrollLock, runtimeMessage, sleep,
 *       sanitizeFilename, escapeHtml, explainDownloadError,
 *       classifyFileResponse, triggerBlobDownload,
 *       collectPreviewUrls, getFreshPreviewUrl, isWorkerPage
 */

(function () {
    'use strict';

    const gracefulClose = (maskElement) => {
        if (!maskElement) return;
        maskElement.classList.add('lms-closing');
        const panel = maskElement.querySelector('.lms-panel');
        if(panel) panel.classList.add('lms-closing');
        document.body.style.overflow = '';
        setTimeout(() => { maskElement.remove(); }, 280);
    };

    const toggleScrollLock = (isLocked) => {
        document.body.style.overflow = isLocked ? 'hidden' : '';
    };

    const isWorkerPage = new URLSearchParams(location.search).get('njuhub_lms_worker') === '1';

    function runtimeMessage(message) {
        return new Promise((resolve) => {
            chrome.runtime.sendMessage(message, (response) => {
                if (chrome.runtime.lastError) {
                    resolve({ ok: false, error: chrome.runtime.lastError.message });
                    return;
                }
                resolve(response || { ok: false, error: '插件后台没有返回结果' });
            });
        });
    }

    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    function sanitizeFilename(filename) {
        return String(filename || 'download')
            .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_')
            .trim() || 'download';
    }

    function escapeHtml(value) {
        return String(value ?? '').replace(/[&<>"']/g, char => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        }[char]));
    }

    function explainDownloadError(reason) {
        const raw = String(reason || '未知错误');
        if (/A listener indicated an asynchronous response|message channel closed/i.test(raw)) {
            return {
                cause: '后台页面通信通道在页面刷新、关闭或扩展重新加载时中断。',
                solution: '请不要关闭下载过程中出现的标签页，刷新 LMS 页面并重新点击下载。',
                technical: raw
            };
        }
        if (/Receiving end does not exist|Could not establish connection/i.test(raw)) {
            return {
                cause: '后台下载页面尚未加载完成，插件暂时找不到接收指令的页面。',
                solution: '请等待 LMS 页面完全加载后重试；如果持续出现，请重新加载扩展。',
                technical: raw
            };
        }
        if (/未捕获到 pdf-viewer|签名地址/i.test(raw)) {
            return {
                cause: '预览页面已打开，但没有捕获到 LMS 生成的临时下载地址。',
                solution: '请确认该文件可以手动预览；若可以，请刷新扩展后重试。',
                technical: raw
            };
        }
        if (/服务器拒绝了直接下载|权限不足|无权访问|HTTP 401|HTTP 403/i.test(raw)) {
            return {
                cause: '文件列表可以访问，但当前课程不允许直接下载文件内容。',
                solution: '插件已尝试使用预览授权链路；请确认你能在 LMS 中打开该文件预览。',
                technical: raw
            };
        }
        if (/活动页面加载超时|等待页面元素超时/i.test(raw)) {
            return {
                cause: '对应课件页面在规定时间内没有加载出文件内容。',
                solution: '请检查 LMS 网络连接，等待课程页面完全加载后重试。',
                technical: raw
            };
        }
        return {
            cause: raw,
            solution: '请刷新 LMS 页面和扩展后重试；如果仍失败，请保留此错误信息。',
            technical: raw
        };
    }

    function isLikelyErrorText(text) {
        return /权限不足|无法下载|无权访问|没有权限|未登录|登录后访问|access denied|forbidden|permission denied/i.test(text || '');
    }

    async function classifyFileResponse(response, expectedName) {
        const contentType = (response.headers.get('content-type') || '').toLowerCase();
        const blob = await response.blob();
        if (!blob.size) return { ok: false, reason: '响应为空' };

        const headerBytes = new Uint8Array(await blob.slice(0, 16).arrayBuffer());
        const headerText = new TextDecoder().decode(headerBytes);
        const textual = contentType.startsWith('text/') || contentType.includes('json') || contentType.includes('javascript');
        const textualPreview = textual ? await blob.slice(0, 1200).text().catch(() => '') : '';
        const looksHtml = contentType.includes('text/html') || /^\s*<(?:!doctype|html|head|body)/i.test(headerText) || /^\s*<(?:!doctype|html|head|body)/i.test(textualPreview);
        const looksJson = contentType.includes('json') || /^\s*[\[{]/.test(headerText) || /^\s*[\[{]/.test(textualPreview);
        if (looksHtml || looksJson) {
            const preview = textualPreview || await blob.slice(0, 1200).text().catch(() => '');
            return { ok: false, reason: isLikelyErrorText(preview) ? '服务器拒绝了直接下载' : '响应不是文件', blob };
        }
        if (isLikelyErrorText(headerText) || isLikelyErrorText(textualPreview)) return { ok: false, reason: '服务器拒绝了直接下载', blob };

        const ext = String(expectedName || '').split('.').pop().toLowerCase();
        const signatures = {
            pdf: headerText.startsWith('%PDF-'),
            png: headerBytes[0] === 0x89 && headerBytes[1] === 0x50 && headerBytes[2] === 0x4e && headerBytes[3] === 0x47,
            jpg: headerBytes[0] === 0xff && headerBytes[1] === 0xd8,
            jpeg: headerBytes[0] === 0xff && headerBytes[1] === 0xd8,
            zip: headerBytes[0] === 0x50 && headerBytes[1] === 0x4b
        };
        if (signatures[ext] === false) return { ok: false, reason: '文件内容与扩展名不匹配', blob };
        return { ok: true, blob };
    }

    function triggerBlobDownload(blob, filename) {
        const objectUrl = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = objectUrl;
        anchor.download = sanitizeFilename(filename);
        anchor.style.display = 'none';
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        setTimeout(() => URL.revokeObjectURL(objectUrl), 1500);
    }

    function extractPreviewFileUrl(viewerUrl) {
        let outer;
        try { outer = new URL(viewerUrl, location.href); } catch (_) { return null; }
        const raw = outer.searchParams.get('file');
        if (!raw) return null;

        let candidate = raw;
        for (let i = 0; i < 2; i += 1) {
            try {
                const decoded = decodeURIComponent(candidate);
                if (decoded === candidate) break;
                candidate = decoded;
            } catch (_) { break; }
        }

        let media;
        try { media = new URL(candidate, location.href); } catch (_) { return null; }
        if (media.protocol !== 'https:' || !['lms.nju.edu.cn', 'lms-media.nju.edu.cn'].includes(media.hostname)) return null;
        return media.href;
    }

    function getPreviewUrlsFromPerformance() {
        const urls = new Set();
        const entries = performance.getEntriesByType('resource').map(entry => entry.name);
        for (const url of entries) {
            if (!/pdf-viewer|note-bene/i.test(url)) continue;
            const extracted = extractPreviewFileUrl(url);
            if (extracted) urls.add(extracted);
        }
        return urls;
    }

    function getPreviewUrlsFromDom() {
        const urls = new Set();
        const elements = document.querySelectorAll('iframe[src], embed[src], object[data], a[href], [data-url]');
        for (const element of elements) {
            const raw = element.getAttribute('src') || element.getAttribute('data') || element.getAttribute('href') || element.getAttribute('data-url');
            if (!raw || !/pdf-viewer|note-bene/i.test(raw)) continue;
            const extracted = extractPreviewFileUrl(raw);
            if (extracted) urls.add(extracted);
        }
        return urls;
    }

    function collectPreviewUrls() {
        return new Set([
            ...getPreviewUrlsFromPerformance(),
            ...getPreviewUrlsFromDom()
        ]);
    }

    function getFreshPreviewUrl(before) {
        const current = collectPreviewUrls();
        for (const url of current) {
            if (!before.has(url)) return url;
        }
        return null;
    }

    Object.assign(window.__LMS__, {
        gracefulClose,
        toggleScrollLock,
        isWorkerPage,
        runtimeMessage,
        sleep,
        sanitizeFilename,
        escapeHtml,
        explainDownloadError,
        classifyFileResponse,
        triggerBlobDownload,
        extractPreviewFileUrl,
        collectPreviewUrls,
        getFreshPreviewUrl
    });
})();
