"use strict";

(() => {
  /* -------------------- 常量与工具 -------------------- */

  //定义常量
  //任务数据键名
  const STORAGE_KEY = "todo-app:v1";
  //主题数据键名
  const THEME_KEY = "todo-app:theme";
  //保存防抖的延迟时间（毫秒）
  const SAVE_DELAY = 300;
  //筛选状态
  const FILTERS = ["all", "active", "completed"];
  //空状态文案
  const EMPTY_TEXT = {
    all: "暂无任务，从添加一条开始吧。",
    active: "暂无进行中的任务。",
    completed: "暂无已完成的任务。",
  };
  //撤销窗口显示时间（毫秒）
  const UNDO_DURATION = 4000;
  //Toast 退场过渡时间（毫秒）
  const TOAST_EXIT = 200;

  //函数：防抖
  //参数：fn是需要防抖的真正的业务函数，wait是等待时间
  //返回值：防抖的新函数
  const debounce = (fn, wait) => {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), wait);
    };
  };

  //函数：生成 ID
  const createId = () => {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  };

  //函数：清洗任务数据
  //参数：item 是从本地存储读出的单条任务数据
  //返回值：结构统一的任务对象，数据非法时返回 null
  const sanitizeTodo = (item) =>
    item && typeof item.text === "string"
      ? {
          id: typeof item.id === "string" ? item.id : createId(),
          text: item.text,
          completed: !!item.completed,
        }
      : null;

  //函数：创建元素
  //返回结果等价于：<tag class="className">text</tag>
  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };

  //函数：创建 SVG 图标按钮
  const svgBtn = (className, label, svg) => {
    const btn = el("button", className);
    btn.type = "button";
    btn.setAttribute("aria-label", label);
    btn.innerHTML = svg;
    return btn;
  };

  /* -------------------- 存储层 -------------------- */

  //创建对象：数据读写
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
        /* 无碍使用 */
      }
    },
  };

  /* -------------------- 应用状态 -------------------- */

  //创建对象：撤销状态
  //结构：{ items: [{ todo, index }], timer }
  let pendingUndo = null;

  //创建对象：应用状态
  //todos 的结构为：
  // {
  //   id: 由 createId() 生成，也是 <li> 上 data-id 的值
  //   text: 用户输入的文本
  //   completed: 布尔值，记录任务是否完成
  // }
  //数组顺序即页面显示顺序
  const persisted = store.load();
  const state = {
    todos: persisted.todos,
    filter: persisted.filter,
    theme: store.loadTheme(),
  };

  /* -------------------- DOM 引用 -------------------- */

  //DOM 引用
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

  //主题状态对应的图标与文字
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
  //主题切换顺序
  const THEME_ORDER = ["auto", "light", "dark"];
  //系统深色模式媒体查询
  const darkMedia = window.matchMedia?.("(prefers-color-scheme: dark)") ?? null;

  //函数：应用主题
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

  //函数：切换主题
  const cycleTheme = () => {
    state.theme =
      THEME_ORDER[(THEME_ORDER.indexOf(state.theme) + 1) % THEME_ORDER.length];
    store.saveTheme(state.theme);
    applyTheme();
  };

  /* -------------------- 渲染 -------------------- */

  //函数：创建单条 todo 的 DOM 元素
  //返回结果等价于：
  // <li class="todo [todo--completed]" data-id="todo.id">
  //   <label class="todo__check">
  //     <input type="checkbox" class="todo__checkbox" checked="todo.completed" />
  //     <span class="todo__box" aria-hidden="true">
  //       <svg viewBox="0 0 12 10"><path d="M1 5.5 4.5 9 11 1"/></svg>
  //     </span>
  //   </label>
  //   <span class="todo__text">todo.text</span>
  //   <button class="todo__edit" type="button" aria-label="编辑任务：todo.text">
  //     <svg viewBox="0 0 14 14"><path d="M8.8 2.7l2.5 2.5L4.5 12H2V9.5l6.8-6.8z"/><path d="M7.6 3.9l2.5 2.5"/></svg>
  //   </button>
  //   <button class="todo__delete" type="button" aria-label="删除任务：todo.text">
  //     <svg viewBox="0 0 12 12"><path d="M2 2l8 8M10 2l-8 8"/></svg>
  //   </button>
  // </li>
  //结构树如下：
  // li.todo
  // ├─ label.todo__check
  // │   ├─ input.todo__checkbox   ← 真正的勾选控件，透明覆盖在上面
  // │   └─ span.todo__box         ← 肉眼看到的方框，纯装饰
  // │       └─ svg                ← 肉眼看到的对勾，纯装饰
  // ├─ span.todo__text            ← 任务文字，勾选后 CSS 给它画删除线
  // ├─ button.todo__edit          ← hover 行时才出现的编辑按钮
  // │   └─ svg                    ← 编辑按钮里的铅笔图标
  // └─ button.todo__delete        ← hover 行时才出现的删除按钮
  //     └─ svg                    ← 删除按钮里的叉号
  const createTodoElement = (todo) => {
    const li = el("li", `todo${todo.completed ? " todo--completed" : ""}`);
    li.dataset.id = todo.id;
    const checkbox = el("input", "todo__checkbox");
    checkbox.type = "checkbox";
    checkbox.checked = todo.completed;
    const box = el("span", "todo__box");
    box.setAttribute("aria-hidden", "true");
    box.innerHTML =
      '<svg viewBox="0 0 12 10"><path d="M1 5.5 4.5 9 11 1"/></svg>';
    const check = el("label", "todo__check");
    check.append(checkbox, box);
    li.append(
      check,
      el("span", "todo__text", todo.text),
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

  //函数：获取可见任务
  //返回值：当前筛选条件下的任务数组
  const getVisibleTodos = () => {
    if (state.filter === "active") {
      return state.todos.filter((t) => !t.completed);
    } else if (state.filter === "completed") {
      return state.todos.filter((t) => t.completed);
    } else {
      return [...state.todos];
    }
  };

  //函数：同步空状态提示
  const refreshEmptyState = () => {
    const hasVisible = $list.children.length > 0;
    $empty.hidden = hasVisible;
    if (!hasVisible) $empty.textContent = EMPTY_TEXT[state.filter];
  };

  //函数：更新底栏
  const updateFooter = () => {
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

  //函数：离线拼装并渲染
  //拼装的唯一数据来源是 state，所以一切操作的流程都是先改 state，再使用 render()
  const render = () => {
    const fragment = document.createDocumentFragment();
    getVisibleTodos().forEach((todo) =>
      fragment.append(createTodoElement(todo)),
    );
    $list.replaceChildren(fragment);
    refreshEmptyState();
    updateFooter();
  };

  /* -------------------- 业务操作 -------------------- */

  //函数：防抖写入
  const persist = debounce(() => store.save(), SAVE_DELAY);

  //函数：立即写入
  //在页面隐藏前调用，防止数据丢失
  const flushPersist = () => store.save();

  //函数：设置筛选状态
  //行为：筛选结果同时写入 localStorage 和 URL hash
  //参数：updateHash 为是否同步 URL hash；persist 为是否写入本地存储（跨标签页同步时要传 false，避免两标签页互写乒乓）
  const setFilter = (
    filter,
    { updateHash = true, persist: shouldPersist = true } = {},
  ) => {
    const next = FILTERS.includes(filter) ? filter : "all";
    state.filter = next;
    if (shouldPersist) persist();
    if (updateHash) {
      history.replaceState(
        null,
        "",
        next === "all" ? location.pathname + location.search : `#${next}`,
      );
    }
    $filters.querySelectorAll(".filters__btn").forEach((b) => {
      const isActive = b.dataset.filter === next;
      b.classList.toggle("is-active", isActive);
      b.setAttribute("aria-pressed", String(isActive));
    });
    render();
  };

  //函数：从 URL 读取筛选状态
  const filterFromHash = () => {
    const f = location.hash.replace(/^#\/?/, "");
    return FILTERS.includes(f) ? f : null;
  };

  //函数：添加 todo
  const addTodo = (text) => {
    const todo = { id: createId(), text, completed: false };
    state.todos.unshift(todo);
    pendingUndo?.items.forEach((item) => {
      item.index += 1;
    });
    persist();
    if (state.filter === "completed") setFilter("all");
    else render();
    $list.querySelector(`[data-id="${todo.id}"]`)?.classList.add("todo--enter");
  };

  //函数：切换任务完成状态
  const toggleTodo = (id) => {
    const todo = state.todos.find((t) => t.id === id);
    if (!todo) return;
    todo.completed = !todo.completed;
    persist();
    const li = $list.querySelector(`[data-id="${id}"]`);
    if (li) {
      if (state.filter === "all") {
        li.classList.toggle("todo--completed", todo.completed);
      } else {
        li.classList.add("todo--leaving");
        li.addEventListener(
          "animationend",
          () => {
            li.remove();
            refreshEmptyState();
          },
          { once: true },
        );
      }
    }
    updateFooter();
  };

  //函数：行内编辑
  const startEdit = (li, todo) => {
    if (
      li.classList.contains("todo--editing") ||
      li.classList.contains("todo--leaving")
    ) {
      return;
    }
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
    const finish = (commit) => {
      if (settled) return;
      settled = true;
      const text = input.value.trim();
      if (commit && text && text !== todo.text) {
        todo.text = text;
        persist();
        li.querySelector(".todo__text").textContent = text;
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
    };
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        finish(true);
      } else if (event.key === "Escape") finish(false);
    });
    input.addEventListener("blur", () => finish(true));
  };

  //函数：从状态中移除指定任务，并返回撤销快照
  const removeFromState = (ids) => {
    const items = [];
    state.todos.forEach((todo, index) => {
      if (ids.includes(todo.id)) items.push({ todo, index });
    });
    if (items.length)
      state.todos = state.todos.filter((t) => !ids.includes(t.id));
    return items;
  };

  //函数：删除任务
  const deleteTodo = (id, li) => {
    const items = removeFromState([id]);
    if (!items.length) return;
    persist();
    updateFooter();
    showUndoToast(items);
    li.classList.add("todo--leaving");
    li.addEventListener(
      "animationend",
      () => {
        li.remove();
        refreshEmptyState();
      },
      { once: true },
    );
  };

  //函数：清除已完成
  const clearCompleted = () => {
    const items = removeFromState(
      state.todos.filter((t) => t.completed).map((t) => t.id),
    );
    if (!items.length) return;
    persist();
    render();
    showUndoToast(items);
  };

  //函数：撤销删除
  //按删除的逆序插回，保证每个下标在还原时仍然有效
  const undoDelete = () => {
    if (!pendingUndo) return;
    const items = [...pendingUndo.items].reverse();
    hideUndoToast();
    items.forEach(({ todo, index }) =>
      state.todos.splice(Math.min(index, state.todos.length), 0, todo),
    );
    persist();
    render();
  };

  //函数：切换全选状态
  const toggleAllTodos = () => {
    if (!state.todos.length) return;
    const hasActive = state.todos.some((t) => !t.completed);
    state.todos.forEach((t) => {
      t.completed = hasActive;
    });
    persist();
    render();
  };

  //函数：判断条目是否处于繁忙态（编辑中/离场中）
  const isBusy = (li) =>
    !li ||
    li.classList.contains("todo--editing") ||
    li.classList.contains("todo--leaving");

  //函数：显示输入错误（提示+抖动）
  const showInputError = () => {
    $input.setAttribute("aria-invalid", "true");
    $hint.hidden = false;
    $form.classList.remove("todo-form--shake");
    void $form.offsetWidth;
    $form.classList.add("todo-form--shake");
  };

  //函数：清除输入错误
  const clearInputError = () => {
    $input.removeAttribute("aria-invalid");
    $hint.hidden = true;
  };

  /* -------------------- 撤销 Toast -------------------- */

  //Toast 入口
  const showUndoToast = (newItems) => {
    if (pendingUndo) {
      clearTimeout(pendingUndo.timer);
      pendingUndo.items = [...pendingUndo.items, ...newItems];
    } else {
      pendingUndo = { items: [...newItems], timer: null };
      $toast.hidden = false;
      requestAnimationFrame(() => $toast.classList.add("toast--visible"));
    }
    const n = pendingUndo.items.length;
    $toastText.textContent = n === 1 ? "任务已删除" : `已删除 ${n} 条任务`;
    restartCountdown();
    pendingUndo.timer = setTimeout(finalizeUndo, UNDO_DURATION);
  };

  //Toast 重启进度条
  const restartCountdown = () => {
    $toastProgress.style.animation = "none";
    void $toastProgress.offsetWidth;
    $toastProgress.style.animation = "";
    $toastProgress.style.animationDuration = `${UNDO_DURATION}ms`;
  };

  //Toast 退场过渡
  const dismissToast = () => {
    $toast.classList.remove("toast--visible");
    setTimeout(() => {
      if (!pendingUndo) $toast.hidden = true;
    }, TOAST_EXIT);
  };

  //Toast 窗口到期
  const finalizeUndo = () => {
    if (!pendingUndo) return;
    pendingUndo = null;
    dismissToast();
  };

  //Toast 主动隐藏
  const hideUndoToast = () => {
    clearTimeout(pendingUndo?.timer);
    pendingUndo = null;
    dismissToast();
  };

  /* -------------------- 事件绑定 -------------------- */

  //监听器：表单提交
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

  //监听器：输入时自动消除错误
  $input.addEventListener("input", () => {
    if ($hint.hidden) return;
    if ($input.value.trim()) clearInputError();
  });

  //监听器：列表 click
  $list.addEventListener("click", (event) => {
    const li = event.target.closest(".todo");
    if (isBusy(li)) return;
    if (event.target.closest(".todo__delete")) deleteTodo(li.dataset.id, li);
    else if (event.target.closest(".todo__edit")) {
      const todo = state.todos.find((t) => t.id === li.dataset.id);
      if (todo) startEdit(li, todo);
    }
  });

  //监听器：列表 dblclick
  $list.addEventListener("dblclick", (event) => {
    const textEl = event.target.closest(".todo__text");
    const todo =
      textEl &&
      state.todos.find((t) => t.id === textEl.closest(".todo").dataset.id);
    if (todo) startEdit(textEl.closest(".todo"), todo);
  });

  //监听器：列表 change
  $list.addEventListener("change", (event) => {
    const li = event.target.closest(".todo");
    if (isBusy(li)) return;
    if (event.target.closest(".todo__checkbox")) toggleTodo(li.dataset.id);
  });

  //监听器：点击筛选按钮
  $filters.addEventListener("click", (event) => {
    const btn = event.target.closest(".filters__btn");
    if (btn) setFilter(btn.dataset.filter);
  });

  //监听器：点击清除已完成按钮
  $clearBtn.addEventListener("click", clearCompleted);

  //监听器：点击全选按钮
  $toggleAll.addEventListener("click", toggleAllTodos);

  //监听器：点击撤销按钮
  $toastUndo.addEventListener("click", undoDelete);

  //监听器：点击主题切换按钮
  $themeToggle.addEventListener("click", cycleTheme);

  //监听器：hashchange
  window.addEventListener("hashchange", () => {
    const f = filterFromHash();
    if (f && f !== state.filter) setFilter(f, { updateHash: false });
  });

  //监听器：多标签页同步
  window.addEventListener("storage", (event) => {
    if (event.key === STORAGE_KEY) {
      const data = store.load();
      state.todos = data.todos;
      setFilter(data.filter, { persist: false });
    } else if (event.key === THEME_KEY) {
      state.theme = store.loadTheme();
      applyTheme();
    }
  });

  //监听器：系统主题改变
  darkMedia?.addEventListener?.("change", () => {
    if (state.theme === "auto") applyTheme();
  });

  //监听器：页面隐藏时立即写入
  window.addEventListener("pagehide", flushPersist);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushPersist();
  });

  /* -------------------- 初始化 -------------------- */

  //函数：初始化
  const init = () => {
    applyTheme();
    //筛选优先级：URL hash > 本地存储 > 'all'
    const fromHash = filterFromHash();
    setFilter(fromHash || state.filter, { updateHash: !fromHash });
  };

  //启动
  try {
    init();
  } catch (err) {
    console.error("[todo] 初始化失败：", err);
  }
})();
