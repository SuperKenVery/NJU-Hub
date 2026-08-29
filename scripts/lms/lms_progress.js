/**
 * scripts/lms/lms_progress.js
 *
 * 课程列表完成情况层：在 /user/index 课程列表页的每张课程卡片上
 * 插入进度条，显示「已完成章节 / 总章节数」。
 * 依赖：lms_utils.js (escapeHtml)
 * 导出：startCourseProgress
 *
 * 数据来源与 lms_watch.js 一致：
 *   - /api/courses/{id}/activities?sub_course_id=0  章节列表
 *   - /api/course/{id}/activity-reads-for-user      观看记录（completeness === "full" 视为完成）
 */

(function () {
  "use strict";

  const { escapeHtml } = window.__LMS__;

  // 并发上限：每张卡片要发 2 个请求，避免一次打开几十门课打爆服务端
  const MAX_CONCURRENT = 3;

  const pending = new Set();
  let active = 0;

  function isCourseListPage() {
    return location.pathname.startsWith("/user/index");
  }

  async function fetchJSON(url) {
    const res = await fetch(url, {
      headers: { "X-Requested-With": "XMLHttpRequest" },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  async function fetchCourseProgress(courseId) {
    const [actsData, readsData] = await Promise.all([
      fetchJSON(`/api/courses/${courseId}/activities?sub_course_id=0`),
      fetchJSON(`/api/course/${courseId}/activity-reads-for-user`),
    ]);
    const done = new Set();
    (readsData.activity_reads || []).forEach((r) => {
      if (r.completeness === "full") done.add(r.activity_id);
    });
    let total = 0;
    let completed = 0;
    const unfinished = [];
    (actsData.activities || []).forEach((act) => {
      const id = act.id ?? act.activity_id;
      if (id == null) return;
      total += 1;
      if (done.has(id)) {
        completed += 1;
      } else {
        unfinished.push(act.title || act.name || `章节 ${id}`);
      }
    });
    return { total, completed, unfinished };
  }

  function renderProgressEl(card) {
    if (card.querySelector(".lms-course-progress")) return null;
    const info = card.querySelector(".info-area");
    if (!info) return null;
    const wrap = document.createElement("div");
    wrap.className = "lms-course-progress";
    wrap.innerHTML = `
            <div class="lms-cp-bar"><div class="lms-cp-fill"></div></div>
            <span class="lms-cp-text">加载中…</span>
        `;
    // 插在分隔线上方，即卡片信息区底部
    info.insertBefore(wrap, info.querySelector(".divider-line"));
    return wrap;
  }

  // hover 气泡：展示未完成章节列表，跟随鼠标、超出屏幕自动翻转
  function attachHoverTip(el, getItems) {
    let tip = null;
    const place = (e) => {
      if (!tip) return;
      const pad = 14;
      const rect = tip.getBoundingClientRect();
      let x = e.clientX + pad;
      let y = e.clientY + pad;
      if (x + rect.width > window.innerWidth - 8) x = e.clientX - rect.width - pad;
      if (y + rect.height > window.innerHeight - 8) y = e.clientY - rect.height - pad;
      tip.style.left = `${Math.max(8, x)}px`;
      tip.style.top = `${Math.max(8, y)}px`;
    };
    const show = (e) => {
      const items = getItems();
      if (!items.length) return;
      hide();
      tip = document.createElement("div");
      tip.className = "lms-cp-tip";
      tip.innerHTML = `
                <div class="lms-cp-tip-title">未完成 ${items.length} 个章节</div>
                ${items.map((n) => `<div class="lms-cp-tip-item">${escapeHtml(n)}</div>`).join("")}
            `;
      document.body.appendChild(tip);
      place(e);
    };
    const hide = () => {
      if (tip) {
        tip.remove();
        tip = null;
      }
    };
    el.addEventListener("mouseenter", show);
    el.addEventListener("mousemove", place);
    el.addEventListener("mouseleave", hide);
  }

  async function processCard(card) {
    const a = card.querySelector("a.course-name[href*='/course/']");
    if (!a) return;
    const courseId = a.href.match(/\/course\/(\d+)/)?.[1];
    if (!courseId) return;
    const el = renderProgressEl(card);
    if (!el) return;
    try {
      const { total, completed, unfinished } = await fetchCourseProgress(courseId);
      const pct = total ? Math.round((completed / total) * 100) : 0;
      el.querySelector(".lms-cp-fill").style.width = `${pct}%`;
      const text = el.querySelector(".lms-cp-text");
      text.textContent = total
        ? `${completed}/${total} 已完成`
        : "暂无章节";
      if (total > 0 && completed >= total) el.classList.add("done");
      attachHoverTip(el, () => unfinished);
    } catch (e) {
      el.querySelector(".lms-cp-text").textContent = "进度获取失败";
      console.warn(`[NJU-Hub] 课程 ${courseId} 进度获取失败:`, e);
    }
  }

  function pump() {
    while (active < MAX_CONCURRENT && pending.size) {
      const card = pending.values().next().value;
      pending.delete(card);
      active += 1;
      processCard(card).finally(() => {
        active -= 1;
        pump();
      });
    }
  }

  function scanCards() {
    document.querySelectorAll("div.cards-list .course-card-new").forEach((card) => {
      if (card.dataset.lmsProgress) return;
      card.dataset.lmsProgress = "1";
      pending.add(card);
    });
    pump();
  }

  function startCourseProgress() {
    if (!isCourseListPage()) return;
    if (window.__LMS__.__progressStarted) return;
    window.__LMS__.__progressStarted = true;

    // SPA 切换 tab 会重建卡片列表，用全局 MutationObserver 兜底扫描
    let timer = null;
    const observer = new MutationObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(scanCards, 200);
    });
    observer.observe(document.body, { childList: true, subtree: true });
    scanCards();
  }

  Object.assign(window.__LMS__, { startCourseProgress });
})();
