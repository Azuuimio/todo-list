"use strict";

(() => {
  //创建对象：应用状态
  const state = {
    todos: [],
  };
  //DOM 引用
  const $ = (id) => document.getElementById(id);
  const $form = $("todo-form");
  const $input = $("todo-input");
  const $list = $("todo-list");
  const $count = $("todo-count");
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
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  };
  const svgBtn = (className, label, svg) => {
    const btn = el("button", className);
    btn.type = "button";
    btn.setAttribute("aria-label", label);
    btn.innerHTML = svg; // 静态字符串，安全
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
        "todo__delete",
        `删除任务：${todo.text}`,
        '<svg viewBox="0 0 12 12"><path d="M2 2l8 8M10 2l-8 8"/></svg>',
      ),
    );
    return li;
  };
  //函数：离线拼装
  //拼装的数据来源：state.todos
  const render = () => {
    const fragment = document.createDocumentFragment();
    state.todos.forEach((todo) => fragment.append(createTodoElement(todo)));
    $list.replaceChildren(fragment);
    $count.textContent = `${state.todos.length} 项待完成`;
  };
  //函数：添加 todo
  const addTodo = (text) => {
    state.todos.unshift({ id: createId(), text: text, completed: false });
    render();
  };
  //表单提交事件
  $form.addEventListener("submit", (event) => {
    event.preventDefault();
    const text = $input.value.trim();
    if (!text) return;
    addTodo(text);
    $input.value = "";
    $input.focus();
  });
  //初始化
  render();
})();
