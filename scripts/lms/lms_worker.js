/**
 * scripts/lms/lms_worker.js
 *
 * 后台 Worker 页面层：在 njuhub_lms_worker=1 的隐藏活动页中运行，
 * 负责监听预览地址消息、解析当前活动文件的 pdf-viewer 签名地址
 * 依赖：lms_utils.js
 * 导出：initWorker, waitFor, resolveCurrentActivityFile
 */

(function () {
    'use strict';

    const {
        sleep, extractPreviewFileUrl, collectPreviewUrls, getFreshPreviewUrl
    } = window.__LMS__;

    let previewUrlResolver = null;

    function initWorker() {
        window.addEventListener('message', (event) => {
            // Preview requests may originate in an LMS iframe. The URL is
            // still restricted to trusted LMS hosts by extractPreviewFileUrl.
            if (event.data?.source !== 'NJU-Hub' || event.data?.type !== 'lms-preview-url') return;
            const extracted = extractPreviewFileUrl(event.data.url);
            const capture = previewUrlResolver;
            if (!extracted || !capture || capture.before.has(extracted)) return;
            capture.resolve(extracted);
        });
        chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
            if (request.action !== 'lmsWorkerResolveCurrent') return false;
            resolveCurrentActivityFile(request.file || {})
                .then(sendResponse)
                .catch(error => sendResponse({ ok: false, error: error?.message || '预览解析失败' }));
            return true;
        });
    }

    async function waitFor(selector, timeout = 10000) {
        const start = Date.now();
        while (Date.now() - start < timeout) {
            const element = document.querySelector(selector);
            if (element) return element;
            await sleep(250);
        }
        throw new Error(`等待页面元素超时: ${selector}`);
    }

    async function resolveCurrentActivityFile(file) {
        const expectedName = String(file.name || '');
        const start = Date.now();
        let target = null;
        while (Date.now() - start < 12000) {
            const candidates = Array.from(document.querySelectorAll('.file-info .file-name'));
            target = candidates.find(element => (element.textContent || '').trim() === expectedName)
                || candidates.find(element => (element.getAttribute('original-title') || '').trim() === expectedName);
            if (target) break;
            await sleep(250);
        }
        if (!target) throw new Error(`当前活动页面找不到文件: ${expectedName}`);

        // A hidden/default preview can remain in the DOM. Record all
        // existing file URLs before clicking and accept only a URL created
        // by this selection, otherwise a stale file may be downloaded.
        const before = collectPreviewUrls();
        const bridgeUrl = await new Promise((resolve, reject) => {
            let settled = false;
            const capture = {
                before,
                resolve: (url) => {
                    if (settled) return;
                    settled = true;
                    if (previewUrlResolver === capture) previewUrlResolver = null;
                    resolve(url);
                }
            };
            previewUrlResolver = capture;

            const captureStart = Date.now();
            const run = async () => {
                try {
                    target.click();
                    await waitFor('.document-preview-view-mode', 10000);
                    const noteMode = document.querySelector('#note-mode');
                    if (!noteMode) throw new Error('找不到笔记模式按钮');
                    noteMode.click();

                    while (!settled && Date.now() - captureStart < 12000) {
                        const url = getFreshPreviewUrl(before);
                        if (url) {
                            capture.resolve(url);
                            return;
                        }
                        await sleep(250);
                    }
                    capture.resolve(null);
                } catch (error) {
                    if (settled) return;
                    settled = true;
                    if (previewUrlResolver === capture) previewUrlResolver = null;
                    reject(error);
                }
            };
            run();
        });
        if (bridgeUrl) return { ok: true, url: bridgeUrl };
        throw new Error(`未捕获到当前文件的新 pdf-viewer 签名地址: ${expectedName}`);
    }

    Object.assign(window.__LMS__, {
        initWorker,
        waitFor,
        resolveCurrentActivityFile
    });
})();
