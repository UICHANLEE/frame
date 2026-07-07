"use strict";

const CATEGORIES = [
  ["all", "전체"],
  ["ai", "AI"],
  ["mukbang", "먹방"],
  ["beauty", "뷰티"],
  ["vlog", "브이로그"],
  ["variety", "예능"],
  ["movie", "영화/드라마"],
  ["tech", "테크"],
  ["knowledge", "지식"],
  ["travel", "여행"],
  ["animal", "동물"],
];

const SOCIAL_SORTS = {
  reels: [["views", "조회수순"], ["likes", "좋아요순"], ["comments", "댓글순"]],
  x: [["likes", "좋아요순"], ["comments", "댓글순"], ["retweets", "리트윗순"], ["views", "조회수순"]],
  threads: [["likes", "좋아요순"], ["comments", "댓글순"], ["reposts", "리포스트순"]],
  tiktok: [["views", "조회수순"], ["likes", "좋아요순"], ["comments", "댓글순"]],
};

const state = {
  tab: "video",
  category: "all",
  period: "week",
  videoSort: "views",
  socialSort: { reels: "views", x: "likes", threads: "likes", tiktok: "views" },
  search: "",
  socialData: {},
  loadToken: 0,
};

const els = {
  tabBar: document.querySelector("#tabBar"),
  searchForm: document.querySelector("#searchForm"),
  searchInput: document.querySelector("#searchInput"),
  refreshButton: document.querySelector("#refreshButton"),
  videoFilters: document.querySelector("#videoFilters"),
  categoryRow: document.querySelector("#categoryRow"),
  periodRow: document.querySelector("#periodRow"),
  videoSortMenu: document.querySelector("#videoSortMenu"),
  socialFilters: document.querySelector("#socialFilters"),
  socialSortMenu: document.querySelector("#socialSortMenu"),
  socialSortOptions: document.querySelector("#socialSortOptions"),
  accountForm: document.querySelector("#accountForm"),
  accountInput: document.querySelector("#accountInput"),
  accountRow: document.querySelector("#accountRow"),
  statusLine: document.querySelector("#statusLine"),
  grid: document.querySelector("#grid"),
  aiPage: document.querySelector("#aiPage"),
  playerModal: document.querySelector("#playerModal"),
  playerFrame: document.querySelector("#playerFrame"),
};

boot();

function boot() {
  renderCategoryChips();
  bindEvents();
  loadTab();
}

function bindEvents() {
  els.tabBar.addEventListener("click", (event) => {
    const button = event.target.closest("[data-tab]");
    if (!button) return;
    state.tab = button.dataset.tab;
    state.search = "";
    els.searchInput.value = "";
    syncTabs();
    loadTab();
  });

  els.searchForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const query = els.searchInput.value.trim();
    if (!query) return;
    state.search = query;
    if (state.tab !== "video") {
      state.tab = "video";
      syncTabs();
    }
    loadTab();
  });

  els.refreshButton.addEventListener("click", async () => {
    els.refreshButton.disabled = true;
    try {
      await fetch("/api/refresh", { method: "POST" });
    } catch (_) { /* 무시 */ }
    els.refreshButton.disabled = false;
    loadTab();
  });

  els.categoryRow.addEventListener("click", (event) => {
    const chip = event.target.closest("[data-category]");
    if (!chip) return;
    state.category = chip.dataset.category;
    state.search = "";
    els.searchInput.value = "";
    syncVideoFilters();
    loadTab();
  });

  els.periodRow.addEventListener("click", (event) => {
    const chip = event.target.closest("[data-period]");
    if (!chip) return;
    state.period = chip.dataset.period;
    syncVideoFilters();
    loadTab();
  });

  els.videoSortMenu.addEventListener("click", (event) => {
    const button = event.target.closest("[data-sort]");
    if (!button) return;
    state.videoSort = button.dataset.sort;
    els.videoSortMenu.open = false;
    syncVideoFilters();
    loadTab();
  });

  els.socialSortOptions.addEventListener("click", (event) => {
    const button = event.target.closest("[data-sort]");
    if (!button) return;
    state.socialSort[state.tab] = button.dataset.sort;
    els.socialSortMenu.open = false;
    renderSocial();
  });

  els.accountForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const username = els.accountInput.value.trim();
    if (!username) return;
    els.accountInput.value = "";
    await postAccount("add", username);
    loadTab();
  });

  els.accountRow.addEventListener("click", async (event) => {
    const chip = event.target.closest("[data-username]");
    if (!chip) return;
    if (!confirm(`@${chip.dataset.username} 계정을 삭제할까요?`)) return;
    await postAccount("remove", chip.dataset.username);
    loadTab();
  });

  els.playerModal.addEventListener("click", (event) => {
    if (event.target.closest("[data-close]")) closePlayer();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closePlayer();
  });
}

async function postAccount(action, username) {
  try {
    await fetch("/api/accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ platform: state.tab, action, username }),
    });
  } catch (_) { /* 무시 */ }
}

/* -------------------------------------------------- 렌더 공통 */

function syncTabs() {
  els.tabBar.querySelectorAll("button").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.tab === state.tab);
  });
}

function renderCategoryChips() {
  els.categoryRow.innerHTML = "";
  for (const [id, label] of CATEGORIES) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "chip";
    chip.dataset.category = id;
    chip.textContent = label;
    els.categoryRow.append(chip);
  }
  syncVideoFilters();
}

function syncVideoFilters() {
  els.categoryRow.querySelectorAll(".chip").forEach((chip) => {
    chip.classList.toggle("is-active", chip.dataset.category === state.category && !state.search);
  });
  els.periodRow.querySelectorAll(".chip").forEach((chip) => {
    chip.classList.toggle("is-active", chip.dataset.period === state.period);
  });
  const labels = { views: "조회수순", likes: "좋아요순" };
  els.videoSortMenu.querySelector("[data-label]").textContent = labels[state.videoSort];
  els.videoSortMenu.querySelectorAll("[data-sort]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.sort === state.videoSort);
  });
}

function renderSocialSortMenu() {
  const sorts = SOCIAL_SORTS[state.tab] || [];
  const current = state.socialSort[state.tab];
  els.socialSortOptions.innerHTML = "";
  for (const [id, label] of sorts) {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.sort = id;
    button.textContent = label;
    button.classList.toggle("is-active", id === current);
    els.socialSortOptions.append(button);
    if (id === current) {
      els.socialSortMenu.querySelector("[data-label]").textContent = label;
    }
  }
}

function renderAccountChips(accounts) {
  els.accountRow.innerHTML = "";
  for (const account of accounts || []) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "chip";
    chip.dataset.username = account;
    chip.innerHTML = `@${escapeHtml(account)}<span class="chip-x">✕</span>`;
    els.accountRow.append(chip);
  }
}

function setStatus(message, isError = false) {
  els.statusLine.textContent = message || "";
  els.statusLine.classList.toggle("error", isError);
}

function showSpinner(message) {
  els.grid.innerHTML = `<div class="spinner">⏳ ${escapeHtml(message)}</div>`;
}

function formatCount(value) {
  const number = Number(value) || 0;
  if (number >= 1e8) return (number / 1e8).toFixed(1).replace(/\.0$/, "") + "억";
  if (number >= 1e4) return (number / 1e4).toFixed(1).replace(/\.0$/, "") + "만";
  if (number >= 1e3) return (number / 1e3).toFixed(1).replace(/\.0$/, "") + "천";
  return String(number);
}

function escapeHtml(text) {
  return String(text ?? "").replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[ch]);
}

/* -------------------------------------------------- 탭 로딩 */

async function loadTab() {
  const token = ++state.loadToken;
  const tab = state.tab;

  const isVideo = tab === "video" || tab === "shorts";
  const isSocial = tab in SOCIAL_SORTS;
  els.videoFilters.hidden = !isVideo;
  els.socialFilters.hidden = !isSocial;
  els.aiPage.hidden = tab !== "ai";
  els.grid.hidden = tab === "ai";
  setStatus("");

  try {
    if (isVideo) await loadVideos(token);
    else if (tab === "ai") await loadAi(token);
    else await loadSocial(token);
  } catch (error) {
    if (token !== state.loadToken) return;
    setStatus(`불러오기 실패: ${error.message}`, true);
    els.grid.innerHTML = `<div class="empty-note">데이터를 불러오지 못했습니다. 새로고침을 눌러보세요.</div>`;
  }
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    let detail = `HTTP ${response.status}`;
    try {
      const body = await response.json();
      if (body.error) detail = body.error;
    } catch (_) { /* 무시 */ }
    throw new Error(detail);
  }
  return response.json();
}

/* -------------------------------------------------- 유튜브/쇼츠 */

async function loadVideos(token) {
  showSpinner(state.search ? `"${state.search}" 검색 중…` : "인기 영상 불러오는 중…");
  const url = state.search
    ? `/api/search?q=${encodeURIComponent(state.search)}&sort=${state.videoSort}`
    : `/api/videos?mode=${state.tab}&category=${state.category}&period=${state.period}&sort=${state.videoSort}`;
  const data = await fetchJson(url);
  if (token !== state.loadToken) return;

  syncVideoFilters();
  if (state.search) setStatus(`"${state.search}" 검색 결과 · 카테고리를 누르면 검색이 해제됩니다.`);

  els.grid.innerHTML = "";
  const items = data.items || [];
  if (!items.length) {
    els.grid.innerHTML = `<div class="empty-note">표시할 영상이 없습니다.</div>`;
    return;
  }
  for (const item of items) {
    const card = document.createElement("article");
    card.className = "card" + (state.tab === "shorts" ? " is-portrait" : "");
    const likesPart = item.likes != null
      ? ` · 좋아요 <strong>${formatCount(item.likes)}</strong>` : "";
    card.innerHTML = `
      <img class="thumb" src="${escapeHtml(item.thumb)}" alt="" loading="lazy" />
      <div class="card-body">
        <h3 class="card-title">${escapeHtml(item.title)}</h3>
        <p class="card-channel">${escapeHtml(item.channel)}${item.published ? " · " + escapeHtml(item.published) : ""}</p>
        <p class="card-stats">조회수 <strong>${formatCount(item.views)}</strong>${likesPart}</p>
      </div>`;
    card.addEventListener("click", () => openPlayer(item.id));
    els.grid.append(card);
  }
}

function openPlayer(videoId) {
  els.playerFrame.innerHTML =
    `<iframe src="https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}?autoplay=1" ` +
    `allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>`;
  els.playerModal.hidden = false;
}

function closePlayer() {
  els.playerModal.hidden = true;
  els.playerFrame.innerHTML = "";
}

/* -------------------------------------------------- AI 탭 */

async function loadAi(token) {
  els.aiPage.innerHTML = `<div class="spinner">⏳ AI 소식 불러오는 중…</div>`;
  const data = await fetchJson("/api/ai");
  if (token !== state.loadToken) return;

  const sections = [];

  sections.push(aiSection("🆕 새로 나온 영상 생성 모델", (data.newModels || []).map((model) => aiRow(
    model.url, model.id, `공개 ${model.likes ? "· ❤ " + formatCount(model.likes) : ""} ${model.createdAt}`,
  ))));
  sections.push(aiSection("🔥 트렌딩 영상 생성 모델", (data.trendingModels || []).map((model) => aiRow(
    model.url, model.id, `❤ ${formatCount(model.likes)} · ⬇ ${formatCount(model.downloads)}`,
  ))));
  sections.push(aiSection("🇰🇷 국내 AI 영상 뉴스", (data.newsKr || []).map((news) => aiRow(
    news.url, news.title, news.source,
  ))));
  sections.push(aiSection("🌏 해외 AI 영상 뉴스", (data.newsEn || []).map((news) => aiRow(
    news.url, news.title, news.source,
  ))));

  els.aiPage.innerHTML = sections.join("");
  if ((data.errors || []).length) setStatus(`일부 항목 실패: ${data.errors.join(" / ")}`, true);
}

function aiSection(title, rows) {
  const body = rows.length ? rows.join("") : `<div class="empty-note">데이터 없음</div>`;
  return `<section class="ai-section"><h2>${escapeHtml(title)}</h2><div class="ai-list">${body}</div></section>`;
}

function aiRow(url, title, meta) {
  return `<a class="ai-row" href="${escapeHtml(url)}" target="_blank" rel="noopener">` +
    `<span class="ai-title">${escapeHtml(title)}</span>` +
    `<span class="ai-meta">${escapeHtml(meta || "")}</span></a>`;
}

/* -------------------------------------------------- 소셜 탭 */

async function loadSocial(token) {
  renderSocialSortMenu();
  showSpinner("불러오는 중… (처음엔 몇십 초 걸릴 수 있어요)");
  const data = await fetchJson(`/api/${state.tab}`);
  if (token !== state.loadToken) return;
  state.socialData[state.tab] = data;
  renderAccountChips(data.accounts);
  renderSocial();
}

function renderSocial() {
  const tab = state.tab;
  const data = state.socialData[tab];
  if (!data) return;
  renderSocialSortMenu();

  const sortKey = state.socialSort[tab];
  let items = [...(data.items || [])];
  if (sortKey === "views") {
    items = items.filter((item) => (item.views || 0) > 0);
  }
  items.sort((a, b) => (b[sortKey] || 0) - (a[sortKey] || 0));

  const errors = data.errors || [];
  setStatus(errors.length ? `일부 계정 실패: ${errors.join(" / ")}` : "", errors.length > 0);

  els.grid.innerHTML = "";

  if (tab === "threads" && data.fallback) {
    setStatus("스레드 실시간 조회가 현재 막혀 있어 계정 바로가기로 안내합니다.");
    for (const link of data.links || []) {
      const card = document.createElement("a");
      card.className = "card is-text";
      card.href = link.url;
      card.target = "_blank";
      card.rel = "noopener";
      card.innerHTML = `<div class="card-body">
        <h3 class="card-title">🧵 @${escapeHtml(link.username)}</h3>
        <p class="card-channel">threads.net에서 최신 글 보기 →</p>
      </div>`;
      els.grid.append(card);
    }
    return;
  }

  if (!items.length) {
    els.grid.innerHTML = `<div class="empty-note">표시할 항목이 없습니다.</div>`;
    return;
  }

  for (const item of items) {
    const card = document.createElement("a");
    card.href = item.url;
    card.target = "_blank";
    card.rel = "noopener";

    if (tab === "x" || tab === "threads") {
      card.className = "card is-text";
      const stats = [
        `❤ <strong>${formatCount(item.likes)}</strong>`,
        `💬 <strong>${formatCount(item.comments)}</strong>`,
        tab === "x" ? `🔁 <strong>${formatCount(item.retweets)}</strong>` : `🔁 <strong>${formatCount(item.reposts)}</strong>`,
      ];
      if (tab === "x" && item.views) stats.push(`👁 <strong>${formatCount(item.views)}</strong>`);
      card.innerHTML = `<div class="card-body">
        <p class="card-channel">@${escapeHtml(item.username)}${item.name ? " · " + escapeHtml(item.name) : ""}</p>
        <h3 class="card-title">${escapeHtml(item.text)}</h3>
        <p class="card-stats">${stats.join(" ")}</p>
      </div>`;
    } else {
      card.className = "card is-portrait";
      card.innerHTML = `
        <img class="thumb" src="${escapeHtml(item.thumb)}" alt="" loading="lazy" />
        <div class="card-body">
          <h3 class="card-title">${escapeHtml(item.caption || item.title || "")}</h3>
          <p class="card-channel">@${escapeHtml(item.username)}</p>
          <p class="card-stats">👁 <strong>${formatCount(item.views)}</strong> ❤ <strong>${formatCount(item.likes)}</strong> 💬 <strong>${formatCount(item.comments)}</strong></p>
        </div>`;
    }
    els.grid.append(card);
  }
}
