"use strict";

const STORAGE_KEY = "todo-habit-app-v1";
const SUGGESTIONS = ["Wasser trinken", "10 Minuten lesen", "Spazieren gehen"];
const WEEKDAYS = {
  sonntag: 0, montag: 1, dienstag: 2, mittwoch: 3,
  donnerstag: 4, freitag: 5, samstag: 6,
};

let state = load();
let weekOffset = 0;

/* ---------- Speicher ---------- */

function load() {
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (data && Array.isArray(data.todos) && Array.isArray(data.habits)) return data;
  } catch (e) { /* leerer Start */ }
  return { todos: [], habits: [] };
}

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

/* ---------- Datum ---------- */

function iso(d) {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return d.getFullYear() + "-" + m + "-" + day;
}

function fromIso(s) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function addDays(d, n) {
  const c = new Date(d);
  c.setDate(c.getDate() + n);
  return c;
}

function today() {
  const t = new Date();
  return new Date(t.getFullYear(), t.getMonth(), t.getDate());
}

function mondayOf(d) {
  const offset = (d.getDay() + 6) % 7;
  return addDays(d, -offset);
}

function shortDate(d) {
  return d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" });
}

function formatDue(s) {
  const d = fromIso(s);
  const diff = Math.round((d - today()) / 86400000);
  const rel = { "-1": "Gestern", "0": "Heute", "1": "Morgen", "2": "Übermorgen" }[diff];
  const prefix = rel || d.toLocaleDateString("de-DE", { weekday: "short" });
  return prefix + ", " + shortDate(d);
}

/* ---------- Datum aus Text erkennen ---------- */

// \b kennt keine Umlaute. Darum eigene Wortgrenzen.
function word(pattern) {
  return new RegExp("(?<![\\p{L}\\p{N}])(?:" + pattern + ")(?![\\p{L}\\p{N}])", "iu");
}

function parseTodo(raw) {
  let text = raw.trim();
  let due = null;
  const base = today();

  const rules = [
    [word("übermorgen|uebermorgen"), () => addDays(base, 2)],
    [word("morgen"), () => addDays(base, 1)],
    [word("heute"), () => base],
  ];
  for (const [re, fn] of rules) {
    if (!due && re.test(text)) {
      due = fn();
      text = text.replace(re, "");
    }
  }

  if (!due) {
    const m = text.match(/(\d{1,2})\.(\d{1,2})\.?(\d{4})?/);
    if (m) {
      const year = m[3] ? Number(m[3]) : base.getFullYear();
      const date = new Date(year, Number(m[2]) - 1, Number(m[1]));
      if (!m[3] && date < base) date.setFullYear(year + 1);
      if (!isNaN(date)) {
        due = date;
        text = text.replace(m[0], "");
      }
    }
  }

  if (!due) {
    const re = word(Object.keys(WEEKDAYS).join("|"));
    const m = text.match(re);
    if (m) {
      const target = WEEKDAYS[m[0].toLowerCase()];
      const delta = ((target - base.getDay() + 7) % 7) || 7;
      due = addDays(base, delta);
      text = text.replace(m[0], "");
    }
  }

  text = text.replace(/(^|\s)(am|bis)\s*$/i, "").replace(/^\s*(am|bis)(\s|$)/i, "")
             .replace(/\s{2,}/g, " ").replace(/^[\s,.:-]+|[\s,.:-]+$/g, "");
  if (!text) text = raw.trim();
  if (text) text = text.charAt(0).toUpperCase() + text.slice(1);

  // Ohne Datum im Text gilt das Datum, an dem die Aufgabe angelegt wird.
  return { title: text, due: iso(due || base) };
}

/* ---------- Habits ---------- */

function countOn(habit, date) {
  const key = iso(date);
  return habit.log.filter((x) => x === key).length;
}

function isDone(habit, date) {
  return countOn(habit, date) > 0;
}

function doneInWeek(habit, monday) {
  let n = 0;
  for (let i = 0; i < 7; i++) n += countOn(habit, addDays(monday, i));
  return n;
}

function habitDoneToday(habit) {
  if (isDone(habit, today())) return true;
  return habit.perWeek < 7 && doneInWeek(habit, mondayOf(today())) >= habit.perWeek;
}

function streak(habit) {
  const t = today();
  if (habit.perWeek === 7) {
    let day = isDone(habit, t) ? t : addDays(t, -1);
    let n = 0;
    while (isDone(habit, day)) {
      n++;
      day = addDays(day, -1);
    }
    return { n, unit: n === 1 ? "Tag" : "Tage" };
  }
  let week = mondayOf(t);
  let n = 0;
  let current = true;
  while (n <= 520) {
    if (doneInWeek(habit, week) >= habit.perWeek) n++;
    else if (!current) break;
    current = false;
    week = addDays(week, -7);
  }
  return { n, unit: n === 1 ? "Woche" : "Wochen" };
}

// Täglich: Tap schaltet um. Wöchentlich: jeder Tap zählt eins hoch.
function tapHabit(id) {
  const habit = state.habits.find((h) => h.id === id);
  if (!habit) return;
  const key = iso(today());
  if (habit.perWeek === 7) {
    const i = habit.log.indexOf(key);
    if (i === -1) habit.log.push(key);
    else habit.log.splice(i, 1);
  } else if (doneInWeek(habit, mondayOf(today())) < habit.perWeek) {
    habit.log.push(key);
  }
  save();
  render();
}

// Nimmt den letzten Eintrag dieser Woche zurück.
function undoHabit(id) {
  const habit = state.habits.find((h) => h.id === id);
  if (!habit) return;
  const from = iso(mondayOf(today()));
  const to = iso(today());
  let best = -1;
  habit.log.forEach((d, i) => {
    if (d >= from && d <= to && (best === -1 || d >= habit.log[best])) best = i;
  });
  if (best !== -1) habit.log.splice(best, 1);
  save();
  render();
}

function addHabit(name, perWeek) {
  state.habits.push({ id: uid(), name: name.trim(), perWeek, log: [] });
  save();
  render();
}

function removeHabit(id) {
  const habit = state.habits.find((h) => h.id === id);
  if (!habit || !confirm("„" + habit.name + "“ löschen?")) return;
  state.habits = state.habits.filter((h) => h.id !== id);
  save();
  render();
}

/* ---------- To-dos ---------- */

function addTodo(raw, pickedDate) {
  const parsed = parseTodo(raw);
  if (!parsed.title) return;
  const due = pickedDate || parsed.due;
  state.todos.push({ id: uid(), title: parsed.title, due, done: false });
  save();
  render();
}

// Text anklicken, ändern, Enter oder woanders klicken speichert. Esc bricht ab.
function startEdit(li, textNode, todo) {
  const input = document.createElement("input");
  input.type = "text";
  input.className = "edit-input";
  input.value = todo.title;
  input.setAttribute("aria-label", "Aufgabe bearbeiten");
  let finished = false;

  function finish(saveIt) {
    if (finished) return;
    finished = true;
    const value = input.value.trim();
    if (saveIt && value && value !== todo.title) {
      todo.title = value;
      save();
    }
    render();
  }

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") finish(true);
    else if (e.key === "Escape") finish(false);
  });
  input.addEventListener("blur", () => finish(true));

  li.replaceChild(input, textNode);
  input.focus();
  input.select();
}

function setTodoDue(id, due) {
  const todo = state.todos.find((t) => t.id === id);
  if (!todo) return;
  todo.due = due;
  save();
  render();
}

function toggleTodo(id) {
  const todo = state.todos.find((t) => t.id === id);
  if (!todo) return;
  todo.done = !todo.done;
  save();
  render();
}

function removeTodo(id) {
  state.todos = state.todos.filter((t) => t.id !== id);
  save();
  render();
}

/* ---------- Anzeige ---------- */

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function renderHabits() {
  const box = document.getElementById("habits");
  box.replaceChildren();

  if (state.habits.length === 0) {
    const empty = el("div", "empty");
    empty.append(el("p", null, "Was möchtest du jeden Tag tun?"));
    const chips = el("div", "chips");
    for (const name of SUGGESTIONS) {
      const chip = el("button", "chip", name);
      chip.type = "button";
      chip.addEventListener("click", () => addHabit(name, 7));
      chips.append(chip);
    }
    empty.append(chips);
    box.append(empty);
    return;
  }

  const t = today();
  for (const habit of state.habits) {
    const weekly = habit.perWeek < 7;
    const count = weekly ? doneInWeek(habit, mondayOf(t)) : 0;
    const done = weekly ? count >= habit.perWeek : isDone(habit, t);
    const partial = weekly && !done && count > 0;

    const wrap = el("div", "habit-wrap");
    const tile = el("button", "habit" + (done ? " done" : "") + (partial ? " partial" : ""));
    tile.type = "button";
    tile.append(el("div", "circle", done ? "✓" : partial ? String(count) : "✓"));
    tile.append(el("div", "name", habit.name));

    const s = streak(habit);
    const parts = [];
    if (weekly) parts.push(count + " von " + habit.perWeek + " diese Woche");
    parts.push(s.n > 0 ? "🔥 " + s.n + " " + s.unit : "Noch keine Serie");
    tile.append(el("div", "meta", parts.join(" · ")));
    tile.addEventListener("click", () => tapHabit(habit.id));

    const del = el("button", "remove", "×");
    del.type = "button";
    del.setAttribute("aria-label", "Habit löschen");
    del.addEventListener("click", () => removeHabit(habit.id));
    wrap.append(tile, del);

    if (weekly && count > 0) {
      const undo = el("button", "undo", "−");
      undo.type = "button";
      undo.title = "Letzten Eintrag zurücknehmen";
      undo.setAttribute("aria-label", "Letzten Eintrag zurücknehmen");
      undo.addEventListener("click", () => undoHabit(habit.id));
      wrap.append(undo);
    }
    box.append(wrap);
  }
}

function todoItem(todo) {
  const li = el("li", todo.done ? "done" : "");

  const check = el("button", "check", todo.done ? "✓" : "");
  check.type = "button";
  check.setAttribute("aria-label", "Erledigt umschalten");
  check.addEventListener("click", () => toggleTodo(todo.id));

  const text = el("span", "text", todo.title);
  text.title = "Zum Bearbeiten anklicken";
  text.addEventListener("click", () => startEdit(li, text, todo));
  li.append(check, text);

  const late = todo.due && !todo.done && todo.due < iso(today());
  const wrap = el("span", "due-wrap");
  wrap.title = "Datum ändern";
  wrap.append(el("span", "due" + (late ? " late" : "") + (todo.due ? "" : " empty-date"),
    todo.due ? formatDue(todo.due) : "+ Datum"));
  const picker = document.createElement("input");
  picker.type = "date";
  picker.value = todo.due || "";
  picker.setAttribute("aria-label", "Datum ändern");
  picker.addEventListener("click", () => {
    if (picker.showPicker) {
      try { picker.showPicker(); } catch (e) { /* Browser öffnet selbst */ }
    }
  });
  picker.addEventListener("change", () => setTodoDue(todo.id, picker.value || null));
  wrap.append(picker);
  li.append(wrap);

  const del = el("button", "remove", "×");
  del.type = "button";
  del.setAttribute("aria-label", "Aufgabe löschen");
  del.addEventListener("click", () => removeTodo(todo.id));
  li.append(del);
  return li;
}

function fillList(id, items, emptyText) {
  const list = document.getElementById(id);
  list.replaceChildren();
  if (items.length === 0 && emptyText) {
    list.append(el("li", "none", emptyText));
    return;
  }
  for (const todo of items) list.append(todoItem(todo));
}

function renderTodos() {
  const t = iso(today());
  const open = state.todos.filter((x) => !x.done);
  const dueToday = open.filter((x) => x.due && x.due <= t)
                       .sort((a, b) => a.due.localeCompare(b.due));
  const soon = open.filter((x) => !x.due || x.due > t)
                   .sort((a, b) => (a.due || "9999").localeCompare(b.due || "9999"));
  const done = state.todos.filter((x) => x.done);

  fillList("todos-today", dueToday, "Nichts fällig. 🎉");
  fillList("todos-soon", soon, "Nichts geplant.");
  fillList("todos-done", done);
  document.getElementById("done-count").textContent = done.length;
  document.getElementById("done-wrap").hidden = done.length === 0;
}

function renderProgress() {
  const key = iso(today());
  const habitsDone = state.habits.filter(habitDoneToday).length;
  const todosToday = state.todos.filter((x) => (x.due && x.due <= key && !x.done) || (x.done && x.due === key));
  const todosDone = todosToday.filter((x) => x.done).length;

  const total = state.habits.length + todosToday.length;
  const done = habitsDone + todosDone;
  const ring = document.getElementById("ring");
  ring.style.setProperty("--p", total ? Math.round((done / total) * 100) : 0);
  document.getElementById("ring-text").textContent = done + "/" + total;
}

/* ---------- Wochenübersicht ---------- */

function renderWeek() {
  const monday = addDays(mondayOf(today()), weekOffset * 7);
  const sunday = addDays(monday, 6);
  document.getElementById("week-label").textContent =
    shortDate(monday) + " – " + shortDate(sunday) + (weekOffset === 0 ? " (diese Woche)" : "");

  const box = document.getElementById("week");
  box.replaceChildren();
  const t = today();

  for (let i = 0; i < 7; i++) {
    const day = addDays(monday, i);
    const key = iso(day);
    const row = el("div", "day" + (key === iso(t) ? " is-today" : ""));
    row.append(el("div", "day-label",
      day.toLocaleDateString("de-DE", { weekday: "short" }) + " " + shortDate(day)));

    const chips = el("div", "day-chips");

    for (const habit of state.habits) {
      const n = countOn(habit, day);
      if (habit.perWeek === 7) {
        chips.append(el("span", "tag habit" + (n > 0 ? " on" : ""), (n > 0 ? "✓ " : "") + habit.name));
      } else if (n > 0) {
        chips.append(el("span", "tag habit on", "✓ " + habit.name + (n > 1 ? " ×" + n : "")));
      }
    }

    for (const todo of state.todos) {
      if (todo.due === key) {
        chips.append(el("span", "tag todo" + (todo.done ? " on" : ""), (todo.done ? "✓ " : "") + todo.title));
      }
    }

    if (!chips.children.length) chips.append(el("span", "muted", "–"));
    row.append(chips);
    box.append(row);
  }
}

function render() {
  document.getElementById("date").textContent =
    new Date().toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long" });
  renderHabits();
  renderTodos();
  renderProgress();
  renderWeek();
}

/* ---------- Ereignisse ---------- */

const todoForm = document.getElementById("todo-form");
const todoInput = document.getElementById("todo-input");
const todoDate = document.getElementById("todo-date");
todoForm.addEventListener("submit", (e) => {
  e.preventDefault();
  if (!todoInput.value.trim()) return;
  addTodo(todoInput.value, todoDate.value);
  todoInput.value = "";
  todoDate.value = "";
  todoInput.focus();
});

const dialog = document.getElementById("habit-dialog");
const habitForm = document.getElementById("habit-form");
const habitName = document.getElementById("habit-name");
const habitFreq = document.getElementById("habit-freq");

document.getElementById("add-habit").addEventListener("click", () => {
  habitForm.reset();
  dialog.showModal();
  habitName.focus();
});
document.getElementById("habit-cancel").addEventListener("click", () => dialog.close());
habitForm.addEventListener("submit", () => {
  if (habitName.value.trim()) addHabit(habitName.value, Number(habitFreq.value));
});

document.getElementById("week-prev").addEventListener("click", () => { weekOffset--; renderWeek(); });
document.getElementById("week-next").addEventListener("click", () => { weekOffset++; renderWeek(); });
document.getElementById("week-now").addEventListener("click", () => { weekOffset = 0; renderWeek(); });

render();
