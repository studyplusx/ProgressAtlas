const TOTAL_QUESTIONS = 1000;
const BLOCK_SIZE = 100;
const STORAGE_KEY = "vocab-progress-atlas/v1";

const STATUS_META = {
  correct: {
    label: "〇",
    name: "正解",
    color: "#2a8f63",
    tone: "correct",
    weight: 1,
  },
  partial: {
    label: "△",
    name: "あと一歩",
    color: "#d28b1f",
    tone: "partial",
    weight: 0.5,
  },
  wrong: {
    label: "✕",
    name: "要復習",
    color: "#bd4d37",
    tone: "wrong",
    weight: 0,
  },
  blank: {
    label: "未",
    name: "未記録",
    color: "#b6a58a",
    tone: "blank",
    weight: null,
  },
};

const BRUSH_OPTIONS = ["correct", "partial", "wrong", "blank"];
const FILTER_OPTIONS = [
  { key: "all", label: "すべて", tone: "blank" },
  { key: "correct", label: "〇のみ", tone: "correct" },
  { key: "partial", label: "△のみ", tone: "partial" },
  { key: "wrong", label: "✕のみ", tone: "wrong" },
  { key: "unrecorded", label: "未記録", tone: "blank" },
  { key: "recorded", label: "記録済み", tone: "correct" },
];

const elements = {
  brushPicker: document.getElementById("brush-picker"),
  mobileBrushPicker: document.getElementById("mobile-brush-picker"),
  filterPicker: document.getElementById("filter-picker"),
  statsGrid: document.getElementById("stats-grid"),
  donutChart: document.getElementById("donut-chart"),
  completionRate: document.getElementById("completion-rate"),
  legendList: document.getElementById("legend-list"),
  blockSummary: document.getElementById("block-summary"),
  insightCards: document.getElementById("insight-cards"),
  recentList: document.getElementById("recent-list"),
  questionsGrid: document.getElementById("questions-grid"),
  rangeTabs: document.getElementById("range-tabs"),
  updatedAt: document.getElementById("updated-at"),
  currentScope: document.getElementById("current-scope"),
  focusTitle: document.getElementById("focus-title"),
  focusDetail: document.getElementById("focus-detail"),
  jumpNext: document.getElementById("jump-next"),
  mobileJumpNext: document.getElementById("mobile-jump-next"),
  importData: document.getElementById("import-data"),
  importFile: document.getElementById("import-file"),
  exportData: document.getElementById("export-data"),
  resetData: document.getElementById("reset-data"),
  clearBlockFilter: document.getElementById("clear-block-filter"),
};

const state = {
  items: loadItems(),
  activeBrush: "correct",
  activeFilter: "all",
  activeBlock: null,
};

registerServiceWorker();
initialize();
render();

function registerServiceWorker() {
  if (!("serviceWorker" in navigator) || window.location.protocol === "file:") {
    return;
  }

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch((error) => {
      console.error("Failed to register service worker.", error);
    });
  });
}

function initialize() {
  renderBrushPickers();
  renderFilterPicker();

  elements.brushPicker.addEventListener("click", handleBrushSelection);
  elements.mobileBrushPicker.addEventListener("click", handleBrushSelection);
  elements.filterPicker.addEventListener("click", handleFilterSelection);
  elements.questionsGrid.addEventListener("click", handleQuestionClick);
  elements.blockSummary.addEventListener("click", handleBlockSelection);
  elements.rangeTabs.addEventListener("click", handleBlockSelection);
  elements.jumpNext.addEventListener("click", scrollToNextUnrecorded);
  elements.mobileJumpNext.addEventListener("click", scrollToNextUnrecorded);
  elements.importData.addEventListener("click", () => elements.importFile.click());
  elements.importFile.addEventListener("change", importData);
  elements.exportData.addEventListener("click", exportData);
  elements.resetData.addEventListener("click", resetProgress);
  elements.clearBlockFilter.addEventListener("click", clearBlockFilter);

  document.addEventListener("keydown", handleKeyboardShortcut);
}

function loadItems() {
  const emptyItems = Array.from({ length: TOTAL_QUESTIONS }, (_, index) => ({
    id: index + 1,
    status: "blank",
    updatedAt: null,
  }));

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return emptyItems;
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed.items)) {
      return emptyItems;
    }

    return emptyItems.map((item, index) => {
      const saved = parsed.items[index];
      if (!saved || !STATUS_META[saved.status]) {
        return item;
      }

      return {
        ...item,
        status: saved.status,
        updatedAt: typeof saved.updatedAt === "string" ? saved.updatedAt : null,
      };
    });
  } catch (error) {
    console.error("Failed to load saved progress.", error);
    return emptyItems;
  }
}

function saveItems() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ items: state.items }));
}

function renderBrushPickers() {
  const desktopMarkup = buildBrushButtons(false);
  const mobileMarkup = buildBrushButtons(true);

  elements.brushPicker.innerHTML = desktopMarkup;
  elements.mobileBrushPicker.innerHTML = mobileMarkup;
}

function buildBrushButtons(compact) {
  return BRUSH_OPTIONS.map((statusKey) => {
    const meta = STATUS_META[statusKey];
    const isActive = state.activeBrush === statusKey;
    return `
      <button
        class="chip-button ${compact ? "compact" : ""} ${isActive ? "active" : ""}"
        data-role="brush"
        data-status="${statusKey}"
        data-tone="${meta.tone}"
        type="button"
        aria-pressed="${isActive}"
      >
        ${compact ? meta.label : `${meta.label} ${meta.name}`}
      </button>
    `;
  }).join("");
}

function renderFilterPicker() {
  elements.filterPicker.innerHTML = FILTER_OPTIONS.map((filter) => {
    const isActive = state.activeFilter === filter.key;
    return `
      <button
        class="chip-button ${isActive ? "active" : ""}"
        data-role="filter"
        data-filter="${filter.key}"
        data-tone="${filter.tone}"
        type="button"
        aria-pressed="${isActive}"
      >
        ${filter.label}
      </button>
    `;
  }).join("");
}

function render() {
  const metrics = calculateMetrics();
  const visibleItems = getVisibleItems();

  renderStats(metrics);
  renderDonut(metrics);
  renderLegend(metrics);
  renderBlocks(metrics.blocks);
  renderRangeTabs(metrics.blocks);
  renderInsights(metrics);
  renderRecent(metrics.recentItems);
  renderQuestions(visibleItems);
  renderMeta(metrics, visibleItems.length);
}

function calculateMetrics() {
  const counts = {
    correct: 0,
    partial: 0,
    wrong: 0,
    blank: 0,
  };

  const blocks = Array.from({ length: TOTAL_QUESTIONS / BLOCK_SIZE }, (_, blockIndex) => ({
    index: blockIndex,
    start: blockIndex * BLOCK_SIZE + 1,
    end: (blockIndex + 1) * BLOCK_SIZE,
    counts: {
      correct: 0,
      partial: 0,
      wrong: 0,
      blank: 0,
    },
  }));

  let weightedTotal = 0;
  let recorded = 0;

  state.items.forEach((item, index) => {
    counts[item.status] += 1;

    if (item.status !== "blank") {
      recorded += 1;
      weightedTotal += STATUS_META[item.status].weight;
    }

    const block = blocks[Math.floor(index / BLOCK_SIZE)];
    block.counts[item.status] += 1;
  });

  const completionRate = recorded / TOTAL_QUESTIONS;
  const correctRate = recorded ? counts.correct / recorded : 0;
  const masteryRate = weightedTotal / TOTAL_QUESTIONS;
  const remaining = TOTAL_QUESTIONS - recorded;
  const lastUpdated = [...state.items]
    .filter((item) => item.updatedAt)
    .sort((left, right) => new Date(right.updatedAt) - new Date(left.updatedAt));

  blocks.forEach((block) => {
    const blockRecorded = BLOCK_SIZE - block.counts.blank;
    const blockWeighted =
      block.counts.correct * STATUS_META.correct.weight +
      block.counts.partial * STATUS_META.partial.weight;

    block.recorded = blockRecorded;
    block.completionRate = blockRecorded / BLOCK_SIZE;
    block.masteryRate = blockWeighted / BLOCK_SIZE;
    block.correctRate = blockRecorded ? block.counts.correct / blockRecorded : 0;
  });

  const strongBlock = [...blocks]
    .filter((block) => block.recorded > 0)
    .sort((left, right) => right.masteryRate - left.masteryRate)[0] || null;

  const weakBlock = [...blocks]
    .filter((block) => block.recorded > 0)
    .sort((left, right) => {
      if (left.masteryRate === right.masteryRate) {
        return right.counts.wrong - left.counts.wrong;
      }
      return left.masteryRate - right.masteryRate;
    })[0] || null;

  const nextUnrecorded = state.items.find((item) => item.status === "blank") || null;

  return {
    counts,
    recorded,
    remaining,
    completionRate,
    correctRate,
    masteryRate,
    blocks,
    nextUnrecorded,
    lastUpdated,
    recentItems: lastUpdated.slice(0, 8),
    strongBlock,
    weakBlock,
  };
}

function renderStats(metrics) {
  const cards = [
    {
      label: "記録済み",
      value: `${metrics.recorded}`,
      subtext: `${percent(metrics.completionRate)} を記録`,
    },
    {
      label: "正解数",
      value: `${metrics.counts.correct}`,
      subtext: `記録済みの ${percent(metrics.correctRate)}`,
    },
    {
      label: "あと一歩",
      value: `${metrics.counts.partial}`,
      subtext: "復習で〇に変えたい問題",
    },
    {
      label: "要復習",
      value: `${metrics.counts.wrong}`,
      subtext: "苦手として残っている問題",
    },
    {
      label: "未記録",
      value: `${metrics.remaining}`,
      subtext: "まだ触れていない問題",
    },
    {
      label: "仕上がり度",
      value: `${percent(metrics.masteryRate)}`,
      subtext: "〇を1点、△を0.5点で換算",
    },
  ];

  elements.statsGrid.innerHTML = cards
    .map(
      (card) => `
        <article class="stat-card">
          <p class="stat-label">${card.label}</p>
          <p class="stat-value">${card.value}</p>
          <p class="stat-subtext">${card.subtext}</p>
        </article>
      `,
    )
    .join("");
}

function renderDonut(metrics) {
  const correctDeg = Math.round((metrics.counts.correct / TOTAL_QUESTIONS) * 3600) / 10;
  const partialDeg = Math.round((metrics.counts.partial / TOTAL_QUESTIONS) * 3600) / 10;
  const wrongDeg = Math.round((metrics.counts.wrong / TOTAL_QUESTIONS) * 3600) / 10;
  const blankDeg = Math.max(0, 360 - correctDeg - partialDeg - wrongDeg);

  elements.donutChart.style.background = `
    conic-gradient(
      ${STATUS_META.correct.color} 0deg ${correctDeg}deg,
      ${STATUS_META.partial.color} ${correctDeg}deg ${correctDeg + partialDeg}deg,
      ${STATUS_META.wrong.color} ${correctDeg + partialDeg}deg ${correctDeg + partialDeg + wrongDeg}deg,
      ${STATUS_META.blank.color} ${correctDeg + partialDeg + wrongDeg}deg ${correctDeg + partialDeg + wrongDeg + blankDeg}deg
    )
  `;
  elements.completionRate.textContent = percent(metrics.completionRate);
}

function renderLegend(metrics) {
  const order = ["correct", "partial", "wrong", "blank"];

  elements.legendList.innerHTML = order
    .map((statusKey) => {
      const meta = STATUS_META[statusKey];
      const count = metrics.counts[statusKey];
      const ratio = count / TOTAL_QUESTIONS;
      return `
        <div class="legend-item">
          <div class="legend-row">
            <span class="legend-title">
              <span class="legend-swatch" style="background:${meta.color};"></span>
              ${meta.label} ${meta.name}
            </span>
            <strong>${count}問</strong>
          </div>
          <div class="legend-meter">
            <div class="legend-meter-fill" style="width:${ratio * 100}%; background:${meta.color};"></div>
          </div>
          <div class="legend-row">
            <span>${percent(ratio)}</span>
            <span>${statusKey === "blank" ? "未着手" : "全体に占める割合"}</span>
          </div>
        </div>
      `;
    })
    .join("");
}

function renderBlocks(blocks) {
  elements.clearBlockFilter.hidden = state.activeBlock === null;

  elements.blockSummary.innerHTML = blocks
    .map((block) => {
      const isActive = state.activeBlock === block.index;
      return `
        <button class="block-card ${isActive ? "active" : ""}" type="button" data-block-index="${block.index}">
          <div class="block-head">
            <span class="block-range">${block.start}〜${block.end}</span>
            <span class="block-rate">${percent(block.completionRate)} 記録</span>
          </div>
          <div class="stacked-meter" aria-hidden="true">
            ${renderMeterSegments(block.counts, BLOCK_SIZE)}
          </div>
          <div class="block-stats-row">
            <span>〇 ${block.counts.correct}</span>
            <span>△ ${block.counts.partial}</span>
            <span>✕ ${block.counts.wrong}</span>
            <span>未 ${block.counts.blank}</span>
          </div>
        </button>
      `;
    })
    .join("");
}

function renderRangeTabs(blocks) {
  const allActive = state.activeBlock === null;
  const allButton = `
    <button
      class="chip-button range-chip ${allActive ? "active" : ""}"
      type="button"
      data-block-index="-1"
      data-tone="blank"
      aria-pressed="${allActive}"
    >
      すべて
    </button>
  `;

  const blockButtons = blocks
    .map((block) => {
      const isActive = state.activeBlock === block.index;
      return `
        <button
          class="chip-button range-chip ${isActive ? "active" : ""}"
          type="button"
          data-block-index="${block.index}"
          data-tone="blank"
          aria-pressed="${isActive}"
        >
          ${block.start}〜${block.end}
        </button>
      `;
    })
    .join("");

  elements.rangeTabs.innerHTML = `${allButton}${blockButtons}`;
}

function renderInsights(metrics) {
  const insightCards = [
    metrics.nextUnrecorded
      ? {
          title: `次に記録するなら ${metrics.nextUnrecorded.id} 問`,
          text: "未記録の先頭です。リズムを切らさずここから埋めると、記録率が素直に伸びます。",
          tone: "blank",
        }
      : {
          title: "1000問すべて記録済みです",
          text: "次は△と✕に絞って、仕上がり度を上げる段階に入れます。",
          tone: "correct",
        },
    metrics.strongBlock
      ? {
          title: `最も仕上がっているのは ${metrics.strongBlock.start}〜${metrics.strongBlock.end}`,
          text: `仕上がり度 ${percent(metrics.strongBlock.masteryRate)}。この範囲は定着しつつあります。`,
          tone: "correct",
        }
      : {
          title: "まずは最初の1問を記録",
          text: "まだデータがないため、どの範囲を先に進めても統計に反映されます。",
          tone: "blank",
        },
    metrics.weakBlock
      ? {
          title: `重点復習は ${metrics.weakBlock.start}〜${metrics.weakBlock.end}`,
          text: `仕上がり度 ${percent(metrics.weakBlock.masteryRate)}、✕ ${metrics.weakBlock.counts.wrong}問。ここを崩すと全体効率が上がります。`,
          tone: "wrong",
        }
      : {
          title: "苦手ブロックはまだ未判定",
          text: "記録が増えると、どの100問に時間を使うべきか見えてきます。",
          tone: "partial",
        },
    {
      title: `〇に変える候補は ${metrics.counts.partial + metrics.counts.wrong}問`,
      text: "△と✕だけをフィルタ表示すれば、短時間で復習対象を抽出できます。",
      tone: "partial",
    },
  ];

  elements.insightCards.innerHTML = insightCards
    .map(
      (insight) => `
        <article class="insight-card">
          <div class="mini-line">
            <span class="mini-tone ${insight.tone}"></span>
            <strong>${insight.title}</strong>
          </div>
          <p>${insight.text}</p>
        </article>
      `,
    )
    .join("");
}

function renderRecent(recentItems) {
  if (!recentItems.length) {
    elements.recentList.innerHTML = `
      <li class="recent-item">
        <div class="recent-head">
          <span>まだ記録はありません</span>
        </div>
        <div class="recent-sub">最初のセルを押すと、ここに直近の更新が並びます。</div>
      </li>
    `;
    return;
  }

  elements.recentList.innerHTML = recentItems
    .map((item) => {
      const meta = STATUS_META[item.status];
      return `
        <li class="recent-item">
          <div class="recent-head">
            <span>第 ${item.id} 問</span>
            <span style="color:${meta.color};">${meta.label} ${meta.name}</span>
          </div>
          <div class="recent-sub">${formatDateTime(item.updatedAt)}</div>
        </li>
      `;
    })
    .join("");
}

function renderQuestions(items) {
  if (!items.length) {
    elements.questionsGrid.innerHTML = `
      <div class="insight-card">
        <strong>表示対象がありません</strong>
        <p>フィルタやブロック選択を変えると、別の問題が表示されます。</p>
      </div>
    `;
    return;
  }

  elements.questionsGrid.innerHTML = items
    .map((item) => {
      const meta = STATUS_META[item.status];
      return `
        <button
          class="question-cell ${meta.tone}"
          type="button"
          data-index="${item.id - 1}"
          aria-label="第${item.id}問 現在は${meta.name}"
        >
          <span class="question-num">No.${item.id}</span>
          <span class="question-status">${meta.label}</span>
          <span class="question-text">${meta.name}</span>
        </button>
      `;
    })
    .join("");
}

function renderMeta(metrics, visibleCount) {
  const lastUpdated = metrics.lastUpdated[0];
  elements.updatedAt.textContent = lastUpdated
    ? `最終更新: ${formatDateTime(lastUpdated.updatedAt)}`
    : "まだ記録されていません";
  elements.jumpNext.disabled = !metrics.nextUnrecorded;
  elements.mobileJumpNext.disabled = !metrics.nextUnrecorded;

  let scopeText = `${visibleCount}問を表示中`;
  if (state.activeBlock !== null) {
    const start = state.activeBlock * BLOCK_SIZE + 1;
    const end = start + BLOCK_SIZE - 1;
    scopeText += ` / ブロック ${start}〜${end}`;
  } else {
    scopeText += " / 全1000問";
  }
  if (state.activeFilter !== "all") {
    const label = FILTER_OPTIONS.find((item) => item.key === state.activeFilter)?.label || state.activeFilter;
    scopeText += ` / ${label}`;
  }
  elements.currentScope.textContent = scopeText;

  if (metrics.nextUnrecorded) {
    elements.focusTitle.textContent = `${metrics.nextUnrecorded.id} 問から再開`;
    elements.focusDetail.textContent = `未記録の先頭は第 ${metrics.nextUnrecorded.id} 問です。1クリックで進捗を前に進められます。`;
  } else if (metrics.weakBlock) {
    elements.focusTitle.textContent = `${metrics.weakBlock.start}〜${metrics.weakBlock.end} を復習`;
    elements.focusDetail.textContent = `この100問は仕上がり度 ${percent(metrics.weakBlock.masteryRate)}。△と✕を優先して潰すと効率的です。`;
  } else {
    elements.focusTitle.textContent = "最初の1問を記録";
    elements.focusDetail.textContent = "データが増えるほど、苦手範囲や完成度が可視化されます。";
  }
}

function getVisibleItems() {
  return state.items.filter((item) => {
    const matchesBlock =
      state.activeBlock === null ||
      Math.floor((item.id - 1) / BLOCK_SIZE) === state.activeBlock;

    const matchesFilter = (() => {
      switch (state.activeFilter) {
        case "recorded":
          return item.status !== "blank";
        case "unrecorded":
          return item.status === "blank";
        case "all":
          return true;
        default:
          return item.status === state.activeFilter;
      }
    })();

    return matchesBlock && matchesFilter;
  });
}

function handleBrushSelection(event) {
  const button = event.target.closest("[data-role='brush']");
  if (!button) {
    return;
  }

  state.activeBrush = button.dataset.status;
  renderBrushPickers();
}

function handleFilterSelection(event) {
  const button = event.target.closest("[data-role='filter']");
  if (!button) {
    return;
  }

  state.activeFilter = button.dataset.filter;
  renderFilterPicker();
  render();
}

function handleQuestionClick(event) {
  const button = event.target.closest("[data-index]");
  if (!button) {
    return;
  }

  const index = Number(button.dataset.index);
  updateQuestionStatus(index, state.activeBrush);
}

function handleBlockSelection(event) {
  const button = event.target.closest("[data-block-index]");
  if (!button) {
    return;
  }

  const blockIndex = Number(button.dataset.blockIndex);
  if (blockIndex < 0) {
    state.activeBlock = null;
  } else {
    state.activeBlock = state.activeBlock === blockIndex ? null : blockIndex;
  }
  render();
}

function clearBlockFilter() {
  state.activeBlock = null;
  render();
}

function updateQuestionStatus(index, nextStatus) {
  const item = state.items[index];
  if (!item || item.status === nextStatus) {
    return;
  }

  state.items[index] = {
    ...item,
    status: nextStatus,
    updatedAt: new Date().toISOString(),
  };

  saveItems();
  render();
}

function handleKeyboardShortcut(event) {
  if (event.target.matches("input, textarea")) {
    return;
  }

  const shortcutMap = {
    1: "correct",
    2: "partial",
    3: "wrong",
    0: "blank",
  };

  const nextBrush = shortcutMap[event.key];
  if (!nextBrush) {
    return;
  }

  state.activeBrush = nextBrush;
  renderBrushPickers();
}

function scrollToNextUnrecorded() {
  const nextItem = state.items.find((item) => item.status === "blank");
  if (!nextItem) {
    return;
  }

  const blockIndex = Math.floor((nextItem.id - 1) / BLOCK_SIZE);
  if (state.activeBlock !== blockIndex) {
    state.activeBlock = blockIndex;
  }
  state.activeFilter = "all";
  renderFilterPicker();
  render();

  requestAnimationFrame(() => {
    const target = elements.questionsGrid.querySelector(`[data-index="${nextItem.id - 1}"]`);
    target?.scrollIntoView({ behavior: "smooth", block: "center" });
    target?.focus();
  });
}

function exportData() {
  const payload = {
    exportedAt: new Date().toISOString(),
    totalQuestions: TOTAL_QUESTIONS,
    items: state.items,
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const stamp = new Date().toISOString().slice(0, 10);
  link.href = url;
  link.download = `vocab-progress-${stamp}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function importData(event) {
  const [file] = event.target.files || [];
  if (!file) {
    return;
  }

  try {
    const rawText = await file.text();
    const parsed = JSON.parse(rawText);
    const importedItems = normalizeImportedItems(parsed);

    if (!importedItems) {
      window.alert("JSONの形式が正しくありません。書き出ししたデータを選択してください。");
      return;
    }

    const confirmed = window.confirm("現在の記録を読み込みデータで上書きします。よろしいですか？");
    if (!confirmed) {
      return;
    }

    state.items = importedItems;
    state.activeFilter = "all";
    state.activeBlock = null;
    saveItems();
    renderFilterPicker();
    render();
  } catch (error) {
    console.error("Failed to import progress data.", error);
    window.alert("データの読み込みに失敗しました。JSONファイルを確認してください。");
  } finally {
    event.target.value = "";
  }
}

function resetProgress() {
  const confirmed = window.confirm("1000問分の記録をすべて未記録に戻します。よろしいですか？");
  if (!confirmed) {
    return;
  }

  state.items = Array.from({ length: TOTAL_QUESTIONS }, (_, index) => ({
    id: index + 1,
    status: "blank",
    updatedAt: null,
  }));
  state.activeFilter = "all";
  state.activeBlock = null;

  saveItems();
  renderFilterPicker();
  render();
}

function renderMeterSegments(counts, total) {
  return ["correct", "partial", "wrong", "blank"]
    .map((statusKey) => {
      const width = (counts[statusKey] / total) * 100;
      return `<span class="stacked-segment ${statusKey}" style="width:${width}%;"></span>`;
    })
    .join("");
}

function normalizeImportedItems(parsed) {
  if (!parsed || !Array.isArray(parsed.items) || parsed.items.length !== TOTAL_QUESTIONS) {
    return null;
  }

  return parsed.items.map((item, index) => {
    const status = STATUS_META[item?.status] ? item.status : "blank";
    const updatedAt = typeof item?.updatedAt === "string" ? item.updatedAt : null;

    return {
      id: index + 1,
      status,
      updatedAt,
    };
  });
}

function percent(value) {
  return `${Math.round(value * 100)}%`;
}

function formatDateTime(isoString) {
  return new Intl.DateTimeFormat("ja-JP", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(isoString));
}
