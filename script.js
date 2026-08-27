"use strict";

const $form = document.getElementById("todo-form");
const $input = document.getElementById("todo-input");
const $list = document.getElementById("todo-list");

$form.addEventListener("submit", (event) => {
  //阻止页面
  event.preventDefault();
  //获取并校验输入
  const text = $input.value.trim();
  if (!text) return;
  //创建 DOM 元素
  const li = document.createElement("li");
  li.className = "todo";
  const span = document.createElement("span");
  span.className = "todo__text";
  span.textContent = text;
  //清空输入框，复位光标
  $input.value = "";
  $input.focus();
  //挂载到 DOM 树
  li.append(span);
  $list.append(li);
  //清空输入并保持焦点
  $input.value = "";
  $input.focus();
});
