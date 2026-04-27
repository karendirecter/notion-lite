/* ============================================================
   Simplified Notion - app logic
   ============================================================ */

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const uid = () => Math.random().toString(36).slice(2, 10);
const now = () => Date.now();
const STORAGE_KEY = "notion-lite::v2";
const LEGACY_STORAGE_KEY = "notion-lite::v1";
const EMPTY_TITLE = "无标题";
const DEFAULT_PAGE_ICON = "📄";
const DEFAULT_CALLOUT_ICON = "💡";

const ICON_POOL = ["📄", "📝", "📚", "✨", "🌿", "🧠", "🪐", "🎯", "🔥", "🎨", "💡", "🧩", "📌", "📆", "📊", "🚀", "🌈", "🫧", "🧪", "📎"];
const COVER_GRADIENTS = [
  "linear-gradient(135deg,#fbc2eb 0%,#a6c1ee 100%)",
  "linear-gradient(135deg,#84fab0 0%,#8fd3f4 100%)",
  "linear-gradient(135deg,#ffecd2 0%,#fcb69f 100%)",
  "linear-gradient(135deg,#a1c4fd 0%,#c2e9fb 100%)",
  "linear-gradient(135deg,#fad0c4 0%,#ffd1ff 100%)",
  "linear-gradient(135deg,#0f0c29 0%,#302b63 50%,#24243e 100%)",
  "linear-gradient(135deg,#232526 0%,#414345 100%)",
  "linear-gradient(135deg,#2c3e50 0%,#fd746c 100%)"
];

const BLOCK_TYPES = [
  { type: "paragraph", name: "正文", desc: "普通文字块", icon: "¶", ph: "输入“/”打开命令菜单" },
  { type: "h1", name: "一级标题", desc: "页面主标题", icon: "H1", ph: "标题 1" },
  { type: "h2", name: "二级标题", desc: "章节标题", icon: "H2", ph: "标题 2" },
  { type: "h3", name: "三级标题", desc: "小节标题", icon: "H3", ph: "标题 3" },
  { type: "bullet", name: "无序列表", desc: "圆点列表", icon: "•", ph: "列表项" },
  { type: "numbered", name: "有序列表", desc: "数字列表", icon: "1.", ph: "列表项" },
  { type: "todo", name: "待办事项", desc: "可勾选任务", icon: "☑", ph: "待办" },
  { type: "quote", name: "引用", desc: "引用内容", icon: "❝", ph: "引用" },
  { type: "callout", name: "提示框", desc: "强调信息", icon: "💡", ph: "提示内容" },
  { type: "code", name: "代码", desc: "等宽代码块", icon: "</>", ph: "// code" },
  { type: "table", name: "表格", desc: "可输入数据表格", icon: "▦", ph: "" },
  { type: "divider", name: "分割线", desc: "水平分隔", icon: "—", ph: "" }
];
BLOCK_TYPES.splice(BLOCK_TYPES.length - 1, 0, { type: "ai", name: "AI Writer", desc: "Generate structured note blocks", icon: "AI", ph: "" });
const BT_MAP = Object.fromEntries(BLOCK_TYPES.map(item => [item.type, item]));
const AI_WRITABLE_TYPES = new Set(["paragraph", "h1", "h2", "h3", "bullet", "numbered", "todo", "quote", "callout", "code", "table", "divider"]);

let state = loadState();
let saveTimer = null;
let savedHintTimer = null;
let dragId = null;
let activeOutlineId = null;
let selectedBlockId = null;
let activeTableSelection = null;

const slashMenu = { open: false, mode: "create", blockId: null, contentEl: null, sel: 0, filter: "", filtered: [] };

function createBlock(type = "paragraph", data = {}) {
  const block = { id: uid(), type, text: "", ...data };
  if (type === "todo") block.checked = data.checked ?? false;
  if (type === "callout") block.emoji = data.emoji || DEFAULT_CALLOUT_ICON;
  if (type === "table") {
    block.rows = normalizeTableRows(data.rows);
    delete block.text;
  }
  if (type === "ai") {
    block.messages = normalizeAIMessages(data.messages);
    block.draft = typeof data.draft === "string" ? data.draft : "";
    block.error = typeof data.error === "string" ? data.error : "";
    block.isLoading = !!data.isLoading;
    delete block.text;
  }
  return block;
}

function createPage(parentId = null, title = "") {
  return {
    id: uid(),
    parentId,
    icon: ICON_POOL[Math.floor(Math.random() * ICON_POOL.length)],
    title,
    cover: "",
    blocks: [createBlock("paragraph")],
    createdAt: now(),
    updatedAt: now()
  };
}

function defaultState() {
  const welcomeId = uid();
  const guideId = uid();
  return {
    currentPageId: welcomeId,
    sidebarWidth: 268,
    theme: "light",
    fontMode: "balanced",
    collapsedPages: {},
    pages: [
      {
        id: welcomeId,
        parentId: null,
        icon: "✨",
        title: "欢迎来到 Notion Lite",
        cover: COVER_GRADIENTS[0],
        blocks: [
          createBlock("callout", { emoji: "👋", text: "输入 <b>/</b> 打开命令菜单，或按 <b>Ctrl/⌘ + K</b> 搜索。" }),
          createBlock("h1", { text: "一个更顺手的中文笔记主页" }),
          createBlock("paragraph", { text: "现在支持多级页面目录、中文字体优化、可编辑表格和更顺滑的动效。" }),
          createBlock("h2", { text: "你可以先试试这些" }),
          createBlock("todo", { text: "在左侧创建一个子页面", checked: false }),
          createBlock("todo", { text: "输入 /table 插入一个表格", checked: false }),
          createBlock("todo", { text: "写几个标题，看看右侧目录导航", checked: true }),
          createBlock("h3", { text: "快捷方式" }),
          createBlock("bullet", { text: "输入 <code># </code> 变成一级标题" }),
          createBlock("bullet", { text: "输入 <code>[] </code> 变成待办事项" }),
          createBlock("bullet", { text: "输入 <code>/table</code> 或选择“表格”" }),
          createBlock("table", {
            rows: [
              ["项目", "状态", "备注"],
              ["界面", "进行中", "继续微调细节"],
              ["表格", "完成", "支持增行增列与键盘输入"]
            ]
          })
        ],
        createdAt: now(),
        updatedAt: now()
      },
      {
        id: guideId,
        parentId: welcomeId,
        icon: "📚",
        title: "使用说明",
        cover: "",
        blocks: [
          createBlock("h2", { text: "页面树" }),
          createBlock("paragraph", { text: "左侧支持创建子页面，并用面包屑显示层级。" }),
          createBlock("h2", { text: "表格" }),
          createBlock("paragraph", { text: "Tab、方向键、Enter 都可以在表格中快速移动。" })
        ],
        createdAt: now(),
        updatedAt: now()
      }
    ]
  };
}

function normalizeTableRows(rows) {
  if (!Array.isArray(rows) || !rows.length) return [["列 1", "列 2", "列 3"], ["", "", ""], ["", "", ""]];
  const width = Math.max(1, ...rows.map(row => Array.isArray(row) ? row.length : 0));
  return rows.map(row => {
    const safe = Array.isArray(row) ? row.slice(0, width) : [];
    while (safe.length < width) safe.push("");
    return safe.map(cell => typeof cell === "string" ? cell : "");
  });
}

function normalizeBlock(block) {
  const next = { id: block.id || uid(), type: block.type || "paragraph" };
  if (next.type === "image") {
    next.src = typeof block.src === "string" ? block.src : "";
    next.caption = typeof block.caption === "string" ? block.caption : "";
    next.imageWidth = Math.min(100, Math.max(20, Number(block.imageWidth) || 100));
    return next;
  }
  if (next.type === "table") {
    next.rows = normalizeTableRows(block.rows);
    return next;
  }
  if (next.type === "ai") {
    next.messages = normalizeAIMessages(block.messages);
    next.draft = typeof block.draft === "string" ? block.draft : "";
    next.error = typeof block.error === "string" ? block.error : "";
    next.isLoading = !!block.isLoading;
    return next;
  }
  next.text = typeof block.text === "string" ? block.text : "";
  if (next.type === "todo") next.checked = !!block.checked;
  if (next.type === "callout") next.emoji = block.emoji || DEFAULT_CALLOUT_ICON;
  return next;
}

function normalizeAIMessages(messages) {
  if (!Array.isArray(messages)) return [];
  return messages
    .map(message => ({
      role: message?.role === "assistant" ? "assistant" : "user",
      content: typeof message?.content === "string" ? message.content : ""
    }))
    .filter(message => message.content.trim());
}

function normalizePage(page) {
  return {
    id: page.id || uid(),
    parentId: page.parentId || null,
    icon: page.icon || DEFAULT_PAGE_ICON,
    title: typeof page.title === "string" ? page.title : "",
    cover: typeof page.cover === "string" ? page.cover : "",
    blocks: Array.isArray(page.blocks) && page.blocks.length ? page.blocks.map(normalizeBlock) : [createBlock("paragraph")],
    createdAt: page.createdAt || now(),
    updatedAt: page.updatedAt || now()
  };
}

function migrateLegacyState(raw) {
  if (!raw) return null;
  const parsed = JSON.parse(raw);
  if (!parsed || !Array.isArray(parsed.pages) || !parsed.pages.length) return null;
  return parsed;
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return defaultState();
    const parsed = migrateLegacyState(raw);
    if (!parsed) return defaultState();
    const pages = parsed.pages.map(normalizePage);
    return {
      currentPageId: parsed.currentPageId && pages.some(page => page.id === parsed.currentPageId) ? parsed.currentPageId : pages[0].id,
      sidebarWidth: Math.min(420, Math.max(220, parsed.sidebarWidth || 268)),
      theme: parsed.theme === "dark" ? "dark" : "light",
      fontMode: ["balanced", "english", "chinese", "handwritten"].includes(parsed.fontMode) ? parsed.fontMode : "balanced",
      collapsedPages: parsed.collapsedPages && typeof parsed.collapsedPages === "object" ? parsed.collapsedPages : {},
      pages
    };
  } catch {
    return defaultState();
  }
}

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    flashSaved();
  }, 250);
}

function touchPage(page = currentPage()) {
  if (page) page.updatedAt = now();
}

function flashSaved() {
  const el = $("#savedHint");
  el.textContent = "已保存";
  el.classList.remove("fade");
  clearTimeout(savedHintTimer);
  savedHintTimer = setTimeout(() => el.classList.add("fade"), 1200);
}

function currentPage() {
  return state.pages.find(page => page.id === state.currentPageId) || state.pages[0];
}

function getPageById(id) {
  return state.pages.find(page => page.id === id);
}

function getChildren(parentId) {
  return state.pages.filter(page => (page.parentId || null) === (parentId || null));
}

function hasChildren(pageId) {
  return state.pages.some(page => page.parentId === pageId);
}

function getAncestors(pageId) {
  const chain = [];
  let cursor = getPageById(pageId);
  while (cursor) {
    chain.unshift(cursor);
    cursor = cursor.parentId ? getPageById(cursor.parentId) : null;
  }
  return chain;
}

function getDescendantIds(pageId) {
  const ids = [];
  const visit = parentId => {
    getChildren(parentId).forEach(child => {
      ids.push(child.id);
      visit(child.id);
    });
  };
  visit(pageId);
  return ids;
}

function getInsertIndexForChild(parentId) {
  const parentIndex = state.pages.findIndex(page => page.id === parentId);
  const descendants = getDescendantIds(parentId);
  if (!descendants.length) return parentIndex + 1;
  const lastDescendant = descendants[descendants.length - 1];
  return state.pages.findIndex(page => page.id === lastDescendant) + 1;
}

function applyTheme() {
  document.documentElement.dataset.theme = state.theme;
}

function applyFontMode() {
  document.documentElement.dataset.font = state.fontMode || "balanced";
  const select = $("#fontPreset");
  if (select) select.value = state.fontMode || "balanced";
}

function toggleTheme() {
  state.theme = state.theme === "light" ? "dark" : "light";
  applyTheme();
  scheduleSave();
}

function renderSidebar() {
  const list = $("#pageList");
  list.innerHTML = "";

  const renderBranch = (parentId = null, depth = 0) => {
    getChildren(parentId).forEach(page => {
      const li = document.createElement("li");
      const expanded = !state.collapsedPages[page.id];
      const childExists = hasChildren(page.id);
      li.className = `page-row depth-${Math.min(depth, 5)}${page.id === state.currentPageId ? " active" : ""}${expanded ? " expanded" : ""}`;
      li.dataset.id = page.id;
      li.innerHTML = `
        <button class="tree-toggle ${childExists ? "" : "empty"}" data-act="toggle" aria-label="切换子页面">
          <svg viewBox="0 0 20 20" width="12" height="12"><path fill="currentColor" d="M7 4.5 12.5 10 7 15.5"/></svg>
        </button>
        <span class="pr-icon">${page.icon || DEFAULT_PAGE_ICON}</span>
        <span class="pr-title">${escapeHTML(page.title || EMPTY_TITLE)}</span>
        <span class="pr-actions">
          <button class="icon-btn small" data-act="child" title="添加子页面">＋</button>
          <button class="icon-btn small" data-act="del" title="删除页面">✕</button>
        </span>`;
      li.addEventListener("click", event => {
        const action = event.target.closest("[data-act]")?.dataset.act;
        if (action === "toggle") {
          event.stopPropagation();
          togglePageTree(page.id);
          return;
        }
        if (action === "child") {
          event.stopPropagation();
          newPage(page.id);
          return;
        }
        if (action === "del") {
          event.stopPropagation();
          deletePage(page.id);
          return;
        }
        switchPage(page.id);
      });
      list.appendChild(li);
      if (childExists && expanded) renderBranch(page.id, depth + 1);
    });
  };

  renderBranch(null, 0);
  document.documentElement.style.setProperty("--sidebar-w", `${state.sidebarWidth}px`);
}

function togglePageTree(pageId) {
  state.collapsedPages[pageId] = !state.collapsedPages[pageId];
  scheduleSave();
  renderSidebar();
}

function switchPage(id) {
  state.currentPageId = id;
  activeOutlineId = null;
  scheduleSave();
  renderSidebar();
  renderPage();
}

function newPage(parentId = null) {
  const page = createPage(parentId);
  if (parentId) {
    const insertIndex = getInsertIndexForChild(parentId);
    state.pages.splice(insertIndex, 0, page);
    state.collapsedPages[parentId] = false;
  } else {
    state.pages.unshift(page);
  }
  state.currentPageId = page.id;
  scheduleSave();
  renderSidebar();
  renderPage();
  setTimeout(() => $("#pageTitle")?.focus(), 30);
}

function deletePage(id) {
  const target = getPageById(id);
  if (!target) return;
  if (state.pages.length <= 1) {
    toast("至少保留一个页面");
    return;
  }
  const descendants = getDescendantIds(id);
  const ok = confirm(descendants.length ? `删除该页面及其 ${descendants.length} 个子页面？` : "删除该页面？");
  if (!ok) return;

  const removeSet = new Set([id, ...descendants]);
  state.pages = state.pages.filter(page => !removeSet.has(page.id));
  removeSet.forEach(pageId => delete state.collapsedPages[pageId]);
  if (!state.pages.some(page => page.id === state.currentPageId)) state.currentPageId = state.pages[0].id;
  scheduleSave();
  renderSidebar();
  renderPage();
}

function renderCrumbs() {
  const items = getAncestors(currentPage().id);
  $("#crumbs").innerHTML = items.map((page, index) => {
    const item = `<button class="cr" data-id="${page.id}">${page.icon || DEFAULT_PAGE_ICON} ${escapeHTML(page.title || EMPTY_TITLE)}</button>`;
    return index === items.length - 1 ? item : `${item}<span class="sep">/</span>`;
  }).join("");
  $$(".crumbs .cr").forEach(button => button.addEventListener("click", () => switchPage(button.dataset.id)));
}

function renderOutline() {
  const root = $("#outlineBody");
  const headings = currentPage().blocks.filter(block => ["h1", "h2", "h3"].includes(block.type));
  if (!headings.length) {
    root.innerHTML = '<div class="outline-empty">添加 H1 / H2 / H3 后会显示目录</div>';
    return;
  }
  root.innerHTML = headings.map(block => `
    <button class="outline-item level-${block.type}${activeOutlineId === block.id ? " active" : ""}" data-id="${block.id}">
      ${escapeHTML(stripHTML(block.text) || BT_MAP[block.type].name)}
    </button>`).join("");
  $$(".outline-item", root).forEach(button => {
    button.addEventListener("click", () => {
      activeOutlineId = button.dataset.id;
      document.querySelector(`.block[data-id="${button.dataset.id}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      renderOutline();
    });
  });
}

function renderPage() {
  const page = currentPage();
  renderCrumbs();
  $("#pageTitle").textContent = page.title || "";
  $("#pageIcon").textContent = page.icon || DEFAULT_PAGE_ICON;
  const cover = $("#cover");
  if (page.cover) {
    cover.style.background = page.cover;
    cover.classList.add("has");
  } else {
    cover.style.background = "";
    cover.classList.remove("has");
  }
  renderBlocks();
  renderOutline();
}

function renderBlocks() {
  const root = $("#editor");
  root.innerHTML = "";
  const page = currentPage();
  if (!page.blocks.length) page.blocks.push(createBlock("paragraph"));

  let counter = 0;
  page.blocks.forEach(block => {
    if (block.type === "numbered") {
      counter += 1;
      block._num = counter;
    } else {
      counter = 0;
      delete block._num;
    }
    root.appendChild(buildBlockEl(block));
  });
  applySelectedBlockState();
}

function renderBlockInPlace(blockId) {
  const block = currentPage().blocks.find(item => item.id === blockId);
  const oldEl = document.querySelector(`.block[data-id="${blockId}"]`);
  if (!block || !oldEl) return;
  oldEl.replaceWith(buildBlockEl(block));
  applySelectedBlockState();
}

function setSelectedBlock(blockId = null) {
  selectedBlockId = blockId;
  applySelectedBlockState();
}

function applySelectedBlockState() {
  $$(".block").forEach(blockEl => {
    blockEl.classList.toggle("is-selected", blockEl.dataset.id === selectedBlockId);
  });
}

function buildBlockEl(block) {
  const el = document.createElement("div");
  el.className = "block";
  el.dataset.id = block.id;
  el.dataset.type = block.type;
  if (block.type === "todo") el.dataset.checked = block.checked ? "true" : "false";
  el.addEventListener("mousedown", (event) => {
    if (!event.target.closest(".block-handles") && !["table", "image", "ai"].includes(block.type)) {
      setSelectedBlock(null);
    }
  });

  const handles = document.createElement("div");
  handles.className = "block-handles";
  handles.innerHTML = `
    <button class="handle" data-act="add" title="添加块">
      <svg viewBox="0 0 20 20" width="13" height="13"><path fill="currentColor" d="M10 4a1 1 0 0 1 1 1v4h4a1 1 0 1 1 0 2h-4v4a1 1 0 1 1-2 0v-4H5a1 1 0 1 1 0-2h4V5a1 1 0 0 1 1-1Z"/></svg>
    </button>
    <button class="handle drag" title="拖拽 / 转换" draggable="true">
      <svg viewBox="0 0 20 20" width="13" height="13"><path fill="currentColor" d="M7 4a1 1 0 1 1 0 2 1 1 0 0 1 0-2Zm6 0a1 1 0 1 1 0 2 1 1 0 0 1 0-2ZM7 9a1 1 0 1 1 0 2 1 1 0 0 1 0-2Zm6 0a1 1 0 1 1 0 2 1 1 0 0 1 0-2ZM7 14a1 1 0 1 1 0 2 1 1 0 0 1 0-2Zm6 0a1 1 0 1 1 0 2 1 1 0 0 1 0-2Z"/></svg>
    </button>`;
  el.appendChild(handles);

  handles.querySelector('[data-act="add"]').addEventListener("click", () => insertBlockAfter(block.id, createBlock("paragraph"), true));
  const drag = handles.querySelector(".drag");
  drag.addEventListener("dragstart", event => onDragStart(event, block.id, el));
  drag.addEventListener("click", event => {
    if (event.detail === 1) showBlockMenu(block.id, drag);
  });

  if (["bullet", "numbered", "todo"].includes(block.type)) {
    const marker = document.createElement("div");
    marker.className = "li-marker";
    if (block.type === "numbered") marker.textContent = `${block._num || 1}.`;
    if (block.type === "todo") {
      const check = document.createElement("button");
      check.className = `todo-check${block.checked ? " on" : ""}`;
      check.addEventListener("click", () => {
        block.checked = !block.checked;
        el.dataset.checked = block.checked ? "true" : "false";
        check.classList.toggle("on", block.checked);
        touchPage();
        scheduleSave();
      });
      marker.appendChild(check);
    }
    el.appendChild(marker);
  }

  if (block.type === "callout") {
    const emoji = document.createElement("span");
    emoji.className = "callout-emoji";
    emoji.textContent = block.emoji || DEFAULT_CALLOUT_ICON;
    emoji.addEventListener("click", () => {
      const value = prompt("输入一个 emoji", block.emoji || DEFAULT_CALLOUT_ICON);
      if (!value) return;
      block.emoji = value.trim();
      emoji.textContent = block.emoji;
      touchPage();
      scheduleSave();
    });
    el.appendChild(emoji);
  }

  if (block.type === "image") {
    el.appendChild(buildImageBlock(block));
  } else if (block.type === "table") {
    el.appendChild(buildTableBlock(block));
  } else if (block.type === "ai") {
    el.appendChild(buildAIBlock(block));
  } else {
    const content = document.createElement("div");
    content.className = "b-content";
    content.contentEditable = block.type === "divider" ? "false" : "true";
    content.spellcheck = false;
    content.dataset.placeholder = BT_MAP[block.type]?.ph || "";
    content.innerHTML = block.text || "";
    attachBlockEvents(content, block);
    el.appendChild(content);
  }

  el.addEventListener("dragover", onDragOver);
  el.addEventListener("dragleave", () => el.classList.remove("drop-before", "drop-after"));
  el.addEventListener("drop", onDrop);
  return el;
}

function buildImageBlock(block) {
  const wrap = document.createElement("div");
  wrap.className = "image-wrap";
  wrap.tabIndex = 0;
  wrap.style.setProperty("--image-width", `${block.imageWidth || 100}%`);
  wrap.addEventListener("focus", () => setSelectedBlock(block.id));
  wrap.addEventListener("mousedown", event => {
    if (event.target.closest(".image-resize-handle")) {
      return;
    }
    if (!event.target.closest(".block-handles")) {
      setSelectedBlock(block.id);
    }
  });
  wrap.addEventListener("keydown", event => {
    if ((event.key === "Backspace" || event.key === "Delete") && !event.target.closest(".image-caption")) {
      event.preventDefault();
      removeBlock(block.id);
    }
  });

  if (!block.src) {
    const empty = document.createElement("div");
    empty.className = "image-empty";
    empty.textContent = "直接粘贴图片到笔记中即可";
    wrap.appendChild(empty);
    return wrap;
  }
  const frame = document.createElement("div");
  frame.className = "image-frame";

  const img = document.createElement("img");
  img.className = "image-block";
  img.src = block.src;
  img.alt = block.caption || "笔记图片";
  img.addEventListener("click", () => openImagePreview(block.src, block.caption));
  frame.appendChild(img);

  const resizeHandle = document.createElement("button");
  resizeHandle.className = "image-resize-handle";
  resizeHandle.type = "button";
  resizeHandle.setAttribute("aria-label", "缩放图片");
  enableImageResize(resizeHandle, block.id);
  frame.appendChild(resizeHandle);

  wrap.appendChild(frame);

  const caption = document.createElement("div");
  caption.className = "image-caption";
  caption.contentEditable = "true";
  caption.spellcheck = false;
  caption.dataset.placeholder = "写点图片说明…";
  caption.textContent = block.caption || "";
  caption.addEventListener("input", () => {
    block.caption = caption.textContent.trim();
    touchPage();
    scheduleSave();
  });
  caption.addEventListener("keydown", event => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      createParagraphAfter(block.id);
    }
  });
  wrap.appendChild(caption);
  return wrap;
}

function buildTableBlock(block) {
  const wrap = document.createElement("div");
  wrap.className = "table-wrap";
  wrap.tabIndex = 0;
  wrap.addEventListener("focus", () => setSelectedBlock(block.id));
  wrap.addEventListener("mousedown", event => {
    if (!event.target.closest(".table-cell")) setSelectedBlock(block.id);
  });
  wrap.addEventListener("keydown", event => {
    if ((event.key === "Backspace" || event.key === "Delete") && selectedBlockId === block.id) {
      event.stopPropagation();
      event.preventDefault();
      const sel = activeTableSelection;
      
      if (sel?.blockId === block.id) {
        if (sel.mode === "range") {
          deleteTableRange(block.id, sel.startRow, sel.endRow, sel.startCol, sel.endCol);
          return;
        }
        if (sel.mode === "row") {
          deleteTableRow(block.id, sel.row);
          return;
        }
        if (sel.mode === "col") {
          deleteTableCol(block.id, sel.col);
          return;
        }
        return;
      }
      
      if (!event.target.closest(".table-cell")) {
        removeBlock(block.id);
      }
    }
  });
  const cols = block.rows[0]?.length || 0;
  wrap.innerHTML = `
    <div class="table-scroll">
      <table class="table-grid"><tbody></tbody></table>
    </div>`;

  const tbody = $("tbody", wrap);
  let isSelecting = false;
  let selectionStart = null;

  block.rows.forEach((row, rowIndex) => {
    const tr = document.createElement("tr");
    tr.className = "table-row";
    row.forEach((cell, colIndex) => {
      const holder = document.createElement(rowIndex === 0 ? "th" : "td");
      const cellEl = document.createElement("div");
      cellEl.className = "table-cell";
      cellEl.contentEditable = "true";
      cellEl.spellcheck = false;
      cellEl.dataset.row = String(rowIndex);
      cellEl.dataset.col = String(colIndex);
      cellEl.dataset.placeholder = rowIndex === 0 ? `列 ${colIndex + 1}` : "输入内容";
      cellEl.innerHTML = cell || "";
      attachTableCellEvents(cellEl, block);
      holder.appendChild(cellEl);
      tr.appendChild(holder);

      cellEl.addEventListener("mousedown", event => {
        if (event.button === 0) {
          isSelecting = true;
          selectionStart = { row: rowIndex, col: colIndex };
          activeTableSelection = {
            blockId: block.id,
            mode: "range",
            startRow: rowIndex,
            endRow: rowIndex,
            startCol: colIndex,
            endCol: colIndex
          };
          setSelectedBlock(block.id);
          updateTableSelectionHighlight(block.id, wrap);
        }
      });
    });
    tbody.appendChild(tr);
  });

  wrap.addEventListener("mousemove", event => {
    if (!isSelecting || activeTableSelection?.blockId !== block.id) return;
    const cell = event.target.closest(".table-cell");
    if (!cell) return;
    const row = Number(cell.dataset.row);
    const col = Number(cell.dataset.col);
    activeTableSelection = {
      blockId: block.id,
      mode: "range",
      startRow: Math.min(selectionStart.row, row),
      endRow: Math.max(selectionStart.row, row),
      startCol: Math.min(selectionStart.col, col),
      endCol: Math.max(selectionStart.col, col)
    };
    updateTableSelectionHighlight(block.id, wrap);
  });

  wrap.addEventListener("mouseup", () => {
    isSelecting = false;
  });

  wrap.addEventListener("mouseleave", () => {
    isSelecting = false;
  });

  const scroll = $(".table-scroll", wrap);
  wrap.appendChild(buildTableEdgeControls(block, scroll));
  updateTableSelectionHighlight(block.id, wrap);

  return wrap;
}

function buildAIBlock(block) {
  const wrap = document.createElement("div");
  wrap.className = "ai-wrap";
  wrap.tabIndex = 0;
  wrap.addEventListener("focus", () => setSelectedBlock(block.id));
  wrap.addEventListener("mousedown", event => {
    if (!event.target.closest(".block-handles")) setSelectedBlock(block.id);
  });

  const status = block.isLoading ? "AI writing..." : "AI Writer";
  const helper = document.createElement("div");
  helper.className = "ai-block-head";
  helper.innerHTML =         `
    <div class="ai-chip">${status}</div>
    <div class="ai-meta">Generated note blocks will be inserted directly below this card.</div>`;
  wrap.appendChild(helper);

  const messages = document.createElement("div");
  messages.className = "ai-messages";
  if (block.messages.length) {
    messages.innerHTML = block.messages.map(message =>       `
      <div class="ai-message ${message.role}">
        <div class="ai-message-role">${message.role === "assistant" ? "AI" : "You"}</div>
        <div class="ai-message-body">${plainTextToHTML(message.content)}</div>
      </div>`).join("");
  } else {
    messages.innerHTML =       `
      <div class="ai-empty">
        Describe what you want to write. The AI will create native note blocks such as paragraphs, quotes, tables, todos, and callouts.
      </div>`;
  }
  wrap.appendChild(messages);

  if (block.error) {
    const error = document.createElement("div");
    error.className = "ai-error";
    error.textContent = block.error;
    wrap.appendChild(error);
  }

  const composer = document.createElement("div");
  composer.className = "ai-composer";

  const input = document.createElement("textarea");
  input.className = "ai-input";
  input.rows = 1;
  input.placeholder = "Example: Write meeting notes about backend monitoring, with a summary, action items, and a comparison table.";
  input.value = block.draft || "";
  input.disabled = block.isLoading;
  autoResizeTextarea(input);
  input.addEventListener("input", () => {
    block.draft = input.value;
    block.error = "";
    autoResizeTextarea(input);
    touchPage();
    scheduleSave();
  });
  input.addEventListener("keydown", event => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      requestAIWrite(block.id);
    }
  });
  composer.appendChild(input);

  const send = document.createElement("button");
  send.className = "ai-send";
  send.type = "button";
  send.textContent = block.isLoading ? "Working..." : "Send";
  send.disabled = block.isLoading;
  send.addEventListener("click", () => requestAIWrite(block.id));
  composer.appendChild(send);

  wrap.appendChild(composer);
  return wrap;
}

function updateTableSelectionHighlight(blockId, wrap) {
  const cells = $$(".table-cell", wrap);
  const sel = activeTableSelection;
  cells.forEach(cell => {
    const row = Number(cell.dataset.row);
    const col = Number(cell.dataset.col);
    const holder = cell.parentElement;
    holder.classList.remove("table-selected");
    if (sel?.blockId === blockId) {
      if (sel.mode === "range") {
        if (row >= sel.startRow && row <= sel.endRow && col >= sel.startCol && col <= sel.endCol) {
          holder.classList.add("table-selected");
        }
      } else if (sel.mode === "row" && sel.row === row) {
        holder.classList.add("table-selected");
      } else if (sel.mode === "col" && sel.col === col) {
        holder.classList.add("table-selected");
      }
    }
  });
}

function buildTableEdgeControls(block, scrollEl) {
  const layer = document.createElement("div");
  layer.className = "table-edge-controls";

  const top = document.createElement("div");
  top.className = "table-col-adders";
  block.rows[0].forEach((_, colIndex) => {
    const control = document.createElement("button");
    control.className = `table-edge-btn col-btn`;
    control.type = "button";
    control.textContent = "+";
    control.title = `在列 ${colIndex + 1} 右侧添加列`;
    control.dataset.col = String(colIndex);
    control.addEventListener("click", event => {
      event.stopPropagation();
      addTableCol(block.id, colIndex);
    });
    top.appendChild(control);
  });
  const addCol = document.createElement("button");
  addCol.className = "table-edge-btn table-edge-plus";
  addCol.type = "button";
  addCol.textContent = "+";
  addCol.title = "末尾添加列";
  addCol.addEventListener("click", event => {
    event.stopPropagation();
    addTableCol(block.id);
  });
  top.appendChild(addCol);

  const side = document.createElement("div");
  side.className = "table-row-adders";
  block.rows.forEach((_, rowIndex) => {
    const control = document.createElement("button");
    control.className = `table-edge-btn row-btn`;
    control.type = "button";
    control.textContent = "+";
    control.title = `在行 ${rowIndex + 1} 下方添加行`;
    control.dataset.row = String(rowIndex);
    control.addEventListener("click", event => {
      event.stopPropagation();
      addTableRow(block.id, rowIndex);
    });
    side.appendChild(control);
  });
  const addRow = document.createElement("button");
  addRow.className = "table-edge-btn table-edge-plus";
  addRow.type = "button";
  addRow.textContent = "+";
  addRow.title = "末尾添加行";
  addRow.addEventListener("click", event => {
    event.stopPropagation();
    addTableRow(block.id);
  });
  side.appendChild(addRow);

  layer.appendChild(top);
  layer.appendChild(side);
  requestAnimationFrame(() => positionTableEdgeControls(layer));
  return layer;
}

function positionTableEdgeControls(layer) {
  const wrap = layer.closest(".table-wrap");
  if (!wrap) return;
  const rows = $$("tr", wrap);
  const firstRowCells = rows[0] ? [...rows[0].children] : [];
  $$(".col-btn", layer).forEach(button => {
    const col = Number(button.dataset.col);
    const cell = firstRowCells[col];
    if (!cell) return;
    button.style.left = `${cell.offsetLeft + cell.offsetWidth - 10}px`;
  });
  $$(".row-btn", layer).forEach(button => {
    const row = Number(button.dataset.row);
    const tr = rows[row];
    if (!tr) return;
    button.style.top = `${tr.offsetTop + tr.offsetHeight - 10}px`;
  });
}

function attachBlockEvents(content, block) {
  let composing = false;

  const onInput = () => {
    if (composing) return;
    block.text = content.innerHTML;
    const plain = content.textContent;
    const map = [
      [/^# $/, "h1"], [/^## $/, "h2"], [/^### $/, "h3"],
      [/^- $/, "bullet"], [/^\* $/, "bullet"],
      [/^1\. $/, "numbered"],
      [/^\[\] $/, "todo"], [/^\[\s\] $/, "todo"],
      [/^> $/, "quote"],
      [/^``` $/, "code"], [/^--- $/, "divider"]
    ];
    for (const [re, type] of map) {
      if (!re.test(plain)) continue;
      applyBlockType(block, type, true);
      return;
    }
    touchPage();
    scheduleSave();
    renderOutline();
  };

  content.addEventListener("compositionstart", () => { composing = true; });
  content.addEventListener("compositionend", () => {
    composing = false;
    onInput();
  });
  content.addEventListener("input", onInput);

  content.addEventListener("keydown", event => {
    if (slashMenu.open && ["ArrowUp", "ArrowDown", "Enter", "Escape"].includes(event.key)) return;

    if (event.key === "/" && !slashMenu.open) {
      setTimeout(() => openSlashMenu(block.id, content), 0);
      return;
    }

    if (event.key === "Enter" && !event.shiftKey && !composing) {
      event.preventDefault();
      if (["bullet", "numbered", "todo", "quote", "callout"].includes(block.type) && plainText(content) === "") {
        applyBlockType(block, "paragraph", false);
        return;
      }
      const caret = caretOffset(content);
      const html = content.innerHTML;
      const before = html.slice(0, caret);
      const after = html.slice(caret);
      block.text = before;
      const nextType = ["bullet", "numbered", "todo"].includes(block.type) ? block.type : "paragraph";
      insertBlockAfter(block.id, createBlock(nextType, { text: after, checked: false }), true);
      touchPage();
      scheduleSave();
      return;
    }

    if (event.key === "Backspace") {
      const caret = caretOffset(content);
      if (caret === 0 && plainText(content) === "" && currentPage().blocks.length > 1) {
        event.preventDefault();
        removeBlock(block.id);
        return;
      }
      if (caret === 0 && !["paragraph", "divider"].includes(block.type)) {
        event.preventDefault();
        applyBlockType(block, "paragraph", false);
        return;
      }
    }

    if (event.key === "ArrowUp") {
      const caret = caretOffset(content);
      if (caret === 0) {
        event.preventDefault();
        focusSiblingBlock(block.id, -1, "end");
      }
    }

    if (event.key === "ArrowDown") {
      const caret = caretOffset(content);
      if (caret >= plainText(content).length) {
        event.preventDefault();
        focusSiblingBlock(block.id, 1, "start");
      }
    }

    if ((event.metaKey || event.ctrlKey) && /^(b|B)$/u.test(event.key)) {
      event.preventDefault();
      document.execCommand("bold");
      onInput();
    }

    if ((event.metaKey || event.ctrlKey) && /^(i|I)$/u.test(event.key)) {
      event.preventDefault();
      document.execCommand("italic");
      onInput();
    }
  });

  content.addEventListener("focus", () => {
    if (["h1", "h2", "h3"].includes(block.type)) {
      activeOutlineId = block.id;
      renderOutline();
    }
  });

  content.addEventListener("paste", event => {
    const clipboard = event.clipboardData || window.clipboardData;
    const items = [...(clipboard?.items || [])];
    const imageItem = items.find(item => item.type?.startsWith("image/"));
    if (imageItem) {
      event.preventDefault();
      const file = imageItem.getAsFile?.();
      if (file) insertImagesFromFiles([file], block.id);
      return;
    }
    event.preventDefault();
    const text = clipboard.getData("text/plain");
    document.execCommand("insertText", false, text);
  });
}

function attachTableCellEvents(cell, block) {
  cell.addEventListener("input", () => {
    const row = Number(cell.dataset.row);
    const col = Number(cell.dataset.col);
    block.rows[row][col] = cell.innerHTML;
    touchPage();
    scheduleSave();
  });

  cell.addEventListener("focus", () => {
    activeOutlineId = null;
    activeTableSelection = { blockId: block.id, mode: "cell", row: Number(cell.dataset.row), col: Number(cell.dataset.col) };
    setSelectedBlock(block.id);
    renderOutline();
    const wrap = cell.closest(".table-wrap");
    if (wrap) updateTableSelectionHighlight(block.id, wrap);
  });

  cell.addEventListener("keydown", event => {
    const row = Number(cell.dataset.row);
    const col = Number(cell.dataset.col);
    const maxRow = block.rows.length - 1;
    const maxCol = block.rows[0].length - 1;

    if (event.key === "Tab") {
      event.preventDefault();
      if (row === maxRow && col === maxCol) addTableRow(block.id);
      focusTableCell(block.id, col === maxCol ? row + 1 : row, col === maxCol ? 0 : col + 1);
      return;
    }

    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if ((event.metaKey || event.ctrlKey) && row === maxRow) {
        createParagraphAfter(block.id);
        return;
      }
      if (row === maxRow) addTableRow(block.id);
      focusTableCell(block.id, Math.min(row + 1, block.rows.length - 1), col);
      return;
    }

    if (event.key === "ArrowLeft" && caretOffset(cell) === 0 && col > 0) {
      event.preventDefault();
      focusTableCell(block.id, row, col - 1, "end");
      return;
    }

    if (event.key === "ArrowRight" && caretOffset(cell) >= plainText(cell).length && col < maxCol) {
      event.preventDefault();
      focusTableCell(block.id, row, col + 1, "start");
      return;
    }

    if (event.key === "ArrowUp" && row > 0 && caretOffset(cell) === 0) {
      event.preventDefault();
      focusTableCell(block.id, row - 1, col, "start");
      return;
    }

    if (event.key === "ArrowDown" && caretOffset(cell) >= plainText(cell).length) {
      event.preventDefault();
      if (row < maxRow) focusTableCell(block.id, row + 1, col, "end");
      else createParagraphAfter(block.id);
    }
  });

  cell.addEventListener("paste", event => {
    event.preventDefault();
    const text = (event.clipboardData || window.clipboardData).getData("text/plain");
    document.execCommand("insertText", false, text);
  });
}

function focusSiblingBlock(blockId, offset, where) {
  const blocks = currentPage().blocks;
  const index = blocks.findIndex(block => block.id === blockId);
  const target = blocks[index + offset];
  if (target) focusBlock(target.id, where);
}

function focusBlock(id, where = "start") {
  requestAnimationFrame(() => {
    const editable = document.querySelector(`.block[data-id="${id}"] .b-content`);
    if (editable && editable.contentEditable !== "false") {
      placeCaret(editable, where);
      return;
    }
    const caption = document.querySelector(`.block[data-id="${id}"] .image-caption`);
    if (caption) {
      placeCaret(caption, where);
      return;
    }
    const tableCell = document.querySelector(`.block[data-id="${id}"] .table-cell`);
    if (tableCell) {
      placeCaret(tableCell, "start");
      return;
    }
    const aiInput = document.querySelector(`.block[data-id="${id}"] .ai-input`);
    if (aiInput) {
      aiInput.focus();
      aiInput.setSelectionRange?.(aiInput.value.length, aiInput.value.length);
      return;
    }
    const shell = document.querySelector(`.block[data-id="${id}"] .table-wrap, .block[data-id="${id}"] .image-wrap`);
    shell?.focus?.();
  });
}

function focusTableCell(blockId, row, col, where = "start") {
  requestAnimationFrame(() => {
    const cell = document.querySelector(`.block[data-id="${blockId}"] .table-cell[data-row="${row}"][data-col="${col}"]`);
    if (cell) placeCaret(cell, where);
  });
}

function placeCaret(el, where = "start") {
  el.focus();
  const range = document.createRange();
  const sel = window.getSelection();
  range.selectNodeContents(el);
  range.collapse(where !== "end");
  sel.removeAllRanges();
  sel.addRange(range);
}

function insertBlockAfter(afterId, block, focus = false) {
  const page = currentPage();
  const index = page.blocks.findIndex(item => item.id === afterId);
  const normalized = normalizeBlock(block);
  page.blocks.splice(index + 1, 0, normalized);
  touchPage();
  scheduleSave();
  renderBlocks();
  renderOutline();
  if (focus) focusBlock(normalized.id, "start");
}

function insertBlocksAfter(afterId, blocks, focus = false) {
  const page = currentPage();
  const index = page.blocks.findIndex(item => item.id === afterId);
  if (index < 0 || !Array.isArray(blocks) || !blocks.length) return [];
  const normalized = blocks.map(normalizeBlock);
  page.blocks.splice(index + 1, 0, ...normalized);
  touchPage();
  scheduleSave();
  renderBlocks();
  renderOutline();
  if (focus && normalized[0]) focusBlock(normalized[0].id, "start");
  return normalized.map(block => block.id);
}

function createParagraphAfter(blockId) {
  const block = createBlock("paragraph");
  insertBlockAfter(blockId, block, true);
}

function removeBlock(blockId) {
  const page = currentPage();
  const index = page.blocks.findIndex(block => block.id === blockId);
  if (index < 0 || page.blocks.length <= 1) return;
  if (selectedBlockId === blockId) setSelectedBlock(null);
  if (activeTableSelection?.blockId === blockId) activeTableSelection = null;
  page.blocks.splice(index, 1);
  touchPage();
  scheduleSave();
  renderBlocks();
  renderOutline();
  const target = page.blocks[Math.max(0, index - 1)];
  if (target) focusBlock(target.id, "end");
}

function applyBlockType(block, type, shouldFocusEnd) {
  block.type = type;
  if (type === "todo") block.checked = false;
  else delete block.checked;
  if (type === "callout") block.emoji = block.emoji || DEFAULT_CALLOUT_ICON;
  else delete block.emoji;
  if (type === "table") {
    block.rows = normalizeTableRows(block.rows);
    delete block.text;
    delete block.messages;
    delete block.draft;
    delete block.error;
    delete block.isLoading;
  } else if (type === "ai") {
    block.messages = normalizeAIMessages(block.messages);
    block.draft = typeof block.draft === "string" ? block.draft : "";
    block.error = "";
    block.isLoading = false;
    delete block.text;
    delete block.rows;
  } else {
    block.text = type === "divider" ? "" : (block.text || "");
    delete block.rows;
    delete block.messages;
    delete block.draft;
    delete block.error;
    delete block.isLoading;
  }
  touchPage();
  scheduleSave();
  renderBlocks();
  renderOutline();
  if (shouldFocusEnd) focusBlock(block.id, "end");
}

function addTableRow(blockId, afterRow = null) {
  const block = currentPage().blocks.find(item => item.id === blockId);
  if (!block || block.type !== "table") return;
  const cols = block.rows[0]?.length || 1;
  const insertAt = afterRow == null ? block.rows.length : afterRow + 1;
  block.rows.splice(insertAt, 0, Array.from({ length: cols }, () => ""));
  touchPage();
  scheduleSave();
  renderBlockInPlace(blockId);
}

function addTableCol(blockId, afterCol = null) {
  const block = currentPage().blocks.find(item => item.id === blockId);
  if (!block || block.type !== "table") return;
  const insertAt = afterCol == null ? block.rows[0].length : afterCol + 1;
  block.rows = block.rows.map((row, index) => {
    const next = [...row];
    next.splice(insertAt, 0, index === 0 ? `列 ${insertAt + 1}` : "");
    return next;
  });
  touchPage();
  scheduleSave();
  renderBlockInPlace(blockId);
}

function deleteTableRow(blockId, rowIndex = null) {
  const block = currentPage().blocks.find(item => item.id === blockId);
  if (!block || block.type !== "table") return;
  if (block.rows.length <= 2) {
    removeBlock(blockId);
    return;
  }
  const row = rowIndex ?? (activeTableSelection?.blockId === blockId ? activeTableSelection.row : block.rows.length - 1);
  block.rows.splice(Math.max(1, row), 1);
  activeTableSelection = { blockId, mode: "row", row: Math.max(1, Math.min(row, block.rows.length - 1)) };
  touchPage();
  scheduleSave();
  renderBlockInPlace(blockId);
}

function deleteTableCol(blockId, colIndex = null) {
  const block = currentPage().blocks.find(item => item.id === blockId);
  if (!block || block.type !== "table") return;
  if ((block.rows[0]?.length || 0) <= 1) {
    removeBlock(blockId);
    return;
  }
  const col = colIndex ?? (activeTableSelection?.blockId === blockId ? activeTableSelection.col : (block.rows[0].length - 1));
  block.rows = block.rows.map(row => row.filter((_, index) => index !== col));
  activeTableSelection = { blockId, mode: "col", col: Math.max(0, Math.min(col, block.rows[0].length - 1)) };
  touchPage();
  scheduleSave();
  renderBlockInPlace(blockId);
}

function deleteTableRange(blockId, startRow, endRow, startCol, endCol) {
  const block = currentPage().blocks.find(item => item.id === blockId);
  if (!block || block.type !== "table") return;
  
  const totalRows = block.rows.length;
  const totalCols = block.rows[0].length;
  
  const isFullRow = (startCol === 0 && endCol === totalCols - 1);
  const isFullColumn = (startRow === 0 && endRow === totalRows - 1);
  
  if (isFullRow) {
    for (let r = endRow; r >= startRow; r--) {
      if (block.rows.length > 2) {
        block.rows.splice(r, 1);
      }
    }
  } else if (isFullColumn) {
    for (let r = 0; r < block.rows.length; r++) {
      for (let c = endCol; c >= startCol; c--) {
        if (block.rows[r].length > 1) {
          block.rows[r].splice(c, 1);
        }
      }
    }
  } else {
    for (let r = startRow; r <= endRow; r++) {
      for (let c = startCol; c <= endCol; c++) {
        if (block.rows[r] && block.rows[r][c] !== undefined) {
          block.rows[r][c] = "";
        }
      }
    }
  }
  
  activeTableSelection = null;
  touchPage();
  scheduleSave();
  renderBlockInPlace(blockId);
}

function setImageWidth(blockId, width) {
  const block = currentPage().blocks.find(item => item.id === blockId);
  if (!block || block.type !== "image") return;
  block.imageWidth = width;
  touchPage();
  scheduleSave();
  renderBlockInPlace(blockId);
}

function enableImageResize(handle, blockId) {
  handle.addEventListener("mousedown", event => {
    event.preventDefault();
    event.stopPropagation();
    const block = currentPage().blocks.find(item => item.id === blockId);
    const wrap = document.querySelector(`.block[data-id="${blockId}"] .image-wrap`);
    if (!block || !wrap) return;
    const containerWidth = wrap.parentElement?.clientWidth || wrap.clientWidth || 1;
    const startX = event.clientX;
    const startWidth = block.imageWidth || 100;

    function onMove(moveEvent) {
      const deltaPx = moveEvent.clientX - startX;
      const nextWidth = Math.min(100, Math.max(20, startWidth + (deltaPx / containerWidth) * 100));
      block.imageWidth = Math.round(nextWidth);
      wrap.style.setProperty("--image-width", `${block.imageWidth}%`);
    }

    function onUp() {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      touchPage();
      scheduleSave();
      renderBlockInPlace(blockId);
    }

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  });
}

function openImagePreview(src, caption = "") {
  $("#imagePreviewImg").src = src;
  $("#imagePreviewImg").alt = caption || "图片预览";
  $("#imagePreviewMask").hidden = false;
}

function closeImagePreview() {
  $("#imagePreviewMask").hidden = true;
}

function plainText(el) {
  return (el.textContent || "").replace(/\u200B/g, "");
}

function stripHTML(html) {
  return (html || "").replace(/<[^>]+>/g, "").trim();
}

function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function getActiveBlockId() {
  return document.activeElement?.closest?.(".block")?.dataset?.id || currentPage().blocks[currentPage().blocks.length - 1]?.id;
}

async function insertImagesFromFiles(files, afterId = getActiveBlockId()) {
  const validFiles = [...files].filter(file => file.type?.startsWith("image/"));
  if (!validFiles.length) return;
  const page = currentPage();
  const insertBase = Math.max(0, page.blocks.findIndex(block => block.id === afterId));
  let offset = 1;
  for (const file of validFiles) {
    const src = await readFileAsDataURL(file);
    const imageBlock = normalizeBlock({
      id: uid(),
      type: "image",
      src,
      caption: file.name?.replace(/\.[^.]+$/, "") || "图片",
      imageWidth: 100
    });
    page.blocks.splice(insertBase + offset, 0, imageBlock);
    offset += 1;
  }
  touchPage();
  scheduleSave();
  renderBlocks();
  renderOutline();
}

function autoResizeTextarea(textarea) {
  textarea.style.height = "auto";
  textarea.style.height = `${Math.min(220, Math.max(52, textarea.scrollHeight))}px`;
}

function plainTextToHTML(value) {
  return escapeHTML(String(value || "")).replace(/\n/g, "<br>");
}

function serializeBlockForAI(block) {
  if (!block || block.type === "ai") return null;
  if (block.type === "table") {
    return {
      type: "table",
      rows: block.rows.map(row => row.map(cell => stripHTML(cell)))
    };
  }
  if (block.type === "image") {
    return {
      type: "image",
      caption: block.caption || ""
    };
  }
  return {
    type: block.type,
    text: stripHTML(block.text || "")
  };
}

function collectAIContextBlocks(anchorId) {
  const page = currentPage();
  const anchorIndex = page.blocks.findIndex(item => item.id === anchorId);
  if (anchorIndex < 0) return [];
  return page.blocks
    .slice(Math.max(0, anchorIndex - 10), anchorIndex)
    .map(serializeBlockForAI)
    .filter(Boolean);
}

function normalizeAIResponseBlock(spec) {
  if (!spec || typeof spec !== "object") return null;
  const type = typeof spec.type === "string" ? spec.type.trim() : "";
  if (!AI_WRITABLE_TYPES.has(type)) return null;

  if (type === "divider") return createBlock("divider");

  if (type === "table") {
    const rows = Array.isArray(spec.rows)
      ? spec.rows.map(row => Array.isArray(row) ? row.map(cell => plainTextToHTML(String(cell ?? ""))) : [])
      : [];
    return createBlock("table", { rows });
  }

  const text = typeof spec.text === "string" ? spec.text.trim() : "";
  if (!text) return null;

  const data = { text: plainTextToHTML(text) };
  if (type === "todo") data.checked = !!spec.checked;
  if (type === "callout") data.emoji = typeof spec.emoji === "string" && spec.emoji.trim() ? spec.emoji.trim() : DEFAULT_CALLOUT_ICON;
  return createBlock(type, data);
}

function normalizeAIResponseBlocks(blocks, fallbackText = "") {
  const normalized = Array.isArray(blocks) ? blocks.map(normalizeAIResponseBlock).filter(Boolean) : [];
  if (normalized.length) return normalized;
  const fallback = typeof fallbackText === "string" ? fallbackText.trim() : "";
  return fallback ? [createBlock("paragraph", { text: plainTextToHTML(fallback) })] : [];
}

async function requestAIWrite(blockId) {
  const block = currentPage().blocks.find(item => item.id === blockId);
  if (!block || block.type !== "ai" || block.isLoading) return;

  const prompt = (block.draft || "").trim();
  if (!prompt) {
    toast("Please enter a request first.");
    return;
  }

  block.messages = [...block.messages, { role: "user", content: prompt }];
  block.draft = "";
  block.error = "";
  block.isLoading = true;
  touchPage();
  scheduleSave();
  renderBlockInPlace(blockId);

  try {
    const response = await fetch("/api/ai/compose", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        pageTitle: currentPage().title || "",
        contextBlocks: collectAIContextBlocks(blockId),
        messages: block.messages
      })
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload?.error || `AI request failed (${response.status})`);
    }

    const latestBlock = currentPage().blocks.find(item => item.id === blockId);
    if (!latestBlock || latestBlock.type !== "ai") return;

    const reply = typeof payload.reply === "string" && payload.reply.trim() ? payload.reply.trim() : "I generated note content based on your request.";
    latestBlock.messages = [...latestBlock.messages, { role: "assistant", content: reply }];
    latestBlock.isLoading = false;
    latestBlock.error = "";

    const nextBlocks = normalizeAIResponseBlocks(payload.blocks, reply);
    if (nextBlocks.length) {
      insertBlocksAfter(latestBlock.id, nextBlocks, true);
    } else {
      touchPage();
      scheduleSave();
      renderBlockInPlace(blockId);
    }
  } catch (error) {
    const latestBlock = currentPage().blocks.find(item => item.id === blockId);
    if (!latestBlock || latestBlock.type !== "ai") return;
    latestBlock.isLoading = false;
    latestBlock.error = error instanceof Error ? error.message : "AI generation failed.";
    touchPage();
    scheduleSave();
    renderBlockInPlace(blockId);
    toast(latestBlock.error);
  }
}

function caretOffset(el) {
  const sel = window.getSelection();
  if (!sel.rangeCount) return 0;
  const range = sel.getRangeAt(0).cloneRange();
  range.selectNodeContents(el);
  range.setEnd(sel.getRangeAt(0).endContainer, sel.getRangeAt(0).endOffset);
  return range.toString().length;
}

function onDragStart(event, id, el) {
  dragId = id;
  el.classList.add("dragging");
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", id);
  const preview = el.cloneNode(true);
  preview.style.position = "absolute";
  preview.style.top = "-9999px";
  preview.style.opacity = "0.85";
  document.body.appendChild(preview);
  event.dataTransfer.setDragImage(preview, 10, 10);
  setTimeout(() => preview.remove(), 0);
  document.addEventListener("dragend", onDragEnd, { once: true });
}

function onDragEnd() {
  dragId = null;
  $$(".block").forEach(block => block.classList.remove("dragging", "drop-before", "drop-after"));
}

function onDragOver(event) {
  if (!dragId) return;
  event.preventDefault();
  const el = event.currentTarget;
  if (el.dataset.id === dragId) return;
  const rect = el.getBoundingClientRect();
  const before = event.clientY - rect.top < rect.height / 2;
  $$(".block").forEach(block => block.classList.remove("drop-before", "drop-after"));
  el.classList.add(before ? "drop-before" : "drop-after");
}

function onDrop(event) {
  if (!dragId) return;
  event.preventDefault();
  const el = event.currentTarget;
  const targetId = el.dataset.id;
  if (targetId === dragId) return;
  const before = el.classList.contains("drop-before");
  const page = currentPage();
  const fromIndex = page.blocks.findIndex(block => block.id === dragId);
  const [moved] = page.blocks.splice(fromIndex, 1);
  let toIndex = page.blocks.findIndex(block => block.id === targetId);
  if (!before) toIndex += 1;
  page.blocks.splice(toIndex, 0, moved);
  touchPage();
  scheduleSave();
  renderBlocks();
  renderOutline();
}

function openSlashMenu(blockId, contentEl) {
  slashMenu.open = true;
  slashMenu.mode = "create";
  slashMenu.blockId = blockId;
  slashMenu.contentEl = contentEl;
  slashMenu.sel = 0;
  slashMenu.filter = "";
  $(".slash-head").textContent = "基础块";
  positionSlashMenu();
  renderSlashList();
  $("#slashMenu").hidden = false;
  document.addEventListener("keydown", slashKeyHandler, true);
  document.addEventListener("input", slashInputHandler, true);
  document.addEventListener("mousedown", slashOutsideHandler, true);
}

function closeSlashMenu() {
  slashMenu.open = false;
  $("#slashMenu").hidden = true;
  $(".slash-head").textContent = "基础块";
  document.removeEventListener("keydown", slashKeyHandler, true);
  document.removeEventListener("input", slashInputHandler, true);
  document.removeEventListener("mousedown", slashOutsideHandler, true);
}

function positionSlashMenu(anchor = null) {
  const menu = $("#slashMenu");
  const rect = anchor?.getBoundingClientRect?.() || window.getSelection()?.getRangeAt?.(0)?.getBoundingClientRect?.();
  if (!rect) return;
  let top = rect.bottom + 6;
  let left = rect.left;
  if (left + 300 > window.innerWidth) left = window.innerWidth - 310;
  if (top + 360 > window.innerHeight) top = rect.top - 364;
  menu.style.top = `${Math.max(12, top)}px`;
  menu.style.left = `${Math.max(12, left)}px`;
}

function renderSlashList() {
  const list = $("#slashList");
  const filter = slashMenu.filter.toLowerCase();
  slashMenu.filtered = BLOCK_TYPES.filter(item => !filter || item.name.toLowerCase().includes(filter) || item.type.includes(filter) || item.desc.toLowerCase().includes(filter));
  if (slashMenu.sel >= slashMenu.filtered.length) slashMenu.sel = 0;

  if (!slashMenu.filtered.length) {
    list.innerHTML = '<div style="padding:14px;color:var(--fg-mute);font-size:13px;">没有匹配项</div>';
    return;
  }

  list.innerHTML = slashMenu.filtered.map((item, index) => `
    <button class="slash-item ${index === slashMenu.sel ? "sel" : ""}" data-type="${item.type}">
      <span class="si-icon">${item.icon}</span>
      <span class="si-text">
        <span class="si-name">${item.name}</span>
        <span class="si-desc">${item.desc}</span>
      </span>
    </button>`).join("");

  $$(".slash-item", list).forEach(button => {
    button.addEventListener("click", () => {
      if (slashMenu.mode === "transform") applyBlockTransform(button.dataset.type);
      else applySlash(button.dataset.type);
    });
  });
}

function slashKeyHandler(event) {
  if (event.key === "Escape") {
    event.preventDefault();
    closeSlashMenu();
    return;
  }
  if (event.key === "ArrowDown") {
    event.preventDefault();
    slashMenu.sel = (slashMenu.sel + 1) % Math.max(1, slashMenu.filtered.length);
    renderSlashList();
    return;
  }
  if (event.key === "ArrowUp") {
    event.preventDefault();
    slashMenu.sel = (slashMenu.sel - 1 + slashMenu.filtered.length) % Math.max(1, slashMenu.filtered.length);
    renderSlashList();
    return;
  }
  if (event.key === "Enter") {
    if (!slashMenu.filtered.length) {
      closeSlashMenu();
      return;
    }
    event.preventDefault();
    const type = slashMenu.filtered[slashMenu.sel].type;
    if (slashMenu.mode === "transform") applyBlockTransform(type);
    else applySlash(type);
  }
}

function slashInputHandler() {
  if (!slashMenu.contentEl || slashMenu.mode !== "create") return;
  const text = slashMenu.contentEl.textContent;
  const match = text.match(/\/([^\/]*)$/);
  if (!match) {
    closeSlashMenu();
    return;
  }
  slashMenu.filter = match[1];
  renderSlashList();
  positionSlashMenu();
}

function slashOutsideHandler(event) {
  if (!$("#slashMenu").contains(event.target)) closeSlashMenu();
}

function applySlash(type) {
  const block = currentPage().blocks.find(item => item.id === slashMenu.blockId);
  if (!block) {
    closeSlashMenu();
    return;
  }
  const text = (slashMenu.contentEl?.textContent || "").replace(/\/[^\/]*$/, "");
  block.text = text;
  applyBlockType(block, type, true);
  closeSlashMenu();
  if (type === "table") focusTableCell(block.id, 1, 0, "start");
  if (type === "ai") focusBlock(block.id, "end");
}

function showBlockMenu(blockId, anchor) {
  slashMenu.open = true;
  slashMenu.mode = "transform";
  slashMenu.blockId = blockId;
  slashMenu.contentEl = anchor;
  slashMenu.filter = "";
  slashMenu.sel = 0;
  $(".slash-head").textContent = "转换块";
  renderSlashList();
  positionSlashMenu(anchor);
  $("#slashMenu").hidden = false;
  document.addEventListener("keydown", slashKeyHandler, true);
  document.addEventListener("mousedown", slashOutsideHandler, true);
}

function applyBlockTransform(type) {
  const block = currentPage().blocks.find(item => item.id === slashMenu.blockId);
  if (!block) {
    closeSlashMenu();
    return;
  }
  applyBlockType(block, type, true);
  closeSlashMenu();
  if (type === "table") focusTableCell(block.id, 1, 0, "start");
  if (type === "ai") focusBlock(block.id, "end");
}

function openPalette() {
  $("#paletteMask").hidden = false;
  const input = $("#paletteInput");
  input.value = "";
  renderPaletteResults("");
  setTimeout(() => input.focus(), 30);
}

function closePalette() {
  $("#paletteMask").hidden = true;
}

function plainTextFromBlock(block) {
  if (block.type === "table") return block.rows.flat().map(stripHTML).join(" ");
  if (block.type === "ai") return [...(block.messages || []).map(message => message.content), block.draft || ""].join(" ");
  return stripHTML(block.text || "");
}

function renderPaletteResults(query) {
  const root = $("#paletteResults");
  const keyword = query.trim().toLowerCase();
  const matches = [];

  state.pages.forEach(page => {
    const title = (page.title || EMPTY_TITLE).toLowerCase();
    const titleHit = !keyword || title.includes(keyword);
    if (titleHit) matches.push({ page, snippet: "" });
    if (keyword) {
      page.blocks.forEach(block => {
        const text = plainTextFromBlock(block);
        if (text.toLowerCase().includes(keyword) && !titleHit) matches.push({ page, snippet: text.slice(0, 80) });
      });
    }
  });

  if (!matches.length) {
    root.innerHTML = '<div style="padding:18px;color:var(--fg-mute);font-size:13px;text-align:center;">没有结果</div>';
    return;
  }

  root.innerHTML = matches.slice(0, 30).map((match, index) => `
    <div class="palette-item ${index === 0 ? "sel" : ""}" data-id="${match.page.id}">
      <span class="pi-icon">${match.page.icon || DEFAULT_PAGE_ICON}</span>
      <span>${escapeHTML(match.page.title || EMPTY_TITLE)}</span>
      <span class="pi-snip">${escapeHTML(match.snippet)}</span>
    </div>`).join("");

  $$(".palette-item", root).forEach(item => {
    item.addEventListener("click", () => {
      switchPage(item.dataset.id);
      closePalette();
    });
  });
}

function escapeHTML(value) {
  return (value || "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
}

function toast(message) {
  const el = $("#toast");
  el.textContent = message;
  el.hidden = false;
  setTimeout(() => { el.hidden = true; }, 1800);
}

function wirePage() {
  $("#pageTitle").addEventListener("input", event => {
    const page = currentPage();
    page.title = event.target.textContent.trim();
    touchPage(page);
    scheduleSave();
    renderSidebar();
    renderCrumbs();
  });

  $("#pageTitle").addEventListener("keydown", event => {
    if (event.key === "Enter") {
      event.preventDefault();
      const first = currentPage().blocks[0];
      if (first) focusBlock(first.id, "start");
    }
  });

  $("#iconPick").addEventListener("click", () => {
    const page = currentPage();
    page.icon = ICON_POOL[Math.floor(Math.random() * ICON_POOL.length)];
    touchPage(page);
    scheduleSave();
    renderSidebar();
    renderCrumbs();
    $("#pageIcon").textContent = page.icon;
  });

  $("#iconPick").addEventListener("contextmenu", event => {
    event.preventDefault();
    const page = currentPage();
    const value = prompt("输入自定义 emoji", page.icon || DEFAULT_PAGE_ICON);
    if (!value) return;
    page.icon = value.trim();
    touchPage(page);
    scheduleSave();
    renderSidebar();
    renderCrumbs();
    $("#pageIcon").textContent = page.icon;
  });

  $("#addCoverBtn").addEventListener("click", () => {
    const page = currentPage();
    page.cover = COVER_GRADIENTS[Math.floor(Math.random() * COVER_GRADIENTS.length)];
    touchPage(page);
    scheduleSave();
    renderPage();
  });
}

function wireSidebar() {
  $("#newPageBtn").addEventListener("click", () => newPage(null));
  $("#newPageTopBtn").addEventListener("click", () => newPage(null));
  $("#themeToggle").addEventListener("click", toggleTheme);
  $("#fontPreset").addEventListener("change", event => {
    state.fontMode = event.target.value;
    applyFontMode();
    scheduleSave();
  });
  $("#searchBtn").addEventListener("click", openPalette);
  $("#todayBtn").addEventListener("click", () => {
    const today = new Date().toLocaleDateString("zh-CN");
    const existing = state.pages.find(page => page.title === today);
    if (existing) {
      switchPage(existing.id);
      return;
    }
    newPage(null);
    const page = currentPage();
    page.title = today;
    page.icon = "📅";
    touchPage(page);
    scheduleSave();
    renderSidebar();
    renderPage();
  });

  $("#collapseBtn").addEventListener("click", () => {
    $("#app").classList.add("collapsed");
    $("#expandBtn").hidden = false;
  });
  $("#expandBtn").addEventListener("click", () => {
    $("#app").classList.remove("collapsed");
    $("#expandBtn").hidden = true;
  });

  const resizer = $("#resizer");
  let dragging = false;
  resizer.addEventListener("mousedown", event => {
    dragging = true;
    resizer.classList.add("active");
    document.body.style.cursor = "col-resize";
    event.preventDefault();
  });
  document.addEventListener("mousemove", event => {
    if (!dragging) return;
    const width = Math.min(420, Math.max(220, event.clientX));
    state.sidebarWidth = width;
    document.documentElement.style.setProperty("--sidebar-w", `${width}px`);
  });
  document.addEventListener("mouseup", () => {
    if (!dragging) return;
    dragging = false;
    resizer.classList.remove("active");
    document.body.style.cursor = "";
    scheduleSave();
  });
}

function wireGlobal() {
  document.addEventListener("keydown", event => {
    if (!$("#imagePreviewMask").hidden && event.key === "Escape") {
      closeImagePreview();
      return;
    }
    if (selectedBlockId && (event.key === "Backspace" || event.key === "Delete")) {
      const active = document.activeElement;
      if (!active?.closest?.(".b-content, .table-cell, .image-caption, .ai-input, #pageTitle, #paletteMask")) {
        event.preventDefault();
        removeBlock(selectedBlockId);
        return;
      }
    }
    if ((event.metaKey || event.ctrlKey) && /^(k|K)$/u.test(event.key)) {
      event.preventDefault();
      openPalette();
      return;
    }
    if ((event.metaKey || event.ctrlKey) && event.key === "/") {
      event.preventDefault();
      const first = currentPage().blocks[0];
      if (!first) return;
      focusBlock(first.id, "end");
      setTimeout(() => {
        const content = document.querySelector(`.block[data-id="${first.id}"] .b-content`);
        if (content) openSlashMenu(first.id, content);
      }, 50);
      return;
    }
    if (event.key === "Escape" && !$("#paletteMask").hidden) closePalette();
  });

  $("#paletteInput").addEventListener("input", event => renderPaletteResults(event.target.value));
  $("#paletteInput").addEventListener("keydown", event => {
    const items = $$(".palette-item");
    const index = items.findIndex(item => item.classList.contains("sel"));
    if (event.key === "ArrowDown") {
      event.preventDefault();
      items[index]?.classList.remove("sel");
      items[Math.min(items.length - 1, index + 1)]?.classList.add("sel");
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      items[index]?.classList.remove("sel");
      items[Math.max(0, index - 1)]?.classList.add("sel");
    }
    if (event.key === "Enter") {
      const selected = $(".palette-item.sel");
      if (selected) {
        switchPage(selected.dataset.id);
        closePalette();
      }
    }
  });

  $("#paletteMask").addEventListener("click", event => {
    if (event.target.id === "paletteMask") closePalette();
  });
  $("#imagePreviewMask").addEventListener("click", event => {
    if (event.target.id === "imagePreviewMask" || event.target.id === "imagePreviewClose") closeImagePreview();
  });

  document.addEventListener("paste", async event => {
    const target = event.target;
    if (target && (target.closest("#paletteMask") || target.closest("#pageTitle"))) return;
    const items = [...(event.clipboardData?.items || [])];
    const imageItem = items.find(item => item.type?.startsWith("image/"));
    if (!imageItem) return;
    const file = imageItem.getAsFile?.();
    if (!file) return;
    event.preventDefault();
    await insertImagesFromFiles([file]);
  });

  const editor = $("#editor");
  editor.addEventListener("dragover", event => {
    if ([...(event.dataTransfer?.items || [])].some(item => item.type?.startsWith("image/"))) {
      event.preventDefault();
    }
  });
  editor.addEventListener("drop", async event => {
    const files = [...(event.dataTransfer?.files || [])].filter(file => file.type?.startsWith("image/"));
    if (!files.length) return;
    event.preventDefault();
    const blockId = event.target.closest(".block")?.dataset.id || getActiveBlockId();
    await insertImagesFromFiles(files, blockId);
  });

  $("#shareBtn").addEventListener("click", async () => {
    try {
      await navigator.clipboard?.writeText(`${location.href.split("#")[0]}#${currentPage().id}`);
      toast("页面链接已复制");
    } catch {
      toast("复制失败，请手动复制地址");
    }
  });

  $("#moreBtn").addEventListener("click", () => {
    const data = JSON.stringify(state, null, 2);
    const blob = new Blob([data], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "notion-lite-export.json";
    a.click();
    URL.revokeObjectURL(a.href);
    toast("已导出 JSON");
  });
}

function init() {
  applyTheme();
  applyFontMode();
  renderSidebar();
  renderPage();
  wirePage();
  wireSidebar();
  wireGlobal();
}

init();
