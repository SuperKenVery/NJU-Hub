/**
 * scripts/lms/lms_main.js
 *
 * 主入口：总开关检查、初始化路由（普通页 / Worker 页）、下载队列编排
 * 依赖：lms_core.js → lms_styles.js → lms_utils.js → lms_download.js → lms_worker.js
 */

(function () {
  "use strict";

  const {
    getConfig,
    loadConfig,
    injectStyles,
    updateThemeVariables,
    isWorkerPage,
    runtimeMessage,
    sleep,
    classifyFileResponse,
    triggerBlobDownload,
    renderDownloadBall,
    showDownloadModal,
    showDownloadProgress,
    updateDownloadProgress,
    showDownloadComplete,
    initWorker,
    waitFor,
    resolveCurrentActivityFile,
  } = window.__LMS__;

  // 1. 读取插件的总开关，如果关闭则不注入任何代码
  chrome.storage.local.get(["toggle-lms"], async (result) => {
    if (result["toggle-lms"] === false) return;

    console.log("[NJU-Hub] LMS Engine Starting...");

    // --- Worker 页面：隐藏的活动页，只负责解析预览地址 ---
    if (isWorkerPage) {
      initWorker();
      return;
    }

    // --- 普通页面初始化 ---
    // 单例运行检测，防止 iframe 中重复按钮
    if (window.self !== window.top) return;
    if (document.getElementById("lms-dl-ball-cont")) return;

    const { themeColor } = await loadConfig();
    injectStyles();
    updateThemeVariables(themeColor);

    renderDownloadBall(fetchResources);
    startMonitor();
    startAutoJump();

    // ==========================================
    // 下载队列编排
    // ==========================================

    async function tryLegacyDownload(file) {
      // The legacy blob endpoint can return a cached PDF unrelated to the
      // requested uploadId. Since it is still a valid PDF, the signature
      // check below cannot detect the mismatch. Resolve PDFs through the
      // activity preview, which is tied to the selected file instead.
      if (/\.pdf$/i.test(file.name)) {
        return { ok: false, reason: "PDF 使用预览授权链路下载" };
      }

      const url = `${file.legacyUrl}${file.legacyUrl.includes("?") ? "&" : "?"}preview=true`;
      try {
        const response = await fetch(url, {
          credentials: "same-origin",
          redirect: "follow",
          cache: "no-store",
          headers: { "X-Requested-With": "XMLHttpRequest" },
        });
        const finalUrl = response.url || "";
        if (/authserver|login/i.test(finalUrl))
          return { ok: false, reason: "重定向到了登录页" };
        if (!response.ok)
          return { ok: false, reason: `HTTP ${response.status}` };

        const result = await classifyFileResponse(response, file.name);
        if (!result.ok) return result;
        triggerBlobDownload(result.blob, file.name);
        return { ok: true, method: "legacy" };
      } catch (error) {
        return { ok: false, reason: error?.message || "旧接口请求失败" };
      }
    }

    async function startDownloadQueue(files, mask) {
      const selected = Array.from(mask.querySelectorAll("input:checked"))
        .map((cb) => files[Number(cb.id.split("-")[1])])
        .filter(Boolean);
      if (!selected.length) return;

      const courseId = location.pathname.match(/\/course\/(\d+)/)?.[1];
      if (!courseId) return;
      showDownloadProgress(mask, selected.length);

      const results = [];
      for (let index = 0; index < selected.length; index += 1) {
        const file = selected[index];
        updateDownloadProgress(mask, index, selected.length, file.name);
        const legacy = await tryLegacyDownload(file);
        if (legacy.ok) {
          results.push({ file, ok: true, method: "legacy" });
          updateDownloadProgress(mask, index + 1, selected.length, file.name);
          await sleep(500);
          continue;
        }

        let worker = null;
        try {
          if (!file.activityId) {
            results.push({
              file,
              ok: false,
              reason: legacy.reason || "缺少活动页面信息",
            });
            continue;
          }

          worker = await runtimeMessage({ action: "lmsOpenWorker", courseId });
          if (!worker.ok) {
            results.push({
              file,
              ok: false,
              reason: worker.error || "无法创建后台标签页",
            });
            continue;
          }

          const activityUrl = `https://lms.nju.edu.cn/course/${courseId}/learning-activity?njuhub_lms_worker=1#/${encodeURIComponent(file.activityId)}`;
          const preview = await runtimeMessage({
            action: "lmsWorkerResolve",
            tabId: worker.tabId,
            activityUrl,
            file: {
              name: file.name,
              uploadId: file.uploadId,
              referenceId: file.referenceId,
              activityId: file.activityId,
            },
          });
          if (!preview.ok || !preview.url) {
            results.push({
              file,
              ok: false,
              reason: preview.error || legacy.reason || "预览授权地址获取失败",
            });
            continue;
          }

          const download = await runtimeMessage({
            action: "lmsWorkerDownload",
            url: preview.url,
            filename: file.name,
          });
          results.push(
            download.ok
              ? { file, ok: true, method: "preview" }
              : { file, ok: false, reason: download.error || "浏览器下载失败" },
          );
        } finally {
          if (worker?.ok)
            await runtimeMessage({
              action: "lmsCloseWorker",
              tabId: worker.tabId,
            });
        }
        updateDownloadProgress(mask, index + 1, selected.length, file.name);
        await sleep(700);
      }

      showDownloadComplete(mask, results);
    }

    async function fetchResources() {
      const courseId = location.pathname.match(/\/course\/(\d+)/)?.[1];
      if (!courseId) return;
      const b = document.getElementById("ball-dl");
      b.innerText = "...";
      try {
        const res = await fetch(
          `/api/courses/${courseId}/activities?sub_course_id=0`,
          { headers: { "X-Requested-With": "XMLHttpRequest" } },
        );
        if (!res.ok) throw new Error(`活动列表请求失败 (${res.status})`);
        const data = await res.json();
        const files = [];
        data.activities?.forEach((act) =>
          act.uploads?.forEach((u) => {
            const uploadId = u.id ?? u.file_id ?? u.upload_id;
            if (uploadId == null || !u.name) return;
            files.push({
              name: u.name,
              uploadId,
              referenceId: u.reference_id,
              activityId: act.id ?? act.activity_id,
              legacyUrl: `/api/uploads/${uploadId}/blob`,
            });
          }),
        );
        if (!files.length) return;
        showDownloadModal(files, startDownloadQueue);
      } catch (e) {
        console.warn("[NJU-Hub] 获取 LMS 文件列表失败:", e);
      }
      b.innerHTML = window.__LMS__.DL_ICON;
    }

    function startMonitor() {
      setInterval(() => {
        const v = document.querySelector("video");
        if (v && getConfig().video.removeRestrictions) {
          v.controls = true;
          v.oncontextmenu = null;
        }
      }, 2000);
    }

    // 自动连播：视频播放结束后跳转到下一章节。
    // SPA 会重建 video 元素，因此用捕获式委托监听 ended（媒体事件不冒泡）。
    function startAutoJump() {
      console.log("[NJU-Hub] 自动连播已启用");
      document.addEventListener(
        "ended",
        async (event) => {
          console.log("[NJU-Hub] 自动连播：视频已结束", event, getConfig());
          const v = event.target;
          if (!(v instanceof HTMLVideoElement)) return;
          if (!getConfig().video.autoJump) return;

          // 1. 从 URL 提取课程 id 与章节 id：
          //   /course/9593/learning-activity#/37983
          //   /course/9593/learning-activity/full-screen#/38160
          const courseId = location.pathname.match(/\/course\/(\d+)/)?.[1];
          const activityId = location.hash.match(/^#\/(\d+)/)?.[1];
          if (!courseId || !activityId) {
            console.error("[NJU-Hub]  自动连播：匹配课程/章节失败")
            return;
          }

          try {
            // 2. 拉取章节列表，.activities[i].id 即所有章节 id
            const res = await fetch(
              `/api/courses/${courseId}/activities?sub_course_id=0`,
              {
                headers: { "X-Requested-With": "XMLHttpRequest" },
              },
            );
            if (!res.ok) return;
            const data = await res.json();
            const ids = (data.activities || [])
              .map((act) => String(act.id ?? act.activity_id))
              .filter(Boolean);

            // 3. 找到当前章节的下一个，直接改 URL（hash 路由，SPA 会自行响应）
            // 保留当前路径形态（含 full-screen），只替换 hash 中的章节 id
            const index = ids.indexOf(activityId);
            if (index === -1 || index + 1 >= ids.length) return;
            const nextId = ids[index + 1];
            console.log(`[NJU-Hub] 自动连播: 跳转下一章节 ${nextId}`);
            location.hash = `#/${nextId}`;
            autoPlayWhenReady();
          } catch (e) {
            console.warn("[NJU-Hub] 自动连播失败:", e);
          }
        },
        true,
      );

      // 章节切换后自动播放：SPA 重建 video 元素需要时间，
      // 轮询等待播放按钮出现后 click()——直接调 video.play() 不会触发
      // LMS 的观看进度追踪脚本，必须模拟真实点击。
      function autoPlayWhenReady() {
        const start = Date.now();
        const timer = setInterval(() => {
          const playBtn = document.querySelector('button.mvp-toggle-play');
          if (!playBtn) {
            if (Date.now() - start > 15000) {
              console.warn('[NJU-Hub] 自动连播: 未能匹配播放按钮，自动播放失败');
              clearInterval(timer);
            }
            return;
          }
          clearInterval(timer);
          playBtn.click();
        }, 300);
      }
    }
  });
})();
