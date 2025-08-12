// js/learn.js
const params = new URLSearchParams(location.search);
const mode = params.get('mode') || 'epoch';   // epoch | random | preview
const epochId = params.get('id') || '';
const sets = (params.get('sets') || '').split('+').filter(Boolean);

const headingEl = document.getElementById('learnHeading');
const subEl = document.getElementById('learnSub');
const counterEl = document.getElementById('counter');
const imgEl = document.getElementById('qImage');
const promptEl = document.getElementById('qPrompt');
const mcForm = document.getElementById('mcForm');
const inputForm = document.getElementById('inputForm');
const textInput = document.getElementById('textInput');
const feedbackEl = document.getElementById('feedback');
const revealBtn = document.getElementById('revealBtn');
const nextBtn = document.getElementById('nextBtn');
const sourceMetaEl = document.getElementById('sourceMeta');
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
(function initTheme(){
  const saved = getCookie('theme') || 'light';
  applyTheme(saved);
  if (themeToggle) {
    themeToggle.addEventListener('change', () => {
      const t = themeToggle.checked ? 'dark' : 'light';
      applyTheme(t);
      setCookie('theme', t);
    });
  }
})();

// ---- Utils ----
function fallbackImg(){
  if(!imgEl) return;
  imgEl.onerror = null;
  imgEl.src = PLACEHOLDER;
}
imgEl.onerror = fallbackImg;

function sleep(ms){ return new Promise(r => setTimeout(r, ms)); }
function shuffle(a){
  for(let i=a.length-1;i>0;i--){
    const j = Math.floor(Math.random()*(i+1));
    [a[i],a[j]] = [a[j],a[i]];
  }
  return a;
}
function norm(s){
  return (s||'')
    .toLowerCase()
    .normalize('NFD').replace(/\p{Diacritic}/gu,'')
    .replace(/[\s\-_.,;:/()]+/g,' ')
    .trim();
}
function arraysEqualSet(a,b){
  if(a.length!==b.length) return false;
  const A = new Set(a), B = new Set(b);
  if(A.size!==B.size) return false;
  for(const x of A){ if(!B.has(x)) return false; }
  return true;
}

// --- Load catalog to resolve titles & file paths ---
async function loadCatalog(){
  const res = await fetch('data/catal og.json'.replace(' ',''));
  return res.json();
}
async function getCatalogItemById(id){
  const cats = await loadCatalog();
  for(const sec of cats){
    for(const it of sec.items){
      if(it.id===id) return it;
    }
  }
  return null;
}

// --- Load questions for one id ---
async function loadQuestionsFor(id){
  const it = await getCatalogItemById(id);
  if(!it || !it.dataPath) return {meta:{id, title:'Unbekannt', period:''}, questions:[]};
  try{
    const res = await fetch(it.dataPath);
    if(!res.ok) throw new Error('not ok');
    return res.json();
  }catch(e){
    return {meta: {id, title: it.title, period: it.period}, questions: []};
  }
}

// --- Build pool for random modes ---
async function buildPoolFromSets(sets){
  const cats = await loadCatalog();
  const ids=[];
  for(const sec of cats){
    const tag = sec.tag; // 'BGI' | 'BGII' | 'STBG' | 'BONUS'
    if(sets.includes(tag) || sets.includes('BGI+BGII+STBG')){ // safety
      for(const it of sec.items){
        ids.push(it.id);
      }
    }
  }
  // filter duplicates & bonus if not selected
  const unique = [...new Set(ids)].filter(id => {
    const isBonus = id.startsWith('bonus_');
    return sets.includes('BONUS') ? isBonus : !isBonus;
  });

  // load
  const packs = await Promise.all(unique.map(loadQuestionsFor));
  const pool = [];
  packs.forEach(pack => pack.questions.forEach(q => pool.push(q)));
  return pool;
}

// Difficulty helpers (accepts number 1–5 or 'easy'|'medium'|'hard')
function normalizeDiff(d) {
  if (typeof d === 'number') return d;
  if (typeof d === 'string') {
    const s = d.toLowerCase();
    if (s.includes('easy') || s.includes('leicht')) return 1;
    if (s.includes('medium') || s.includes('mittel')) return 3;
    if (s.includes('hard') || s.includes('schwer')) return 5;
  }
  return 3; // default medium
}
function difficultyThresholdForProgress(pct){
  // <10%: only easy; 10–39: up to medium; 40–79: up to hard(4); >=80: allow 5
  if (pct < 10) return 2;
  if (pct < 40) return 3;
  if (pct < 80) return 4;
  return 5;
}

// --- Question engine ---
class Engine{
  constructor(opts){
    this.mode = opts.mode;
    this.epochId = opts.epochId || null;
    this.pool = opts.pool || []; // for random mode
    this.pack = opts.pack || null; // for epoch mode
    this.total = (this.mode==='epoch') ? 20 : Infinity;
    this.count = 0;
    this.correct = 0;
    this.current = null;
  }

  // type policy (first 10% only MC, then chance for input grows with progress)
  chooseAnswerMode(){
    if(this.mode==='epoch'){
      const prog = getProgress(this.epochId);
      if (prog < 10) return 'mc_only';
      const r = Math.random();
      // more input over time
      if (prog < 40) return r < 0.25 ? 'input_ok' : 'mixed';
      if (prog < 80) return r < 0.5 ? 'input_ok' : 'mixed';
      return r < 0.7 ? 'input_ok' : 'mixed';
    }
    return 'mixed';
  }

  next(){
    const source = (this.mode==='epoch') ? this.pack.questions : this.pool;
    // difficulty gating
    const prog = this.mode==='epoch' ? getProgress(this.epochId) : 50;
    const thr = difficultyThresholdForProgress(prog);
    const cand = source.filter(q => normalizeDiff(q.difficulty) <= thr);

    // pick and wrap
    const q = this.randFrom(cand.length ? cand : source);
    return this.wrap(q);
  }

  wrap(q){
    const policy = this.chooseAnswerMode();
    let type = q.type;

    // disallow epoch classification inside single-epoch learning
    if(this.mode==='epoch' && type === 'epoch_mc'){
      type = q.building ? 'mc_building' : (q.architects ? 'mc_architect' : 'mc_text');
    }

    // force MC if necessary
    if(policy==='mc_only' && type.startsWith('input')) {
      type = q.building ? 'mc_building' : (q.architects ? 'mc_architect' : 'mc_text');
    }

    // Generate options for MC types if missing
    if(type==='mc_building'){
      const options = this.makeBuildingOptions(q);
      return {...q, type, options};
    }
    if(type==='mc_architect'){
      const options = this.makeArchitectOptions(q);
      return {...q, type, options, allowMultiple: q.allowMultiple || false};
    }
    if(type==='epoch_mc'){
      const options = this.makeEpochOptions(q);
      return {...q, type, options, allowMultiple: q.allowMultiple || false};
    }
    return {...q, type};
  }

  randFrom(arr){ return arr[Math.floor(Math.random()*arr.length)]; }

  collectAllBuildings(){
    const all = [];
    if(this.pack) this.pack.questions.forEach(q => q.building && all.push(q.building));
    if(this.pool) this.pool.forEach(q => q.building && all.push(q.building));
    return [...new Set(all.filter(Boolean))];
  }
  collectAllArchitects(){
    const all = [];
    const push = (src)=>src.forEach(q => (q.architects||[]).forEach(a => all.push(a)));
    if(this.pack) push(this.pack.questions);
    if(this.pool) push(this.pool);
    return [...new Set(all)];
  }
  collectAllEpochs(){
    const all = [];
    const push = (src)=>src.forEach(q => q.epoch && all.push(q.epoch));
    if(this.pack) push(this.pack.questions);
    if(this.pool) push(this.pool);
    return [...new Set(all)];
  }

  makeBuildingOptions(q){
    const others = shuffle(this.collectAllBuildings().filter(n => n!==q.building)).slice(0,3);
    return shuffle([q.building, ...others]);
  }
  makeArchitectOptions(q){
    const corr = q.architects || [];
    const pool = this.collectAllArchitects().filter(a => !corr.includes(a));
    const distract = shuffle(pool).slice(0, Math.max(0, 4 - corr.length));
    return shuffle([...corr, ...distract]).slice(0,4);
  }
  makeEpochOptions(q){
    const corr = Array.isArray(q.epoch) ? q.epoch : [q.epoch];
    const pool = this.collectAllEpochs().filter(e => !corr.includes(e));
    const distract = shuffle(pool).slice(0, Math.max(0, 4 - corr.length));
    return shuffle([...corr, ...distract]).slice(0,4);
  }
}

// progress store
function getProgress(id){
  if(!id) return 0;
  const raw = localStorage.getItem(`progress_${id}`);
  return raw ? parseInt(raw,10) : 0;
}
function setProgress(id, val){
  if(!id) return;
  const v = Math.max(0, Math.min(100, val|0));
  localStorage.setItem(`progress_${id}`, String(v));
}

// UI
function setUIForQuestion(q){
  // image + prompt
  imgEl.src = q.image || PLACEHOLDER;
  imgEl.onerror = fallbackImg;
  promptEl.textContent = q.prompt || '—';
  feedbackEl.hidden = true;
  revealBtn.hidden = false; // immer verfügbar
  nextBtn.hidden = true;

  mcForm.innerHTML = '';
  inputForm.hidden = true;
  mcForm.hidden = true;

  if(q.type.startsWith('mc')){
    mcForm.hidden = false;
    const allowMultiple = !!q.allowMultiple;
    q.options.forEach((opt, idx) => {
      const id = `opt_${idx}`;
      const wrap = document.createElement('label');
      wrap.className = 'opt';
      wrap.innerHTML = `
        <input type="${allowMultiple ? 'checkbox' : 'radio'}" name="opt" value="${opt}" id="${id}">
        <span>${opt}</span>
      `;
      mcForm.appendChild(wrap);
    });

    mcForm.onsubmit = (e) => { e.preventDefault(); handleMCSubmit(q, allowMultiple); };
  }else{
    inputForm.hidden = false;
    textInput.value = '';
    textInput.focus();
    inputForm.onsubmit = (e) => { e.preventDefault(); handleInputSubmit(q); };
  }

  // Quelle/Meta
  sourceMetaEl.textContent = [q.building, (q.architects||[]).join(', '), q.year ? `${q.year}` : '', Array.isArray(q.epoch)? q.epoch.join(' / ') : (q.epoch||'')].filter(Boolean).join(' • ');
  revealBtn.onclick = () => showFeedback(false, q, true);
  nextBtn.onclick = () => askNext();
}

function showFeedback(isCorrect, q, reveal=false){
  feedbackEl.hidden = false;
  feedbackEl.className = `feedback ${isCorrect ? 'ok' : (reveal ? '' : 'bad')}`;
  const ep = Array.isArray(q.epoch) ? q.epoch.join(' / ') : (q.epoch||'');
  const who = (q.architects && q.architects.length) ? `von ${q.architects.join(', ')} ` : '';
  const when = q.year ? `(${q.year})` : (q.yearRange ? `(${q.yearRange})` : '');
  const bname = q.building ? `${q.building} ` : '';
  const base = q.feedback || `${bname}${who}${when ? when+' ' : ''}— Epoche: ${ep}.`;
  feedbackEl.textContent = reveal ? base : (isCorrect ? `Richtig! ${base}` : `Leider falsch. ${base}`);
  nextBtn.hidden = false;
}

function handleMCSubmit(q, allowMultiple){
  const selected = [...mcForm.querySelectorAll('input:checked')].map(i => i.value);
  if(selected.length === 0) return;

  let correctVals = [];
  if(q.type==='mc_building'){
    correctVals = [q.building];
  }else if(q.type==='mc_architect'){
    correctVals = q.architects || [];
  }else if(q.type==='epoch_mc'){
    correctVals = Array.isArray(q.epoch) ? q.epoch : [q.epoch];
  }else if(q.correctOptions){
    correctVals = q.correctOptions;
  }

  const isCorrect = allowMultiple ? arraysEqualSet(selected, correctVals) : (selected[0]===correctVals[0]);
  engine.correct += isCorrect ? 1 : 0;
  showFeedback(isCorrect, q);
}

function handleInputSubmit(q){
  const val = norm(textInput.value);
  if(!val) return;

  let ok = false;
  if(q.type==='input_building'){
    const acc = (q.accept||[q.building]).map(norm);
    ok = acc.includes(val);
  }else if(q.type==='input_architect'){
    const acc = (q.accept||q.architects||[]).map(norm);
    ok = acc.includes(val);
  }else if(q.type==='input_year'){
    if(q.acceptYears){
      ok = q.acceptYears.includes(parseInt(textInput.value,10));
    }else if(q.year){
      ok = parseInt(textInput.value,10) === q.year;
    }else if(q.yearRange){
      const [a,b] = q.yearRange.split('-').map(n=>parseInt(n,10));
      const year = parseInt(textInput.value,10);
      ok = year>=a && year<=b;
    }else{
      ok = false;
    }
  }else if(q.type==='input_text'){
    const acc = (q.accept||[]).map(norm);
    ok = acc.includes(val);
  }

  engine.correct += ok ? 1 : 0;
  showFeedback(ok, q);
}

// ask next
async function askNext(){
  // finished?
  if(engine.mode==='epoch' && engine.count>=engine.total){
    // session done
    const pct = Math.round((engine.correct/engine.total)*100);
    feedbackEl.hidden = false;
    feedbackEl.className = 'feedback';
    feedbackEl.textContent = `Session beendet: ${engine.correct}/${engine.total} richtig (${pct} %). Fortschritt +10 %.`;
    nextBtn.hidden = true;
    revealBtn.hidden = true;

    // Fortschritt +10 %
    const cur = getProgress(engine.epochId);
    setProgress(engine.epochId, Math.min(100, cur + 10));
    counterEl.textContent = `${engine.total}/${engine.total}`;
    return;
  }

  const q = engine.next();
  engine.current = q;
  engine.count++;
  counterEl.textContent = (engine.total===Infinity) ? `∞` : `${engine.count}/${engine.total}`;
  const title = engine.pack?.meta?.title || (Array.isArray(q.epoch) ? q.epoch.join(' / ') : q.epoch) || 'Allgemein';
  headingEl.textContent = engine.mode==='epoch' ? (engine.pack?.meta?.title || 'Lernen') : 'Zufallslernen';
  setUIForQuestion(q);
}

// bootstrap
let engine;

(async function init(){
  if(mode==='epoch' || mode==='preview'){
    const pack = await loadQuestionsFor(epochId);
    if(!pack.questions.length){
      headingEl.textContent = pack.meta?.title || 'Unbekannte Kategorie';
      subEl.textContent = pack.meta?.period || '';
      document.getElementById('learnMain').innerHTML = `<p style="padding:18px">Für diese Kategorie sind noch keine Fragen hinterlegt. Ergänze eine JSON in <code>${(await getCatalogItemById(epochId))?.dataPath || 'data/questions/...json'}</code>.</p>`;
      counterEl.textContent = '0/0';
      return;
    }
    headingEl.textContent = pack.meta.title;
    subEl.textContent = pack.meta.period || '';
    engine = new Engine({mode:'epoch', epochId, pack});
  }else{
    headingEl.textContent = 'Zufallslernen';
    subEl.textContent = sets.join(' + ');
    counterEl.textContent = '∞';
    const pool = await buildPoolFromSets(sets);
    if(!pool.length){
      document.getElementById('learnMain').innerHTML = `<p style="padding:18px">Für die gewählten Bereiche sind noch keine Fragen vorhanden.</p>`;
      return;
    }
    engine = new Engine({mode:'random', pool});
  }
  await askNext();
})();
