// js/main.js
const catalogRoot = document.getElementById('catalogRoot');
const pointsValue = document.getElementById('pointsValue');

const PLACEHOLDER = 'assets/images/_placeholder.svg';

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

async function renderCatalog(){
  const res = await fetch('data/catal og.json'.replace(' ','')); // avoid auto-linking in some editors
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
      const card = document.createElement('article');
      card.className = 'card';

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
      const per = document.createElement('div'); per.className = 'period'; per.textContent = item.period; body.appendChild(per);

      if(item.kicker !== 'Bonus'){
        const prog = document.createElement('div'); prog.className = 'progress';
        const bar = document.createElement('i');
        const p = getProgress(item.id);
        bar.style.width = `${p}%`;
        prog.appendChild(bar);
        body.appendChild(prog);
      }

      const actions = document.createElement('div'); actions.className = 'actions';
      const btn = document.createElement('a');
      btn.className = 'start';
      btn.href = `learn.html?mode=epoch&id=${encodeURIComponent(item.id)}`;
      btn.textContent = 'Starten';
      actions.appendChild(btn);

      const btn2 = document.createElement('a');
      btn2.className = 'start secondary';
      btn2.href = `learn.html?mode=preview&id=${encodeURIComponent(item.id)}`;
      btn2.textContent = 'Vorschau';
      actions.appendChild(btn2);

      body.appendChild(actions);
      card.appendChild(body);
      grid.appendChild(card);
    }
  }

  pointsValue.textContent = sumAllProgress();
}

// FAB menu
const fab = document.getElementById('fab');
const fabMenu = document.getElementById('fabMenu');

fab.addEventListener('click', () => {
  const open = fabMenu.classList.toggle('show');
  fab.setAttribute('aria-expanded', String(open));
  fabMenu.setAttribute('aria-hidden', String(!open));
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
