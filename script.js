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
  //返回结果等价于：
  //<tag class="className">text</tag>
  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  //函数：生成 ID
  const createId = () =>
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  //函数：创建单条 todo 的 DOM 元素
  //返回结果等价于：
  //<li class="todo" data-id="todo.id">
  //  <span class="todo__text">todo.text</span>
  //</li>
  const createTodoElement = (todo) => {
    const li = el("li", "todo");
    li.dataset.id = todo.id;
    li.append(el("span", "todo__text", todo.text));
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
    state.todos.unshift({ id: createId(), text, completed: false });
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
  console.log(state.todos);
})();
