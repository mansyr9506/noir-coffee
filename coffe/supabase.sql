-- NOIR COFFEE — схема базы для Supabase.
-- Как применить: Supabase → SQL Editor → New query → вставить весь файл → Run.
-- Файл можно запускать повторно, он ничего не сломает.

-- ===== Таблицы =====
create table if not exists public.menu (
  id         text primary key,
  name       text not null,
  descr      text,
  price      integer not null check (price > 0),
  cat        text not null,
  emoji      text,
  milk       boolean not null default false,
  sweet      boolean not null default false,
  iced       boolean not null default false,
  coffee     boolean not null default true,
  keys       text[] not null default '{}',
  pitch      text,
  available  boolean not null default true,
  sort       integer not null default 0
);

create table if not exists public.orders (
  id          bigint generated always as identity primary key,
  name        text not null,
  phone       text not null,
  comment     text,
  pickup      text,
  total       integer not null,
  status      text not null default 'new' check (status in ('new','cooking','ready','done','cancelled')),
  created_at  timestamptz not null default now()
);

create table if not exists public.order_items (
  order_id  bigint not null references public.orders(id) on delete cascade,
  item_id   text   not null references public.menu(id),
  name      text   not null,
  price     integer not null,
  qty       integer not null check (qty between 1 and 20)
);
create index if not exists order_items_order_id_idx on public.order_items(order_id);
create index if not exists orders_created_at_idx on public.orders(created_at desc);

-- Персонал: пользователи Supabase Auth, которым разрешено видеть заказы
create table if not exists public.staff (
  user_id uuid primary key references auth.users(id) on delete cascade
);

-- ===== Безопасность (RLS) =====
alter table public.menu        enable row level security;
alter table public.orders      enable row level security;
alter table public.order_items enable row level security;
alter table public.staff       enable row level security;   -- без политик: напрямую недоступна никому

create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.staff where user_id = (select auth.uid()));
$$;
revoke execute on function public.is_staff() from public;
grant execute on function public.is_staff() to anon, authenticated;

drop policy if exists "menu: все читают" on public.menu;
create policy "menu: все читают" on public.menu for select to anon, authenticated using (true);
drop policy if exists "menu: персонал меняет" on public.menu;
create policy "menu: персонал меняет" on public.menu for update to authenticated
  using ((select public.is_staff())) with check ((select public.is_staff()));

drop policy if exists "orders: персонал читает" on public.orders;
create policy "orders: персонал читает" on public.orders for select to authenticated using ((select public.is_staff()));
drop policy if exists "orders: персонал меняет" on public.orders;
create policy "orders: персонал меняет" on public.orders for update to authenticated
  using ((select public.is_staff())) with check ((select public.is_staff()));

drop policy if exists "order_items: персонал читает" on public.order_items;
create policy "order_items: персонал читает" on public.order_items for select to authenticated using ((select public.is_staff()));

-- Доступ через API (авто-выдача прав выключена, поэтому выдаём явно и по минимуму)
grant usage on schema public to anon, authenticated;
grant select on public.menu to anon, authenticated;
grant update (available) on public.menu to authenticated;
grant select on public.orders, public.order_items to authenticated;
grant update (status) on public.orders to authenticated;

-- ===== Оформление заказа =====
-- Покупатель не пишет в таблицы напрямую: только через эту функцию.
-- Цену она берёт из меню сама, поэтому подменить сумму из браузера нельзя.
create or replace function public.place_order(p_name text, p_phone text, p_comment text, p_pickup text, p_items jsonb)
returns json language plpgsql security definer set search_path = '' as $$
declare
  v_name    text := left(btrim(coalesce(p_name, '')), 60);
  v_phone   text := left(regexp_replace(coalesce(p_phone, ''), '[^0-9+]', '', 'g'), 16);
  v_order   bigint;
  v_total   integer := 0;
  v_item    jsonb;
  v_qty     integer;
  m         public.menu%rowtype;
begin
  if length(v_name) < 2 then raise exception 'Укажи имя' using errcode = 'P0001'; end if;
  if length(regexp_replace(v_phone, '\D', '', 'g')) < 10 then raise exception 'Укажи корректный телефон' using errcode = 'P0001'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Корзина пуста' using errcode = 'P0001'; end if;
  if jsonb_array_length(p_items) > 30 then raise exception 'Слишком много позиций' using errcode = 'P0001'; end if;

  insert into public.orders (name, phone, comment, pickup, total)
  values (v_name, v_phone, left(btrim(coalesce(p_comment, '')), 200), left(coalesce(p_pickup, ''), 30), 0)
  returning id into v_order;

  for v_item in select * from jsonb_array_elements(p_items) loop
    select * into m from public.menu where id = v_item->>'id';
    if not found then raise exception 'Такой позиции нет в меню' using errcode = 'P0001'; end if;
    if not m.available then raise exception '«%» сейчас закончился', m.name using errcode = 'P0001'; end if;
    v_qty := (v_item->>'qty')::integer;
    if v_qty is null or v_qty < 1 or v_qty > 20 then raise exception 'Неверное количество' using errcode = 'P0001'; end if;
    insert into public.order_items (order_id, item_id, name, price, qty) values (v_order, m.id, m.name, m.price, v_qty);
    v_total := v_total + m.price * v_qty;
  end loop;

  update public.orders set total = v_total where id = v_order;
  return json_build_object('id', v_order, 'total', v_total);
end $$;
revoke execute on function public.place_order(text, text, text, text, jsonb) from public;
grant execute on function public.place_order(text, text, text, text, jsonb) to anon, authenticated;

-- ===== Начальное меню =====
insert into public.menu (id, name, descr, price, cat, emoji, milk, sweet, iced, coffee, keys, pitch, sort) values
  ('esp', 'Эспрессо', 'Крепкий, насыщенный', 650, 'classic', '☕', false, false, false, true, array['креп','бодр','энерг','быстр','класс','горьк','проснут','утр','насыщ','маленьк'], 'чистый вкус и заряд за пару глотков', 0),
  ('ame', 'Американо', 'Мягкий чёрный кофе', 800, 'classic', '☕', false, false, false, true, array['черн','легк','больш','объем','долг','класс','калор','диет','прост'], 'большая чашка чёрного кофе почти без калорий', 1),
  ('cap', 'Капучино', 'Нежная молочная пена', 950, 'milk', '🥛', true, false, false, true, array['молок','пен','нежн','класс','утр','баланс','завтрак'], 'идеальный баланс эспрессо и плотной пены', 2),
  ('lat', 'Латте', 'Для долгих разговоров', 950, 'milk', '🥛', true, false, false, true, array['молок','нежн','мягк','больш','долг','легк','сироп','разговор','работ'], 'много молока, мягкий вкус — можно добавить сироп', 3),
  ('flw', 'Флэт Уайт', 'Для настоящих ценителей', 1100, 'milk', '🥛', true, false, false, true, array['креп','молок','насыщ','ценит','бодр','баланс','двойн'], 'двойной эспрессо с бархатным молоком — крепко, но мягко', 4),
  ('raf', 'Раф', 'Сладкий, сливочный', 1200, 'milk', '🍦', true, true, false, true, array['слад','сливоч','ванил','десерт','нежн','молок','крем','вкусн'], 'сливки и ваниль — почти десерт', 5),
  ('ice', 'Айс Латте', 'Холодный, освежающий', 1100, 'cold', '🧊', true, false, true, true, array['холодн','лед','льд','айс','жар','освеж','лет','молок'], 'лёд, молоко и эспрессо — спасение в жару', 6),
  ('ton', 'Эспрессо-тоник', 'Тоник, лёд и цитрус', 1200, 'cold', '🍋', false, false, true, true, array['холодн','тоник','освеж','необыч','кисл','цитрус','лет','жар','лед','льд','нов','эксперимент','газ'], 'необычно, бодро и очень освежающе', 7),
  ('mat', 'Матча Латте', 'Японский зелёный чай с молоком', 1300, 'nocoffee', '🍵', true, false, false, false, array['матч','чай','зелен','необыч','полез','нов','молок','зож'], 'мягкая бодрость без кофе', 8),
  ('coc', 'Какао', 'Густое, шоколадное', 900, 'nocoffee', '🍫', true, true, false, false, array['какао','шоколад','слад','дет','тепл','уют','молок','вечер','сон'], 'шоколад и уют, без кофеина — можно и вечером', 9)
on conflict (id) do nothing;

-- ===== Добавить сотрудника (запускать отдельно, после создания пользователя) =====
-- 1) Authentication → Users → Add user → Create new user (email + пароль, галочка Auto Confirm)
-- 2) Затем выполнить, подставив email:
-- insert into public.staff (user_id) select id from auth.users where email = 'barista@example.com' on conflict do nothing;
