// Подключение к Supabase. Оба значения публичные — их можно хранить в коде сайта,
// данные защищены правилами RLS из supabase.sql.
// Ключ: Supabase → Project Settings → API Keys → Publishable key (sb_publishable_...)
window.NOIR_CONFIG = {
  url: 'https://dhmuyyhumwrnakcydltw.supabase.co',
  key: 'ВСТАВЬ_СЮДА_PUBLISHABLE_KEY',
};

window.sb = (() => {
  const { url, key } = window.NOIR_CONFIG;
  if (!window.supabase || !key || key.startsWith('ВСТАВЬ')) return null;
  return window.supabase.createClient(url, key);
})();
