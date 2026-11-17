-- ============================================================================
--  BEDROCK CRAFT — настройка базы данных Supabase
--  Как использовать:
--    1) Создайте бесплатный проект на https://supabase.com
--    2) Откройте SQL Editor в проекте и вставьте ВЕСЬ этот файл
--    3) Нажмите Run (выполнить)
--    4) Скопируйте Project URL и anon/public ключ в config.js
--  Файл можно запускать повторно — он идемпотентный (безопасен).
-- ============================================================================

-- Расширение для генерации UUID
create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
-- 1. ТАБЛИЦЫ
-- ----------------------------------------------------------------------------

-- Настройки сайта (одна строка, id = 1)
create table if not exists public.site_settings (
  id int primary key,
  server_name text not null default 'BEDROCK CRAFT',
  server_tagline text not null default '',
  server_notice text not null default '',
  server_ip text not null default 'play.myserver.ru',
  minecraft_version text not null default '1.21.4',
  mod_loader text not null default 'Fabric',
  announcement_text text not null default '',
  announcement_enabled boolean not null default false,
  mods_download_url text not null default 'mods/server-mods.zip',
  mods_filename text not null default 'server-mods-1.21.4-fabric.zip',
  mods_version text not null default 'v1.0',
  mods_size text not null default 'Архив .zip',
  mods_updated text not null default '',
  mods_description text not null default '',
  discord_url text not null default '',
  telegram_url text not null default '',
  github_url text not null default '',
  donate_url text not null default ''
);

-- Профили игроков (связаны с auth.users)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique,
  mcnick text not null default '',
  email text not null default '',
  avatar_color text not null default '#27ce40',
  role text not null default 'player' check (role in ('player','moderator','admin','owner')),
  banned boolean not null default false,
  banned_reason text not null default '',
  created_at timestamptz not null default now()
);

-- Разделы форума
create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null default '',
  admin_only boolean not null default false,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

-- Темы форума
create table if not exists public.threads (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  category_id uuid references public.categories(id) on delete set null,
  author_id uuid references public.profiles(id) on delete set null,
  pinned boolean not null default false,
  locked boolean not null default false,
  likes jsonb not null default '[]'::jsonb,
  views int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Ответы в темах
create table if not exists public.replies (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.threads(id) on delete cascade,
  author_id uuid references public.profiles(id) on delete set null,
  body text not null,
  likes jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Моды в сборке
create table if not exists public.mods_items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null default '',
  sort_order int not null default 0
);

-- Правила и FAQ
create table if not exists public.rules_items (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  sort_order int not null default 0
);

-- ----------------------------------------------------------------------------
-- 2. ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ДЛЯ RLS
-- ----------------------------------------------------------------------------
create or replace function public.is_staff()
returns boolean language sql security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('moderator','admin','owner') and banned = false
  );
$$;

create or replace function public.is_owner()
returns boolean language sql security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'owner'
  );
$$;

create or replace function public.is_banned()
returns boolean language sql security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and banned = true
  );
$$;

-- Автоматическое обновление updated_at у тем и ответов
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_threads_touch on public.threads;
create trigger trg_threads_touch before update on public.threads
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_replies_touch on public.replies;
create trigger trg_replies_touch before update on public.replies
  for each row execute function public.touch_updated_at();

-- ----------------------------------------------------------------------------
-- 3. АВТОМАТИЧЕСКАЯ ВЫДАЧА РОЛИ «СОЗДАТЕЛЬ»
--    Первый зарегистрировавшийся пользователь (или пользователь с email
--    из списка ниже) автоматически получает роль owner.
--    >>> ЗАМЕНИТЕ admin@example.com на СВОЙ email, если хотите <<<
-- ----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_count int;
  v_username text;
  v_is_owner boolean := false;
begin
  select count(*) into v_count from public.profiles;

  -- Email создателя сайта (можно указать несколько через OR)
  if lower(new.email) = lower('admin@example.com') then
    v_is_owner := true;
  end if;

  -- Первый пользователь проекта — тоже создатель
  if v_count = 0 then
    v_is_owner := true;
  end if;

  v_username := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'username'), ''),
    split_part(new.email, '@', 1)
  );

  insert into public.profiles (id, username, mcnick, email, avatar_color, role)
  values (
    new.id,
    v_username,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'mcnick'), ''), v_username),
    new.email,
    coalesce(nullif(new.raw_user_meta_data ->> 'avatar_color', ''), '#27ce40'),
    case when v_is_owner then 'owner' else 'player' end
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ----------------------------------------------------------------------------
-- 4. ROW LEVEL SECURITY (RLS) — политики доступа
-- ----------------------------------------------------------------------------
alter table public.site_settings enable row level security;
alter table public.profiles enable row level security;
alter table public.categories enable row level security;
alter table public.threads enable row level security;
alter table public.replies enable row level security;
alter table public.mods_items enable row level security;
alter table public.rules_items enable row level security;

-- --- site_settings: читать всем, менять только администрации ---
drop policy if exists "settings_select" on public.site_settings;
create policy "settings_select" on public.site_settings for select using (true);

drop policy if exists "settings_write" on public.site_settings;
create policy "settings_write" on public.site_settings for all
  using (public.is_staff()) with check (public.is_staff());

-- --- profiles: читать всем (нужно для форума), менять — себе или администрации ---
drop policy if exists "profiles_select" on public.profiles;
create policy "profiles_select" on public.profiles for select using (true);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles for insert
  with check (id = auth.uid());

drop policy if exists "profiles_update" on public.profiles;
create policy "profiles_update" on public.profiles for update
  using (id = auth.uid() or public.is_staff())
  with check (id = auth.uid() or public.is_staff());

drop policy if exists "profiles_delete" on public.profiles;
create policy "profiles_delete" on public.profiles for delete
  using (public.is_owner());

-- --- categories: публичные разделы всем, закрытые — только администрации ---
drop policy if exists "categories_select" on public.categories;
create policy "categories_select" on public.categories for select
  using (admin_only = false or public.is_staff());

drop policy if exists "categories_write" on public.categories;
create policy "categories_write" on public.categories for all
  using (public.is_staff()) with check (public.is_staff());

-- --- threads: читать с учётом закрытых разделов ---
drop policy if exists "threads_select" on public.threads;
create policy "threads_select" on public.threads for select
  using (
    category_id is null
    or exists (select 1 from public.categories c where c.id = threads.category_id and c.admin_only = false)
    or public.is_staff()
  );

drop policy if exists "threads_insert" on public.threads;
create policy "threads_insert" on public.threads for insert
  with check (auth.uid() is not null and author_id = auth.uid() and not public.is_banned());

drop policy if exists "threads_update" on public.threads;
create policy "threads_update" on public.threads for update
  using (author_id = auth.uid() or public.is_staff())
  with check (author_id = auth.uid() or public.is_staff());

drop policy if exists "threads_delete" on public.threads;
create policy "threads_delete" on public.threads for delete
  using (author_id = auth.uid() or public.is_staff());

-- --- replies ---
drop policy if exists "replies_select" on public.replies;
create policy "replies_select" on public.replies for select
  using (
    exists (
      select 1 from public.threads t
      left join public.categories c on c.id = t.category_id
      where t.id = replies.thread_id
        and (t.category_id is null or c.admin_only = false or public.is_staff())
    )
  );

drop policy if exists "replies_insert" on public.replies;
create policy "replies_insert" on public.replies for insert
  with check (auth.uid() is not null and author_id = auth.uid() and not public.is_banned());

drop policy if exists "replies_update" on public.replies;
create policy "replies_update" on public.replies for update
  using (author_id = auth.uid() or public.is_staff())
  with check (author_id = auth.uid() or public.is_staff());

drop policy if exists "replies_delete" on public.replies;
create policy "replies_delete" on public.replies for delete
  using (author_id = auth.uid() or public.is_staff());

-- --- mods_items / rules_items: читать всем, писать администрации ---
drop policy if exists "mods_select" on public.mods_items;
create policy "mods_select" on public.mods_items for select using (true);

drop policy if exists "mods_write" on public.mods_items;
create policy "mods_write" on public.mods_items for all
  using (public.is_staff()) with check (public.is_staff());

drop policy if exists "rules_select" on public.rules_items;
create policy "rules_select" on public.rules_items for select using (true);

drop policy if exists "rules_write" on public.rules_items;
create policy "rules_write" on public.rules_items for all
  using (public.is_staff()) with check (public.is_staff());

-- ----------------------------------------------------------------------------
-- 5. НАЧАЛЬНЫЕ ДАННЫЕ (настройки, разделы, моды, правила)
-- ----------------------------------------------------------------------------
insert into public.site_settings (id) values (1)
on conflict (id) do nothing;

insert into public.categories (name, description, admin_only, sort_order) values
  ('Новости сервера', 'Обновления, вайпы и важные анонсы', true, 1),
  ('Общие обсуждения', 'Разговоры обо всём и ни о чём', false, 2),
  ('Моды и техподдержка', 'Установка сборки, ошибки и вопросы по модам', false, 3),
  ('Постройки и скриншоты', 'Покажите свои базы, механизмы и арт', false, 4),
  ('Предложения и баги', 'Идеи по развитию сервера и сообщения об ошибках', false, 5)
on conflict do nothing;

insert into public.mods_items (name, description, sort_order) values
  ('Energized Power', 'Энергетика и генераторы для индустриальной базы', 1),
  ('PolyFactory', 'Автоматизация и конвейеры', 2),
  ('Tech Reborn', 'Машины, руды и крафты', 3),
  ('Pufferfish''s Skills', 'Прокачка навыков персонажа', 4),
  ('RPGStats', 'Характеристики и развитие героя', 5),
  ('Waystones', 'Телепорты между точками мира', 6),
  ('VeinMiner', 'Добыча жилы одним ударом', 7),
  ('Traveler''s Backpack', 'Рюкзаки и удобное хранение', 8)
on conflict do nothing;

insert into public.rules_items (title, body, sort_order) values
  ('Запрещены читы, X-Ray и сторонние модификации, дающие преимущество',
   'Использование любых читов, макросов и модов, нарушающих честную игру (X-Ray, KillAura, Fly и т.п.), карается баном без предупреждения. Разрешены только моды из официальной сборки сервера и чисто визуальные/оптимизирующие клиенты, не дающие игрового преимущества.', 1),
  ('Запрещены гриферство и воровство',
   'Разрушение чужих построек, кража из сундуков и порча территории других игроков запрещены. Приват территории обязателен для ценных построек. Нарушение — бан и откат действий.', 2),
  ('Запрещён флуд, оскорбления и реклама на форуме',
   'На форуме запрещено: спам, флуд, оскорбления других игроков, реклама сторонних проектов и читов. За нарушение — предупреждения и бан на форуме.', 3),
  ('Как получить помощь на сервере?',
   'Создайте тему в разделе «Моды и техподдержка» на форуме, подробно описав проблему. Администрация отвечает в течение суток. Для срочных вопросов используйте Discord сервера.', 4),
  ('Что делать, если сборка модов не запускается?',
   'Проверьте: версия Minecraft 1.21.4, загрузчик Fabric, все .jar файлы лежат в папке mods, старые моды удалены. Если не помогло — создайте тему на форуме с текстом ошибки из лога (папка logs/latest.log).', 5)
on conflict do nothing;

-- ============================================================================
--  ГОТОВО! Теперь:
--   1) В Supabase: Authentication -> Providers -> Email — оставьте включённым.
--      (Для мгновенной регистрации без подтверждения письма отключите
--       Confirm email в Authentication -> Providers -> Email.)
--   2) В config.js вставьте SUPABASE_URL и SUPABASE_ANON_KEY.
--   3) Зарегистрируйтесь на сайте первым — вы получите роль Создателя.
-- ============================================================================
