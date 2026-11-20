/* ---------- Данные ---------- */
// Меню загружается из базы данных (GET /api/menu)
let MENU = [];
const CATS = [['all','Все'],['classic','Классика'],['milk','С молоком'],['cold','Холодные'],['nocoffee','Без кофе']];
const HINTS = ['хочу что-то сладкое','крепкий, чтобы проснуться','жарко, хочу холодное','без молока до 1000 ₸','без кофеина'];

const $ = s => document.querySelector(s);
const fmt = n => n.toLocaleString('ru-RU') + ' ₸';
const byId = id => MENU.find(m => m.id === id);

/* ---------- Меню ---------- */
let activeCat = 'all';
function renderFilters(){
  $('#filters').innerHTML = CATS.map(([k,t]) =>
    `<button class="filter" data-cat="${k}" aria-pressed="${k===activeCat}">${t}</button>`).join('');
}
function renderMenu(highlight = []){
  const list = MENU.filter(m => activeCat === 'all' || m.cat === activeCat);
  if(!MENU.length){ $('#menuGrid').innerHTML = `<p class="empty">${menuError || 'Загружаем меню…'}</p>`; return; }
  $('#menuGrid').innerHTML = list.map(m => `
    <article class="card${highlight.includes(m.id) ? ' hl' : ''}${m.available ? '' : ' off'}" id="item-${m.id}">
      <div class="emoji" aria-hidden="true">${m.emoji}</div>
      <b>${m.name}</b><small>${m.desc}</small>
      <div class="tags">${!m.available?'<span class="tag">закончился</span>':''}${m.iced?'<span class="tag">холодный</span>':''}${m.milk?'<span class="tag">с молоком</span>':''}${m.sweet?'<span class="tag">сладкий</span>':''}${!m.coffee?'<span class="tag">без кофеина</span>':''}</div>
      <div class="row"><span class="price">${fmt(m.price)}</span><button class="add" data-add="${m.id}" aria-label="Добавить ${m.name}" ${m.available ? '' : 'disabled'}>+</button></div>
    </article>`).join('');
  if(highlight.length) document.getElementById('item-' + highlight[0])?.scrollIntoView({behavior:'smooth', block:'center'});
}
let menuError = '';
async function loadMenu(){
  if(!window.sb){ menuError = 'База не подключена: впиши publishable key в config.js'; renderMenu(); return; }
  const { data, error } = await sb.from('menu').select('*').order('sort');
  if(error) menuError = 'Не удалось загрузить меню. Проверь интернет и обнови страницу';
  else MENU = data.map(m => ({ ...m, desc: m.descr }));
  renderMenu(); renderCart();
}
$('#filters').addEventListener('click', e => {
  const b = e.target.closest('[data-cat]'); if(!b) return;
  activeCat = b.dataset.cat; renderFilters(); renderMenu();
});

/* ---------- Корзина ---------- */
let cart = {};
try { cart = JSON.parse(localStorage.getItem('noir-cart')) || {}; } catch {}
function saveCart(){ try { localStorage.setItem('noir-cart', JSON.stringify(cart)); } catch {} }
function addToCart(id){
  const m = byId(id); if(!m) return;
  if(!m.available) return toast(`${m.name} сейчас закончился`);
  if((cart[id] || 0) >= 20) return toast('Максимум 20 штук одной позиции');
  cart[id] = (cart[id] || 0) + 1; saveCart(); renderCart();
  const b = $('#cartBtn'); b.classList.remove('bump'); void b.offsetWidth; b.classList.add('bump');
  toast(`${byId(id).name} в корзине`);
}
function renderCart(){
  const ids = Object.keys(cart).filter(id => cart[id] > 0 && byId(id));
  const count = ids.reduce((s,id) => s + cart[id], 0);
  const sum = ids.reduce((s,id) => s + cart[id] * byId(id).price, 0);
  $('#cartCount').textContent = count; $('#cartSum').textContent = fmt(sum); $('#total').textContent = fmt(sum);
  $('#checkout').disabled = !count;
  $('#items').innerHTML = count ? ids.map(id => `
    <div class="item"><span>${byId(id).name}</span>
      <div class="qty"><button data-dec="${id}" aria-label="Меньше">−</button><b>${cart[id]}</b><button data-add="${id}" aria-label="Больше">+</button></div>
      <span>${fmt(byId(id).price * cart[id])}</span></div>`).join('')
    : '<p class="empty">Пока пусто. Добавь что-нибудь из меню ☕</p>';
}
document.addEventListener('click', e => {
  const add = e.target.closest('[data-add]'); if(add) addToCart(add.dataset.add);
  const dec = e.target.closest('[data-dec]');
  if(dec){ const id = dec.dataset.dec; cart[id]--; if(cart[id] <= 0) delete cart[id]; saveCart(); renderCart(); }
  if(e.target.closest('[data-close]')) $('#drawer').classList.remove('open');
});
$('#cartBtn').onclick = () => { $('#drawer').classList.add('open'); $('#formError').textContent = ''; };
document.addEventListener('keydown', e => { if(e.key === 'Escape') $('#drawer').classList.remove('open'); });

// Оформление предзаказа → сохраняется в базу (POST /api/orders)
try { const saved = JSON.parse(localStorage.getItem('noir-contact')) || {}; $('#oName').value = saved.name || ''; $('#oPhone').value = saved.phone || ''; } catch {}
$('#orderForm').addEventListener('submit', async e => {
  e.preventDefault();
  const err = $('#formError'); err.textContent = '';
  const items = Object.keys(cart).filter(id => cart[id] > 0 && byId(id)).map(id => ({id, qty: cart[id]}));
  if(!items.length) return;
  const order = { name: $('#oName').value, phone: $('#oPhone').value, pickup: $('#oPickup').value, comment: $('#oComment').value, items };
  const btn = $('#checkout'); btn.disabled = true; btn.textContent = 'Отправляем…';
  try {
    if(!window.sb) throw new Error('База не подключена');
    const { data, error } = await sb.rpc('place_order', { p_name: order.name, p_phone: order.phone, p_comment: order.comment, p_pickup: order.pickup, p_items: items });
    if(error) throw new Error(error.code === 'P0001' ? error.message : 'Не получилось оформить заказ, попробуй ещё раз');
    try { localStorage.setItem('noir-contact', JSON.stringify({name: order.name, phone: order.phone})); } catch {}
    cart = {}; saveCart(); $('#oComment').value = '';
    $('#drawer').classList.remove('open');
    toast(`Заказ №${data.id} принят! ${fmt(data.total)}, заберёшь ${$('#oPickup').selectedOptions[0].text.toLowerCase()}`, 4000);
  } catch (ex) {
    err.textContent = ex.message;
  } finally {
    btn.textContent = 'Оформить предзаказ'; renderCart();
  }
});

let toastT;
function toast(text, ms = 2200){
  const t = $('#toast'); t.textContent = text; t.classList.add('show');
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), ms);
}

/* ---------- AI-бариста ---------- */
function recommend(raw){
  let q = raw.toLowerCase().replace(/ё/g,'е').trim();
  if(!q) return {text:'Напиши, чего хочется — например: «хочу крепкий» или «что-то холодное до 1200».'};
  if(/^(привет|здравств|салем|сәлем|салам|хай|hello)/.test(q))
    return {text:'Привет! Я NOIR AI. Расскажи, какое у тебя настроение, а я подберу напиток ☕'};
  if(/спасиб|рахмет|благодар/.test(q))
    return {text:'Рахмет тебе! Приходи ещё — сварим самое вкусное 🤎'};

  // Флаги и ограничения
  const f = {
    noMilk:    /без\s+молок|не\s+(хочу\s+|люблю\s+)?молок|безлактоз|лактоз/.test(q),
    noCaffeine:/без\s+кофеин|не\s+(хочу\s+)?кофе\b|декаф|на\s+ночь|перед\s+сном/.test(q),
    noSugar:   /без\s+сахар|не\s+(хочу\s+|люблю\s+)?сладк|несладк/.test(q),
    warm:      /холодно(?![а-я])|мороз|зим|замерз|согреть|горяч/.test(q),
    cheap:     /дешев|бюджет|эконом|недорог/.test(q),
  };
  const budget = q.match(/(?:до|дешевле|не\s+дороже|меньше|максимум|за)\s*(\d{3,5})/);
  // убираем отрицания и «холодно на улице», чтобы они не давали очки
  q = q.replace(/(без|не\s+хочу|не\s+люблю|не)\s+\S+/g,' ').replace(/холодно(?![а-я])|мороз\S*|замерз\S*/g,' ');
  f.iced = !f.warm && /холодн|айс|ice|льд|лед|жарк|жара|освеж/.test(q);

  let list = MENU.filter(m => m.available &&
    !(f.noMilk && m.milk) && !(f.noCaffeine && m.coffee) && !(f.noSugar && m.sweet) &&
    !(f.warm && m.iced) && !(budget && m.price > +budget[1]));

  if(!list.length) return {text:'Хм, под все условия ничего не нашлось 😔 Попробуй смягчить запрос — например, поднять бюджет.'};

  const scored = list.map(m => {
    let s = m.keys.reduce((a,k) => a + (q.includes(k) ? 1 : 0), 0);
    if(f.iced && m.iced) s += 3;
    if(f.warm && /тепл|уют|слад|сливоч/.test(m.keys.join())) s += 1;
    if(f.noCaffeine && !m.coffee) s += 2;
    if(f.cheap) s += (1300 - m.price) / 400;
    return {m, s};
  }).sort((a,b) => b.s - a.s || a.m.price - b.m.price);

  const anyFlag = f.noMilk || f.noCaffeine || f.noSugar || f.warm || f.cheap || f.iced || budget;
  if(scored[0].s <= 0 && !anyFlag){
    const h = new Date().getHours();
    const want = h < 12 ? 'cap' : h < 17 ? 'ice' : h < 21 ? 'lat' : 'coc';
    const id = byId(want)?.available ? want : list[0].id;
    return {text:`Не совсем понял, но в это время дня советую ${byId(id).name} — ${byId(id).pitch}. Можешь уточнить: сладкое, крепкое, холодное?`, picks:[id]};
  }

  const top = scored.filter(x => x.s >= scored[0].s - 0.5).slice(0,2).map(x => x.m);
  const [a,b] = top;
  let text = `Тебе подойдёт ${a.name} (${fmt(a.price)}) — ${a.pitch}.`;
  if(b) text += ` Ещё можно взять ${b.name} (${fmt(b.price)}) — ${b.pitch}.`;
  return {text, picks: top.map(m => m.id)};
}

function addMsg(text, who, picks){
  const el = document.createElement('div');
  el.className = 'msg ' + who;
  el.textContent = text;                       // безопасно: без innerHTML для текста
  if(picks && picks.length){
    const box = document.createElement('div'); box.className = 'picks';
    picks.forEach(id => {
      const btn = document.createElement('button');
      btn.className = 'pick'; btn.dataset.add = id;
      btn.textContent = `+ ${byId(id).name}`;
      box.appendChild(btn);
    });
    el.appendChild(box);
  }
  $('#chat').appendChild(el);
  $('#chat').scrollTop = $('#chat').scrollHeight;
  return el;
}

function ask(text){
  text = text.trim(); if(!text) { $('#q').focus(); return; }
  addMsg(text, 'user');
  $('#q').value = '';
  const typing = addMsg('', 'bot'); typing.innerHTML = '<span class="typing"><span></span><span></span><span></span></span>';
  setTimeout(() => {
    typing.remove();
    const r = recommend(text);
    addMsg(r.text, 'bot', r.picks);
    if(r.picks){ activeCat = 'all'; renderFilters(); renderMenu(r.picks); }
  }, 500 + Math.random()*400);
}

$('#askForm').addEventListener('submit', e => { e.preventDefault(); ask($('#q').value); });
$('#hints').innerHTML = HINTS.map(h => `<button class="hint" type="button">${h}</button>`).join('');
$('#hints').addEventListener('click', e => { const h = e.target.closest('.hint'); if(h) ask(h.textContent); });

/* ---------- Старт ---------- */
addMsg('Привет! Напиши, чего хочется, — подберу напиток. Понимаю «без молока», «до 1000 ₸», «холодное», «без кофеина».', 'bot');
renderFilters(); renderMenu(); renderCart(); loadMenu();
