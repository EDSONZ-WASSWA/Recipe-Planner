/* Recipe & Meal Planner - single page app (vanilla JS, no libraries).
   Safety rule: API/user data is NEVER inserted with innerHTML. All DOM is built with el(). */
'use strict';

// ===================================================================
// Constants (enum option lists only - all records come from the API)
// ===================================================================
const CATEGORIES = ['breakfast', 'lunch', 'dinner', 'snack', 'dessert'];
const DIETARY = ['vegetarian', 'vegan', 'gluten-free', 'dairy-free', 'nut-free', 'high-protein', 'low-carb'];
const DIFFICULTIES = ['easy', 'medium', 'hard'];
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const MEALS = ['breakfast', 'lunch', 'dinner', 'snack'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const NUTRITION_FIELDS = [
  ['calories', 'Calories', 'kcal'], ['protein_g', 'Protein', 'g'], ['carbs_g', 'Carbs', 'g'], ['fat_g', 'Fat', 'g'],
  ['fiber_g', 'Fiber', 'g'], ['sugar_g', 'Sugar', 'g'], ['sodium_mg', 'Sodium', 'mg'],
];
const NAV = [
  ['recipes', 'Recipes'], ['cook', 'What can I cook?'], ['nutrition', 'Nutrition search'], ['planner', 'Meal planner'],
  ['shopping', 'Shopping list'], ['add', 'Add recipe'], ['dashboard', 'Dashboard'],
];

// ===================================================================
// DOM helpers
// ===================================================================
function el(tag, attrs, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs || {})) {
    if (value === null || value === undefined || value === false) continue;
    if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2).toLowerCase(), value);
    else if (key === 'class') node.className = value;
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else if (['value', 'checked', 'disabled', 'selected', 'open'].includes(key)) node[key] = value;
    else node.setAttribute(key, value === true ? '' : String(value));
  }
  appendChildren(node, children);
  return node;
}
function appendChildren(node, children) {
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    node.appendChild(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}
const $ = (selector, root = document) => root.querySelector(selector);
const clear = (node) => node.replaceChildren();
const view = () => $('#view');

function spinner() { return el('div', { class: 'spinner', role: 'status', 'aria-label': 'Loading' }); }
function loadingBox(text = 'Loading...') { return el('div', { class: 'loading-box' }, spinner(), el('p', null, text)); }
const SVG_NS = 'http://www.w3.org/2000/svg';
const ART = {
  bowl: [['light', 'M16 46h64c0 18-12 30-32 30S16 64 16 46z'], ['light', 'M36 84h24'], ['dark', 'M48 36c0-8 6-12 12-12 0 8-5 12-12 12z'], ['dark', 'M48 36v8'], ['dark', 'M48 38c0-6-4-9-10-9 0 6 4 9 10 9z']],
  search: [['light', 'M40 18a22 22 0 1 1 0 44 22 22 0 0 1 0-44z'], ['dark', 'M56 58l22 22'], ['dark', 'M30 50c0-10 8-18 20-18 0 10-8 18-20 18z'], ['dark', 'M30 50l12-12']],
  calendar: [['light', 'M24 22h48a6 6 0 0 1 6 6v46a6 6 0 0 1-6 6H24a6 6 0 0 1-6-6V28a6 6 0 0 1 6-6z'], ['light', 'M18 40h60'], ['dark', 'M34 14v14'], ['dark', 'M62 14v14'], ['dark', 'M32 54h8M44 54h8M56 54h8M32 66h8M44 66h8']],
  basket: [['light', 'M14 40h68l-8 36H22z'], ['light', 'M38 50v18M48 50v18M58 50v18'], ['dark', 'M30 40l12-20'], ['dark', 'M66 40L54 20'], ['dark', 'M10 40h76']],
};
function illustration(kind, size = 96) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 96 96');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('class', 'illustration');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke-width', '2.5');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  for (const [tone, d] of ART[kind]) {
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', d);
    path.setAttribute('stroke', tone === 'dark' ? '#2E7D32' : '#A5D6A7');
    svg.appendChild(path);
  }
  return svg;
}
function emojiTile(emoji, category, size = 'lg') {
  return el('span', { class: `tile tile-${size}`, dataset: { category: category || '' }, 'aria-hidden': 'true' }, emoji);
}
function skeletonGrid(count = 6) {
  const card = () => el('div', { class: 'recipe-card skeleton-card', 'aria-hidden': 'true' },
    el('div', { class: 'card-top' }, el('div', { class: 'skel', style: 'width:56px;height:56px;border-radius:12px' }),
      el('div', { style: 'flex:1' }, el('div', { class: 'skel', style: 'height:16px;width:70%;margin-bottom:8px' }), el('div', { class: 'skel', style: 'height:12px;width:45%' }))),
    el('div', { class: 'skel', style: 'height:12px;width:90%;margin-top:12px' }),
    el('div', { class: 'skel', style: 'height:12px;width:60%;margin-top:12px' }));
  return el('div', { class: 'grid skeleton-grid', 'aria-busy': 'true', role: 'status', 'aria-label': 'Loading' }, Array.from({ length: count }, card));
}
function emptyState(message, action, art) {
  return el('div', { class: 'empty' },
    art ? illustration(art) : null,
    el('p', null, message),
    action ? el('button', { class: 'btn btn-secondary', type: 'button', onClick: action.onClick }, action.label) : null);
}
// Disables a button and shows a spinner while a request runs.
function setLoading(button, loading) {
  if (!button) return;
  if (loading) {
    button._label = Array.from(button.childNodes);
    button.disabled = true;
    button.replaceChildren(el('span', { class: 'spinner' }), ' Working...');
  } else {
    button.disabled = false;
    if (button._label) button.replaceChildren(...button._label);
  }
}
async function withLoading(button, fn) {
  setLoading(button, true);
  try { return await fn(); } finally { setLoading(button, false); }
}
function debounce(fn, ms) {
  let timer;
  return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), ms); };
}

// ===================================================================
// API wrapper
// ===================================================================
async function api(path, { method = 'GET', body } = {}) {
  let res;
  try {
    res = await fetch(path, {
      method,
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    throw new Error('Cannot reach the server. Is it running?');
  }
  let json = null;
  try { json = await res.json(); } catch (e) { /* not JSON */ }
  if (!res.ok || !json || !json.success) {
    const err = new Error((json && json.error) || `Request failed (${res.status})`);
    err.details = (json && json.details) || [];
    err.status = res.status;
    throw err;
  }
  return json;
}

// ===================================================================
// Toasts
// ===================================================================
function toast(message, type = 'success', details = []) {
  const root = $('#toast-root');
  const node = el('div', { class: `toast toast-${type}`, role: type === 'error' ? 'alert' : 'status' },
    el('span', null, message),
    details.length ? el('ul', null, details.map((d) => el('li', null, d))) : null);
  root.appendChild(node);
  while (root.children.length > 3) root.firstChild.remove();
  setTimeout(() => node.remove(), details.length ? 6500 : 3500);
}
function toastError(err) { toast(err.message || 'Something went wrong', 'error', err.details || []); }

// ===================================================================
// Modals (stackable) + confirm dialog
// ===================================================================
const modalStack = [];
function openModal(content, { wide = false, label = 'Dialog', onClose } = {}) {
  const previousFocus = document.activeElement;
  const closeBtn = el('button', { class: 'icon-btn modal-close', type: 'button', 'aria-label': 'Close dialog' }, '×');
  const dialog = el('div', { class: `modal${wide ? ' modal-wide' : ''}`, role: 'dialog', 'aria-modal': 'true', 'aria-label': label, tabindex: '-1' }, closeBtn, content);
  const overlay = el('div', { class: 'overlay' }, dialog);
  const handle = { overlay, dialog };
  handle.close = () => {
    const i = modalStack.indexOf(handle);
    if (i === -1) return;
    modalStack.splice(i, 1);
    overlay.remove();
    if (!modalStack.length) document.body.classList.remove('modal-open');
    if (previousFocus && previousFocus.focus && document.contains(previousFocus)) previousFocus.focus();
    if (onClose) onClose();
  };
  closeBtn.addEventListener('click', handle.close);
  overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) handle.close(); });
  $('#modal-root').appendChild(overlay);
  modalStack.push(handle);
  document.body.classList.add('modal-open');
  dialog.focus();
  return handle;
}
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && modalStack.length) modalStack[modalStack.length - 1].close();
});
function confirmDialog(message, { confirmText = 'Confirm', danger = false } = {}) {
  return new Promise((resolve) => {
    let answered = false;
    const answer = (value) => { answered = true; modal.close(); resolve(value); };
    const content = el('div', null,
      el('h3', null, 'Please confirm'),
      el('p', null, message),
      el('div', { class: 'modal-actions' },
        el('button', { class: 'btn btn-secondary', type: 'button', onClick: () => answer(false) }, 'Cancel'),
        el('button', { class: `btn ${danger ? 'btn-danger-solid' : ''}`, type: 'button', onClick: () => answer(true) }, confirmText)));
    const modal = openModal(content, { label: 'Confirmation', onClose: () => { if (!answered) resolve(false); } });
  });
}

// ===================================================================
// Formatting helpers
// ===================================================================
function formatQty(value) {
  const n = Math.round(Number(value) * 100) / 100;
  const whole = Math.trunc(n);
  const frac = Math.round((n - whole) * 100) / 100;
  const fractions = { 0.25: '¼', 0.5: '½', 0.75: '¾', 0.33: '⅓', 0.67: '⅔' };
  if (fractions[frac] && n > 0) return whole ? `${whole}${fractions[frac]}` : fractions[frac];
  return String(n);
}
function formatMinutes(min) {
  const m = Math.round(Number(min) || 0);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h} h ${r} min` : `${h} h`;
}
const capitalize = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
const pad2 = (n) => String(n).padStart(2, '0');
function toDateString(d) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }
function parseDateString(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }
function mondayOf(date) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}
function addDays(dateStr, n) { const d = parseDateString(dateStr); d.setDate(d.getDate() + n); return toDateString(d); }
const shortDate = (d) => `${d.getDate()} ${MONTHS[d.getMonth()]}`;
function formatWeekRange(weekStart) {
  const a = parseDateString(weekStart);
  const b = parseDateString(addDays(weekStart, 6));
  return `${shortDate(a)} – ${shortDate(b)} ${b.getFullYear()}`;
}

// ===================================================================
// Shared UI pieces
// ===================================================================
function codePanel(title, data) {
  const text = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
  const pre = el('pre');
  pre.textContent = text;
  const copy = el('button', { class: 'btn btn-secondary btn-small copy-btn', type: 'button' }, 'Copy');
  copy.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(text); copy.textContent = 'Copied'; }
    catch (e) { copy.textContent = 'Copy failed'; }
    setTimeout(() => { copy.textContent = 'Copy'; }, 1500);
  });
  return el('details', { class: 'panel' }, el('summary', null, title), el('div', { class: 'code-wrap' }, copy, pre));
}
const difficultyBadge = (d) => el('span', { class: `difficulty difficulty-${d}` }, capitalize(d));
// At most two dietary tags are shown; the rest collapse into a "+N" tag.
function dietBadges(list, max = 2) {
  const items = list || [];
  return el('div', { class: 'tags' },
    items.slice(0, max).map((d) => el('span', { class: 'tag' }, d)),
    items.length > max ? el('span', { class: 'tag', title: items.slice(max).join(', ') }, `+${items.length - max}`) : null);
}
function optionList(values, allLabel) {
  return [allLabel ? el('option', { value: '' }, allLabel) : null, ...values.map((v) => el('option', { value: v }, capitalize(v)))];
}
function field(label, input, id, errorKey) {
  return el('div', { class: 'field' },
    el('label', { for: id }, label), input,
    el('span', { class: 'field-error', 'data-error-for': errorKey || id, role: 'alert' }));
}

// Shared week state (persisted so refresh keeps the selected week)
let currentWeekStart = (() => {
  const saved = sessionStorage.getItem('weekStart');
  return saved && /^\d{4}-\d{2}-\d{2}$/.test(saved) ? saved : toDateString(mondayOf(new Date()));
})();
function setWeek(ws) { currentWeekStart = ws; sessionStorage.setItem('weekStart', ws); }

// Called by views so the recipe modal can refresh whatever list is behind it
let refreshCurrentView = () => {};

// ===================================================================
// Recipe card + detail modal
// ===================================================================
function heartIcon() {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(ns, 'path');
  path.setAttribute('d', 'M12 20.5C5 15.5 3 12.3 3 9.3 3 6.9 4.8 5 7.1 5c1.9 0 3.7 1.1 4.9 3 1.2-1.9 3-3 4.9-3C19.2 5 21 6.9 21 9.3c0 3-2 6.2-9 11.2z');
  svg.appendChild(path);
  return svg;
}
function heartButton(recipe, onChange) {
  const label = () => `${recipe.isFavorite ? 'Remove from' : 'Add to'} favourites: ${recipe.title}`;
  const btn = el('button', { class: 'heart', type: 'button', 'aria-pressed': String(!!recipe.isFavorite), 'aria-label': label() }, heartIcon());
  btn.addEventListener('click', async (e) => {
    e.stopPropagation();
    btn.disabled = true;
    try {
      const res = await api(`/api/recipes/${recipe._id}/favorite`, { method: 'PATCH' });
      recipe.isFavorite = res.data.isFavorite;
      btn.setAttribute('aria-pressed', String(recipe.isFavorite));
      btn.setAttribute('aria-label', label());
      if (onChange) onChange(recipe);
    } catch (err) { toastError(err); } finally { btn.disabled = false; }
  });
  return btn;
}
function activateOnKey(node, fn) {
  node.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn(); } });
}
function recipeCard(r, { onFavorite } = {}) {
  const open = () => openRecipeModal(r._id);
  const card = el('article', { class: 'recipe-card', tabindex: '0', role: 'button', 'aria-label': `Open recipe ${r.title}`, dataset: { id: r._id }, onClick: open },
    el('div', { class: 'card-top' },
      emojiTile(r.emoji || '🍽️', r.category, 'lg'),
      el('div', null, el('h3', null, r.title), el('div', { class: 'sub' }, `${r.cuisine} · ${capitalize(r.category)}`))),
    el('p', { class: 'desc', title: r.description }, r.description),
    el('div', { class: 'meta' },
      el('div', null, `Prep ${formatMinutes(r.prepTimeMin)} · Cook ${formatMinutes(r.cookTimeMin)} · Total ${formatMinutes(r.totalTimeMin)}`),
      el('div', null, `${r.nutrition.calories} kcal · `, difficultyBadge(r.difficulty))),
    dietBadges(r.dietary));
  card.appendChild(heartButton(r, onFavorite));
  activateOnKey(card, open);
  return card;
}

async function openRecipeModal(id) {
  const body = el('div', null, loadingBox('Loading recipe...'));
  const modal = openModal(body, { wide: true, label: 'Recipe details' });
  try {
    const { data: r } = await api(`/api/recipes/${id}`);
    renderRecipeDetail(body, modal, r);
  } catch (err) {
    clear(body);
    body.appendChild(emptyState(err.message));
  }
}

function renderRecipeDetail(body, modal, r) {
  let servings = r.servings;
  const qtyEls = [];
  const ingList = el('ul', { class: 'ingredient-list' }, r.ingredients.map((ing) => {
    const q = el('span', { class: 'qty' });
    qtyEls.push([q, ing]);
    const row = el('li', { role: 'checkbox', 'aria-checked': 'false', tabindex: '0' },
      el('span', { class: 'tick', 'aria-hidden': 'true' }), q,
      el('span', { class: 'ing-name' }, capitalize(ing.name), ing.optional ? el('span', { class: 'muted' }, ' (optional)') : null));
    const toggle = () => row.setAttribute('aria-checked', String(row.getAttribute('aria-checked') !== 'true'));
    row.addEventListener('click', toggle);
    row.addEventListener('keydown', (e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); toggle(); } });
    return row;
  }));
  const servingsInput = el('input', { class: 'input', type: 'number', min: '1', max: '100', value: String(servings), id: 'servings-input', 'aria-label': 'Servings' });
  const updateScale = () => {
    const n = Math.min(100, Math.max(1, parseInt(servingsInput.value, 10) || 1));
    servings = n;
    for (const [node, ing] of qtyEls) node.textContent = `${formatQty((ing.quantity * n) / r.servings)} ${ing.unit}`;
  };
  const setServings = (n) => { servingsInput.value = String(Math.min(100, Math.max(1, n))); updateScale(); };
  servingsInput.addEventListener('input', updateScale);
  updateScale();

  const favBtn = el('button', { class: 'btn btn-secondary', type: 'button' });
  const paintFav = () => { favBtn.textContent = r.isFavorite ? 'Remove from favourites' : 'Add to favourites'; favBtn.setAttribute('aria-pressed', String(!!r.isFavorite)); };
  paintFav();
  favBtn.addEventListener('click', async () => {
    try {
      const res = await api(`/api/recipes/${r._id}/favorite`, { method: 'PATCH' });
      r.isFavorite = res.data.isFavorite;
      paintFav();
      refreshCurrentView();
    } catch (err) { toastError(err); }
  });
  const delBtn = el('button', { class: 'btn btn-danger', type: 'button' }, 'Delete');
  delBtn.addEventListener('click', async () => {
    if (!(await confirmDialog(`Delete "${r.title}"? It will also be removed from any meal plans.`, { confirmText: 'Delete', danger: true }))) return;
    try {
      const res = await api(`/api/recipes/${r._id}`, { method: 'DELETE' });
      const n = res.meta && res.meta.mealPlansUpdated;
      toast(`Recipe deleted${n > 0 ? ` and removed from ${n} meal plan(s)` : ''}`);
      modal.close();
      refreshCurrentView();
    } catch (err) { toastError(err); }
  });
  const editBtn = el('button', { class: 'btn btn-secondary', type: 'button', onClick: () => { modal.close(); location.hash = `#edit/${r._id}`; } }, 'Edit');

  const section = (title, ...content) => el('section', { class: 'detail-section' }, el('h3', null, title), ...content);
  const fact = (value, label) => el('div', { class: 'fact' }, el('b', null, value), el('span', null, label));
  const tagList = (items) => el('div', { class: 'tags' }, items.map((t) => el('span', { class: 'tag' }, t)));

  clear(body);
  body.append(
    el('div', { class: 'modal-band', dataset: { category: r.category } },
      emojiTile(r.emoji, r.category, 'xl'),
      el('div', null, el('h2', null, r.title),
        el('div', { class: 'small' }, `${r.cuisine} · ${capitalize(r.category)} · `, difficultyBadge(r.difficulty)))),
    el('p', null, r.description),
    el('div', { class: 'facts' },
      fact(formatMinutes(r.prepTimeMin), 'Prep'), fact(formatMinutes(r.cookTimeMin), 'Cook'),
      fact(formatMinutes(r.prepTimeMin + r.cookTimeMin), 'Total'), fact(String(r.servings), 'Servings (original)')),
    section('Ingredients',
      el('div', { class: 'scaler' },
        el('span', { class: 'label' }, 'Servings'),
        el('div', { class: 'stepper' },
          el('button', { type: 'button', 'aria-label': 'Decrease servings', onClick: () => setServings(servings - 1) }, '−'),
          servingsInput,
          el('button', { type: 'button', 'aria-label': 'Increase servings', onClick: () => setServings(servings + 1) }, '+')),
        el('button', { class: 'btn btn-link', type: 'button', onClick: () => setServings(r.servings) }, 'Reset')),
      el('p', { class: 'muted small tick-hint' }, 'Tap an ingredient to tick it off'),
      ingList),
    section('Steps', el('ol', { class: 'step-list' }, r.steps.map((s) =>
      el('li', null, el('span', null, s.instruction, s.durationMin ? el('span', { class: 'muted' }, ` (${formatMinutes(s.durationMin)})`) : null))))),
    section('Nutrition (per serving)', el('dl', { class: 'nutrition-grid' }, NUTRITION_FIELDS.map(([key, label, unit]) =>
      el('div', { class: 'nutri' }, el('dt', null, `${label} (${unit})`), el('dd', null, `${r.nutrition[key]}`)))),
      el('p', { class: 'muted small', style: 'margin-top:8px' }, 'Nutrition values are per serving and do not change with the servings scaler.')),
    r.dietary && r.dietary.length ? section('Dietary', tagList(r.dietary)) : null,
    r.tags && r.tags.length ? section('Tags', tagList(r.tags.map((t) => `#${t}`))) : null,
    r.notes ? section('Notes', el('p', null, r.notes)) : null,
    r.equipment && r.equipment.length ? section('Equipment', el('ul', null, r.equipment.map((x) => el('li', null, x)))) : null,
    r.variations && r.variations.length ? section('Variations', el('ul', null, r.variations.map((x) => el('li', null, x)))) : null,
    el('div', { class: 'modal-actions' }, favBtn, editBtn, delBtn));
}

// ===================================================================
// View: Recipes
// ===================================================================
const recipeFilters = { q: '', category: '', dietary: '', favorite: false, sort: 'newest', page: 1 };
const RECIPE_LIMIT = 12;

function viewRecipes(container) {
  const search = el('input', { class: 'input', id: 'f-search', type: 'search', placeholder: 'Title, tag or ingredient', value: recipeFilters.q });
  const category = el('div', { class: 'tabs', role: 'group', 'aria-label': 'Category', id: 'f-category' },
    [['', 'All'], ...CATEGORIES.map((c) => [c, capitalize(c)])].map(([value, label]) =>
      el('button', { class: 'tab', type: 'button', 'aria-pressed': 'false', dataset: { cat: value }, onClick: () => { recipeFilters.category = value; paintTabs(); change(); } }, label)));
  const paintTabs = () => category.querySelectorAll('.tab').forEach((t) => t.setAttribute('aria-pressed', String(t.dataset.cat === recipeFilters.category)));
  const dietary = el('select', { class: 'select', id: 'f-dietary' }, optionList(DIETARY, 'Any dietary'));
  const sort = el('select', { class: 'select', id: 'f-sort' },
    el('option', { value: 'newest' }, 'Newest'), el('option', { value: 'quickest' }, 'Quickest'), el('option', { value: 'calories' }, 'Lowest calories'));
  const fav = el('input', { type: 'checkbox', id: 'f-fav', checked: recipeFilters.favorite });
  const reset = el('button', { class: 'btn btn-link', id: 'f-reset', type: 'button' }, 'Clear filters');
  paintTabs(); dietary.value = recipeFilters.dietary; sort.value = recipeFilters.sort;

  const subtitle = el('span', { class: 'subtitle', id: 'recipes-subtitle' });
  const count = el('div', { class: 'result-count', id: 'result-count', 'aria-live': 'polite' });
  const list = el('div', { id: 'recipe-list' });
  const pager = el('nav', { class: 'pagination', 'aria-label': 'Pagination' });
  const pipelineHolder = el('div');

  async function updateSubtitle(total, filtered) {
    try {
      const all = filtered ? (await api('/api/recipes?limit=1')).data.total : total;
      subtitle.textContent = `${all} recipe${all === 1 ? '' : 's'}`;
    } catch (e) { /* subtitle is optional */ }
  }
  async function load() {
    clear(list); clear(pager); list.appendChild(skeletonGrid());
    const params = new URLSearchParams({ page: recipeFilters.page, limit: RECIPE_LIMIT, sort: recipeFilters.sort });
    if (recipeFilters.q) params.set('q', recipeFilters.q);
    if (recipeFilters.category) params.set('category', recipeFilters.category);
    if (recipeFilters.dietary) params.set('dietary', recipeFilters.dietary);
    if (recipeFilters.favorite) params.set('favorite', 'true');
    const filtered = !!(recipeFilters.q || recipeFilters.category || recipeFilters.dietary || recipeFilters.favorite);
    try {
      const res = await api(`/api/recipes?${params}`);
      const d = res.data;
      if (d.totalPages > 0 && recipeFilters.page > d.totalPages) { recipeFilters.page = d.totalPages; return load(); }
      clear(list); clear(pager); clear(pipelineHolder);
      updateSubtitle(d.total, filtered);
      pipelineHolder.appendChild(codePanel('Show aggregation pipeline', res.meta.pipeline));
      if (!d.recipes.length) {
        count.textContent = 'No recipes found';
        list.appendChild(emptyState('No recipes match these filters.', { label: 'Clear filters', onClick: () => reset.click() }, 'bowl'));
        return;
      }
      const from = (d.page - 1) * d.limit + 1;
      count.textContent = `Showing ${from}–${from + d.recipes.length - 1} of ${d.total} recipes`;
      list.appendChild(el('div', { class: 'grid' }, d.recipes.map((r) => recipeCard(r, {
        onFavorite: (rec) => { if (recipeFilters.favorite && !rec.isFavorite) load(); },
      }))));
      renderPager(d.page, d.totalPages);
    } catch (err) {
      clear(list); list.appendChild(emptyState(err.message, { label: 'Try again', onClick: load }));
    }
  }
  function renderPager(page, totalPages) {
    if (totalPages <= 1) return;
    const go = (p) => { recipeFilters.page = p; load(); window.scrollTo({ top: 0 }); };
    pager.appendChild(el('button', { class: 'btn btn-secondary', type: 'button', disabled: page <= 1, onClick: () => go(page - 1) }, 'Previous'));
    for (let p = 1; p <= totalPages; p++) {
      pager.appendChild(el('button', { class: `btn btn-secondary${p === page ? ' current' : ''}`, type: 'button', 'aria-current': p === page ? 'page' : null, 'aria-label': `Page ${p}`, onClick: () => go(p) }, String(p)));
    }
    pager.appendChild(el('button', { class: 'btn btn-secondary', type: 'button', disabled: page >= totalPages, onClick: () => go(page + 1) }, 'Next'));
  }
  const change = () => { recipeFilters.page = 1; load(); };
  search.addEventListener('input', debounce(() => { recipeFilters.q = search.value.trim(); change(); }, 350));
  dietary.addEventListener('change', () => { recipeFilters.dietary = dietary.value; change(); });
  sort.addEventListener('change', () => { recipeFilters.sort = sort.value; change(); });
  fav.addEventListener('change', () => { recipeFilters.favorite = fav.checked; change(); });
  reset.addEventListener('click', () => {
    Object.assign(recipeFilters, { q: '', category: '', dietary: '', favorite: false, sort: 'newest', page: 1 });
    search.value = ''; dietary.value = ''; paintTabs(); sort.value = 'newest'; fav.checked = false;
    load();
  });

  container.append(
    el('div', { class: 'page-head' }, el('div', { class: 'head-line' }, el('h1', null, 'Recipes'), subtitle)),
    category,
    el('div', { class: 'filters' },
      el('div', { class: 'field' }, el('label', { for: 'f-search' }, 'Search'), search),
      el('div', { class: 'field' }, el('label', { for: 'f-dietary' }, 'Dietary'), dietary),
      el('div', { class: 'field' }, el('label', { for: 'f-sort' }, 'Sort by'), sort),
      el('label', { class: 'check', for: 'f-fav' }, fav, 'Favourites only'),
      reset),
    count, list, pager, pipelineHolder);
  refreshCurrentView = load;
  load();
}


// ===================================================================
// View: Add / Edit recipe
// ===================================================================
const QUICK_EMOJIS = ['🍲', '🍛', '🍝', '🍚', '🥗', '🍳', '🥞', '🍗', '🥩', '🍌', '🥔', '🍅', '🌯', '🍩', '🥣', '🍓'];
const COMMON_UNITS = ['piece', 'g', 'kg', 'cup', 'tbsp', 'tsp', 'clove', 'ml', 'l', 'bunch', 'slice', 'pinch'];

async function viewRecipeForm(container, editId) {
  const isEdit = !!editId;
  let existing = null;
  if (isEdit) {
    container.appendChild(loadingBox('Loading recipe...'));
    try { existing = (await api(`/api/recipes/${editId}`)).data; }
    catch (err) { clear(container); container.appendChild(emptyState(err.message, { label: 'Back to recipes', onClick: () => { location.hash = '#recipes'; } })); return; }
    clear(container);
  }
  const r = existing || {};
  const inputs = {};
  const mk = (id, attrs) => { inputs[id] = el('input', { class: 'input', id: `r-${id}`, ...attrs }); return inputs[id]; };

  mk('title', { type: 'text', maxlength: '120', value: r.title || '' });
  inputs.description = el('textarea', { class: 'textarea', id: 'r-description', maxlength: '1000' }); inputs.description.value = r.description || '';
  inputs.category = el('select', { class: 'select', id: 'r-category' }, optionList(CATEGORIES, 'Select...')); inputs.category.value = r.category || '';
  mk('cuisine', { type: 'text', maxlength: '60', value: r.cuisine || '' });
  inputs.difficulty = el('select', { class: 'select', id: 'r-difficulty' }, optionList(DIFFICULTIES, 'Select...')); inputs.difficulty.value = r.difficulty || '';
  mk('prepTimeMin', { type: 'number', min: '0', max: '1440', step: '1', value: r.prepTimeMin ?? '' });
  mk('cookTimeMin', { type: 'number', min: '0', max: '1440', step: '1', value: r.cookTimeMin ?? '' });
  mk('servings', { type: 'number', min: '1', max: '100', step: '1', value: r.servings ?? '' });
  mk('emoji', { type: 'text', maxlength: '8', value: r.emoji || '' });
  inputs.tags = el('input', { class: 'input', id: 'r-tags', type: 'text', placeholder: 'comma, separated, tags', value: (r.tags || []).join(', ') });
  for (const [key, label] of NUTRITION_FIELDS) mk(`n-${key}`, { type: 'number', min: '0', step: 'any', value: r.nutrition ? r.nutrition[key] : '' });
  inputs.notes = el('textarea', { class: 'textarea', id: 'r-notes', maxlength: '2000' }); inputs.notes.value = r.notes || '';
  inputs.equipment = el('textarea', { class: 'textarea', id: 'r-equipment', placeholder: 'One item per line' }); inputs.equipment.value = (r.equipment || []).join('\n');
  inputs.variations = el('textarea', { class: 'textarea', id: 'r-variations', placeholder: 'One variation per line' }); inputs.variations.value = (r.variations || []).join('\n');

  const dietChecks = DIETARY.map((d) => el('label', { class: 'check' }, el('input', { type: 'checkbox', value: d, checked: (r.dietary || []).includes(d), class: 'diet-check' }), d));

  // ---- dynamic ingredient rows ----
  const ingBox = el('div', { id: 'ingredient-rows' });
  const addIngRow = (ing = {}) => {
    const row = el('div', { class: 'dyn-row ing-row' },
      el('div', { class: 'field' }, el('input', { class: 'input ing-name', type: 'text', placeholder: 'Ingredient name', 'aria-label': 'Ingredient name', maxlength: '60', value: ing.name || '' }), el('span', { class: 'field-error' })),
      el('div', { class: 'field' }, el('input', { class: 'input ing-qty', type: 'number', min: '0.01', step: 'any', placeholder: 'Qty', 'aria-label': 'Quantity', value: ing.quantity ?? '' }), el('span', { class: 'field-error' })),
      el('div', { class: 'field' }, el('input', { class: 'input ing-unit', type: 'text', list: 'unit-list', placeholder: 'Unit', 'aria-label': 'Unit', maxlength: '20', value: ing.unit || '' }), el('span', { class: 'field-error' })),
      el('label', { class: 'check' }, el('input', { type: 'checkbox', class: 'ing-opt', checked: !!ing.optional }), 'optional'),
      el('button', { class: 'icon-btn ing-remove', type: 'button', 'aria-label': 'Remove ingredient', onClick: () => { row.remove(); syncRows(); } }, '×'));
    ingBox.appendChild(row); syncRows();
  };
  // ---- dynamic step rows ----
  const stepBox = el('div', { id: 'step-rows' });
  const addStepRow = (step = {}) => {
    const row = el('div', { class: 'dyn-row step-row' },
      el('div', { class: 'step-num' }),
      el('div', { class: 'field' }, el('textarea', { class: 'textarea step-text', 'aria-label': 'Step instruction', placeholder: 'Describe this step', maxlength: '1000' }), el('span', { class: 'field-error' })),
      el('div', { class: 'field' }, el('input', { class: 'input step-dur', type: 'number', min: '0', step: '1', placeholder: 'Minutes', 'aria-label': 'Duration in minutes', value: step.durationMin ?? '' }), el('span', { class: 'field-error' })),
      el('div', { class: 'row' },
        el('button', { class: 'icon-btn step-up', type: 'button', 'aria-label': 'Move step up', onClick: () => { if (row.previousElementSibling) stepBox.insertBefore(row, row.previousElementSibling); syncRows(); } }, '↑'),
        el('button', { class: 'icon-btn step-down', type: 'button', 'aria-label': 'Move step down', onClick: () => { if (row.nextElementSibling) stepBox.insertBefore(row.nextElementSibling, row); syncRows(); } }, '↓'),
        el('button', { class: 'icon-btn step-remove', type: 'button', 'aria-label': 'Remove step', onClick: () => { row.remove(); syncRows(); } }, '×')));
    $('.step-text', row).value = step.instruction || '';
    stepBox.appendChild(row); syncRows();
  };
  function syncRows() {
    const ingRows = ingBox.children, stepRows = stepBox.children;
    for (const row of ingRows) $('.ing-remove', row).disabled = ingRows.length === 1;
    Array.from(stepRows).forEach((row, i) => {
      $('.step-num', row).textContent = String(i + 1);
      $('.step-remove', row).disabled = stepRows.length === 1;
      $('.step-up', row).disabled = i === 0;
      $('.step-down', row).disabled = i === stepRows.length - 1;
    });
  }
  if (r.ingredients && r.ingredients.length) r.ingredients.forEach(addIngRow); else addIngRow();
  if (r.steps && r.steps.length) r.steps.forEach(addStepRow); else addStepRow();

  const emojiPicks = el('div', { class: 'emoji-picks' }, QUICK_EMOJIS.map((e) =>
    el('button', { type: 'button', 'aria-label': `Use emoji ${e}`, onClick: () => { inputs.emoji.value = e; } }, e)));

  const form = el('form', { id: 'recipe-form', novalidate: true });
  const submitBtn = el('button', { class: 'btn', type: 'submit', id: 'save-recipe' }, isEdit ? 'Save changes' : 'Create recipe');

  const setError = (node, message) => {
    if (!node) return;
    node.classList.toggle('invalid', !!message);
    const holder = node.closest('.field');
    const span = holder && $('.field-error', holder);
    if (span) span.textContent = message || '';
  };

  function collect() {
    const errors = [];
    const err = (node, msg) => { setError(node, msg); errors.push(msg); };
    Object.values(inputs).forEach((n) => setError(n, ''));
    const num = (n) => (n.value.trim() === '' ? NaN : Number(n.value));
    const body = {};

    body.title = inputs.title.value.trim();
    if (body.title.length < 2) err(inputs.title, 'Title must be 2-120 characters');
    body.description = inputs.description.value.trim();
    if (!body.description) err(inputs.description, 'Description is required');
    body.category = inputs.category.value;
    if (!body.category) err(inputs.category, 'Choose a category');
    body.cuisine = inputs.cuisine.value.trim();
    if (body.cuisine.length < 2) err(inputs.cuisine, 'Cuisine is required (2-60 characters)');
    body.difficulty = inputs.difficulty.value;
    if (!body.difficulty) err(inputs.difficulty, 'Choose a difficulty');
    for (const [key, min, max, label] of [['prepTimeMin', 0, 1440, 'Prep time'], ['cookTimeMin', 0, 1440, 'Cook time'], ['servings', 1, 100, 'Servings']]) {
      const v = num(inputs[key]);
      body[key] = v;
      if (!Number.isInteger(v) || v < min || v > max) err(inputs[key], `${label} must be a whole number ${min}-${max}`);
    }
    body.emoji = inputs.emoji.value.trim() || '🍽️';
    body.tags = inputs.tags.value.split(',').map((t) => t.trim()).filter(Boolean);
    body.dietary = Array.from(form.querySelectorAll('.diet-check:checked')).map((c) => c.value);

    body.nutrition = {};
    for (const [key, label] of NUTRITION_FIELDS) {
      const v = num(inputs[`n-${key}`]);
      body.nutrition[key] = v;
      if (!Number.isFinite(v) || v < 0) err(inputs[`n-${key}`], `${label} must be 0 or more`);
    }

    body.ingredients = [];
    const seen = new Set();
    for (const row of ingBox.children) {
      const nameN = $('.ing-name', row), qtyN = $('.ing-qty', row), unitN = $('.ing-unit', row);
      const name = nameN.value.trim().toLowerCase().replace(/\s+/g, ' ');
      const qty = qtyN.value.trim() === '' ? NaN : Number(qtyN.value);
      const unit = unitN.value.trim();
      if (!name) err(nameN, 'Name required'); else if (seen.has(name)) err(nameN, 'Duplicate ingredient'); else setError(nameN, '');
      seen.add(name);
      if (!Number.isFinite(qty) || qty <= 0) err(qtyN, 'Must be > 0'); else setError(qtyN, '');
      if (!unit) err(unitN, 'Unit required'); else setError(unitN, '');
      body.ingredients.push({ name: nameN.value.trim(), quantity: qty, unit, optional: $('.ing-opt', row).checked });
    }
    body.steps = [];
    for (const row of stepBox.children) {
      const textN = $('.step-text', row), durN = $('.step-dur', row);
      const instruction = textN.value.trim();
      if (!instruction) err(textN, 'Instruction required'); else setError(textN, '');
      const step = { instruction };
      if (durN.value.trim() !== '') {
        const d = Number(durN.value);
        if (!Number.isInteger(d) || d < 0) err(durN, 'Whole minutes ≥ 0'); else { step.durationMin = d; setError(durN, ''); }
      }
      body.steps.push(step);
    }

    // optional fields are omitted when empty so a PUT removes them from the document
    const notes = inputs.notes.value.trim();
    if (notes) body.notes = notes;
    const lines = (n) => n.value.split('\n').map((l) => l.trim()).filter(Boolean);
    if (lines(inputs.equipment).length) body.equipment = lines(inputs.equipment);
    if (lines(inputs.variations).length) body.variations = lines(inputs.variations);
    return { body, errors };
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const { body, errors } = collect();
    if (errors.length) {
      toast('Please fix the highlighted fields', 'error', errors.slice(0, 5));
      const bad = form.querySelector('.invalid'); if (bad) bad.focus();
      return;
    }
    try {
      const res = await withLoading(submitBtn, () => api(isEdit ? `/api/recipes/${editId}` : '/api/recipes', { method: isEdit ? 'PUT' : 'POST', body }));
      const n = res.meta && res.meta.mealPlansUpdated;
      toast(isEdit ? `Recipe updated${n > 0 ? ` · ${n} meal plan(s) updated` : ''}` : 'Recipe created');
      pendingModalId = res.data._id;
      location.hash = '#recipes';
    } catch (err) { toastError(err); }
  });

  const section = (title, ...c) => el('section', { class: 'card form-section' }, el('h2', null, title), ...c);
  form.append(
    section('Basics',
      el('div', { class: 'form-grid' },
        field('Title *', inputs.title, 'r-title'), field('Cuisine *', inputs.cuisine, 'r-cuisine'),
        field('Category *', inputs.category, 'r-category'), field('Difficulty *', inputs.difficulty, 'r-difficulty'),
        field('Prep time (min) *', inputs.prepTimeMin, 'r-prepTimeMin'), field('Cook time (min) *', inputs.cookTimeMin, 'r-cookTimeMin'),
        field('Servings *', inputs.servings, 'r-servings')),
      field('Description *', inputs.description, 'r-description'),
      el('div', { class: 'field' }, el('label', { for: 'r-emoji' }, 'Emoji'), inputs.emoji, emojiPicks),
      field('Tags', inputs.tags, 'r-tags'),
      el('div', { class: 'field' }, el('span', { class: 'label' }, 'Dietary'), el('div', { class: 'checkbox-row' }, dietChecks))),
    section('Ingredients', ingBox, el('datalist', { id: 'unit-list' }, COMMON_UNITS.map((u) => el('option', { value: u }))),
      el('button', { class: 'btn btn-secondary', type: 'button', id: 'add-ingredient', onClick: () => addIngRow() }, '+ Add ingredient')),
    section('Steps', stepBox, el('button', { class: 'btn btn-secondary', type: 'button', id: 'add-step', onClick: () => addStepRow() }, '+ Add step')),
    section('Nutrition (per serving) *', el('div', { class: 'form-grid' }, NUTRITION_FIELDS.map(([key, label, unit]) =>
      field(`${label} (${unit})`, inputs[`n-${key}`], `r-n-${key}`)))),
    section('Optional details', el('p', { class: 'muted small' }, 'Leave these empty and they are not stored at all - documents in a MongoDB collection can have different fields.'),
      field('Notes', inputs.notes, 'r-notes'), field('Equipment (one per line)', inputs.equipment, 'r-equipment'), field('Variations (one per line)', inputs.variations, 'r-variations')),
    el('div', { class: 'form-actions' }, submitBtn, el('button', { class: 'btn btn-secondary', type: 'button', onClick: () => { location.hash = '#recipes'; } }, 'Cancel')));

  container.append(el('div', { class: 'page-head' }, el('h1', null, isEdit ? 'Edit recipe' : 'Add recipe')), form);
}

// ===================================================================
// View: What can I cook?
// ===================================================================
const SUGGESTED = ['rice', 'tomato', 'onion', 'eggs', 'beans', 'potato', 'chicken breast', 'wheat flour', 'milk', 'carrot'];
let cookChips = [];
const normalizeName = (s) => s.trim().toLowerCase().replace(/\s+/g, ' ');

function matchRing(pct, color) {
  const r = 18;
  const c = 2 * Math.PI * r;
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 44 44');
  svg.setAttribute('width', '44');
  svg.setAttribute('height', '44');
  svg.setAttribute('aria-hidden', 'true');
  const circle = (stroke, dash) => {
    const node = document.createElementNS(SVG_NS, 'circle');
    node.setAttribute('cx', '22'); node.setAttribute('cy', '22'); node.setAttribute('r', String(r));
    node.setAttribute('fill', 'none'); node.setAttribute('stroke', stroke); node.setAttribute('stroke-width', '4');
    if (dash) { node.setAttribute('stroke-dasharray', dash); node.setAttribute('stroke-linecap', 'round'); }
    return node;
  };
  svg.append(circle('#ECEAE4'), circle(color, `${(pct / 100) * c} ${c}`));
  return el('div', { class: 'ring', role: 'img', 'aria-label': `${pct}% match` }, svg, el('span', { class: 'ring-num' }, `${pct}%`));
}

function viewCook(container) {
  let hasRun = false;
  const chipBox = el('div', { class: 'chip-input', id: 'chip-box' });
  const textInput = el('input', { type: 'text', id: 'chip-text', placeholder: 'Type an ingredient, press Enter or comma', 'aria-label': 'Add ingredient' });
  const onlyFull = el('input', { type: 'checkbox', id: 'only-full' });
  const findBtn = el('button', { class: 'btn', id: 'find-recipes', type: 'button' }, 'Find recipes');
  const clearBtn = el('button', { class: 'btn btn-secondary', id: 'clear-chips', type: 'button' }, 'Clear all');
  const inlineMsg = el('div', { class: 'field-error', id: 'cook-msg', role: 'alert' });
  const stapleInfo = el('p', { class: 'muted small', id: 'staple-info', style: 'margin:16px 0 8px' }, 'Salt, water and cooking oil are assumed.');
  const results = el('div', { id: 'cook-results', 'aria-live': 'polite', style: 'margin-top:24px' });

  function renderChips() {
    chipBox.replaceChildren(...cookChips.map((c) => el('span', { class: 'chip', dataset: { chip: c } }, c,
      el('button', { type: 'button', 'aria-label': `Remove ${c}`, onClick: () => { cookChips = cookChips.filter((x) => x !== c); renderChips(); } }, '×'))), textInput);
    findBtn.disabled = cookChips.length === 0;
    clearBtn.disabled = cookChips.length === 0;
  }
  // Adds names to the chip list. A single manual entry toasts if it is a duplicate;
  // bulk adds (several names, or the pantry) show ONE summary toast.
  function addNames(names, { pantry = false } = {}) {
    let added = 0;
    let duplicates = 0;
    for (const raw of names) {
      const name = normalizeName(raw);
      if (!name) continue;
      if (cookChips.includes(name)) { duplicates++; continue; }
      cookChips.push(name);
      added++;
    }
    inlineMsg.textContent = '';
    renderChips();
    const bulk = pantry || names.filter((n) => normalizeName(n)).length > 1;
    if (!bulk) {
      if (duplicates) toast(`"${normalizeName(names.find((n) => normalizeName(n)))}" is already in your list`, 'info');
    } else if (added || duplicates) {
      const source = pantry ? ' from your pantry' : '';
      const plural = (n) => `${n} ingredient${n === 1 ? '' : 's'}`;
      toast(added
        ? `Added ${plural(added)}${source}${duplicates ? ` (${duplicates} already in your list)` : ''}`
        : `All ${plural(duplicates)}${source} already in your list`, 'info');
    }
  }
  function addChips(text) { addNames(text.split(/[,\n]/)); }
  textInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addChips(textInput.value); textInput.value = ''; textInput.focus(); }
    else if (e.key === 'Backspace' && !textInput.value && cookChips.length) { cookChips.pop(); renderChips(); textInput.focus(); }
  });
  textInput.addEventListener('paste', (e) => {
    const text = (e.clipboardData || window.clipboardData).getData('text');
    if (/[,\n]/.test(text)) { e.preventDefault(); addChips(text); }
  });
  textInput.addEventListener('blur', () => { if (textInput.value.trim()) { addChips(textInput.value); textInput.value = ''; } });
  clearBtn.addEventListener('click', () => { cookChips = []; renderChips(); clear(results); hasRun = false; });

  async function run() {
    if (!cookChips.length) { inlineMsg.textContent = 'Add at least one ingredient first.'; return; }
    clear(results); results.appendChild(skeletonGrid());
    try {
      const res = await withLoading(findBtn, () => api('/api/cook', { method: 'POST', body: { ingredients: cookChips, onlyFullMatch: onlyFull.checked } }));
      hasRun = true;
      const d = res.data;
      stapleInfo.textContent = `${d.staples.map(capitalize).join(', ')} are assumed.`;
      clear(results);
      results.appendChild(el('div', { class: 'result-count', id: 'cook-count' }, `${d.count} recipe${d.count === 1 ? '' : 's'} found`));
      if (!d.results.length) results.appendChild(emptyState(onlyFull.checked ? 'Nothing can be fully cooked with these ingredients. Try turning off the full-match option.' : 'No recipes match these ingredients yet.', null, 'search'));
      else results.appendChild(el('div', { class: 'grid' }, d.results.map(matchCard)));
      results.appendChild(codePanel('Show aggregation pipeline', res.meta.pipeline));
    } catch (err) { clear(results); toastError(err); }
  }
  findBtn.addEventListener('click', run);
  onlyFull.addEventListener('change', () => { if (hasRun) run(); });

  function matchCard(r) {
    const pct = r.matchPercentage;
    const ringColor = pct === 100 ? '#2E7D32' : pct >= 50 ? '#FB8C00' : '#C9605C';
    const open = () => openRecipeModal(r._id);
    const line = (label, items, cls) => el('div', { class: 'match-line' }, el('span', { class: 'muted' }, `${label}: `), el('span', { class: cls }, items.join(', ')));
    const card = el('article', { class: 'match-card', tabindex: '0', role: 'button', 'aria-label': `Open recipe ${r.title}`, dataset: { id: r._id, pct: String(pct) }, onClick: open },
      el('div', { class: 'match-top' }, emojiTile(r.emoji, r.category, 'sm'),
        el('div', { style: 'min-width:0' }, el('h3', { style: 'margin:0' }, r.title), el('span', { class: 'muted small' }, `${r.cuisine} · ${capitalize(r.category)}`)),
        matchRing(pct, ringColor)),
      pct === 100 ? el('div', { class: 'ring-note' }, 'You have everything') : null,
      r.availableIngredients.length ? line('Have', r.availableIngredients, '') : null,
      r.missingIngredients.length ? line('Missing', r.missingIngredients, 'missing') : null,
      r.optionalAvailable.length ? line('Optional you have', r.optionalAvailable, '') : null,
      el('div', { class: 'muted small num' }, `${formatMinutes(r.totalTimeMin)} · ${r.nutrition.calories} kcal · `, difficultyBadge(r.difficulty)));
    activateOnKey(card, open);
    return card;
  }

  // ---- pantry panel ----
  const pantryList = el('div', { id: 'pantry-list' });
  let pantryItems = [];
  const useBtn = el('button', { class: 'btn btn-secondary', id: 'use-pantry', type: 'button' }, 'Use my pantry ingredients');
  async function loadPantry() {
    try {
      pantryItems = (await api('/api/pantry')).data;
      clear(pantryList);
      useBtn.disabled = pantryItems.length === 0;
      if (!pantryItems.length) { pantryList.appendChild(emptyState('Your pantry is empty.')); return; }
      pantryList.append(...pantryItems.map(pantryRow));
    } catch (err) { clear(pantryList); toastError(err); }
  }
  function pantryRow(item) {
    const qty = el('input', { class: 'input', type: 'number', min: '0', step: 'any', value: String(item.quantity), 'aria-label': `Quantity of ${item.name}` });
    const unit = el('input', { class: 'input unit', type: 'text', maxlength: '20', value: item.unit, 'aria-label': `Unit of ${item.name}` });
    const save = el('button', { class: 'btn btn-secondary btn-small', type: 'button', 'aria-label': `Save ${item.name}`, title: 'Save changes' }, 'Save');
    save.addEventListener('click', async () => {
      try { await withLoading(save, () => api(`/api/pantry/${item._id}`, { method: 'PUT', body: { quantity: qty.value, unit: unit.value } })); toast('Pantry item updated'); loadPantry(); }
      catch (err) { toastError(err); }
    });
    const del = el('button', { class: 'icon-btn pantry-del', type: 'button', 'aria-label': `Delete ${item.name}`, title: 'Delete', onClick: async () => {
      try { await api(`/api/pantry/${item._id}`, { method: 'DELETE' }); loadPantry(); } catch (err) { toastError(err); }
    } }, '×');
    return el('div', { class: 'pantry-item', dataset: { name: item.name } },
      el('div', { class: 'name', title: item.name }, item.name),
      el('div', { class: 'pantry-controls' }, qty, unit, save, del));
  }
  useBtn.addEventListener('click', () => addNames(pantryItems.map((p) => p.name), { pantry: true }));
  const pName = el('input', { class: 'input', type: 'text', placeholder: 'Ingredient', 'aria-label': 'Pantry ingredient name', maxlength: '60' });
  const pQty = el('input', { class: 'input', type: 'number', min: '0', step: 'any', placeholder: 'Qty', 'aria-label': 'Pantry quantity' });
  const pUnit = el('input', { class: 'input', type: 'text', placeholder: 'Unit', 'aria-label': 'Pantry unit', maxlength: '20', list: 'unit-list-pantry' });
  const pAdd = el('button', { class: 'btn btn-small', type: 'submit', style: 'height:38px' }, 'Add');
  const pForm = el('form', { class: 'pantry-form', id: 'pantry-form' }, pName, pQty, pUnit, pAdd,
    el('datalist', { id: 'unit-list-pantry' }, COMMON_UNITS.map((u) => el('option', { value: u }))));
  pForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await withLoading(pAdd, () => api('/api/pantry', { method: 'POST', body: { name: pName.value, quantity: pQty.value, unit: pUnit.value } }));
      pName.value = ''; pQty.value = ''; pUnit.value = ''; toast('Pantry updated'); loadPantry();
    } catch (err) { toastError(err); }
  });

  container.append(
    el('div', { class: 'page-head' }, el('h1', null, 'What can I cook?')),
    el('div', { class: 'two-col' },
      el('div', null,
        el('div', { class: 'card' },
          el('p', null, 'Add what\'s in your kitchen and see what you can make.'),
          el('label', { class: 'label', for: 'chip-text', style: 'display:block;margin-bottom:4px' }, 'Your ingredients'), chipBox, inlineMsg,
          el('div', { class: 'chips', style: 'margin-top:8px' }, el('span', { class: 'muted small' }, 'Quick add:'),
            SUGGESTED.map((s) => el('button', { class: 'chip chip-link', type: 'button', onClick: () => addChips(s) }, s))),
          stapleInfo,
          el('label', { class: 'check', style: 'margin:0 0 16px' }, onlyFull, 'Show only recipes I can cook now'),
          el('div', { class: 'row' }, findBtn, clearBtn)),
        results),
      el('aside', { class: 'card', 'aria-label': 'My pantry' }, el('h2', null, 'Pantry'), useBtn, pantryList, pForm)));
  renderChips();
  loadPantry();
  refreshCurrentView = () => { if (hasRun) run(); };
}

// ===================================================================
// View: Nutrition search
// ===================================================================
function viewNutrition(container) {
  const FIELDS = [['maxCalories', 'Max calories', 'nutrition.calories', 'calories'], ['minProtein', 'Min protein (g)', 'nutrition.protein_g', 'protein_g'],
    ['maxCarbs', 'Max carbs (g)', 'nutrition.carbs_g', 'carbs_g'], ['maxFat', 'Max fat (g)', 'nutrition.fat_g', 'fat_g'], ['minFiber', 'Min fiber (g)', 'nutrition.fiber_g', 'fiber_g']];
  const inputs = {};
  for (const [key, label] of FIELDS) inputs[key] = el('input', { class: 'input', id: `n-${key}`, type: 'number', min: '0', step: 'any', 'aria-label': label });
  const diet = DIETARY.map((d) => el('label', { class: 'check' }, el('input', { type: 'checkbox', value: d, class: 'n-diet' }), d));
  const out = el('div', { id: 'nutrition-results', 'aria-live': 'polite', style: 'margin-top:24px' });
  const searchBtn = el('button', { class: 'btn', id: 'n-search', type: 'submit' }, 'Search');

  function clearForm() { Object.values(inputs).forEach((i) => { i.value = ''; }); container.querySelectorAll('.n-diet').forEach((c) => { c.checked = false; }); }
  async function run() {
    const body = {};
    for (const [key] of FIELDS) if (inputs[key].value.trim() !== '') body[key] = Number(inputs[key].value);
    const selected = Array.from(container.querySelectorAll('.n-diet:checked')).map((c) => c.value);
    if (selected.length) body.dietary = selected;
    clear(out); out.appendChild(loadingBox('Searching...'));
    try {
      const res = await withLoading(searchBtn, () => api('/api/nutrition-search', { method: 'POST', body }));
      clear(out);
      out.appendChild(el('div', { class: 'result-count', id: 'n-count' }, `${res.data.count} recipe${res.data.count === 1 ? '' : 's'} found`));
      if (!res.data.results.length) out.appendChild(emptyState('No recipes match these limits. Try loosening a filter.', null, 'search'));
      else {
        const hl = (key) => FIELDS.some(([k, , , nk]) => nk === key && body[k] !== undefined);
        const num = (key, label, text) => el('td', { class: `r${hl(key) ? ' hl' : ''}`, dataset: { metric: key, label } }, text);
        out.appendChild(el('div', { class: 'table-scroll' }, el('table', { class: 'nutri-results' },
          el('thead', null, el('tr', null,
            el('th', null, 'Recipe'), ['kcal', 'Protein', 'Carbs', 'Fat', 'Fiber'].map((h) => el('th', { class: 'r' }, h)), el('th', null, 'Dietary'))),
          el('tbody', null, res.data.results.map((r) => {
            const open = () => openRecipeModal(r._id);
            const tr = el('tr', { tabindex: '0', role: 'button', 'aria-label': `Open recipe ${r.title}`, dataset: { id: r._id }, onClick: open },
              el('td', { class: 'title-cell' }, emojiTile(r.emoji, r.category, 'xs'), ' ', el('strong', null, r.title)),
              num('calories', 'kcal', `${r.nutrition.calories}`), num('protein_g', 'Protein', `${r.nutrition.protein_g} g`), num('carbs_g', 'Carbs', `${r.nutrition.carbs_g} g`),
              num('fat_g', 'Fat', `${r.nutrition.fat_g} g`), num('fiber_g', 'Fiber', `${r.nutrition.fiber_g} g`),
              el('td', { dataset: { label: 'Dietary' } }, dietBadges(r.dietary, 3)));
            activateOnKey(tr, open);
            return tr;
          })))));
      }
      const m = res.meta;
      out.appendChild(codePanel('Show query', `db.recipes.find(\n${JSON.stringify(m.query, null, 2)}\n).sort(${JSON.stringify(m.sort)}).limit(${m.limit})`));
    } catch (err) { clear(out); toastError(err); }
  }
  const preset = (label, key, value) => el('button', { class: 'btn btn-secondary', type: 'button', dataset: { preset: key }, onClick: () => { clearForm(); inputs[key].value = String(value); run(); } }, label);
  const form = el('form', { id: 'nutrition-form', class: 'card' },
    el('div', { class: 'row', style: 'margin-bottom:16px' }, el('span', { class: 'label' }, 'Presets'),
      preset('Low calorie', 'maxCalories', 400), preset('High protein', 'minProtein', 25), preset('Low carb', 'maxCarbs', 30)),
    el('div', { class: 'nutri-form' }, FIELDS.map(([key, label]) => field(label, inputs[key], `n-${key}`))),
    el('div', { class: 'field' }, el('span', { class: 'label' }, 'Dietary (a recipe must match all selected)'), el('div', { class: 'checkbox-row' }, diet)),
    el('div', { class: 'row' }, searchBtn, el('button', { class: 'btn btn-secondary', type: 'button', id: 'n-clear', onClick: () => { clearForm(); clear(out); } }, 'Clear')));
  form.addEventListener('submit', (e) => { e.preventDefault(); run(); });
  container.append(el('div', { class: 'page-head' }, el('h1', null, 'Nutrition search')), form, out);
  refreshCurrentView = () => { if (out.childNodes.length) run(); };
}

// ===================================================================
// Week navigator (shared by planner and shopping list)
// ===================================================================
function weekNavigator(onChange, canLeave) {
  const label = el('span', { class: 'week-label', id: 'week-label', 'aria-live': 'polite' });
  const update = () => { label.textContent = `Week of ${formatWeekRange(currentWeekStart)}`; };
  const go = async (ws) => {
    if (canLeave && !(await canLeave())) return;
    setWeek(ws); update(); onChange();
  };
  update();
  const node = el('div', { class: 'week-nav' },
    el('div', { class: 'btn-group' },
      el('button', { class: 'btn btn-secondary', id: 'week-prev', type: 'button', 'aria-label': 'Previous week', onClick: () => go(addDays(currentWeekStart, -7)) }, '‹'),
      el('button', { class: 'btn btn-secondary', id: 'week-this', type: 'button', onClick: () => go(toDateString(mondayOf(new Date()))) }, 'This week'),
      el('button', { class: 'btn btn-secondary', id: 'week-next', type: 'button', 'aria-label': 'Next week', onClick: () => go(addDays(currentWeekStart, 7)) }, '›')),
    label);
  return { node, update, go };
}

// ===================================================================
// View: Meal planner
// ===================================================================
let plannerDirty = false;
window.addEventListener('beforeunload', (e) => { if (plannerDirty) { e.preventDefault(); e.returnValue = ''; } });

function viewPlanner(container) {
  let plan = null;
  let entries = [];
  let savedSnap = '[]';
  let recipeOptions = null;
  const snapshot = (list) => JSON.stringify(list.map((e) => [e.day, e.mealType, e.recipeId]).sort());
  const isDirty = () => snapshot(entries) !== savedSnap;
  const gridBox = el('div', { id: 'planner-grid-box' });
  const statsBox = el('p', { class: 'planner-stats', id: 'planner-stats' });
  const hint = el('div', { class: 'plan-hint muted', id: 'plan-hint' });
  const setHint = (text) => { hint.replaceChildren(...(text ? [illustration('calendar', 48), el('span', null, text)] : [])); };
  const dirtyBadge = el('span', { class: 'unsaved hidden', id: 'unsaved-badge' }, 'Unsaved changes');
  const saveBtn = el('button', { class: 'btn', id: 'plan-save', type: 'button' }, 'Save plan');
  const deleteBtn = el('button', { class: 'btn btn-danger hidden', id: 'plan-delete', type: 'button' }, 'Delete plan');
  const savedSelect = el('select', { class: 'select', id: 'saved-plans', 'aria-label': 'Saved plans', style: 'width:auto;max-width:320px' });

  const canLeave = async () => !isDirty() || confirmDialog('You have unsaved changes to this meal plan. Leave without saving?', { confirmText: 'Discard changes', danger: true });
  leaveGuard = canLeave;
  const nav = weekNavigator(loadWeek, canLeave);
  const kcal = (n) => `${n.toLocaleString('en-US')} kcal`;

  function refreshDirty() {
    plannerDirty = isDirty();
    dirtyBadge.classList.toggle('hidden', !plannerDirty);
    deleteBtn.classList.toggle('hidden', !plan);
  }
  async function loadSaved() {
    try {
      const list = (await api('/api/mealplans')).data;
      savedSelect.replaceChildren(el('option', { value: '' }, list.length ? 'Saved plans' : 'No saved plans yet'),
        ...list.map((p) => el('option', { value: p.weekStart }, `Week of ${shortDate(parseDateString(p.weekStart))} ${parseDateString(p.weekStart).getFullYear()} — ${p.entryCount} meals`)));
      savedSelect.value = '';
    } catch (err) { toastError(err); }
  }
  async function loadWeek() {
    clear(gridBox); gridBox.appendChild(loadingBox('Loading plan...'));
    try {
      const res = await api(`/api/mealplans?weekStart=${currentWeekStart}`);
      plan = res.data;
      entries = plan ? plan.entries.map((e) => ({ ...e, recipeId: String(e.recipeId) })) : [];
      savedSnap = snapshot(entries);
      setHint(plan ? '' : 'No plan saved for this week yet. Add meals and press Save.');
      render();
    } catch (err) { clear(gridBox); gridBox.appendChild(emptyState(err.message, { label: 'Try again', onClick: loadWeek })); }
  }
  function render() {
    const weekTotal = entries.reduce((s, e) => s + e.calories, 0);
    statsBox.replaceChildren(
      el('b', { id: 'stat-meals' }, `${entries.length} of 28`), ' meals · ',
      el('b', { id: 'stat-total' }, kcal(weekTotal)), ' this week · ',
      el('b', { id: 'stat-avg' }, kcal(Math.round(weekTotal / 7))), ' per day on average');
    const base = parseDateString(currentWeekStart);
    gridBox.replaceChildren(el('div', { class: 'planner-grid' }, DAYS.map((day, i) => {
      const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + i);
      const dayTotal = entries.filter((e) => e.day === day).reduce((s, e) => s + e.calories, 0);
      const isToday = toDateString(d) === toDateString(new Date());
      return el('section', { class: `day-card${isToday ? ' today' : ''}`, dataset: { day }, 'aria-label': day },
        el('div', null, el('h3', null, day, isToday ? el('span', { class: 'today-label' }, 'Today') : null), el('div', { class: 'date' }, shortDate(d))),
        el('div', { class: 'slots' }, MEALS.map((meal) => slotNode(day, meal))),
        el('div', { class: 'day-total' }, `Total ${kcal(dayTotal)}`));
    })));
    refreshDirty();
  }
  function slotNode(day, meal) {
    const entry = entries.find((e) => e.day === day && e.mealType === meal);
    const label = el('div', { class: 'slot-label' }, capitalize(meal));
    if (!entry) {
      return el('div', { class: 'slot', dataset: { day, meal } }, label,
        el('button', { class: 'btn btn-link add-slot', type: 'button', 'aria-label': `Add ${meal} on ${day}`, onClick: () => pickRecipe(day, meal) }, '+ Add'));
    }
    return el('div', { class: 'slot filled', dataset: { day, meal } }, label,
      el('button', { class: 'slot-title', type: 'button', onClick: () => openRecipeModal(entry.recipeId) }, `${entry.emoji} ${entry.recipeTitle}`),
      el('div', { class: 'muted small num' }, `${entry.calories} kcal`),
      el('div', { class: 'slot-actions' },
        el('button', { class: 'btn btn-link replace-slot', type: 'button', 'aria-label': `Replace ${meal} on ${day}`, onClick: () => pickRecipe(day, meal) }, 'Replace'),
        el('button', { class: 'btn btn-link danger remove-slot', type: 'button', 'aria-label': `Remove ${meal} on ${day}`, onClick: () => { entries = entries.filter((e) => e !== entry); render(); } }, 'Remove')));
  }
  async function pickRecipe(day, meal) {
    if (!recipeOptions) {
      try { recipeOptions = (await api('/api/recipes/options')).data; } catch (err) { toastError(err); return; }
    }
    const search = el('input', { class: 'input', id: 'picker-search', type: 'search', placeholder: 'Search recipes', 'aria-label': 'Search recipes' });
    const cat = el('select', { class: 'select', id: 'picker-category', 'aria-label': 'Category' }, optionList(CATEGORIES, 'All categories'));
    const list = el('div', { class: 'picker-list' });
    let modal;
    const paint = () => {
      const q = search.value.trim().toLowerCase();
      const items = recipeOptions.filter((r) => (!cat.value || r.category === cat.value) && (!q || r.title.toLowerCase().includes(q)));
      list.replaceChildren(...(items.length ? items.map((r) => el('button', { class: 'picker-item', type: 'button', dataset: { id: r._id }, onClick: () => {
        entries = entries.filter((e) => !(e.day === day && e.mealType === meal));
        entries.push({ day, mealType: meal, recipeId: r._id, recipeTitle: r.title, calories: r.nutrition.calories, emoji: r.emoji });
        modal.close(); render();
      } }, emojiTile(r.emoji, r.category, 'sm'), el('span', { style: 'flex:1' }, el('strong', null, r.title), el('div', { class: 'small muted' }, capitalize(r.category))), el('span', { class: 'muted num' }, `${r.nutrition.calories} kcal`)))
        : [emptyState('No recipes match.')]));
    };
    search.addEventListener('input', paint); cat.addEventListener('change', paint);
    modal = openModal(el('div', null, el('h2', { style: 'padding-right:32px' }, `Choose a recipe for ${day} ${meal}`), el('div', { class: 'row' }, el('div', { style: 'flex:2;min-width:160px' }, search), el('div', { style: 'flex:1;min-width:140px' }, cat)), list), { label: 'Choose recipe' });
    paint();
    search.focus();
  }

  saveBtn.addEventListener('click', async () => {
    const body = entries.map((e) => ({ day: e.day, mealType: e.mealType, recipeId: e.recipeId }));
    try {
      const res = await withLoading(saveBtn, () => (plan
        ? api(`/api/mealplans/${plan._id}`, { method: 'PUT', body: { entries: body } })
        : api('/api/mealplans', { method: 'POST', body: { weekStart: currentWeekStart, entries: body } })));
      plan = res.data;
      entries = plan.entries.map((e) => ({ ...e, recipeId: String(e.recipeId) }));
      savedSnap = snapshot(entries);
      setHint('');
      toast('Meal plan saved');
      render(); loadSaved();
    } catch (err) { toastError(err); }
  });
  deleteBtn.addEventListener('click', async () => {
    if (!plan || !(await confirmDialog('Delete the saved meal plan for this week?', { confirmText: 'Delete plan', danger: true }))) return;
    try {
      await api(`/api/mealplans/${plan._id}`, { method: 'DELETE' });
      plan = null; entries = []; savedSnap = '[]';
      setHint('No plan saved for this week yet. Add meals and press Save.');
      toast('Meal plan deleted'); render(); loadSaved();
    } catch (err) { toastError(err); }
  });
  savedSelect.addEventListener('change', async () => {
    if (!savedSelect.value) return;
    const target = savedSelect.value;
    savedSelect.value = '';
    if (!(await canLeave())) return;
    setWeek(target); nav.update(); loadWeek();
  });

  container.append(
    el('div', { class: 'page-head' }, el('div', { class: 'head-line' }, el('h1', null, 'Meal planner'), dirtyBadge)),
    nav.node,
    el('div', { class: 'toolbar no-print' }, savedSelect, saveBtn,
      el('button', { class: 'btn btn-secondary', id: 'plan-clear', type: 'button', onClick: () => { entries = []; render(); } }, 'Clear week'),
      deleteBtn,
      el('a', { class: 'btn btn-secondary', id: 'to-shopping', href: '#shopping' }, 'Shopping list for this week')),
    hint, statsBox, gridBox);
  refreshCurrentView = () => {};
  loadSaved();
  loadWeek();
}

// ===================================================================
// View: Shopping list
// ===================================================================
function viewShopping(container) {
  const box = el('div', { id: 'shopping-box' });
  const nav = weekNavigator(load);
  async function load() {
    clear(box); box.appendChild(loadingBox('Loading shopping list...'));
    try {
      const planRes = await api(`/api/mealplans?weekStart=${currentWeekStart}`);
      const plan = planRes.data;
      if (!plan || !plan.entries.length) {
        clear(box);
        box.appendChild(emptyState('There is no meal plan for this week yet, so there is nothing to buy.', { label: 'Go to meal planner', onClick: () => { location.hash = '#planner'; } }, 'calendar'));
        return;
      }
      const res = await api(`/api/mealplans/${plan._id}/shopping-list`);
      if (!res.data.items.length) {
        clear(box);
        box.appendChild(emptyState('Nothing to buy for this plan.', { label: 'Go to meal planner', onClick: () => { location.hash = '#planner'; } }, 'basket'));
        return;
      }
      renderList(plan._id, res);
    } catch (err) { clear(box); box.appendChild(emptyState(err.message, { label: 'Try again', onClick: load })); }
  }
  function renderList(planId, res) {
    const d = res.data;
    const purchased = new Set(d.purchasedItems);
    const progress = el('div', { class: 'progress-text', id: 'shop-progress' });
    const track = el('div', { class: 'bar-fill', style: 'width:0' });
    const updateProgress = () => {
      const n = d.items.filter((i) => purchased.has(i.key)).length;
      progress.textContent = `${n} of ${d.items.length} bought`;
      track.style.width = `${d.items.length ? (n / d.items.length) * 100 : 0}%`;
    };
    const list = el('div', { class: 'shop-list', id: 'shop-list' }, d.items.map((item) => {
      const cb = el('input', { type: 'checkbox', checked: purchased.has(item.key), id: `shop-${item.key.replace(/[^a-z0-9]/gi, '_')}`, dataset: { key: item.key }, 'aria-label': `Bought: ${item.name}` });
      const row = el('div', { class: `shop-item${purchased.has(item.key) ? ' done' : ''}`, dataset: { key: item.key } }, cb,
        el('div', null, el('div', { class: 'shop-name' }, item.name, item.allOptional ? el('span', { class: 'muted', style: 'font-weight:400;text-transform:none' }, ' (optional)') : null),
          el('div', { class: 'small muted' }, `used in: ${item.recipes.join(', ')}`)),
        el('div', { class: 'shop-qty' }, `${formatQty(item.totalQuantity)} ${item.unit}`));
      cb.addEventListener('change', async () => {
        const want = cb.checked;
        if (want) purchased.add(item.key); else purchased.delete(item.key);
        row.classList.toggle('done', want); updateProgress();
        try { await api(`/api/mealplans/${planId}/purchased`, { method: 'PATCH', body: { key: item.key, purchased: want } }); }
        catch (err) {
          if (want) purchased.delete(item.key); else purchased.add(item.key);
          cb.checked = !want; row.classList.toggle('done', !want); updateProgress(); toastError(err);
        }
      });
      return row;
    }));
    updateProgress();
    clear(box);
    box.append(
      el('h2', { class: 'print-title' }, `Shopping list - week of ${formatWeekRange(d.weekStart)}`),
      el('div', { class: 'row between no-print' },
        el('p', { id: 'shop-summary', style: 'margin:0' }, `${d.mealCount} meals planned · ${d.items.length} items`),
        el('button', { class: 'btn btn-secondary', id: 'shop-print', type: 'button', onClick: () => window.print() }, 'Print')),
      progress, el('div', { class: 'bar-track no-print', style: 'margin-bottom:16px' }, track),
      el('div', { class: 'card', style: 'padding:8px 24px' }, list),
      el('p', { class: 'muted small', style: 'margin-top:16px' }, `${d.staplesExcluded.map(capitalize).join(', ')} are assumed and not listed.`),
      codePanel('Show aggregation pipeline', res.meta.pipeline));
  }
  container.append(el('div', { class: 'page-head' }, el('h1', null, 'Shopping list')), el('div', { class: 'no-print' }, nav.node), box);
  refreshCurrentView = load;
  load();
}

// ===================================================================
// View: Dashboard
// ===================================================================
function bars(items, labelOf, valueOf, { grey = false, unit = '' } = {}) {
  const max = Math.max(1, ...items.map(valueOf));
  if (!items.length) return emptyState('No data yet.');
  return el('div', { class: 'bars' }, items.map((it) => el('div', { class: `hbar${grey ? ' grey' : ''}`, dataset: { label: labelOf(it), value: String(valueOf(it)) } },
    el('span', { class: 'lbl', title: labelOf(it) }, labelOf(it)),
    el('div', { class: 'bar-track' }, el('div', { class: 'bar-fill', style: `width:${(valueOf(it) / max) * 100}%` })),
    el('span', { class: 'val' }, `${valueOf(it)}${unit}`))));
}

async function viewDashboard(container) {
  container.append(el('div', { class: 'page-head' }, el('h1', null, 'Dashboard')), loadingBox('Loading statistics...'));
  let res;
  try { res = await api('/api/stats'); }
  catch (err) { clear(container); container.append(emptyState(err.message, { label: 'Try again', onClick: () => { clear(container); viewDashboard(container); } })); return; }
  const d = res.data;
  const t = d.totals;
  const stat = (value, label, id) => el('div', { class: 'stat-block', id }, el('b', null, String(value)), el('span', null, label));
  const sv = d.schemaVariety;
  const card = (title, ...c) => el('section', { class: 'card' }, el('h2', null, title), ...c);

  const explainBox = el('div', { id: 'explain-result' });
  const scenario = el('select', { class: 'select', id: 'ex-scenario' },
    el('option', { value: 'calories' }, 'Calories ≤ 300 (idx_nutrition_calories)'), el('option', { value: 'ingredient' }, 'Ingredient = onion (idx_ingredients_name)'));
  const dataset = el('select', { class: 'select', id: 'ex-collection' },
    el('option', { value: 'recipes' }, 'Recipes collection'), el('option', { value: 'perf_samples' }, 'Benchmark collection (perf_samples)'));
  const compareBtn = el('button', { class: 'btn', id: 'ex-compare', type: 'button' }, 'Compare indexed and non-indexed query');
  const genBtn = el('button', { class: 'btn btn-secondary', id: 'ex-generate', type: 'button' }, 'Generate 50,000 benchmark documents');
  const rmBtn = el('button', { class: 'btn btn-secondary', id: 'ex-remove', type: 'button' }, 'Remove benchmark data');

  const planCard = (title, p, maxDocs) => el('div', { class: 'card' },
    el('h3', null, title), el('span', { class: `stage stage-${p.primaryStage === 'IXSCAN' ? 'ixscan' : 'collscan'}` }, p.primaryStage),
    el('dl', null,
      el('dt', null, 'Index used'), el('dd', null, p.indexName || 'none'),
      el('dt', null, 'Execution time'), el('dd', null, `${p.executionTimeMillis} ms`),
      el('dt', null, 'Keys examined'), el('dd', null, String(p.totalKeysExamined)),
      el('dt', null, 'Docs examined'), el('dd', null, String(p.totalDocsExamined)),
      el('dt', null, 'Docs returned'), el('dd', null, String(p.nReturned)),
      el('dt', null, 'Stages'), el('dd', null, p.stages.join(' → '))),
    el('div', { class: 'small muted', style: 'margin:16px 0 4px' }, 'Documents examined'),
    el('div', { class: 'bar-track', style: 'height:8px' }, el('div', { class: `bar-fill${p.primaryStage === 'COLLSCAN' ? ' low' : ''}`, style: `width:${maxDocs ? Math.max(2, (p.totalDocsExamined / maxDocs) * 100) : 0}%` })));

  compareBtn.addEventListener('click', async () => {
    clear(explainBox);
    try {
      const r = await withLoading(compareBtn, () => api(`/api/explain-demo?scenario=${scenario.value}&collection=${dataset.value}`));
      const x = r.data;
      const maxDocs = Math.max(x.indexed.totalDocsExamined, x.collectionScan.totalDocsExamined);
      explainBox.append(
        x.smallDataset ? el('div', { class: 'info-box', id: 'small-dataset-info' }, `This collection has only ${x.collectionSize} documents, so both queries finish in about 0 ms. Compare "docs examined" instead, or generate the benchmark dataset (50,000 documents) to see a real difference.`) : null,
        el('p', { style: 'margin-top:16px' }, 'Filter: ', el('code', null, JSON.stringify(x.filter)), ` on ${x.collection} (${x.collectionSize} documents)`),
        el('div', { class: 'compare' }, planCard('Indexed query', x.indexed, maxDocs), planCard('Collection scan', x.collectionScan, maxDocs)),
        el('p', { class: 'muted small', id: 'explain-note', style: 'margin-top:16px' }, x.note));
    } catch (err) { toastError(err); explainBox.appendChild(el('div', { class: 'info-box', id: 'explain-error' }, err.message)); }
  });
  genBtn.addEventListener('click', async () => {
    try {
      await withLoading(genBtn, () => api('/api/explain-demo/benchmark-data', { method: 'POST', body: { count: 50000 } }));
      toast('Generated 50,000 benchmark documents in perf_samples');
    } catch (err) { toastError(err); }
  });
  rmBtn.addEventListener('click', async () => {
    if (!(await confirmDialog('Remove the perf_samples benchmark collection? Your recipes are not affected.', { confirmText: 'Remove', danger: true }))) return;
    try { await withLoading(rmBtn, () => api('/api/explain-demo/benchmark-data', { method: 'DELETE' })); toast('Benchmark data removed'); } catch (err) { toastError(err); }
  });

  clear(container);
  container.append(
    el('div', { class: 'page-head' }, el('h1', null, 'Dashboard')),
    el('div', { class: 'stat-row' },
      stat(t.count, 'Recipes', 'sum-total'), stat(t.favorites, 'Favourites', 'sum-fav'),
      stat(d.mealPlanCount, 'Meal plans', 'sum-plans'), stat(d.pantryCount, 'Pantry items', 'sum-pantry'),
      stat(t.avgCalories, 'Avg calories', 'sum-cal'), stat(t.avgPrep, 'Avg prep (min)', 'sum-prep'), stat(t.avgCook, 'Avg cook (min)', 'sum-cook')),
    el('div', { class: 'chart-grid' },
      card('Recipes by category', bars(d.byCategory, (c) => c.category, (c) => c.count),
        el('table', { class: 'simple-table' }, el('thead', null, el('tr', null, el('th', null, 'Category'), el('th', { class: 'r' }, 'Recipes'), el('th', { class: 'r' }, 'Avg kcal'))),
          el('tbody', null, d.byCategory.map((c) => el('tr', null, el('td', null, c.category), el('td', { class: 'r' }, String(c.count)), el('td', { class: 'r' }, String(c.avgCalories))))))),
      card('Average calories per category', bars(d.byCategory, (c) => c.category, (c) => c.avgCalories, { grey: true })),
      card('Top 10 ingredients', bars(d.topIngredients, (i) => i.name, (i) => i.count), el('p', { class: 'muted small' }, `Excludes staples: ${d.staplesExcluded.join(', ')}.`)),
      card('Recipes by cuisine', bars(d.byCuisine, (c) => c.cuisine, (c) => c.count)),
      card('Recipes by difficulty', bars(d.byDifficulty, (c) => c.difficulty, (c) => c.count)),
      card('Flexible schema', el('div', { id: 'schema-variety' },
        bars([{ k: 'notes', v: sv.withNotes }, { k: 'equipment', v: sv.withEquipment }, { k: 'variations', v: sv.withVariations }], (i) => `With ${i.k}`, (i) => i.v),
        el('p', null, `${sv.withNotes} of ${t.count} recipes have notes, ${sv.withEquipment} have equipment and ${sv.withVariations} have variations.`)),
        el('p', { class: 'muted small' }, 'Documents in one MongoDB collection can have different fields. Optional fields are only stored when they have a value, so there are no empty columns and no schema migration.'))),
    codePanel('Show aggregation pipeline', res.meta.pipeline),
    el('section', { class: 'card demo-card' }, el('h2', null, 'Index performance'),
      el('p', { class: 'muted' }, 'An index is a sorted structure of key values that point to documents. MongoDB can jump straight to the matching keys instead of reading every document. The cost is extra storage and slightly slower writes, because every index is updated on insert, update and delete.'),
      el('div', { class: 'demo-controls' }, field('Scenario', scenario, 'ex-scenario'), field('Dataset', dataset, 'ex-collection'), el('div', { class: 'field' }, compareBtn)),
      el('div', { class: 'row' }, genBtn, rmBtn),
      explainBox));
}

// ===================================================================
// Router
// ===================================================================
let leaveGuard = null;
let lastHash = null;
let suppressRoute = false;
let pendingModalId = null;

function buildNav() {
  const nav = $('#main-nav');
  nav.replaceChildren(...NAV.map(([key, label]) => el('a', { href: `#${key}`, dataset: { route: key } }, label)));
  nav.addEventListener('click', (e) => { if (e.target.closest('a')) closeMenu(); });
  const toggle = $('#nav-toggle');
  toggle.addEventListener('click', () => {
    const open = nav.classList.toggle('open');
    toggle.setAttribute('aria-expanded', String(open));
  });
}
function closeMenu() { $('#main-nav').classList.remove('open'); $('#nav-toggle').setAttribute('aria-expanded', 'false'); }

const VIEWS = {
  recipes: viewRecipes, cook: viewCook, nutrition: viewNutrition, planner: viewPlanner,
  shopping: viewShopping, add: (c) => viewRecipeForm(c, null), edit: (c, id) => viewRecipeForm(c, id), dashboard: viewDashboard,
};

async function route() {
  if (suppressRoute) { suppressRoute = false; return; }
  const raw = location.hash.replace(/^#/, '');
  if (leaveGuard && raw !== lastHash && !(await leaveGuard())) {
    suppressRoute = true;
    location.hash = lastHash || 'recipes';
    return;
  }
  leaveGuard = null; plannerDirty = false;
  while (modalStack.length) modalStack[modalStack.length - 1].close();
  const [name, param] = raw.split('/');
  const key = Object.hasOwn(VIEWS, name) && (name !== 'edit' || param) ? name : 'recipes';
  lastHash = raw;
  const navKey = key === 'edit' ? 'add' : key;
  document.querySelectorAll('#main-nav a').forEach((a) => {
    if (a.dataset.route === navKey) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  refreshCurrentView = () => {};
  const container = view();
  clear(container);
  container.classList.remove('fade');
  void container.offsetWidth;
  container.classList.add('fade');
  window.scrollTo(0, 0);
  try { await VIEWS[key](container, param); }
  catch (err) { console.error(err); clear(container); container.appendChild(emptyState('Something went wrong showing this page.')); }
  if (pendingModalId) { const id = pendingModalId; pendingModalId = null; openRecipeModal(id); }
}

buildNav();
window.addEventListener('hashchange', route);
route();
