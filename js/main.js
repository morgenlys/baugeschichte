// js/main.js
const catalogRoot = document.getElementById('catalogRoot');
const pointsValue = document.getElementById('pointsValue');
const themeToggle = document.getElementById('themeToggle');

const PLACEHOLDER = 'assets/images/_placeholder.svg';

// ---- Theme (cookie) ----
function setCookie(name, value, days = 365) {
  const maxAge = days * 24 * 60 * 60;
  document.cookie = `${name}=${encodeURIComponent(value)}; Max-Age=${maxAge}; Path=/; SameSite=Lax`;
}
function getCookie(name) {
  const m = document.cookie.split(';').map(s => s.trim()).find(s => s.startsWith(name + '='));
  return m ? decodeURIComponent(m.split('=')[1]) : null;
}
function applyTheme(theme) {
  const t = theme === 'dark' ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', t);
  if (themeToggle) themeToggle.checked = (t === 'dark');
}
function initTheme() {
  const saved = getCookie('theme') || 'light';
  applyTheme(saved);
  if (themeToggle) {
    themeToggle.addEventListener('change', () => {
      const t = themeToggle.checked ? 'dark' : 'light';
      applyTheme(t);
      setCookie('theme', t);
    });
  }
}
initTheme();

// ---- Progress helpers ----
function getProgress(id){
  const raw = localStorage.getItem(`progress_${id}`);
  const n = raw ? parseInt(raw, 10) : 0;
  return Math.max(0, Math.min(100, n));
}
function sumAllProgress(){
  let sum = 0;
  const raw = localStorage.getItem('catalog_ids');
  if(!raw) return 0;
  const ids = JSON.parse(raw);
  ids.forEach(id => sum += getProgress(id));
  return Math.round(sum / ids.length);
}
function imageWithFallback(src){
  const img = document.createElement('img');
  img.loading = 'lazy';
  img.src = src || PLACEHOLDER;
  img.alt = '';
  img.onerror = () => { img.src = PLACEHOLDER; };
  return img;
}

// ---- Period fallbacks (if catalog item has missing/placeholder period) ----
const PERIOD_BY_KEYWORD = [
  {kw:/jugendstil/i, period:'ca. 1890 – 1914'},
  {kw:/moderne\b(?!.*nach)/i, period:'ca. 1900 – 1945 (Expressionismus, Neue Sachlichkeit, Bauhaus)'},
  {kw:/nachkriegsmoderne/i, period:'ca. 1945 – 1990 (inkl. High-Tech-Architektur)'},
  {kw:/postmoderne/i, period:'ab ca. 1975 (bis ca. 2000)'}
];
function withPeriodFallback(item) {
  if (item.period && !/bitte zeit einfügen/i.test(item.period)) return item.period;
  const hit = PERIOD_BY_KEYWORD.find(p => p.kw.test(item.title));
  return hit ? hit.period : (item.period || '');
}

function makeCard(item){
  const card = document.createElement('article');
  card.className = 'card';
  card.setAttribute('role','link');
  card.setAttribute('tabindex','0');
  card.dataset.id = item.id;

  const thumb = document.createElement('div');
  thumb.className = 'thumb';
  thumb.appendChild(imageWithFallback(item.image));
  card.appendChild(thumb);

  const body = document.createElement('div'); body.className = 'body';

  const kicker = document.createElement('div');
  kicker.className = 'kicker';
  kicker.textContent = item.kicker || '';
  body.appendChild(kicker);

  const h3 = document.createElement('h3'); h3.textContent = item.title; body.appendChild(h3);
  const per = document.createElement('div'); per.className = 'period'; per.textContent = withPeriodFallback(item); body.appendChild(per);

  if(item.kicker !== 'Bonus'){
    const prog = document.createElement('div'); prog.className = 'progress';
    const bar = document.createElement('i');
    const p = getProgress(item.id);
    bar.style.width = `${p}%`;
    prog.appendChild(bar);
    body.appendChild(prog);
  }

  card.appendChild(body);

  const go = () => { location.href = `learn.html?mode=epoch&id=${encodeURIComponent(item.id)}`; };
  card.addEventListener('click', go);
  card.addEventListener('keydown', (e) => {
    if(e.key === 'Enter' || e.key === ' '){
      e.preventDefault(); go();
    }
  });

  return card;
}

async function renderCatalog(){
  const res = await fetch('data/catal og.json'.replace(' ','')); // avoid auto-linking in manchen Editoren
  const data = await res.json();

  // Liste aller IDs für Fortschritts-Schnitt
  const allIds = [];
  data.forEach(section => section.items.forEach(it => allIds.push(it.id)));
  localStorage.setItem('catalog_ids', JSON.stringify(allIds));

  catalogRoot.innerHTML = '';

  for(const section of data){
    const h = document.createElement('h2');
    h.className = 'category-title';
    h.textContent = section.group;
    catalogRoot.appendChild(h);

    const grid = document.createElement('div');
    grid.className = 'grid';
    catalogRoot.appendChild(grid);

    for(const item of section.items){
      grid.appendChild(makeCard(item));
    }
  }

  pointsValue.textContent = sumAllProgress();
}

// FAB menu
const fab = document.getElementById('fab');
const fabMenu = document.getElementById('fabMenu');

function closeFab(){
  fabMenu.classList.remove('show');
  fab.setAttribute('aria-expanded', 'false');
  fabMenu.setAttribute('aria-hidden', 'true');
}
fab.addEventListener('click', (e) => {
  e.stopPropagation();
  const open = fabMenu.classList.toggle('show');
  fab.setAttribute('aria-expanded', String(open));
  fabMenu.setAttribute('aria-hidden', String(!open));
});
document.addEventListener('click', (e) => {
  if (!fabMenu.contains(e.target) && e.target !== fab) closeFab();
});
document.addEventListener('keydown', (e) => {
  if(e.key === 'Escape') closeFab();
});
fabMenu.addEventListener('click', (e) => {
  const btn = e.target.closest('.fab-menu-item');
  if(!btn) return;
  const sets = btn.dataset.sets;
  const mode = btn.dataset.mode;
  location.href = `learn.html?mode=${mode}&sets=${encodeURIComponent(sets)}`;
});

renderCatalog().catch(err => {
  console.error(err);
  catalogRoot.innerHTML = `<p>Fehler beim Laden des Katalogs.</p>`;
});
