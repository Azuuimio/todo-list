"use strict";

(() => {
  /* -------------------- 常量与工具 -------------------- */

  // 任务数据键名
  const STORAGE_KEY = "todo-app:v1";
  // 主题数据键名
  const THEME_KEY = "todo-app:theme";
  // 筛选状态
  const FILTERS = ["all", "active", "completed"];
  // 空状态文案
  const EMPTY_TEXT = {
    all: "暂无任务，从添加一条开始吧。",
    active: "暂无进行中的任务。",
    completed: "暂无已完成的任务。",
  };
  // 撤销倒计时的初始时长（毫秒），暂停期间不计时
  const UNDO_DURATION = 6000;
  // Toast 开始退场至隐藏节点的等待时间（毫秒）
  const TOAST_HIDE_DELAY = 200;

  // 函数：生成 ID
  const createId = () => {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  };

  // 函数：清洗任务数据
  // 参数：item 是从本地存储读出的单条任务数据
  // 返回值：结构统一的任务对象，数据非法时返回 null
  const sanitizeTodo = (item) =>
    item && typeof item.text === "string"
      ? {
          id: typeof item.id === "string" ? item.id : createId(),
          text: item.text,
          completed: !!item.completed,
        }
      : null;

  // 函数：创建元素
  // 返回结果等价于：<tag class="className">text</tag>
  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };

  // 函数：创建 SVG 图标按钮
  const svgBtn = (className, label, svg) => {
    const btn = el("button", className);
    btn.type = "button";
    btn.setAttribute("aria-label", label);
    btn.innerHTML = svg;
    return btn;
  };

  /* -------------------- 存储层 -------------------- */

  // 创建对象：数据读写
  const store = {
    load() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return { todos: [], filter: "all" };
        const data = JSON.parse(raw);
        return {
          todos: (Array.isArray(data.todos) ? data.todos : [])
            .map(sanitizeTodo)
            .filter(Boolean),
          filter: FILTERS.includes(data.filter) ? data.filter : "all",
        };
      } catch (err) {
        console.warn("[todo] 读取本地数据失败，以空列表启动：", err);
        return { todos: [], filter: "all" };
      }
    },
    save() {
      try {
        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({ todos: state.todos, filter: state.filter }),
        );
      } catch (err) {
        console.warn("[todo] 写入本地存储失败：", err);
      }
    },
    loadTheme() {
      try {
        const t = localStorage.getItem(THEME_KEY);
        return t === "light" || t === "dark" ? t : "auto";
      } catch {
        return "auto";
      }
    },
    saveTheme(theme) {
      try {
        localStorage.setItem(THEME_KEY, theme);
      } catch {
        /* 本次主题切换仍生效，但无法保存偏好 */
      }
    },
  };

  /* -------------------- 应用状态 -------------------- */

  // 创建对象：撤销状态
  // 结构：{ batches: [[{ todo, index }]], timer, remaining, startedAt }
  // remaining 记录本轮开始或暂停时的剩余毫秒数，不实时递减。
  // startedAt 为本轮计时起点；timer 为 null 时暂停。
  let pendingUndo = null;

  // 当前编辑的结束函数，没有正在编辑的任务时为 null
  let finishEditing = null;

  // 创建对象：应用状态
  // todos 数组中单个任务的结构为：
  // {
  //   id: 由 createId() 生成，也是 <li> 上 data-id 的值
  //   text: 用户输入的文本
  //   completed: 布尔值，记录任务是否完成
  // }
  // 数组顺序即页面显示顺序
  const persisted = store.load();
  const state = {
    todos: persisted.todos,
    filter: persisted.filter,
    theme: store.loadTheme(),
  };

  /* -------------------- DOM 引用 -------------------- */

  const $ = (id) => document.getElementById(id);
  const $form = $("todo-form");
  const $input = $("todo-input");
  const $hint = $("input-hint");
  const $toggleAll = $("toggle-all");
  const $filters = $("filters");
  const $list = $("todo-list");
  const $empty = $("todo-empty");
  const $count = $("todo-count");
  const $clearBtn = $("clear-completed");
  const $toast = $("toast");
  const $toastText = $("toast-text");
  const $toastProgress = $("toast-progress");
  const $toastUndo = $("toast-undo");
  const $themeToggle = $("theme-toggle");
  const $themeIcon = $("theme-icon");
  const $themeLabel = $("theme-label");

  /* -------------------- 主题 -------------------- */

  // 主题状态对应的图标与文字
  const THEME_META = {
    auto: [
      "跟随系统",
      '<svg viewBox="0 0 16 16"><rect x="1.5" y="2.5" width="13" height="9" rx="1.5"/><path d="M5.5 13.5h5"/></svg>',
    ],
    light: [
      "浅色",
      '<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="3"/><path d="M8 1.5v1.5M8 13v1.5M1.5 8H3M13 8h1.5M3.4 3.4l1 1M11.6 11.6l1 1M12.6 3.4l-1 1M4.4 11.6l-1 1"/></svg>',
    ],
    dark: [
      "深色",
      '<svg viewBox="0 0 16 16"><path d="M13.5 9.5A5.5 5.5 0 1 1 6.5 2.5a4.5 4.5 0 0 0 7 7z"/></svg>',
    ],
  };
  // 主题切换顺序
  const THEME_ORDER = ["auto", "light", "dark"];
  // 系统深色模式媒体查询
  const darkMedia = window.matchMedia?.("(prefers-color-scheme: dark)") ?? null;

  // 函数：应用主题
  const applyTheme = () => {
    document.documentElement.dataset.theme =
      state.theme === "auto"
        ? darkMedia?.matches
          ? "dark"
          : "light"
        : state.theme;
    const [label, icon] = THEME_META[state.theme];
    $themeIcon.innerHTML = icon;
    $themeLabel.textContent = label;
    $themeToggle.setAttribute("aria-label", `当前主题：${label}，点击切换`);
  };

  // 函数：切换主题
  const cycleTheme = () => {
    state.theme =
      THEME_ORDER[(THEME_ORDER.indexOf(state.theme) + 1) % THEME_ORDER.length];
    store.saveTheme(state.theme);
    applyTheme();
  };

  /* -------------------- 渲染 -------------------- */

  // 函数：创建单条 todo 的 DOM 元素
  // HTML 结构示意（含占位符和条件属性）：
  // todo.* 表示动态值；[todo--completed] 表示仅在任务完成时添加的类名。
  // checked="todo.completed" 表示 checked 属性随完成状态设置，并非实际 HTML 写法。
  // <li class="todo [todo--completed]" data-id="todo.id">
  //   <label class="todo__check">
  //     <input type="checkbox" class="todo__checkbox" checked="todo.completed"
  //       aria-labelledby="todo-text-todo.id" />
  //     <span class="todo__box" aria-hidden="true">
  //       <svg viewBox="0 0 12 10"><path d="M1 5.5 4.5 9 11 1"/></svg>
  //     </span>
  //   </label>
  //   <span class="todo__text">
  //     <span class="todo__text-content" id="todo-text-todo.id">todo.text</span>
  //   </span>
  //   <button class="todo__edit" type="button" aria-label="编辑任务：todo.text">
  //     <svg viewBox="0 0 14 14"><path d="M8.8 2.7l2.5 2.5L4.5 12H2V9.5l6.8-6.8z"/><path d="M7.6 3.9l2.5 2.5"/></svg>
  //   </button>
  //   <button class="todo__delete" type="button" aria-label="删除任务：todo.text">
  //     <svg viewBox="0 0 12 12"><path d="M2 2l8 8M10 2l-8 8"/></svg>
  //   </button>
  // </li>
  // 结构树如下：
  // li.todo
  // ├─ label.todo__check
  // │   ├─ input.todo__checkbox    ← 真正的勾选控件，透明覆盖在上面
  // │   └─ span.todo__box          ← 肉眼看到的方框，纯装饰
  // │       └─ svg                 ← 肉眼看到的对勾，纯装饰
  // ├─ span.todo__text             ← 文字容器，参与任务行的 flex 布局
  // │   └─ span.todo__text-content ← 行内文字，勾选后每行分别展开删除线
  // ├─ button.todo__edit           ← 编辑按钮
  // │   └─ svg                     ← 编辑按钮里的铅笔图标
  // └─ button.todo__delete         ← 删除按钮
  //     └─ svg                     ← 删除按钮里的叉号
  // 操作按钮在行悬停或行内元素获得焦点时显示；无悬停能力的设备上始终显示。
  const createTodoElement = (todo) => {
    const li = el("li", `todo${todo.completed ? " todo--completed" : ""}`);
    li.dataset.id = todo.id;
    const checkbox = el("input", "todo__checkbox");
    checkbox.type = "checkbox";
    checkbox.checked = todo.completed;
    const text = el("span", "todo__text");
    const content = el("span", "todo__text-content", todo.text);
    content.id = `todo-text-${todo.id}`;
    checkbox.setAttribute("aria-labelledby", content.id);
    text.append(content);
    const box = el("span", "todo__box");
    box.setAttribute("aria-hidden", "true");
    box.innerHTML =
      '<svg viewBox="0 0 12 10"><path d="M1 5.5 4.5 9 11 1"/></svg>';
    const check = el("label", "todo__check");
    check.append(checkbox, box);
    li.append(
      check,
      text,
      svgBtn(
        "todo__edit",
        `编辑任务：${todo.text}`,
        '<svg viewBox="0 0 14 14"><path d="M8.8 2.7l2.5 2.5L4.5 12H2V9.5l6.8-6.8z"/><path d="M7.6 3.9l2.5 2.5"/></svg>',
      ),
      svgBtn(
        "todo__delete",
        `删除任务：${todo.text}`,
        '<svg viewBox="0 0 12 12"><path d="M2 2l8 8M10 2l-8 8"/></svg>',
      ),
    );
    return li;
  };

  // 函数：获取可见任务
  // 返回值：当前筛选条件下的任务数组
  const getVisibleTodos = () => {
    if (state.filter === "active") {
      return state.todos.filter((t) => !t.completed);
    } else if (state.filter === "completed") {
      return state.todos.filter((t) => t.completed);
    } else {
      return state.todos;
    }
  };

  // 函数：同步空状态提示
  const refreshEmptyState = () => {
    const hasVisible = $list.children.length > 0;
    $empty.hidden = hasVisible;
    if (!hasVisible) $empty.textContent = EMPTY_TEXT[state.filter];
  };

  // 函数：更新任务统计与操作按钮状态
  const updateSummaryAndControls = () => {
    const total = state.todos.length;
    const remaining = state.todos.filter((t) => !t.completed).length;
    $count.textContent =
      total > 0 && remaining === 0
        ? "全部完成，干得漂亮"
        : `${remaining} 项待完成`;
    $clearBtn.disabled = !state.todos.some((t) => t.completed);
    $toggleAll.disabled = total === 0;
    $toggleAll.setAttribute(
      "aria-pressed",
      String(total > 0 && remaining === 0),
    );
  };

  // 函数：在未挂载的 DocumentFragment 中拼装节点，再渲染列表
  // 完整渲染以 state 为数据来源；切换完成状态、行内编辑和删除等操作会局部更新 DOM。
  const render = () => {
    const focused = document.activeElement;
    const focusedRow = focused.closest(".todo");
    const focusSelector = focused.matches(".todo__edit, .todo__edit-input")
      ? ".todo__edit"
      : focused.matches(".todo__delete")
        ? ".todo__delete"
        : ".todo__checkbox";
    // 重绘前提交编辑草稿；重绘后恢复原任务上的键盘操作位置。
    finishEditing?.(true);
    const fragment = document.createDocumentFragment();
    getVisibleTodos().forEach((todo) =>
      fragment.append(createTodoElement(todo)),
    );
    $list.replaceChildren(fragment);
    refreshEmptyState();
    updateSummaryAndControls();
    if (focusedRow) {
      const row = [...$list.children].find(
        (li) => li.dataset.id === focusedRow.dataset.id,
      );
      (row?.querySelector(focusSelector) || $input).focus();
    }
  };

  /* -------------------- 业务操作 -------------------- */

  // 函数：设置筛选状态
  // 默认将筛选状态同步到 URL hash，状态变化后立即写入 localStorage。
  // 参数：updateHash 控制是否同步 URL hash；persist 控制是否写入本地存储。
  // 初始化恢复状态或与新增任务一并保存时，将 persist 设为 false，避免重复写入。
  const setFilter = (filter, { updateHash = true, persist = true } = {}) => {
    const next = FILTERS.includes(filter) ? filter : "all";
    const changed = next !== state.filter;
    state.filter = next;
    if (changed && persist) store.save();
    if (updateHash) {
      history.replaceState(
        null,
        "",
        next === "all" ? location.pathname + location.search : `#${next}`,
      );
    }
    $filters.querySelectorAll(".filters__btn").forEach((b) => {
      const isActive = b.dataset.filter === next;
      b.classList.toggle("filters__btn--active", isActive);
      b.setAttribute("aria-pressed", String(isActive));
    });
    render();
  };

  // 函数：从 URL 读取筛选状态
  const filterFromHash = () => {
    const f = location.hash.replace(/^#\/?/, "");
    return FILTERS.includes(f) ? f : null;
  };

  // 函数：添加 todo
  const addTodo = (text) => {
    finishEditing?.(true);
    const todo = { id: createId(), text, completed: false };
    state.todos.unshift(todo);
    pendingUndo?.batches.forEach((items) => {
      items.forEach((item) => {
        item.index += 1;
      });
    });
    if (state.filter === "completed") {
      setFilter("all", { persist: false });
    } else {
      render();
    }
    store.save();
    $list.querySelector(`[data-id="${todo.id}"]`)?.classList.add("todo--enter");
  };

  // 函数：切换任务完成状态
  const toggleTodo = (id) => {
    const todo = state.todos.find((t) => t.id === id);
    if (!todo) return;
    todo.completed = !todo.completed;
    store.save();
    const li = $list.querySelector(`[data-id="${id}"]`);
    if (li) {
      if (state.filter === "all") {
        li.classList.toggle("todo--completed", todo.completed);
      } else {
        li.classList.add("todo--leaving");
        li.addEventListener(
          "animationend",
          () => {
            moveFocusFromTodo(li);
            li.remove();
            refreshEmptyState();
          },
          { once: true },
        );
      }
    }
    updateSummaryAndControls();
  };

  // 函数：行内编辑
  const startEdit = (li, todo) => {
    if (isBusy(li)) return;
    finishEditing?.(true);
    li.classList.add("todo--editing");
    const input = el("input", "todo__edit-input");
    input.type = "text";
    input.maxLength = 200;
    input.value = todo.text;
    input.setAttribute("aria-label", "编辑任务内容");
    li.append(input);
    input.focus();
    input.select();
    let settled = false;
    const finish = (commit, restoreFocus = false) => {
      if (settled) return;
      settled = true;
      finishEditing = null;
      const text = input.value.trim();
      if (commit && text && text !== todo.text) {
        todo.text = text;
        store.save();
        li.querySelector(".todo__text-content").textContent = text;
        li.querySelector(".todo__edit").setAttribute(
          "aria-label",
          `编辑任务：${text}`,
        );
        li.querySelector(".todo__delete").setAttribute(
          "aria-label",
          `删除任务：${text}`,
        );
      }
      li.classList.remove("todo--editing");
      input.remove();
      if (restoreFocus) li.querySelector(".todo__edit").focus();
    };
    finishEditing = finish;
    input.addEventListener("keydown", (event) => {
      if (event.isComposing) return;
      if (event.key === "Enter") {
        event.preventDefault();
        finish(true, true);
      } else if (event.key === "Escape") {
        event.preventDefault();
        finish(false, true);
      }
    });
    input.addEventListener("blur", () => finish(true));
  };

  // 函数：从状态中移除指定任务，并返回撤销快照
  const removeFromState = (ids) => {
    const items = [];
    state.todos.forEach((todo, index) => {
      if (ids.includes(todo.id)) items.push({ todo, index });
    });
    if (items.length) {
      state.todos = state.todos.filter((t) => !ids.includes(t.id));
    }
    return items;
  };

  // 函数：删除任务
  const deleteTodo = (id, li) => {
    const items = removeFromState([id]);
    if (!items.length) return;
    store.save();
    updateSummaryAndControls();
    showUndoToast(items);
    li.classList.add("todo--leaving");
    li.addEventListener(
      "animationend",
      () => {
        moveFocusFromTodo(li);
        li.remove();
        refreshEmptyState();
      },
      { once: true },
    );
  };

  // 函数：清除已完成
  const clearCompleted = () => {
    finishEditing?.(true);
    const restoreFocus = document.activeElement === $clearBtn;
    const items = removeFromState(
      state.todos.filter((t) => t.completed).map((t) => t.id),
    );
    if (!items.length) return;
    store.save();
    render();
    if (restoreFocus) {
      ($list.querySelector(".todo__checkbox") || $input).focus();
    }
    showUndoToast(items);
  };

  // 函数：撤销删除
  // 按删除批次的逆序还原，同一批次按原下标升序插回
  const undoDelete = () => {
    if (!pendingUndo) return;
    finishEditing?.(true);
    const restoreFocus = $toast.contains(document.activeElement);
    const batches = [...pendingUndo.batches].reverse();
    hideUndoToast();
    batches.forEach((items) =>
      items.forEach(({ todo, index }) =>
        state.todos.splice(Math.min(index, state.todos.length), 0, todo),
      ),
    );
    store.save();
    render();
    if (restoreFocus) {
      ($list.querySelector(".todo__checkbox") || $input).focus();
    }
  };

  // 函数：切换全选状态
  const toggleAllTodos = () => {
    if (!state.todos.length) return;
    finishEditing?.(true);
    const hasActive = state.todos.some((t) => !t.completed);
    state.todos.forEach((t) => {
      t.completed = hasActive;
    });
    store.save();
    render();
  };

  // 函数：判断条目是否处于繁忙态（编辑中/离场中）
  const isBusy = (li) =>
    !li ||
    li.classList.contains("todo--editing") ||
    li.classList.contains("todo--leaving");

  // 函数：移除任务前，将行内焦点转移到相邻任务；用户已移开焦点时不干预。
  const moveFocusFromTodo = (li) => {
    if (!li.contains(document.activeElement)) return;
    const rows = [...$list.children];
    const index = rows.indexOf(li);
    const targetRow =
      rows.slice(index + 1).find((row) => !isBusy(row)) ||
      rows
        .slice(0, index)
        .reverse()
        .find((row) => !isBusy(row));
    (targetRow?.querySelector(".todo__checkbox") || $input).focus();
  };

  // 函数：显示输入错误（提示+抖动）
  const showInputError = () => {
    $input.setAttribute("aria-invalid", "true");
    $input.setAttribute("aria-describedby", "input-hint");
    $hint.hidden = false;
    $form.classList.remove("todo-form--shake");
    // 读取布局，让移除动画类的样式先生效，再添加类以重新触发抖动。
    void $form.offsetWidth;
    $form.classList.add("todo-form--shake");
  };

  // 函数：清除输入错误
  const clearInputError = () => {
    $input.removeAttribute("aria-invalid");
    $input.removeAttribute("aria-describedby");
    $hint.hidden = true;
  };

  /* -------------------- 撤销 Toast -------------------- */

  // 函数：显示撤销提示，合并删除批次并重置倒计时
  const showUndoToast = (newItems) => {
    if (pendingUndo) {
      clearTimeout(pendingUndo.timer);
      pendingUndo.batches.push(newItems);
    } else {
      pendingUndo = {
        batches: [newItems],
        startedAt: 0,
      };
      $toast.hidden = false;
      requestAnimationFrame(() => $toast.classList.add("toast--visible"));
    }
    pendingUndo.timer = null;
    pendingUndo.remaining = UNDO_DURATION;
    $toastUndo.disabled = false;
    const n = pendingUndo.batches.reduce(
      (total, items) => total + items.length,
      0,
    );
    $toastText.textContent = n === 1 ? "任务已删除" : `已删除 ${n} 条任务`;
    resetCountdownProgress();
    resumeCountdown();
  };

  // 函数：重置倒计时进度条，并保持暂停状态
  const resetCountdownProgress = () => {
    $toastProgress.style.animation = "none";
    // 读取布局，让动画禁用先生效，再恢复动画以重置进度条。
    void $toastProgress.offsetWidth;
    $toastProgress.style.animation = "";
    $toastProgress.style.animationDuration = `${UNDO_DURATION}ms`;
    $toastProgress.style.animationPlayState = "paused";
  };

  // 函数：暂停倒计时，同时记录剩余时间并暂停进度条
  const pauseCountdown = () => {
    if (!pendingUndo || pendingUndo.timer === null) return;
    clearTimeout(pendingUndo.timer);
    pendingUndo.timer = null;
    pendingUndo.remaining = Math.max(
      0,
      pendingUndo.remaining - (performance.now() - pendingUndo.startedAt),
    );
    $toastProgress.style.animationPlayState = "paused";
  };

  // 函数：鼠标和焦点都离开撤销窗口后，按剩余时间继续倒计时
  // 参数：focusedElement 默认为当前焦点；失焦时传入即将获得焦点的元素。
  const resumeCountdown = (focusedElement = document.activeElement) => {
    if (
      !pendingUndo ||
      pendingUndo.timer !== null ||
      $toast.matches(":hover") ||
      $toast.contains(focusedElement)
    ) {
      return;
    }
    pendingUndo.startedAt = performance.now();
    pendingUndo.timer = setTimeout(finalizeUndo, pendingUndo.remaining);
    $toastProgress.style.animationPlayState = "running";
  };

  // 函数：禁用撤销按钮，触发 Toast 退场并延迟隐藏节点
  const dismissToast = () => {
    $toastUndo.disabled = true;
    $toast.classList.remove("toast--visible");
    setTimeout(() => {
      if (!pendingUndo) $toast.hidden = true;
    }, TOAST_HIDE_DELAY);
  };

  // 函数：倒计时到期后清除撤销状态并关闭 Toast
  const finalizeUndo = () => {
    if (!pendingUndo) return;
    pendingUndo = null;
    dismissToast();
  };

  // 函数：主动结束撤销窗口，清除定时器与撤销状态并关闭 Toast
  const hideUndoToast = () => {
    clearTimeout(pendingUndo?.timer);
    pendingUndo = null;
    dismissToast();
  };

  /* -------------------- 事件绑定 -------------------- */

  // 监听器：表单提交
  $form.addEventListener("submit", (event) => {
    event.preventDefault();
    const text = $input.value.trim();
    if (!text) {
      showInputError();
      $input.focus();
      return;
    }
    clearInputError();
    addTodo(text);
    $input.value = "";
    $input.focus();
  });

  // 监听器：输入时自动消除错误
  $input.addEventListener("input", () => {
    if ($hint.hidden) return;
    if ($input.value.trim()) clearInputError();
  });

  // 监听器：列表 click
  $list.addEventListener("click", (event) => {
    const li = event.target.closest(".todo");
    if (isBusy(li)) return;
    if (event.target.closest(".todo__delete")) {
      deleteTodo(li.dataset.id, li);
    } else if (event.target.closest(".todo__edit")) {
      const todo = state.todos.find((t) => t.id === li.dataset.id);
      if (todo) startEdit(li, todo);
    }
  });

  // 监听器：列表 dblclick
  $list.addEventListener("dblclick", (event) => {
    const textEl = event.target.closest(".todo__text");
    const todo =
      textEl &&
      state.todos.find((t) => t.id === textEl.closest(".todo").dataset.id);
    if (todo) startEdit(textEl.closest(".todo"), todo);
  });

  // 监听器：列表 change
  $list.addEventListener("change", (event) => {
    const li = event.target.closest(".todo");
    if (isBusy(li)) return;
    if (event.target.closest(".todo__checkbox")) toggleTodo(li.dataset.id);
  });

  // 监听器：点击筛选按钮
  $filters.addEventListener("click", (event) => {
    const btn = event.target.closest(".filters__btn");
    if (btn) setFilter(btn.dataset.filter);
  });

  $clearBtn.addEventListener("click", clearCompleted);
  $toggleAll.addEventListener("click", toggleAllTodos);
  $toastUndo.addEventListener("click", undoDelete);
  $themeToggle.addEventListener("click", cycleTheme);

  // 监听器：鼠标悬停或焦点进入撤销窗口时暂停，两者都离开后继续倒计时
  $toast.addEventListener("mouseenter", pauseCountdown);
  $toast.addEventListener("mouseleave", () => resumeCountdown());
  $toast.addEventListener("focusin", pauseCountdown);
  $toast.addEventListener("focusout", (event) => {
    resumeCountdown(event.relatedTarget);
  });

  // 监听器：hashchange
  window.addEventListener("hashchange", () => {
    const f = location.hash ? filterFromHash() : "all";
    if (f && f !== state.filter) setFilter(f, { updateHash: false });
  });

  // 监听器：系统主题改变
  darkMedia?.addEventListener?.("change", () => {
    if (state.theme === "auto") applyTheme();
  });

  /* -------------------- 初始化 -------------------- */

  // 函数：初始化
  const init = () => {
    applyTheme();
    // 筛选优先级：URL hash > 本地存储 > 'all'
    const fromHash = filterFromHash();
    setFilter(fromHash || state.filter, {
      updateHash: !fromHash,
      persist: false,
    });
  };

  // 启动
  try {
    init();
  } catch (err) {
    console.error("[todo] 初始化失败：", err);
  }
})();
