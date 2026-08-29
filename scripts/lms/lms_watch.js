/**
 * scripts/lms/lms_watch.js
 *
 * 看课（刷观看进度）层：章节列表弹窗、并行提交各章节观看进度
 * 依赖：lms_core.js, lms_utils.js (sleep, gracefulClose, toggleScrollLock, escapeHtml)
 * 导出：renderWatchBall, startWatchFlow
 *
 * 服务端限速规则：单个章节的进度提交有频率限制（约等于 1 倍速观看），
 * 但不同章节之间互不影响。因此同一章节内按 2 倍速间隔提交
 * （片段 124s → 间隔 62s），所有章节并行执行。
 */

(function () {
  "use strict";

  const { sleep, gracefulClose, toggleScrollLock, escapeHtml } = window.__LMS__;

  const WATCH_ICON =
    '<svg width="24" height="24" viewBox="0 0 24 24" style="display:block"><path fill="currentColor" d="M8 5v14l11-7z"/></svg>';

  // 单次提交的进度片段长度（服务端上限 125s，留 1s 余量）
  const CHUNK_SECONDS = 124;
  // 官方允许 2 倍速，同一章节的提交间隔 = 片段时长 / 2
  const SPEED_FACTOR = 2;

  const WATCH_STATE = { running: false, stop: false };

  function formatDuration(sec) {
    sec = Math.max(0, Math.round(sec));
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    const pad = (n) => String(n).padStart(2, "0");
    return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
  }

  async function logActivityRead(activityId, progress) {
    const response = await fetch(
      `/api/course/activities-read/${encodeURIComponent(activityId)}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Requested-With": "XMLHttpRequest",
        },
        credentials: "same-origin",
        body: JSON.stringify(progress),
      },
    );
    const body = await response.text();
    if (!response.ok)
      throw new Error(`HTTP ${response.status}: ${body.slice(0, 200)}`);
    return body;
  }

  // 章节时长在 activities[i].uploads[0].videos[0].duration，
  // uploads 只有一个元素；videos 是不同清晰度，duration 一致，取第一个即可
  function extractDuration(act) {
      const video = act.uploads?.[0]?.videos?.[0];
      const n = Number(video?.duration);
      // 取整：避免小数 duration 导致循环比较永远差一点出不去
      return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  }

  // 拉取观看记录，返回已完成（completeness === "full"）的 activity_id 集合
  async function fetchCompletedIds(courseId) {
    const res = await fetch(
      `/api/course/${courseId}/activity-reads-for-user`,
      {
        headers: { "X-Requested-With": "XMLHttpRequest" },
      },
    );
    if (!res.ok) throw new Error(`观看记录请求失败 (${res.status})`);
    const data = await res.json();
    const done = new Set();
    (data.activity_reads || []).forEach((r) => {
      if (r.completeness === "full") done.add(r.activity_id);
    });
    return done;
  }

  async function fetchChapters(courseId) {
    const res = await fetch(
      `/api/courses/${courseId}/activities?sub_course_id=0`,
      {
        headers: { "X-Requested-With": "XMLHttpRequest" },
      },
    );
    if (!res.ok) throw new Error(`章节列表请求失败 (${res.status})`);
    const data = await res.json();
    const completed = await fetchCompletedIds(courseId);
    const chapters = [];
    let skipped = 0;
    let completedCount = 0;
    (data.activities || []).forEach((act) => {
      const id = act.id ?? act.activity_id;
      if (id == null) return;
      if (completed.has(id)) {
        completedCount += 1;
        return;
      }
      const duration = extractDuration(act);
      if (!duration) {
        skipped += 1;
        return;
      }
      chapters.push({
        id,
        name: act.name || act.title || `章节 ${id}`,
        duration,
      });
    });
    return { chapters, skipped, completedCount };
  }

  function renderWatchBall(onClick) {
    if (!location.pathname.includes("/course/")) return;
    if (document.getElementById("lms-watch-ball-cont")) return;
    const container = document.createElement("div");
    container.id = "lms-watch-ball-cont";
    container.className = "lms-ball-cont-fixed";
    container.innerHTML = `<div class="lms-circle-ball lms-ball-main" id="ball-watch">${WATCH_ICON}</div>`;
    container.onclick = onClick;
    document.body.appendChild(container);
  }

  function showWatchModal(chapters, skipped, completedCount, onStart) {
    toggleScrollLock(true);
    const mask = document.createElement("div");
    mask.className = "lms-mask";

    mask.innerHTML = `
            <div class="lms-panel">
                <div class="lms-header"><h3>看课 (${chapters.length}${completedCount ? `，已完成 ${completedCount} 已隐藏` : ""})</h3><div class="lms-close" id="lms-watch-close">×</div></div>
                <div class="lms-list-container lms-scrollable">
                    ${chapters
                      .map(
                        (c, i) => `
                        <div class="lms-dl-item" data-idx="${i}">
                            <input type="checkbox" class="lms-ios-checkbox" id="w-${i}" checked>
                            <label class="lms-dl-name">${escapeHtml(c.name)}</label>
                            <span class="lms-watch-duration">${formatDuration(c.duration)}</span>
                        </div>
                    `,
                      )
                      .join("")}
                </div>
                <div class="lms-footer">
                    <div style="display:flex; gap:10px;">
                        <button class="lms-btn" id="lms-watch-all">全选</button>
                        <button class="lms-btn" id="lms-watch-inv">反选</button>
                    </div>
                    <button class="lms-btn lms-btn-prime" id="lms-watch-do">开始看课</button>
                </div>
            </div>
        `;
    document.body.appendChild(mask);
    if (skipped) {
      console.warn(`[NJU-Hub] 看课：${skipped} 个章节未识别到时长，已跳过`);
    }

    const updateRowStyle = () => {
      mask.querySelectorAll(".lms-dl-item").forEach((row) => {
        row.classList.toggle("selected", row.querySelector("input").checked);
      });
    };
    updateRowStyle();

    mask.querySelectorAll(".lms-dl-item").forEach((row) => {
      row.onclick = (e) => {
        if (e.target.tagName !== "INPUT") {
          const cb = row.querySelector("input");
          cb.checked = !cb.checked;
        }
        updateRowStyle();
      };
    });

    mask.querySelector("#lms-watch-close").onclick = () => gracefulClose(mask);
    mask.querySelector("#lms-watch-all").onclick = () => {
      mask.querySelectorAll("input[type=checkbox]").forEach((c) => {
        c.checked = true;
      });
      updateRowStyle();
    };
    mask.querySelector("#lms-watch-inv").onclick = () => {
      mask.querySelectorAll("input[type=checkbox]").forEach((c) => {
        c.checked = !c.checked;
      });
      updateRowStyle();
    };
    mask.querySelector("#lms-watch-do").onclick = () => {
      const selected = Array.from(mask.querySelectorAll("input:checked"))
        .map((cb) => chapters[Number(cb.id.split("-")[1])])
        .filter(Boolean);
      if (!selected.length) return;
      onStart(mask, selected);
    };
    mask.onclick = (e) => {
      if (e.target === mask) gracefulClose(mask);
    };
  }

  function showWatchProgress(mask, chapters) {
    mask.classList.remove("lms-closing");
    mask.innerHTML = `
            <div class="lms-panel">
                <div class="lms-header"><h3>看课进行中</h3><div class="lms-close" id="lms-watch-close">×</div></div>
                <div class="lms-list-container lms-scrollable">
                    ${chapters
                      .map(
                        (c) => `
                        <div class="lms-watch-row" data-id="${escapeHtml(String(c.id))}">
                            <span class="lms-watch-name">${escapeHtml(c.name)}</span>
                            <span class="lms-watch-status">0:00 / ${formatDuration(c.duration)}</span>
                        </div>
                    `,
                      )
                      .join("")}
                </div>
                <div class="lms-footer">
                    <span style="color:#888;font-size:12px;">按 2 倍速提交，可随时停止</span>
                    <button class="lms-btn lms-btn-danger" id="lms-watch-stop">停止</button>
                </div>
            </div>
        `;
    mask.querySelector("#lms-watch-close").onclick = () => {
      WATCH_STATE.stop = true;
      gracefulClose(mask);
    };
    mask.querySelector("#lms-watch-stop").onclick = () => {
      WATCH_STATE.stop = true;
    };
    mask.onclick = () => {};

    const rows = new Map();
    mask.querySelectorAll(".lms-watch-row").forEach((row) => {
      rows.set(row.dataset.id, row);
    });
    return rows;
  }

  function showWatchComplete(mask, summary) {
    mask.classList.remove("lms-closing");
    mask.innerHTML = `
            <div class="lms-panel lms-progress-panel">
                <div class="lms-header"><h3>看课结束</h3><div class="lms-close" data-watch-close>×</div></div>
                <div class="lms-progress-body lms-complete-body">
                    <div class="lms-progress-icon ${summary.failed || summary.stopped ? "" : "done"}" aria-hidden="true"></div>
                    <div class="lms-progress-title">${summary.stopped ? "已停止" : "看课完成"}</div>
                    <div class="lms-progress-subtitle">
                        成功 ${summary.done} 个章节${summary.failed ? `，失败 ${summary.failed} 个` : ""}${summary.stopped ? `，停止 ${summary.stopped} 个` : ""}。
                    </div>
                    <div class="lms-footer lms-complete-footer" style="width:100%; box-sizing:border-box; margin-top:28px;">
                        <span style="color:#888;font-size:12px;">可以安全关闭此窗口</span>
                        <button class="lms-btn lms-btn-prime" data-watch-close>关闭</button>
                    </div>
                </div>
            </div>
        `;
    mask.querySelectorAll("[data-watch-close]").forEach((el) => {
      el.onclick = () => gracefulClose(mask);
    });
    mask.onclick = (e) => {
      if (e.target === mask) gracefulClose(mask);
    };
  }

  // 单个章节：顺序提交 [0, duration] 的片段，片段间隔 = 片段时长 / 2（2 倍速）
  async function watchChapter(chapter, rows) {
    const row = rows.get(String(chapter.id));
    const statusEl = row && row.querySelector(".lms-watch-status");
    const setProgress = (t) => {
      if (row) row.style.setProperty("--watch-progress", `${Math.min(100, (t / chapter.duration) * 100)}%`);
    };
    const setStatus = (text, cls) => {
      if (!statusEl) return;
      statusEl.textContent = text;
      if (cls) {
        row.classList.remove("done", "failed");
        row.classList.add(cls);
      }
    };

    try {
      let t = 0;
      while (t < chapter.duration) {
        if (WATCH_STATE.stop) {
          setStatus("已停止", "failed");
          return "stopped";
        }
        const end = Math.min(t + CHUNK_SECONDS, chapter.duration);
        const chunkLength = end - t;
        // 看完这段才上报：非首段先按本段观看时长（/2 倍速）等待，再提交
        if (t > 0) {
          await sleep((chunkLength / SPEED_FACTOR) * 1000);
          if (WATCH_STATE.stop) {
            setStatus("已停止", "failed");
            return "stopped";
          }
        }
        await logActivityRead(chapter.id, {
          start: Math.floor(t),
          end: Math.floor(end),
        });
        t = end;
        setProgress(t);
        setStatus(`${formatDuration(t)} / ${formatDuration(chapter.duration)}`);
      }
      setStatus("完成", "done");
      return "done";
    } catch (error) {
      console.warn(`[NJU-Hub] 看课：章节 ${chapter.id} 提交失败:`, error);
      setStatus(`失败：${error.message}`, "failed");
      return "failed";
    }
  }

  async function startWatchSession(mask, chapters) {
    WATCH_STATE.running = true;
    WATCH_STATE.stop = false;
    const rows = showWatchProgress(mask, chapters);

    const results = await Promise.all(
      chapters.map((c) => watchChapter(c, rows)),
    );

    const summary = {
      done: results.filter((r) => r === "done").length,
      failed: results.filter((r) => r === "failed").length,
      stopped: results.filter((r) => r === "stopped").length,
    };
    WATCH_STATE.running = false;
    WATCH_STATE.stop = false;
    showWatchComplete(mask, summary);
  }

  async function startWatchFlow() {
    if (WATCH_STATE.running) return;
    const courseId = location.pathname.match(/\/course\/(\d+)/)?.[1];
    if (!courseId) return;
    const ball = document.getElementById("ball-watch");
    if (ball) ball.innerText = "...";
    try {
      const { chapters, skipped, completedCount } = await fetchChapters(courseId);
      if (!chapters.length) {
        console.warn(
          `[NJU-Hub] 看课：没有可刷的章节（已完成 ${completedCount}，未识别到时长 ${skipped}）`,
        );
        alert("没有需要刷的章节，全部已完成");
        return;
      }
      showWatchModal(chapters, skipped, completedCount, startWatchSession);
    } catch (e) {
      console.warn("[NJU-Hub] 看课：获取章节列表失败:", e);
    } finally {
      if (ball) ball.innerHTML = WATCH_ICON;
    }
  }

  Object.assign(window.__LMS__, {
    renderWatchBall,
    startWatchFlow,
  });
})();
