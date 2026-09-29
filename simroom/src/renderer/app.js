// SimRoom home screen. Everything it shows comes from room.json.
import { ICONS } from './vendor/icons.js';
import { allThemes, findTheme } from './themes.js';

const $ = (sel, root = document) => root.querySelector(sel);
const el = (tag, cls, text) => {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = text;
  return node;
};

const state = {
  room: null,
  path: [], // ids of the folders we are inside, outermost first
};

const SIZE_CELLS = { '1x1': [1, 1], '2x1': [2, 1], '2x2': [2, 2] };
const SINGLE_WEIGHT_FONTS = new Set(['Bebas Neue']);
const BACK_TILE = { id: '__back', label: 'Back', kind: 'back', size: '1x1', art: { type: 'icon', icon: 'back' } };

// ---------------------------------------------------------------- boot

async function boot() {
  window.simroom.onChanged(applyLoad);
  applyLoad(await window.simroom.load());
  document.addEventListener('keydown', onKey);
  document.addEventListener('mouseup', (e) => { if (e.button === 3) goUp(); }); // mouse/remote "back" button
  window.addEventListener('resize', layoutGrid);
  setInterval(tickClock, 1000);
  wireErrorScreen();
}

function applyLoad(result) {
  if (!result.ok) {
    showError(result.error);
    return;
  }
  $('#error').hidden = true;
  $('#home').hidden = false;
  state.room = result.room;
  // Keep the user inside the same folder across live reloads if it still exists.
  const kept = [];
  let tiles = state.room.tiles;
  for (const id of state.path) {
    const folder = tiles.find((t) => t.id === id && t.kind === 'folder');
    if (!folder) break;
    kept.push(id);
    tiles = folder.tiles;
  }
  state.path = kept;
  render();
  if (result.warnings && result.warnings.length) toast(result.warnings.join(' '), 6000);
}

// ---------------------------------------------------------------- render

function render() {
  applyTheme();
  renderTopbar();
  renderGrid();
  renderFooter();
}

function applyTheme() {
  const room = state.room;
  const theme = findTheme(room);
  const root = document.documentElement.style;
  const c = theme.colors;
  root.setProperty('--bg', c.background);
  root.setProperty('--tile', c.tile);
  root.setProperty('--tile-hover', c.tileHover);
  root.setProperty('--text', c.text);
  root.setProperty('--muted', c.muted);
  root.setProperty('--accent', c.accent);
  root.setProperty('--border', c.border);
  const fonts = theme.fonts || {};
  root.setProperty('--font-display', fontStack(fonts.display || 'Inter'));
  root.setProperty('--font-body', fontStack(fonts.body || 'Inter'));
  // Single-weight display fonts look smeared when the browser fakes bold.
  const singleWeight = SINGLE_WEIGHT_FONTS.has(fonts.display);
  root.setProperty('--display-weight', singleWeight ? 400 : 600);
  root.setProperty('--display-weight-strong', singleWeight ? 400 : 700);
  root.setProperty('--display-tracking', singleWeight ? '0.03em' : '0.01em');

  const ts = room.tileStyle;
  root.setProperty('--radius', ts.radius);
  root.setProperty('--border-w', ts.border);
  root.setProperty('--label-size', Math.max(24, ts.labelSize));
  root.setProperty('--name-size', room.room.nameSize);
  root.setProperty('--logo-h', room.logo.height);
  root.setProperty('--gap', room.grid.gap);
  document.body.classList.toggle('no-shadow', !ts.shadow);
  document.body.classList.toggle('no-glow', !ts.hoverGlow);
  document.body.classList.toggle('light', luminance(c.background) > 0.4);

  const bg = $('#bg');
  const overlay = $('#bg-overlay');
  const b = theme.background || { type: 'solid' };
  bg.style.cssText = '';
  overlay.style.opacity = 0;
  if (b.type === 'gradient') {
    const from = b.from || c.background;
    const to = b.to || c.background;
    bg.style.background = b.radial
      ? `radial-gradient(ellipse at 50% 0%, ${from} 0%, ${to} 75%)`
      : `linear-gradient(${b.angle ?? 160}deg, ${from}, ${to})`;
  } else if (b.type === 'image' && b.image) {
    bg.style.backgroundColor = c.background;
    bg.style.backgroundImage = `url("${assetUrl(b.image)}")`;
    if (b.fit === 'tile') {
      bg.style.backgroundRepeat = 'repeat';
    } else {
      bg.style.backgroundRepeat = 'no-repeat';
      bg.style.backgroundPosition = 'center';
      bg.style.backgroundSize = b.fit || 'cover';
    }
    overlay.style.opacity = b.overlay ?? 0.45;
  } else {
    bg.style.background = c.background;
  }
}

function renderTopbar() {
  const room = state.room;
  const slots = {};
  for (const slot of document.querySelectorAll('#topbar .slot')) {
    slot.replaceChildren();
    slots[slot.dataset.slot] = slot;
  }
  for (const slot of document.querySelectorAll('#bottombar .slot[data-slot="center"]')) slot.replaceChildren();

  const logo = room.logo;
  const watermark = $('#watermark');
  watermark.hidden = true;
  let logoNode = null;
  if (logo.image) {
    if (logo.position === 'watermark') {
      watermark.src = assetUrl(logo.image);
      watermark.style.opacity = logo.opacity;
      watermark.hidden = false;
      watermark.onerror = () => { watermark.hidden = true; };
    } else {
      logoNode = el('img', 'logo');
      logoNode.alt = room.room.name;
      logoNode.src = assetUrl(logo.image);
      logoNode.style.opacity = logo.opacity;
      logoNode.onerror = () => {
        logoNode.remove();
        toast(`Logo "${logo.image}" was not found in the assets folder.`, 6000);
      };
    }
  }

  const namePos = room.room.namePosition;
  if (logoNode && logo.position.startsWith('top-')) {
    const pos = logo.position.slice(4);
    slots[pos].append(logoNode);
  }
  if (room.room.showName) {
    const brand = el('div', 'brand');
    brand.append(el('div', 'room-name', room.room.name));
    if (room.room.tagline) brand.append(el('div', 'tagline', room.room.tagline));
    slots[namePos].append(brand);
  }
  if (logoNode && logo.position.startsWith('bottom-')) {
    const pos = logo.position.slice(7);
    const footerSlot = $(`#bottombar .slot[data-slot="${pos}"]`);
    footerSlot.prepend(logoNode);
    logoNode.classList.add('logo-bottom');
  }

  if (room.clock.show) {
    const clock = el('div', 'clock');
    clock.append(el('div', 'clock-time'), el('div', 'clock-date'));
    const clockSlot = namePos === 'right' ? slots.left : slots.right;
    clockSlot.append(clock);
    tickClock(true);
  }
  for (const slot of Object.values(slots)) {
    slot.classList.toggle('empty', !slot.childElementCount);
  }
}

let lastClock = '';
function tickClock(force) {
  const node = $('.clock');
  if (!node || !state.room) return;
  const now = new Date();
  const h24 = state.room.clock.format === '24h';
  const time = now.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', hour12: !h24 });
  const date = now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  const key = time + date;
  if (!force && key === lastClock) return;
  lastClock = key;
  const [clockText, ampm] = h24 ? [time, ''] : splitAmPm(time);
  const timeNode = $('.clock-time', node);
  timeNode.textContent = clockText;
  if (ampm) timeNode.append(el('span', 'ampm', ampm));
  $('.clock-date', node).textContent = state.room.clock.showDate ? date : '';
}

function splitAmPm(text) {
  const m = /^(.*?)\s*([AaPp]\.?[Mm]\.?)$/.exec(text);
  return m ? [m[1], m[2].toUpperCase().replace(/\./g, '')] : [text, ''];
}

function currentFolder() {
  let tiles = state.room.tiles;
  let folder = null;
  for (const id of state.path) {
    folder = tiles.find((t) => t.id === id);
    tiles = folder.tiles;
  }
  return { folder, tiles };
}

function renderGrid() {
  const grid = $('#grid');
  const { folder, tiles } = currentFolder();
  const list = folder ? [BACK_TILE, ...tiles] : tiles;
  grid.replaceChildren(...list.map(renderTile));
  grid.setAttribute('aria-label', folder ? folder.label : 'Home');
  grid.classList.remove('enter');
  void grid.offsetWidth; // restart the entrance animation
  grid.classList.add('enter');
  layoutGrid();
}

function renderTile(tile) {
  const node = el('button', 'tile');
  node.type = 'button';
  node.dataset.id = tile.id;
  node.dataset.kind = tile.kind;
  node.dataset.size = tile.size || '1x1';
  node.dataset.label = tile.labelPosition || 'bottom-left';
  const [w, h] = SIZE_CELLS[node.dataset.size];
  node.style.gridColumn = `span ${w}`;
  node.style.gridRow = `span ${h}`;
  node.setAttribute('aria-label', tile.kind === 'folder' ? `${tile.label} folder` : tile.label);

  const art = tile.art || { type: 'glyph', glyph: (tile.label || '?').slice(0, 1) };
  if (art.color) node.style.setProperty('--tile-bg', art.color);
  if (art.iconColor) node.style.setProperty('--icon-color', art.iconColor);
  if (art.color) node.classList.add('custom-color');

  const artNode = el('span', 'tile-art');
  if (art.type === 'image' && art.image) {
    node.classList.add('has-image');
    const img = el('img');
    img.alt = '';
    img.src = assetUrl(art.image);
    img.onerror = () => {
      node.classList.remove('has-image');
      artNode.replaceChildren(glyph((tile.label || '?').slice(0, 1)));
    };
    artNode.append(img);
  } else if (art.type === 'icon' && ICONS[art.icon]) {
    artNode.append(icon(art.icon));
  } else {
    artNode.append(glyph(art.glyph || (tile.label || '?').slice(0, 1)));
  }
  node.append(artNode);

  if (node.dataset.label !== 'hidden') node.append(el('span', 'tile-label', tile.label));
  if (tile.kind === 'folder') {
    const badge = el('span', 'tile-badge');
    badge.append(icon('folder'));
    badge.append(el('span', null, String(tile.tiles.length)));
    node.append(badge);
  }
  node.addEventListener('click', () => activate(tile));
  return node;
}

function icon(name) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.6');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = ICONS[name] || '';
  return svg;
}

function glyph(text) {
  return el('span', 'glyph', text);
}

// Size cells so the whole grid fits on screen when it can; scroll only if it truly can't.
function layoutGrid() {
  const grid = $('#grid');
  const stage = $('#stage');
  if (!state.room || !grid.childElementCount) return;
  const cols = state.room.grid.columns;
  const px = Math.min(innerWidth / 1920, innerHeight / 1080);
  const gap = state.room.grid.gap * px;
  const sizes = [...grid.children].map((n) => SIZE_CELLS[n.dataset.size]);
  const usedCols = Math.min(cols, Math.max(2, sizes.reduce((sum, [w, h]) => sum + w * h, 0)));
  const rows = packedRows(sizes, usedCols);
  const width = stage.clientWidth;
  const height = stage.clientHeight;
  const byWidth = (width - (cols - 1) * gap) / cols;
  const byHeight = (height - (rows - 1) * gap) / rows;
  const cell = Math.floor(Math.max(150 * px, Math.min(byWidth, byHeight)));
  grid.style.gridTemplateColumns = `repeat(${usedCols}, ${cell}px)`;
  grid.style.gridAutoRows = `${cell}px`;
  grid.style.gap = `${gap}px`;
  grid.style.setProperty('--cell', `${cell}px`);
}

// Mirrors CSS `grid-auto-flow: dense` to count how many rows the tiles need.
function packedRows(sizes, cols) {
  const taken = [];
  const free = (r, c, w, h) => {
    if (c + w > cols) return false;
    for (let y = r; y < r + h; y++) for (let x = c; x < c + w; x++) if (taken[y]?.[x]) return false;
    return true;
  };
  let rows = 0;
  for (const [rawW, h] of sizes) {
    const w = Math.min(rawW, cols);
    for (let r = 0; ; r++) {
      const c = [...Array(cols).keys()].find((x) => free(r, x, w, h));
      if (c === undefined) continue;
      for (let y = r; y < r + h; y++) {
        taken[y] = taken[y] || [];
        for (let x = c; x < c + w; x++) taken[y][x] = true;
      }
      rows = Math.max(rows, r + h);
      break;
    }
  }
  return Math.max(rows, 1);
}

function renderFooter() {
  const crumbs = $('#crumbs');
  crumbs.replaceChildren();
  const hint = $('#hint');
  if (!state.path.length) {
    hint.textContent = '';
    return;
  }
  const home = el('button', 'crumb', 'Home');
  home.addEventListener('click', () => { state.path = []; renderGrid(); renderFooter(); });
  crumbs.append(home);
  let tiles = state.room.tiles;
  state.path.forEach((id, i) => {
    const folder = tiles.find((t) => t.id === id);
    tiles = folder.tiles;
    crumbs.append(el('span', 'crumb-sep', '›'));
    const crumb = el('button', 'crumb', folder.label);
    crumb.addEventListener('click', () => { state.path = state.path.slice(0, i + 1); renderGrid(); renderFooter(); });
    crumbs.append(crumb);
  });
  hint.replaceChildren(el('kbd', null, 'Esc'), document.createTextNode(' Back'));
}

// ---------------------------------------------------------------- actions

function activate(tile) {
  switch (tile.kind) {
    case 'back':
      goUp();
      break;
    case 'folder':
      state.path.push(tile.id);
      renderGrid();
      renderFooter();
      break;
    case 'launch': {
      const names = tile.steps.map((s) => s.name || baseName(s.path)).join(', then ');
      toast(`${tile.label} will start ${names}. Launching is wired up in Phase 2.`);
      break;
    }
    case 'website':
      toast(`${tile.label} will open ${tile.url} in a kiosk window. Websites arrive in Phase 2.`);
      break;
    case 'action':
      runAction(tile);
      break;
  }
}

async function runAction(tile) {
  if (tile.action === 'next-theme') {
    nextTheme();
    return;
  }
  const result = await window.simroom.action(tile.action);
  if (!result.ok && result.reason === 'not-yet') {
    toast(`"${tile.label}" arrives in Phase 2.`);
  }
}

async function nextTheme() {
  const themes = allThemes(state.room);
  const i = themes.findIndex((t) => t.id === state.room.theme.active);
  const next = themes[(i + 1) % themes.length];
  const room = structuredClone(state.room);
  room.theme.active = next.id;
  const result = await window.simroom.save(room);
  if (!result.ok) {
    toast(`${result.error.title}: ${result.error.details.join(' ')}`, 8000);
    return;
  }
  state.room = result.room;
  render();
  toast(`Theme: ${next.name}`);
}

function goUp() {
  if (!state.room || !state.path.length) return;
  state.path.pop();
  renderGrid();
  renderFooter();
}

function onKey(e) {
  if (e.key === 'Escape') {
    e.preventDefault();
    goUp();
  }
}

// ---------------------------------------------------------------- error screen

function showError(error) {
  $('#home').hidden = true;
  $('#error').hidden = false;
  $('#error-title').textContent = error.title;
  window.simroom.info().then((info) => {
    $('#error .error-where').textContent = info.roomFile;
  });
  $('#error-details').replaceChildren(...error.details.map((d) => el('li', null, d)));
}

function wireErrorScreen() {
  $('#error').addEventListener('click', async (e) => {
    const what = e.target.closest('button')?.dataset.error;
    if (what === 'retry') applyLoad(await window.simroom.load());
    if (what === 'folder') window.simroom.action('open-room-folder');
    if (what === 'sample') applyLoad(await window.simroom.resetToSample());
    if (what === 'exit') window.simroom.action('exit');
  });
}

// ---------------------------------------------------------------- helpers

let toastTimer = null;
function toast(message, ms = 3500) {
  const node = $('#toast');
  node.textContent = message;
  node.hidden = false;
  node.classList.remove('show');
  void node.offsetWidth;
  node.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { node.classList.remove('show'); }, ms);
}

function assetUrl(file) {
  return 'simroom://assets/' + file.split(/[\\/]/).map(encodeURIComponent).join('/');
}

function baseName(p) {
  return p.split(/[\\/]/).pop().replace(/\.(exe|lnk)$/i, '');
}

function fontStack(name) {
  return name === 'Segoe UI'
    ? '"Segoe UI", system-ui, sans-serif'
    : `"${name}", "Segoe UI", system-ui, sans-serif`;
}

function luminance(hex) {
  const n = hex.replace('#', '');
  const full = n.length === 3 ? [...n].map((ch) => ch + ch).join('') : n.slice(0, 6);
  const [r, g, b] = [0, 2, 4].map((i) => {
    const v = parseInt(full.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

boot();
