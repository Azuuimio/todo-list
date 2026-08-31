"use strict";

(() => {
  //定义常量
  //localStorage 的键名
  const STORAGE_KEY = "todo-app:v1";
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

  //创建对象：数据读写
  const store = {
    load() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return { todos: [], filter: "all" };
        const data = JSON.parse(raw);
        return {
          todos: Array.isArray(data.todos) ? data.todos : [],
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
  };

  //创建对象：应用状态
  //todos 结构为：
  // {
  //   id: 由 createId() 生成，也是 <li> 上 data-id 的值
  //   text: 用户输入的文本
  //   completed: 布尔值，记录任务是否完成
  // }
  //数组顺序即页面显示顺序
  const persisted = store.load();
  const state = { todos: persisted.todos, filter: persisted.filter };

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

  //函数：创建元素
  //返回结果等价于：<tag class="className">text</tag>
  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };

  //函数：生成 ID
  const createId = () => {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  };

  //函数：创建 SVG 图标
  const svgBtn = (className, label, svg) => {
    const btn = el("button", className);
    btn.type = "button";
    btn.setAttribute("aria-label", label);
    btn.innerHTML = svg;
    return btn;
  };

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
  //   <button class="todo__delete" type="button" aria-label="删除任务：todo.text">
  //     <svg viewBox="0 0 12 12"><path d="M2 2l8 8M10 2l-8 8"/></svg>
  //   </button>
  // </li>
  //结构树如下：
  // li.todo
  // ├─ label.todo__check
  // │   ├─ input.todo__checkbox   ← 真正的勾选控件，透明覆盖在上面
  // │   └─ span.todo__box         ← 肉眼看到的方框，纯装饰
  // |       └── svg               ← 肉眼看到的对勾，纯装饰
  // ├─ span.todo__text            ← 任务文字，勾选后 CSS 给它画删除线
  // ├─ button.todo__edit          ← hover 行时才出现的编辑按钮
  // └─ button.todo__delete        ← hover 行时才出现的删除按钮
  //    └── svg                    ← hover 行时才出现的删除按钮里面的叉号
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

  //函数：防抖写入
  const persist = debounce(() => store.save(), SAVE_DELAY);

  //函数：获取可见任务
  const getVisibleTodos = () => {
    if (state.filter === "active") {
      return state.todos.filter((t) => !t.completed);
    } else if (state.filter === "completed") {
      return state.todos.filter((t) => t.completed);
    } else {
      return state.todos.filter(() => true);
    }
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

  //函数：设置筛选状态
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

  //函数：输入错误
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

  //函数：添加 todo
  const addTodo = (text) => {
    state.todos.unshift({ id: createId(), text: text, completed: false });
    persist();
    if (state.filter === "completed") setFilter("all");
    else render();
  };

  //函数：切换任务完成状态
  const toggleTodo = (id) => {
    const todo = state.todos.find((t) => t.id === id);
    if (!todo) return;
    todo.completed = !todo.completed;
    persist();
    render();
  };

  //函数：行内编辑
  const startEdit = (li, todo) => {
    if (li.classList.contains("todo--editing")) return;
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
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        finish(true);
      } else if (e.key === "Escape") finish(false);
    });
    input.addEventListener("blur", () => finish(true));
  };

  //函数：删除任务
  const deleteTodo = (id) => {
    state.todos = state.todos.filter((t) => t.id !== id);
    persist();
    render();
  };

  //函数：空状态
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

  //函数：清除已完成
  const clearCompleted = () => {
    const completedIds = state.todos
      .filter((t) => t.completed)
      .map((t) => t.id);
    if (!completedIds.length) return;
    state.todos = state.todos.filter((t) => !completedIds.includes(t.id));
    persist();
    render();
  };

  //函数：繁忙态守卫
  const isBusy = (li) => !li || li.classList.contains("todo--editing");

  //函数：输入时自动消除错误
  $input.addEventListener(
    "input",
    debounce(() => {
      if ($input.value.trim()) clearInputError();
    }, 200),
  );

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

  //监听器：列表 dbclick
  $list.addEventListener("dblclick", (e) => {
    const textEl = e.target.closest(".todo__text");
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

  //监听器：监听 hashchange
  window.addEventListener("hashchange", () => {
    const f = filterFromHash();
    if (f && f !== state.filter) setFilter(f, { updateHash: false });
  });

  $clearBtn.addEventListener("click", clearCompleted);
  $toggleAll.addEventListener("click", toggleAllTodos);

  //特定情况下，立即写入数据
  const flushPersist = () => store.save();
  window.addEventListener("pagehide", flushPersist);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushPersist();
  });

  //初始化
  const fromHash = filterFromHash();
  setFilter(fromHash || state.filter);
})();
