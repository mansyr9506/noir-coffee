const $ = s => document.querySelector(s);
const fmt = n => n.toLocaleString('ru-RU') + ' ₸';
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const LABEL = { new:'Новый', cooking:'Готовится', ready:'Готов', done:'Выдан', cancelled:'Отменён' };
const NEXT = { new:'cooking', cooking:'ready', ready:'done' };
const NEXT_TEXT = { new:'Начать готовить', cooking:'Готов', ready:'Выдан' };
const TABS = [['active','Активные'], ['done','Выданные'], ['cancelled','Отменённые'], ['all','Все']];

let tab = 'active', orders = [], menu = [], timer;
const check = ({ data, error }) => { if(error) throw new Error(error.message); return data; };

async function load(){
  try {
    if(!(check(await sb.rpc('is_staff')))) { await sb.auth.signOut(); logout(); throw new Error('У этого аккаунта нет доступа к заказам'); }
    [orders, menu] = await Promise.all([
      sb.from('orders').select('*, items:order_items(*)').order('id', { ascending: false }).limit(200).then(check),
      sb.from('menu').select('*').order('sort').then(check),
    ]);
    $('#login').hidden = true; $('#app').hidden = false; $('#logout').hidden = false;
    render();
    clearInterval(timer); timer = setInterval(load, 10000);   // новые заказы подтягиваются каждые 10 сек
  } catch (e) { if(!$('#login').hidden) $('#loginErr').textContent = e.message; else toast(e.message); }
}

function render(){
  const active = orders.filter(o => ['new','cooking','ready'].includes(o.status)).length;
  document.title = (active ? `(${active}) ` : '') + 'NOIR COFFEE — заказы';
  $('#tabs').innerHTML = TABS.map(([k,t]) => `<button class="filter" data-tab="${k}" aria-pressed="${k===tab}">${t}${k==='active' && active ? ` · ${active}` : ''}</button>`).join('');
  const list = orders.filter(o => tab === 'all' || (tab === 'active' ? ['new','cooking','ready'].includes(o.status) : o.status === tab));
  $('#orders').innerHTML = list.length ? list.map(o => `
    <article class="order ${o.status}">
      <h3>№${o.id} <span class="badge">${LABEL[o.status]}</span></h3>
      <div class="meta">${new Date(o.created_at).toLocaleString('ru-RU', {dateStyle:'short', timeStyle:'short'})} · забрать через ${esc(o.pickup)} мин</div>
      <div><b>${esc(o.name)}</b> · <a href="tel:${esc(o.phone)}">${esc(o.phone)}</a></div>
      <ul>${o.items.map(i => `<li>${esc(i.name)} × ${i.qty} — ${fmt(i.price * i.qty)}</li>`).join('')}</ul>
      ${o.comment ? `<div class="meta">💬 ${esc(o.comment)}</div>` : ''}
      <b class="price">${fmt(o.total)}</b>
      <div class="acts">
        ${NEXT[o.status] ? `<button class="primary" data-id="${o.id}" data-status="${NEXT[o.status]}">${NEXT_TEXT[o.status]}</button>` : ''}
        ${['new','cooking'].includes(o.status) ? `<button data-id="${o.id}" data-status="cancelled">Отменить</button>` : ''}
        ${['done','cancelled'].includes(o.status) ? `<button data-id="${o.id}" data-status="new">Вернуть в работу</button>` : ''}
      </div>
    </article>`).join('') : '<p class="empty">Здесь пока пусто</p>';
  $('#stop').innerHTML = menu.map(m => `
    <div><span class="${m.available ? '' : 'is-off'}">${m.emoji} ${esc(m.name)}</span>
      <button data-item="${m.id}" data-on="${m.available ? 0 : 1}">${m.available ? 'В стоп' : 'Вернуть'}</button></div>`).join('');
}

document.addEventListener('click', async e => {
  const t = e.target.closest('[data-tab]'); if(t){ tab = t.dataset.tab; render(); return; }
  const s = e.target.closest('[data-status]');
  if(s){
    if(s.dataset.status === 'cancelled' && !confirm(`Отменить заказ №${s.dataset.id}?`)) return;
    try { check(await sb.from('orders').update({ status: s.dataset.status }).eq('id', +s.dataset.id)); await load(); } catch (ex) { toast(ex.message); }
  }
  const m = e.target.closest('[data-item]');
  if(m){ try { check(await sb.from('menu').update({ available: m.dataset.on === '1' }).eq('id', m.dataset.item)); await load(); } catch (ex) { toast(ex.message); } }
});

$('#login').addEventListener('submit', async e => {
  e.preventDefault(); $('#loginErr').textContent = '';
  if(!window.sb) return $('#loginErr').textContent = 'База не подключена: впиши publishable key в config.js';
  const { error } = await sb.auth.signInWithPassword({ email: $('#email').value.trim(), password: $('#key').value });
  if(error) return $('#loginErr').textContent = 'Неверный email или пароль';
  $('#key').value = ''; load();
});
function logout(){
  clearInterval(timer); $('#login').hidden = false; $('#app').hidden = true; $('#logout').hidden = true;
}
$('#logout').onclick = async () => { await sb?.auth.signOut(); logout(); };

let toastT;
function toast(text){ const el = $('#toast'); el.textContent = text; el.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('show'), 2500); }

sb?.auth.getSession().then(({ data }) => { if(data.session) load(); });
