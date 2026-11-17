/* ============================================================================
   BEDROCK CRAFT — app.js
   Сайт сервера Minecraft: форум, регистрация, админ-панель, сборка модов.
   Работает в двух режимах:
     1) ЛОКАЛЬНЫЙ ДЕМО-РЕЖИМ (без Supabase) — данные в localStorage браузера.
     2) ОНЛАЙН-РЕЖИМ (Supabase) — общие данные для всех посетителей GitHub Pages.
   ============================================================================ */
(function () {
  'use strict';

  /* --------------------------------------------------------------------------
     КОНФИГУРАЦИЯ (значения по умолчанию + переопределения из config.js)
     -------------------------------------------------------------------------- */
  var CFG = {
    SUPABASE_URL: '',
    SUPABASE_ANON_KEY: '',
    OWNER_EMAIL: '',
    SERVER_NAME: 'BEDROCK CRAFT',
    SERVER_TAGLINE: 'Приватный сервер Minecraft 1.21.4 Fabric — индустрия, скиллы и выживание',
    SERVER_NOTICE: 'Для входа на сервер скачайте актуальную сборку модов по кнопке ниже',
    SERVER_IP: 'play.myserver.ru',
    MINECRAFT_VERSION: '1.21.4',
    MOD_LOADER: 'Fabric',
    MODS_DOWNLOAD_URL: 'mods/server-mods.zip',
    MODS_FILENAME: 'server-mods-1.21.4-fabric.zip',
    MODS_VERSION: 'v1.0',
    MODS_SIZE: 'Архив .zip',
    MODS_UPDATED: 'Ноябрь 2026',
    MODS_DESCRIPTION: 'Официальная клиентская сборка модов нашего сервера на Minecraft 1.21.4 (Fabric).',
    DISCORD_URL: '',
    TELEGRAM_URL: '',
    GITHUB_URL: '',
    DONATE_URL: '',
    DEMO_OWNER_LOGIN: 'admin',
    DEMO_OWNER_PASSWORD: 'admin123',
    DEMO_OWNER_EMAIL: 'admin@server.local'
  };
  var _cfg = window.SITE_CONFIG || {};
  for (var _k in _cfg) { if (Object.prototype.hasOwnProperty.call(_cfg, _k)) CFG[_k] = _cfg[_k]; }

  var USE_SB = !!(CFG.SUPABASE_URL && CFG.SUPABASE_ANON_KEY);

  /* --------------------------------------------------------------------------
     УТИЛИТЫ
     -------------------------------------------------------------------------- */
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function uid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  }
  function nowISO() { return new Date().toISOString(); }
  function fmtDate(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }) +
      ' в ' + d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  }
  function timeAgo(iso) {
    if (!iso) return '';
    var s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
    if (s < 60) return 'только что';
    var m = Math.floor(s / 60); if (m < 60) return m + ' мин. назад';
    var h = Math.floor(m / 60); if (h < 24) return h + ' ч. назад';
    var d = Math.floor(h / 24); if (d < 30) return d + ' дн. назад';
    return fmtDate(iso);
  }
  function debounce(fn, ms) {
    var t; return function () { var a = arguments, c = this; clearTimeout(t); t = setTimeout(function () { fn.apply(c, a); }, ms); };
  }
  function toast(msg, type) {
    var box = $('#toast-container'); if (!box) return;
    var el = document.createElement('div');
    el.className = 'toast' + (type ? ' ' + type : '');
    el.textContent = msg;
    box.appendChild(el);
    setTimeout(function () { el.classList.add('show'); }, 10);
    setTimeout(function () { el.classList.remove('show'); setTimeout(function () { el.remove(); }, 300); }, 3600);
  }
  function copyText(text, okMsg) {
    function done() { toast(okMsg || 'Скопировано!'); }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function () { fallback(); });
    } else fallback();
    function fallback() {
      var ta = document.createElement('textarea');
      ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); done(); } catch (e) { toast('Не удалось скопировать', 'error'); }
      ta.remove();
    }
  }

  /* Markdown-lite: безопасно (сначала экранирование), затем форматирование */
  function mdLite(text) {
    var codeBlocks = [];
    var t = String(text == null ? '' : text).replace(/\r\n/g, '\n');
    t = t.replace(/```([\s\S]*?)```/g, function (m, code) {
      codeBlocks.push('<pre class="code-block">' + esc(code.replace(/^\n|\n$/g, '')) + '</pre>');
      return '\u0001' + (codeBlocks.length - 1) + '\u0001';
    });
    t = esc(t);
    t = t.replace(/`([^`\n]+)`/g, '<code>$1</code>');
    t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    t = t.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
    t = t.replace(/^&gt; (.*)$/gm, '<span class="quote-line">$1</span>');
    t = t.replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
    t = t.replace(/\n{2,}/g, '</p><p>').replace(/\n/g, '<br>');
    t = '<p>' + t + '</p>';
    t = t.replace(/\u0001(\d+)\u0001/g, function (m, i) { return codeBlocks[+i] || ''; });
    return t;
  }

  /* Пиксель-аватар (детерминированный по имени пользователя) */
  var AVATAR_COLORS = ['#27ce40', '#f2b93b', '#58a6ff', '#e5534b', '#b07fe8', '#3ac6c6', '#f28bb4', '#a3c14a', '#8c8c8c', '#ff8c42'];
  function avatarSVG(user, size) {
    var name = (user && user.username) || '?';
    var color = (user && user.avatar_color) || AVATAR_COLORS[0];
    var seed = 0; for (var i = 0; i < name.length; i++) seed = (seed * 31 + name.charCodeAt(i)) >>> 0;
    var rnd = function () { seed = (seed * 1103515245 + 12345) >>> 0; return seed / 4294967296; };
    var cells = '';
    for (var y = 0; y < 5; y++) for (var x = 0; x < 5; x++) {
      if (rnd() > 0.52) {
        var shade = rnd() > 0.5 ? '#00000033' : '#ffffff2e';
        cells += '<rect x="' + x + '" y="' + y + '" width="1" height="1" fill="' + shade + '"/>';
      }
    }
    var s = size || 40;
    return '<svg class="pixel-avatar" width="' + s + '" height="' + s + '" viewBox="0 0 5 5" shape-rendering="crispEdges" aria-hidden="true">' +
      '<rect width="5" height="5" fill="' + esc(color) + '"/>' + cells +
      '<rect width="5" height="5" fill="none" stroke="#000" stroke-width="0.25"/></svg>';
  }

  var ROLE_LABELS = { owner: 'Создатель', admin: 'Админ', moderator: 'Модератор', player: 'Игрок' };
  var ROLE_RANK = { player: 0, moderator: 1, admin: 2, owner: 3 };
  function roleBadge(role) {
    var r = role || 'player';
    return '<span class="badge role-' + esc(r) + '">' + esc(ROLE_LABELS[r] || 'Игрок') + '</span>';
  }
  function isStaff(u) { return !!u && (u.role === 'owner' || u.role === 'admin' || u.role === 'moderator'); }
  function isOwner(u) { return !!u && u.role === 'owner'; }
  function canModerate(u) { return isStaff(u); }
  function canEditPost(u, authorId) { return !!u && (u.id === authorId || isStaff(u)); }

  /* --------------------------------------------------------------------------
     ЛОКАЛЬНЫЙ ДРАЙВЕР (демо-режим, localStorage)
     -------------------------------------------------------------------------- */
  var LS_DB = 'bc_local_db_v1';
  var LS_SESSION = 'bc_local_session_v1';

  function sha256(str) {
    if (window.crypto && crypto.subtle && crypto.subtle.digest) {
      return crypto.subtle.digest('SHA-256', new TextEncoder().encode(str)).then(function (buf) {
        return Array.prototype.map.call(new Uint8Array(buf), function (b) { return b.toString(16).padStart(2, '0'); }).join('');
      });
    }
    var h1 = 0x811c9dc5, h2 = 0x1000193;
    for (var i = 0; i < str.length; i++) { h1 = Math.imul(h1 ^ str.charCodeAt(i), 16777619); h2 = Math.imul(h2 + str.charCodeAt(i), 31); }
    return Promise.resolve('fnv' + (h1 >>> 0).toString(16) + (h2 >>> 0).toString(16));
  }

  function defaultSettings() {
    return {
      id: 1,
      server_name: CFG.SERVER_NAME, server_tagline: CFG.SERVER_TAGLINE, server_notice: CFG.SERVER_NOTICE,
      server_ip: CFG.SERVER_IP, minecraft_version: CFG.MINECRAFT_VERSION, mod_loader: CFG.MOD_LOADER,
      announcement_text: '', announcement_enabled: false,
      mods_download_url: CFG.MODS_DOWNLOAD_URL, mods_filename: CFG.MODS_FILENAME,
      mods_version: CFG.MODS_VERSION, mods_size: CFG.MODS_SIZE, mods_updated: CFG.MODS_UPDATED,
      mods_description: CFG.MODS_DESCRIPTION,
      discord_url: CFG.DISCORD_URL, telegram_url: CFG.TELEGRAM_URL, github_url: CFG.GITHUB_URL, donate_url: CFG.DONATE_URL
    };
  }

  function seedLocal() {
    var t0 = Date.now();
    function ago(days, hours) { return new Date(t0 - days * 864e5 - (hours || 0) * 36e5).toISOString(); }
    var owner = { id: 'u-owner', username: CFG.DEMO_OWNER_LOGIN, mcnick: 'Admin', email: CFG.DEMO_OWNER_EMAIL, pass_hash: '', avatar_color: '#f2b93b', role: 'owner', banned: false, banned_reason: '', created_at: ago(120) };
    var mod = { id: 'u-mod', username: 'Moderator', mcnick: 'Moderator', email: 'mod@server.local', pass_hash: '', avatar_color: '#58a6ff', role: 'moderator', banned: false, banned_reason: '', created_at: ago(100) };
    var player = { id: 'u-player', username: 'Steve_2026', mcnick: 'Steve_2026', email: 'steve@example.com', pass_hash: '', avatar_color: '#27ce40', role: 'player', banned: false, banned_reason: '', created_at: ago(40) };
    var cats = [
      { id: 'c-news', name: 'Новости сервера', description: 'Обновления, вайпы и важные анонсы', admin_only: true, sort_order: 1, created_at: ago(120) },
      { id: 'c-general', name: 'Общие обсуждения', description: 'Разговоры обо всём и ни о чём', admin_only: false, sort_order: 2, created_at: ago(120) },
      { id: 'c-mods', name: 'Моды и техподдержка', description: 'Установка сборки, ошибки и вопросы по модам', admin_only: false, sort_order: 3, created_at: ago(120) },
      { id: 'c-builds', name: 'Постройки и скриншоты', description: 'Покажите свои базы, механизмы и арт', admin_only: false, sort_order: 4, created_at: ago(120) },
      { id: 'c-suggest', name: 'Предложения и баги', description: 'Идеи по развитию сервера и сообщения об ошибках', admin_only: false, sort_order: 5, created_at: ago(120) }
    ];
    var threads = [
      { id: 't-welcome', title: 'Добро пожаловать на форум BEDROCK CRAFT!', body: 'Привет, игрок! Здесь вы можете общаться с другими игроками, задавать вопросы и предлагать идеи для сервера.\n\n**Как начать:**\n1. Скачайте сборку модов по кнопке «Моды для сервера».\n2. Распакуйте `.jar` файлы в папку `mods`.\n3. Заходите на сервер по IP из шапки сайта.\n\nПриятной игры!', category_id: 'c-news', author_id: 'u-owner', pinned: true, locked: false, likes: ['u-player', 'u-mod'], views: 128, created_at: ago(30), updated_at: ago(1, 2) },
      { id: 't-mods-guide', title: 'Гайд: как установить сборку модов (1.21.4 Fabric)', body: 'Подробная инструкция по установке:\n\n- Установите **Minecraft 1.21.4** с загрузчиком **Fabric**.\n- Скачайте архив `server-mods.zip` со страницы «Моды для сервера».\n- Распакуйте все `.jar` в папку `%appdata%/.minecraft/mods`.\n- Запустите игру и подключитесь к серверу.\n\nЕсли игра ругается на несовпадение модов — проверьте, что удалили старые версии модов от других версий Minecraft.', category_id: 'c-mods', author_id: 'u-mod', pinned: true, locked: false, likes: ['u-player'], views: 64, created_at: ago(20), updated_at: ago(2) },
      { id: 't-build', title: 'Моя индустриальная база на Energized Power', body: 'Закончил первую очередь базы: солнечная ферма, автоматическая плавильня и склад на Tom\'s Simple Storage.\n\nСкоро покажу скриншоты! Кто тоже играет с индустриальными модами?', category_id: 'c-builds', author_id: 'u-player', pinned: false, locked: false, likes: [], views: 12, created_at: ago(1, 5), updated_at: ago(1, 5) },
      { id: 't-suggest', title: 'Предложение: добавить Waystones для телепортов', body: 'Предлагаю добавить мод **Waystones** — телепортация между базами сильно упростит игру на большом сервере.\n\nЧто думаете?', category_id: 'c-suggest', author_id: 'u-player', pinned: false, locked: false, likes: ['u-mod'], views: 9, created_at: ago(0, 8), updated_at: ago(0, 8) }
    ];
    var replies = [
      { id: 'r1', thread_id: 't-welcome', author_id: 'u-player', body: 'Спасибо за тёплый приём! Сервер отличный, зашёл с друзьями.', likes: [], created_at: ago(29), updated_at: ago(29) },
      { id: 'r2', thread_id: 't-welcome', author_id: 'u-owner', body: 'Добро пожаловать! Если появятся вопросы — пишите в раздел «Моды и техподдержка».', likes: ['u-player'], created_at: ago(28), updated_at: ago(28) },
      { id: 'r3', thread_id: 't-mods-guide', author_id: 'u-player', body: 'У меня была ошибка при входе, помогло удаление старых модов. Спасибо за гайд!', likes: [], created_at: ago(15), updated_at: ago(15) },
      { id: 'r4', thread_id: 't-suggest', author_id: 'u-mod', body: 'Хорошая идея, передал администрации. Следите за новостями сервера.', likes: [], created_at: ago(0, 6), updated_at: ago(0, 6) }
    ];
    var mods = [
      { id: 'm1', name: 'Energized Power', description: 'Энергетика и генераторы для индустриальной базы', sort_order: 1 },
      { id: 'm2', name: 'PolyFactory', description: 'Автоматизация и конвейеры', sort_order: 2 },
      { id: 'm3', name: 'Tech Reborn', description: 'Машины, руды и крафты', sort_order: 3 },
      { id: 'm4', name: "Pufferfish's Skills", description: 'Прокачка навыков персонажа', sort_order: 4 },
      { id: 'm5', name: 'RPGStats', description: 'Характеристики и развитие героя', sort_order: 5 },
      { id: 'm6', name: 'Waystones', description: 'Телепорты между точками мира', sort_order: 6 },
      { id: 'm7', name: 'VeinMiner', description: 'Добыча жилы одним ударом', sort_order: 7 },
      { id: 'm8', name: "Traveler's Backpack", description: 'Рюкзаки и удобное хранение', sort_order: 8 }
    ];
    var rules = [
      { id: 'q1', title: 'Запрещены читы, X-Ray и сторонние модификации, дающие преимущество', body: 'Использование любых читов, макросов и модов, нарушающих честную игру (X-Ray, KillAura, Fly и т.п.), карается баном без предупреждения. Разрешены только моды из официальной сборки сервера и чисто визуальные/оптимизирующие клиенты (Sodium, Iris и т.п.), не дающие игрового преимущества.', sort_order: 1 },
      { id: 'q2', title: 'Запрещены гриферство и воровство', body: 'Разрушение чужих построек, кража из сундуков и порча территории других игроков запрещены. Приват территории обязателен для ценных построек. Нарушение — бан и откат действий.', sort_order: 2 },
      { id: 'q3', title: 'Запрещён флуд, оскорбления и реклама на форуме', body: 'На форуме запрещено: спам, флуд, оскорбления других игроков, реклама сторонних проектов и читов. За нарушение — предупреждение и бан на форуме.', sort_order: 3 },
      { id: 'q4', title: 'Как получить помощь на сервере?', body: 'Создайте тему в разделе «Моды и техподдержка» на форуме, подробно описав проблему: что вы делали, какую ошибку видите. Администрация отвечает в течение суток. Для срочных вопросов используйте Discord сервера.', sort_order: 4 },
      { id: 'q5', title: 'Что делать, если сборка модов не запускается?', body: 'Проверьте: версия Minecraft 1.21.4, загрузчик Fabric, все .jar файлы лежат в папке mods, старые моды удалены. Если не помогло — создайте тему на форуме с текстом ошибки из лога (папка logs/latest.log).', sort_order: 5 }
    ];
    return {
      settings: defaultSettings(), users: [owner, mod, player], categories: cats,
      threads: threads, replies: replies, mods: mods, rules: rules,
      seed_passwords: {}
    };
  }

  function LocalDriver() { this.db = null; }
  LocalDriver.prototype.load = function () {
    try { var raw = localStorage.getItem(LS_DB); if (raw) { this.db = JSON.parse(raw); return; } } catch (e) {}
    this.db = seedLocal();
    this.persist();
  };
  LocalDriver.prototype.persist = function () { try { localStorage.setItem(LS_DB, JSON.stringify(this.db)); } catch (e) {} };
  LocalDriver.prototype.init = function () {
    var self = this; this.load();
    return sha256(CFG.DEMO_OWNER_PASSWORD).then(function (h) {
      var owner = self.db.users.filter(function (u) { return u.id === 'u-owner'; })[0];
      if (owner && !owner.pass_hash) { owner.pass_hash = h; self.persist(); }
      return self.restoreSession();
    });
  };
  LocalDriver.prototype.restoreSession = function () {
    var id = null; try { id = localStorage.getItem(LS_SESSION); } catch (e) {}
    if (!id) return Promise.resolve(null);
    var u = this.db.users.filter(function (x) { return x.id === id; })[0] || null;
    return Promise.resolve(u ? this.publicUser(u) : null);
  };
  LocalDriver.prototype.publicUser = function (u) {
    return { id: u.id, username: u.username, mcnick: u.mcnick, email: u.email, avatar_color: u.avatar_color, role: u.role, banned: !!u.banned, banned_reason: u.banned_reason || '', created_at: u.created_at };
  };
  LocalDriver.prototype.getSettings = function () { return Promise.resolve(JSON.parse(JSON.stringify(this.db.settings))); };
  LocalDriver.prototype.saveSettings = function (s) { this.db.settings = s; this.persist(); return Promise.resolve(s); };
  LocalDriver.prototype.listCategories = function () { return Promise.resolve(this.db.categories.slice().sort(function (a, b) { return a.sort_order - b.sort_order; })); };
  LocalDriver.prototype.createCategory = function (c) { c.id = uid(); c.created_at = nowISO(); this.db.categories.push(c); this.persist(); return Promise.resolve(c); };
  LocalDriver.prototype.updateCategory = function (c) { var i = this.db.categories.findIndex(function (x) { return x.id === c.id; }); if (i >= 0) this.db.categories[i] = c; this.persist(); return Promise.resolve(c); };
  LocalDriver.prototype.deleteCategory = function (id) { this.db.categories = this.db.categories.filter(function (x) { return x.id !== id; }); this.persist(); return Promise.resolve(true); };
  LocalDriver.prototype.listThreads = function () { return Promise.resolve(this.db.threads.slice()); };
  LocalDriver.prototype.createThread = function (t) { t.id = uid(); t.created_at = nowISO(); t.updated_at = t.created_at; t.likes = []; t.views = 0; t.pinned = false; t.locked = false; this.db.threads.push(t); this.persist(); return Promise.resolve(t); };
  LocalDriver.prototype.updateThread = function (t) { var i = this.db.threads.findIndex(function (x) { return x.id === t.id; }); if (i >= 0) this.db.threads[i] = t; this.persist(); return Promise.resolve(t); };
  LocalDriver.prototype.deleteThread = function (id) { this.db.threads = this.db.threads.filter(function (x) { return x.id !== id; }); this.db.replies = this.db.replies.filter(function (r) { return r.thread_id !== id; }); this.persist(); return Promise.resolve(true); };
  LocalDriver.prototype.listReplies = function () { return Promise.resolve(this.db.replies.slice().sort(function (a, b) { return new Date(a.created_at) - new Date(b.created_at); })); };
  LocalDriver.prototype.createReply = function (r) { r.id = uid(); r.created_at = nowISO(); r.updated_at = r.created_at; r.likes = []; this.db.replies.push(r); this.touchThread(r.thread_id); this.persist(); return Promise.resolve(r); };
  LocalDriver.prototype.updateReply = function (r) { var i = this.db.replies.findIndex(function (x) { return x.id === r.id; }); if (i >= 0) { this.db.replies[i] = r; this.touchThread(r.thread_id); } this.persist(); return Promise.resolve(r); };
  LocalDriver.prototype.deleteReply = function (id) { var r = this.db.replies.filter(function (x) { return x.id === id; })[0]; this.db.replies = this.db.replies.filter(function (x) { return x.id !== id; }); if (r) this.touchThread(r.thread_id); this.persist(); return Promise.resolve(true); };
  LocalDriver.prototype.touchThread = function (tid) { var t = this.db.threads.filter(function (x) { return x.id === tid; })[0]; if (t) t.updated_at = nowISO(); };
  LocalDriver.prototype.listUsers = function () { var self = this; return Promise.resolve(this.db.users.map(function (u) { return self.publicUser(u); })); };
  LocalDriver.prototype.updateUser = function (u) {
    var i = this.db.users.findIndex(function (x) { return x.id === u.id; });
    if (i >= 0) { var old = this.db.users[i]; this.db.users[i] = Object.assign({}, old, u); delete this.db.users[i].pass_hash; this.db.users[i].pass_hash = old.pass_hash; }
    this.persist(); return Promise.resolve(this.publicUser(this.db.users[i]));
  };
  LocalDriver.prototype.listMods = function () { return Promise.resolve(this.db.mods.slice().sort(function (a, b) { return a.sort_order - b.sort_order; })); };
  LocalDriver.prototype.createMod = function (m) { m.id = uid(); this.db.mods.push(m); this.persist(); return Promise.resolve(m); };
  LocalDriver.prototype.deleteMod = function (id) { this.db.mods = this.db.mods.filter(function (x) { return x.id !== id; }); this.persist(); return Promise.resolve(true); };
  LocalDriver.prototype.listRules = function () { return Promise.resolve(this.db.rules.slice().sort(function (a, b) { return a.sort_order - b.sort_order; })); };
  LocalDriver.prototype.createRule = function (r) { r.id = uid(); this.db.rules.push(r); this.persist(); return Promise.resolve(r); };
  LocalDriver.prototype.updateRule = function (r) { var i = this.db.rules.findIndex(function (x) { return x.id === r.id; }); if (i >= 0) this.db.rules[i] = r; this.persist(); return Promise.resolve(r); };
  LocalDriver.prototype.deleteRule = function (id) { this.db.rules = this.db.rules.filter(function (x) { return x.id !== id; }); this.persist(); return Promise.resolve(true); };
  LocalDriver.prototype.register = function (data) {
    var self = this;
    var uname = String(data.username || '').trim();
    var email = String(data.email || '').trim().toLowerCase();
    if (this.db.users.some(function (u) { return u.username.toLowerCase() === uname.toLowerCase(); })) return Promise.reject(new Error('Такой логин уже занят'));
    if (this.db.users.some(function (u) { return String(u.email).toLowerCase() === email; })) return Promise.reject(new Error('Аккаунт с таким email уже существует'));
    return sha256(data.password).then(function (h) {
      var isFirst = self.db.users.length === 0;
      var u = { id: uid(), username: uname, mcnick: data.mcnick || uname, email: email, pass_hash: h, avatar_color: data.avatar_color || AVATAR_COLORS[0], role: isFirst ? 'owner' : 'player', banned: false, banned_reason: '', created_at: nowISO() };
      self.db.users.push(u); self.persist();
      try { localStorage.setItem(LS_SESSION, u.id); } catch (e) {}
      return self.publicUser(u);
    });
  };
  LocalDriver.prototype.login = function (identity, password) {
    var self = this; var idn = String(identity || '').trim().toLowerCase();
    var u = this.db.users.filter(function (x) { return x.username.toLowerCase() === idn || String(x.email).toLowerCase() === idn; })[0];
    if (!u) return Promise.reject(new Error('Пользователь не найден. Проверьте логин или email.'));
    return sha256(password).then(function (h) {
      if (u.pass_hash !== h) throw new Error('Неверный пароль');
      if (u.banned) throw new Error('Аккаунт заблокирован' + (u.banned_reason ? ': ' + u.banned_reason : ''));
      try { localStorage.setItem(LS_SESSION, u.id); } catch (e) {}
      return self.publicUser(u);
    });
  };
  LocalDriver.prototype.logout = function () { try { localStorage.removeItem(LS_SESSION); } catch (e) {} return Promise.resolve(true); };
  LocalDriver.prototype.changePassword = function (userId, oldPass, newPass) {
    var self = this; var u = this.db.users.filter(function (x) { return x.id === userId; })[0];
    if (!u) return Promise.reject(new Error('Пользователь не найден'));
    return sha256(oldPass).then(function (h) {
      if (u.pass_hash !== h) throw new Error('Старый пароль неверен');
      return sha256(newPass).then(function (nh) { u.pass_hash = nh; self.persist(); return true; });
    });
  };
  LocalDriver.prototype.purgeUserPosts = function (userId) {
    var tids = this.db.threads.filter(function (t) { return t.author_id === userId; }).map(function (t) { return t.id; });
    this.db.threads = this.db.threads.filter(function (t) { return t.author_id !== userId; });
    this.db.replies = this.db.replies.filter(function (r) { return r.author_id !== userId && tids.indexOf(r.thread_id) === -1; });
    this.persist(); return Promise.resolve(true);
  };
  LocalDriver.prototype.exportData = function () { return Promise.resolve(JSON.stringify(this.db, null, 2)); };
  LocalDriver.prototype.resetData = function () { this.db = seedLocal(); this.persist(); try { localStorage.removeItem(LS_SESSION); } catch (e) {} return Promise.resolve(true); };

  /* --------------------------------------------------------------------------
     SUPABASE ДРАЙВЕР (онлайн-режим для GitHub Pages)
     Таблицы: site_settings, profiles, categories, threads, replies,
              mods_items, rules_items  (см. supabase_setup.sql)
     -------------------------------------------------------------------------- */
  var SB_SESSION = 'bc_sb_session_v1';
  function SupabaseDriver() {
    this.base = String(CFG.SUPABASE_URL).replace(/\/$/, '');
    this.anon = CFG.SUPABASE_ANON_KEY;
    this.session = null;
    try { var raw = localStorage.getItem(SB_SESSION); if (raw) this.session = JSON.parse(raw); } catch (e) {}
  }
  SupabaseDriver.prototype.headers = function (extra) {
    var h = { 'apikey': this.anon, 'Content-Type': 'application/json' };
    h['Authorization'] = 'Bearer ' + ((this.session && this.session.access_token) || this.anon);
    if (extra) for (var k in extra) h[k] = extra[k];
    return h;
  };
  SupabaseDriver.prototype.req = function (path, opts) {
    var self = this; opts = opts || {};
    return fetch(this.base + path, { method: opts.method || 'GET', headers: this.headers(opts.headers), body: opts.body ? JSON.stringify(opts.body) : undefined })
      .then(function (res) {
        return res.text().then(function (txt) {
          var data = null; try { data = txt ? JSON.parse(txt) : null; } catch (e) { data = txt; }
          if (!res.ok) {
            var msg = (data && (data.message || data.error_description || data.msg)) || ('Ошибка Supabase: ' + res.status);
            throw new Error(String(msg));
          }
          return data;
        });
      })
      .then(function (d) { return d; }, function (err) { throw err; });
  };
  SupabaseDriver.prototype.saveSession = function (s) {
    this.session = s;
    try { if (s) localStorage.setItem(SB_SESSION, JSON.stringify(s)); else localStorage.removeItem(SB_SESSION); } catch (e) {}
  };
  SupabaseDriver.prototype.init = function () { return this.restoreSession(); };
  SupabaseDriver.prototype.restoreSession = function () {
    var self = this;
    if (!this.session || !this.session.refresh_token) return Promise.resolve(null);
    return this.req('/auth/v1/user').then(function (u) {
      if (!u || !u.id) throw new Error('no user');
      return self.getProfile(u.id);
    }).catch(function () {
      return self.req('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: { refresh_token: self.session.refresh_token } })
        .then(function (s) { self.saveSession(s); return self.getProfile(s.user.id); })
        .catch(function () { self.saveSession(null); return null; });
    });
  };
  SupabaseDriver.prototype.getProfile = function (id) {
    return this.req('/rest/v1/profiles?select=*&id=eq.' + encodeURIComponent(id)).then(function (rows) {
      return (rows && rows[0]) || null;
    });
  };
  SupabaseDriver.prototype.getSettings = function () {
    return this.req('/rest/v1/site_settings?select=*&id=eq.1').then(function (rows) {
      return (rows && rows[0]) || defaultSettings();
    });
  };
  SupabaseDriver.prototype.saveSettings = function (s) {
    return this.req('/rest/v1/site_settings', { method: 'POST', headers: { 'Prefer': 'resolution=merge-duplicates,return=representation' }, body: s })
      .then(function (rows) { return (rows && rows[0]) || s; });
  };
  SupabaseDriver.prototype.listCategories = function () { return this.req('/rest/v1/categories?select=*&order=sort_order.asc,created_at.asc'); };
  SupabaseDriver.prototype.createCategory = function (c) { return this.req('/rest/v1/categories', { method: 'POST', headers: { 'Prefer': 'return=representation' }, body: c }).then(function (r) { return r[0]; }); };
  SupabaseDriver.prototype.updateCategory = function (c) { return this.req('/rest/v1/categories?id=eq.' + encodeURIComponent(c.id), { method: 'PATCH', headers: { 'Prefer': 'return=representation' }, body: c }).then(function (r) { return r[0] || c; }); };
  SupabaseDriver.prototype.deleteCategory = function (id) { return this.req('/rest/v1/categories?id=eq.' + encodeURIComponent(id), { method: 'DELETE' }).then(function () { return true; }); };
  SupabaseDriver.prototype.listThreads = function () { return this.req('/rest/v1/threads?select=*&order=updated_at.desc'); };
  SupabaseDriver.prototype.createThread = function (t) { return this.req('/rest/v1/threads', { method: 'POST', headers: { 'Prefer': 'return=representation' }, body: t }).then(function (r) { return r[0]; }); };
  SupabaseDriver.prototype.updateThread = function (t) { return this.req('/rest/v1/threads?id=eq.' + encodeURIComponent(t.id), { method: 'PATCH', headers: { 'Prefer': 'return=representation' }, body: t }).then(function (r) { return r[0] || t; }); };
  SupabaseDriver.prototype.deleteThread = function (id) { return this.req('/rest/v1/threads?id=eq.' + encodeURIComponent(id), { method: 'DELETE' }).then(function () { return true; }); };
  SupabaseDriver.prototype.listReplies = function () { return this.req('/rest/v1/replies?select=*&order=created_at.asc'); };
  SupabaseDriver.prototype.createReply = function (r) { return this.req('/rest/v1/replies', { method: 'POST', headers: { 'Prefer': 'return=representation' }, body: r }).then(function (x) { return x[0]; }); };
  SupabaseDriver.prototype.updateReply = function (r) { return this.req('/rest/v1/replies?id=eq.' + encodeURIComponent(r.id), { method: 'PATCH', headers: { 'Prefer': 'return=representation' }, body: r }).then(function (x) { return x[0] || r; }); };
  SupabaseDriver.prototype.deleteReply = function (id) { return this.req('/rest/v1/replies?id=eq.' + encodeURIComponent(id), { method: 'DELETE' }).then(function () { return true; }); };
  SupabaseDriver.prototype.listUsers = function () { return this.req('/rest/v1/profiles?select=*&order=created_at.asc'); };
  SupabaseDriver.prototype.updateUser = function (u) { return this.req('/rest/v1/profiles?id=eq.' + encodeURIComponent(u.id), { method: 'PATCH', headers: { 'Prefer': 'return=representation' }, body: u }).then(function (r) { return r[0] || u; }); };
  SupabaseDriver.prototype.listMods = function () { return this.req('/rest/v1/mods_items?select=*&order=sort_order.asc'); };
  SupabaseDriver.prototype.createMod = function (m) { return this.req('/rest/v1/mods_items', { method: 'POST', headers: { 'Prefer': 'return=representation' }, body: m }).then(function (r) { return r[0]; }); };
  SupabaseDriver.prototype.deleteMod = function (id) { return this.req('/rest/v1/mods_items?id=eq.' + encodeURIComponent(id), { method: 'DELETE' }).then(function () { return true; }); };
  SupabaseDriver.prototype.listRules = function () { return this.req('/rest/v1/rules_items?select=*&order=sort_order.asc'); };
  SupabaseDriver.prototype.createRule = function (r) { return this.req('/rest/v1/rules_items', { method: 'POST', headers: { 'Prefer': 'return=representation' }, body: r }).then(function (x) { return x[0]; }); };
  SupabaseDriver.prototype.updateRule = function (r) { return this.req('/rest/v1/rules_items?id=eq.' + encodeURIComponent(r.id), { method: 'PATCH', headers: { 'Prefer': 'return=representation' }, body: r }).then(function (x) { return x[0] || r; }); };
  SupabaseDriver.prototype.deleteRule = function (id) { return this.req('/rest/v1/rules_items?id=eq.' + encodeURIComponent(id), { method: 'DELETE' }).then(function () { return true; }); };
  SupabaseDriver.prototype.register = function (data) {
    var self = this;
    var email = String(data.email || '').trim().toLowerCase();
    return this.req('/auth/v1/signup', { method: 'POST', body: { email: email, password: data.password } }).then(function (res) {
      var user = res.user || res;
      if (!user || !user.id) throw new Error('Регистрация не завершена. Проверьте почту для подтверждения.');
      var profile = { id: user.id, username: String(data.username).trim(), mcnick: data.mcnick || data.username, email: email, avatar_color: data.avatar_color || AVATAR_COLORS[0], role: 'player', banned: false, banned_reason: '' };
      return self.req('/rest/v1/profiles', { method: 'POST', headers: { 'Prefer': 'return=representation' }, body: profile }).then(function (rows) {
        var p = rows[0] || profile;
        if (res.session) self.saveSession(res.session);
        return p;
      });
    });
  };
  SupabaseDriver.prototype.login = function (identity, password) {
    var self = this; var idn = String(identity || '').trim();
    var emailPromise;
    if (idn.indexOf('@') !== -1) emailPromise = Promise.resolve(idn.toLowerCase());
    else emailPromise = this.req('/rest/v1/profiles?select=email&username=eq.' + encodeURIComponent(idn)).then(function (rows) {
      if (!rows || !rows[0]) throw new Error('Пользователь не найден. Проверьте логин или email.');
      return rows[0].email;
    });
    return emailPromise.then(function (email) {
      return self.req('/auth/v1/token?grant_type=password', { method: 'POST', body: { email: email, password: password } }).then(function (s) {
        self.saveSession(s);
        return self.getProfile(s.user.id).then(function (p) {
          if (!p) throw new Error('Профиль не найден. Обратитесь к администрации.');
          if (p.banned) { self.saveSession(null); throw new Error('Аккаунт заблокирован' + (p.banned_reason ? ': ' + p.banned_reason : '')); }
          return p;
        });
      });
    });
  };
  SupabaseDriver.prototype.logout = function () {
    var self = this;
    return this.req('/auth/v1/logout', { method: 'POST' }).catch(function () {}).then(function () { self.saveSession(null); return true; });
  };
  SupabaseDriver.prototype.changePassword = function (userId, oldPass, newPass) {
    var self = this;
    return this.getProfile(userId).then(function (p) {
      if (!p) throw new Error('Профиль не найден');
      return self.req('/auth/v1/token?grant_type=password', { method: 'POST', body: { email: p.email, password: oldPass } }).then(function () {
        return self.req('/auth/v1/user', { method: 'PUT', body: { password: newPass } }).then(function () { return true; });
      }).catch(function () { throw new Error('Старый пароль неверен'); });
    });
  };
  SupabaseDriver.prototype.purgeUserPosts = function (userId) {
    return this.req('/rest/v1/replies?author_id=eq.' + encodeURIComponent(userId), { method: 'DELETE' })
      .then(function () { return this.req('/rest/v1/threads?author_id=eq.' + encodeURIComponent(userId), { method: 'DELETE' }); })
      .then(function () { return true; });
  };
  SupabaseDriver.prototype.exportData = function () {
    var self = this;
    return Promise.all([this.getSettings(), this.listUsers(), this.listCategories(), this.listThreads(), this.listReplies(), this.listMods(), this.listRules()])
      .then(function (a) { return JSON.stringify({ settings: a[0], users: a[1], categories: a[2], threads: a[3], replies: a[4], mods: a[5], rules: a[6] }, null, 2); });
  };
  SupabaseDriver.prototype.resetData = function () { return Promise.reject(new Error('Сброс данных доступен только в локальном демо-режиме')); };

  var db = USE_SB ? new SupabaseDriver() : new LocalDriver();

  /* --------------------------------------------------------------------------
     СОСТОЯНИЕ САЙТА
     -------------------------------------------------------------------------- */
  var S = {
    user: null, settings: null, categories: [], threads: [], replies: [],
    users: [], mods: [], rules: [],
    forum: { cat: 'all', q: '', sort: 'active', page: 1, perPage: 10 },
    threadId: null, adminTab: 'general', avatarColor: AVATAR_COLORS[0], userQuery: ''
  };

  function userById(id) { return S.users.filter(function (u) { return u.id === id; })[0] || { id: id, username: 'Удалённый игрок', mcnick: '', avatar_color: '#555555', role: 'player' }; }
  function catById(id) { return S.categories.filter(function (c) { return c.id === id; })[0] || null; }
  function threadById(id) { return S.threads.filter(function (t) { return t.id === id; })[0] || null; }
  function repliesOf(tid) { return S.replies.filter(function (r) { return r.thread_id === tid; }); }
  function visibleCategories() {
    return S.categories.filter(function (c) { return !c.admin_only || isStaff(S.user); });
  }
  function canViewCategory(c) { return !c || !c.admin_only || isStaff(S.user); }

  function loadAll() {
    return Promise.all([db.getSettings(), db.listCategories(), db.listThreads(), db.listReplies(), db.listUsers(), db.listMods(), db.listRules()])
      .then(function (a) {
        S.settings = a[0]; S.categories = a[1]; S.threads = a[2]; S.replies = a[3];
        S.users = a[4]; S.mods = a[5]; S.rules = a[6];
        if (S.user) {
          var fresh = S.users.filter(function (u) { return u.id === S.user.id; })[0];
          if (fresh) {
            if (fresh.banned) { S.user = null; db.logout(); toast('Ваш аккаунт был заблокирован администрацией', 'error'); }
            else S.user = fresh;
          }
        }
        renderAll();
      });
  }

  /* --------------------------------------------------------------------------
     РЕНДЕР: шапка, подвал, объявления, главная
     -------------------------------------------------------------------------- */
  function renderNavAuth() {
    var box = $('#nav-auth-area'); var drawer = $('#drawer-auth-links');
    if (!box) return;
    if (!S.user) {
      box.innerHTML = '<button type="button" class="mc-btn sm" data-open-auth="login">Войти</button>' +
        '<button type="button" class="mc-btn stone sm" data-open-auth="register">Регистрация</button>';
      if (drawer) drawer.innerHTML = '<a href="#" data-open-auth="login" data-close-drawer>Войти</a><a href="#" data-open-auth="register" data-close-drawer>Регистрация</a>';
    } else {
      box.innerHTML = '<button type="button" class="user-pill" data-open-profile="1" title="Мой профиль">' + avatarSVG(S.user, 26) +
        '<span class="user-pill-name">' + esc(S.user.username) + '</span>' + roleBadge(S.user.role) + '</button>' +
        (isStaff(S.user) ? '<a href="#admin" class="mc-btn gold sm">Админка</a>' : '') +
        '<button type="button" class="mc-btn stone sm" data-logout="1">Выйти</button>';
      if (drawer) drawer.innerHTML = '<a href="#" data-open-profile="1" data-close-drawer>Мой профиль (' + esc(S.user.username) + ')</a>' +
        (isStaff(S.user) ? '<a href="#admin" data-close-drawer>Админ-панель</a>' : '') +
        '<a href="#" data-logout="1" data-close-drawer>Выйти</a>';
    }
  }

  function renderSettings() {
    var st = S.settings || defaultSettings();
    document.title = (st.server_name || CFG.SERVER_NAME) + ' — Сервер и Форум Minecraft ' + (st.minecraft_version || CFG.MINECRAFT_VERSION);
    var setText = function (id, v) { var el = $(id); if (el) el.textContent = v; };
    setText('#nav-server-name', st.server_name);
    setText('#hero-title', st.server_name);
    setText('#hero-tagline', st.server_tagline);
    setText('#hero-notice', st.server_notice);
    setText('#hero-ip', st.server_ip);
    setText('#hero-version-tag', 'Minecraft ' + st.minecraft_version + ' • ' + st.mod_loader);
    setText('#mods-banner-sub', 'Официальная сборка модов Minecraft ' + st.minecraft_version + ' ' + st.mod_loader + ' одним архивом');
    setText('#mods-description', st.mods_description);
    setText('#mods-faq-ip', st.server_ip);
    setText('#stat-modver', st.mods_version);
    setText('#stat-threads', String(S.threads.length));
    setText('#stat-replies', String(S.replies.length));
    setText('#stat-users', String(S.users.length));
    var bar = $('#announcement-bar');
    if (bar) {
      if (st.announcement_enabled && st.announcement_text) { bar.classList.remove('hidden'); setText('#announcement-text', st.announcement_text); }
      else bar.classList.add('hidden');
    }
    var dl = st.mods_download_url || 'mods/server-mods.zip';
    var fn = st.mods_filename || 'server-mods.zip';
    ['#mods-download-btn', '#home-quick-download'].forEach(function (sel) {
      var a = $(sel); if (a) { a.setAttribute('href', dl); a.setAttribute('download', fn); }
    });
    setText('#mods-file-note', 'Файл: ' + dl);
    var chips = $('#mods-meta-chips');
    if (chips) {
      chips.innerHTML =
        '<span class="meta-chip">' + esc(st.mods_version) + '</span>' +
        '<span class="meta-chip">' + esc(st.mods_size) + '</span>' +
        '<span class="meta-chip">Обновлено: ' + esc(st.mods_updated) + '</span>' +
        '<span class="meta-chip">Minecraft ' + esc(st.minecraft_version) + '</span>' +
        '<span class="meta-chip">' + esc(st.mod_loader) + '</span>';
    }
    var shortcut = $('#mods-admin-shortcut');
    if (shortcut) {
      shortcut.innerHTML = isStaff(S.user)
        ? '<a href="#admin" class="flat-btn gold-text">⚙ Управление сборкой в Админ-панели →</a>' : '';
    }
    var links = $('#footer-links');
    if (links) {
      var items = [['#home', 'Главная'], ['#forum', 'Форум'], ['#mods', 'Моды для сервера'], ['#rules', 'Правила и FAQ']];
      if (st.discord_url) items.push([st.discord_url, 'Discord']);
      if (st.telegram_url) items.push([st.telegram_url, 'Telegram']);
      if (st.github_url) items.push([st.github_url, 'GitHub']);
      if (st.donate_url) items.push([st.donate_url, 'Поддержать']);
      links.innerHTML = items.map(function (it) {
        var ext = it[0].indexOf('http') === 0;
        return '<li><a href="' + esc(it[0]) + '"' + (ext ? ' target="_blank" rel="noopener noreferrer"' : '') + '>' + esc(it[1]) + '</a></li>';
      }).join('');
    }
    setText('#footer-copy', '© ' + new Date().getFullYear() + ' ' + st.server_name + '. Все права защищены.');
  }

  function threadRowHTML(t) {
    var author = userById(t.author_id);
    var cat = catById(t.category_id);
    var reps = repliesOf(t.id).length;
    var excerpt = String(t.body || '').replace(/\s+/g, ' ').slice(0, 140);
    var badges = '';
    if (t.pinned) badges += '<span class="badge badge-pin">📌 Закреплено</span>';
    if (t.locked) badges += '<span class="badge badge-lock">🔒 Закрыто</span>';
    if (cat) badges += '<span class="badge badge-cat">' + esc(cat.name) + '</span>';
    return '<article class="thread-row" data-thread-id="' + esc(t.id) + '" tabindex="0" role="link" aria-label="' + esc(t.title) + '">' +
      '<div class="thread-main">' +
        '<div class="thread-title-line">' + badges + '<span class="thread-title">' + esc(t.title) + '</span></div>' +
        '<p class="thread-excerpt">' + esc(excerpt) + (String(t.body || '').length > 140 ? '…' : '') + '</p>' +
        '<div class="thread-meta">' + avatarSVG(author, 20) + '<span>' + esc(author.username) + '</span><span>•</span><span>' + timeAgo(t.updated_at || t.created_at) + '</span></div>' +
      '</div>' +
      '<div class="thread-stats">' +
        '<div class="thread-stat-box"><strong>' + reps + '</strong><span>ответов</span></div>' +
        '<div class="thread-stat-box"><strong>' + (t.likes || []).length + '</strong><span>лайков</span></div>' +
        '<div class="thread-stat-box"><strong>' + (t.views || 0) + '</strong><span>просмотров</span></div>' +
      '</div></article>';
  }

  function renderHomeRecent() {
    var box = $('#home-recent-threads'); if (!box) return;
    var list = S.threads.filter(function (t) { return canViewCategory(catById(t.category_id)); })
      .slice().sort(function (a, b) { return new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at); }).slice(0, 5);
    box.innerHTML = list.length ? list.map(threadRowHTML).join('')
      : '<div class="empty-state">Пока нет тем. Станьте первым — создайте тему на форуме!</div>';
  }

  /* --------------------------------------------------------------------------
     РЕНДЕР: форум (список тем)
     -------------------------------------------------------------------------- */
  function filteredThreads() {
    var f = S.forum;
    var list = S.threads.filter(function (t) {
      var cat = catById(t.category_id);
      if (!canViewCategory(cat)) return false;
      if (f.cat !== 'all' && t.category_id !== f.cat) return false;
      if (f.q) {
        var q = f.q.toLowerCase();
        var author = userById(t.author_id);
        if ((t.title + ' ' + t.body + ' ' + author.username).toLowerCase().indexOf(q) === -1) return false;
      }
      return true;
    });
    if (f.sort === 'newest') list.sort(function (a, b) { return new Date(b.created_at) - new Date(a.created_at); });
    else if (f.sort === 'popular') list.sort(function (a, b) { return (b.likes || []).length - (a.likes || []).length; });
    else if (f.sort === 'replies') list.sort(function (a, b) { return repliesOf(b.id).length - repliesOf(a.id).length; });
    else list.sort(function (a, b) {
      if (!!b.pinned !== !!a.pinned) return b.pinned ? 1 : -1;
      return new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at);
    });
    return list;
  }

  function renderCategories() {
    var box = $('#forum-categories'); if (!box) return;
    var cats = visibleCategories();
    var html = '<button type="button" class="cat-pill' + (S.forum.cat === 'all' ? ' active' : '') + '" data-cat="all">Все разделы <span class="cat-count">' + S.threads.filter(function (t) { return canViewCategory(catById(t.category_id)); }).length + '</span></button>';
    html += cats.map(function (c) {
      var n = S.threads.filter(function (t) { return t.category_id === c.id; }).length;
      return '<button type="button" class="cat-pill' + (S.forum.cat === c.id ? ' active' : '') + '" data-cat="' + esc(c.id) + '">' + esc(c.name) + ' <span class="cat-count">' + n + '</span></button>';
    }).join('');
    box.innerHTML = html;
  }

  function renderThreadList() {
    var box = $('#forum-thread-list'); if (!box) return;
    var list = filteredThreads();
    var totalPages = Math.max(1, Math.ceil(list.length / S.forum.perPage));
    if (S.forum.page > totalPages) S.forum.page = totalPages;
    var start = (S.forum.page - 1) * S.forum.perPage;
    var pageItems = list.slice(start, start + S.forum.perPage);
    box.innerHTML = pageItems.length ? pageItems.map(threadRowHTML).join('')
      : '<div class="empty-state">' + (S.forum.q ? 'Ничего не найдено по запросу «' + esc(S.forum.q) + '»' : 'Тем пока нет. Создайте первую тему!') + '</div>';
    var pag = $('#forum-pagination');
    if (pag) {
      if (totalPages <= 1) pag.innerHTML = '';
      else {
        var nums = '';
        for (var i = 1; i <= totalPages; i++) nums += '<button type="button" class="page-btn' + (i === S.forum.page ? ' active' : '') + '" data-page="' + i + '">' + i + '</button>';
        pag.innerHTML = '<button type="button" class="page-btn" data-page="prev" ' + (S.forum.page === 1 ? 'disabled' : '') + '>← Назад</button>' + nums +
          '<button type="button" class="page-btn" data-page="next" ' + (S.forum.page === totalPages ? 'disabled' : '') + '>Вперёд →</button>';
      }
    }
    var cnt = $('#forum-search-count');
    if (cnt) { cnt.classList.toggle('hidden', !S.forum.q); cnt.textContent = String(list.length); }
    var clr = $('#forum-search-clear');
    if (clr) clr.classList.toggle('hidden', !S.forum.q);
  }

  /* --------------------------------------------------------------------------
     РЕНДЕР: одна тема + ответы
     -------------------------------------------------------------------------- */
  function postCardHTML(opts) {
    var author = userById(opts.authorId);
    var liked = S.user && (opts.likes || []).indexOf(S.user.id) !== -1;
    var canEdit = canEditPost(S.user, opts.authorId);
    var actions = '';
    if (opts.kind === 'reply') {
      actions += '<button type="button" class="flat-btn" data-quote-reply="' + esc(opts.id) + '">↩ Цитата</button>';
    }
    if (canEdit) {
      actions += '<button type="button" class="flat-btn" data-edit-' + opts.kind + '="' + esc(opts.id) + '">✎ Изменить</button>' +
        '<button type="button" class="flat-btn danger-text" data-delete-' + opts.kind + '="' + esc(opts.id) + '">🗑 Удалить</button>';
    }
    return '<article class="post-card" data-post-id="' + esc(opts.id) + '">' +
      '<div class="post-header">' + avatarSVG(author, 44) +
        '<div class="post-author-info"><div class="post-author-line"><span class="post-author-name">' + esc(author.username) + '</span>' + roleBadge(author.role) +
        (author.mcnick ? '<span class="post-mc-nick">MC: ' + esc(author.mcnick) + '</span>' : '') + '</div>' +
        '<span class="post-date">' + fmtDate(opts.createdAt) + (opts.edited ? ' • изменено' : '') + '</span></div></div>' +
      '<div class="post-body">' + mdLite(opts.body) + '</div>' +
      '<div class="post-footer"><div class="post-actions">' +
        '<button type="button" class="flat-btn like-btn' + (liked ? ' liked' : '') + '" data-like-' + opts.kind + '="' + esc(opts.id) + '">' + (liked ? '❤️' : '🤍') + ' ' + (opts.likes || []).length + '</button>' +
        actions +
      '</div></div></article>';
  }

  function renderThreadDetail() {
    var box = $('#thread-detail-container'); if (!box) return;
    var t = threadById(S.threadId);
    if (!t) { box.innerHTML = '<div class="empty-state">Тема не найдена или была удалена.</div>'; return; }
    var cat = catById(t.category_id);
    if (!canViewCategory(cat)) { box.innerHTML = '<div class="empty-state">У вас нет доступа к этому разделу.</div>'; return; }
    var reps = repliesOf(t.id);
    var badges = '';
    if (t.pinned) badges += '<span class="badge badge-pin">📌 Закреплено</span>';
    if (t.locked) badges += '<span class="badge badge-lock">🔒 Закрыто</span>';
    if (cat) badges += '<span class="badge badge-cat">' + esc(cat.name) + '</span>';
    var modBtns = '';
    if (canModerate(S.user)) {
      modBtns = '<div class="admin-panel-box" style="margin-bottom:1rem;"><strong>Модерация:</strong> ' +
        '<button type="button" class="mc-btn stone sm" data-mod-pin="' + esc(t.id) + '">' + (t.pinned ? 'Снять закреп' : 'Закрепить') + '</button> ' +
        '<button type="button" class="mc-btn stone sm" data-mod-lock="' + esc(t.id) + '">' + (t.locked ? 'Открыть тему' : 'Закрыть тему') + '</button> ' +
        '<button type="button" class="mc-btn danger sm" data-mod-delete-thread="' + esc(t.id) + '">Удалить тему</button></div>';
    }
    var replyBox = '';
    if (!S.user) {
      replyBox = '<div class="reply-box"><p>Чтобы ответить, <a href="#" data-open-auth="login">войдите</a> или <a href="#" data-open-auth="register">зарегистрируйтесь</a>.</p></div>';
    } else if (S.user.banned) {
      replyBox = '<div class="reply-box"><p>Ваш аккаунт заблокирован. Ответы недоступны.</p></div>';
    } else if (t.locked && !isStaff(S.user)) {
      replyBox = '<div class="reply-box"><p>🔒 Тема закрыта для ответов.</p></div>';
    } else {
      replyBox = '<div class="reply-box"><h3>Ваш ответ</h3><div id="reply-error" class="form-error hidden"></div>' +
        '<form id="reply-form"><textarea class="mc-textarea" id="reply-body" rows="4" maxlength="8000" placeholder="Напишите ответ... Поддерживается **жирный**, *курсив*, `код` и > цитата."></textarea>' +
        '<div style="display:flex;justify-content:flex-end;margin-top:0.6rem;"><button type="submit" class="mc-btn sm">Отправить ответ</button></div></form></div>';
    }
    box.innerHTML =
      '<div class="thread-detail-header"><div class="thread-title-line">' + badges + '</div>' +
      '<h1 class="thread-title" style="font-size:1.5rem;">' + esc(t.title) + '</h1>' +
      '<div class="thread-meta" style="margin-top:0.4rem;"><span>👁 ' + (t.views || 0) + ' просмотров</span><span>•</span><span>💬 ' + reps.length + ' ответов</span><span>•</span><span>❤️ ' + (t.likes || []).length + '</span></div></div>' +
      modBtns +
      postCardHTML({ kind: 'thread', id: t.id, authorId: t.author_id, body: t.body, likes: t.likes, createdAt: t.created_at, edited: t.updated_at !== t.created_at }) +
      '<div class="replies-divider">Ответы (' + reps.length + ')</div>' +
      '<div id="replies-list">' + (reps.length ? reps.map(function (r) {
        return postCardHTML({ kind: 'reply', id: r.id, authorId: r.author_id, body: r.body, likes: r.likes, createdAt: r.created_at, edited: r.updated_at !== r.created_at });
      }).join('') : '<div class="empty-state">Ответов пока нет. Станьте первым!</div>') + '</div>' +
      replyBox;
    bindReplyForm();
  }

  function bindReplyForm() {
    var form = $('#reply-form'); if (!form) return;
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var body = $('#reply-body').value.trim();
      var err = $('#reply-error');
      if (body.length < 2) { err.textContent = 'Сообщение слишком короткое'; err.classList.remove('hidden'); return; }
      err.classList.add('hidden');
      db.createReply({ thread_id: S.threadId, author_id: S.user.id, body: body }).then(function () {
        toast('Ответ опубликован'); loadAll();
      }).catch(function (ex) { toast(ex.message || 'Ошибка отправки', 'error'); });
    });
  }

  /* --------------------------------------------------------------------------
     РЕНДЕР: моды и правила
     -------------------------------------------------------------------------- */
  function renderMods() {
    var grid = $('#mods-list-grid'); if (!grid) return;
    grid.innerHTML = S.mods.length ? S.mods.map(function (m) {
      return '<div class="mod-item-card"><div class="mod-item-top"><span class="mod-item-name">' + esc(m.name) + '</span></div>' +
        '<p class="mod-item-desc">' + esc(m.description || '') + '</p></div>';
    }).join('') : '<div class="empty-state">Список модов пока пуст. Администратор добавит моды в Админ-панели.</div>';
  }

  function renderRules() {
    var box = $('#rules-faq-list'); if (!box) return;
    box.innerHTML = S.rules.length ? S.rules.map(function (r, i) {
      return '<details class="faqdetails"' + (i === 0 ? ' open' : '') + '><summary><span class="chevron">▶</span>' + esc(r.title) + '</summary>' +
        '<div class="faqdetails-content">' + mdLite(r.body) + '</div></details>';
    }).join('') : '<div class="empty-state">Правила пока не добавлены.</div>';
  }

  /* --------------------------------------------------------------------------
     РЕНДЕР: Админ-панель
     -------------------------------------------------------------------------- */
  function renderAdmin() {
    var banner = $('#admin-status-banner');
    var content = $('#admin-tab-content');
    if (!content) return;
    if (!isStaff(S.user)) {
      if (banner) banner.innerHTML = '';
      content.innerHTML = '<div class="empty-state">Доступ запрещён. Админ-панель доступна только администрации сайта.</div>';
      return;
    }
    if (banner) {
      banner.innerHTML = USE_SB
        ? '<div class="status-banner online">🟢 Онлайн-режим: данные хранятся в Supabase и общие для всех посетителей сайта.</div>'
        : '<div class="status-banner local">🟡 Локальный демо-режим: данные хранятся только в вашем браузере. Для общего форума подключите Supabase (см. ИНСТРУКЦИЮ.md).</div>';
    }
    $$('#admin-tabs [data-admin-tab]').forEach(function (b) {
      var active = b.getAttribute('data-admin-tab') === S.adminTab;
      b.classList.toggle('stone', !active);
      b.classList.toggle('active', active);
    });
    if (S.adminTab === 'general') renderAdminGeneral(content);
    else if (S.adminTab === 'mods') renderAdminMods(content);
    else if (S.adminTab === 'users') renderAdminUsers(content);
    else if (S.adminTab === 'forum') renderAdminForum(content);
    else if (S.adminTab === 'rules') renderAdminRules(content);
  }

  function field(label, inputHtml) {
    return '<div class="form-group"><label>' + label + '</label>' + inputHtml + '</div>';
  }

  function renderAdminGeneral(box) {
    var st = S.settings;
    box.innerHTML =
      '<div class="admin-panel-box"><h3>Настройки сайта и сервера</h3>' +
      '<form id="admin-settings-form">' +
      '<div class="form-row">' + field('Название сервера', '<input class="mc-input" name="server_name" value="' + esc(st.server_name) + '">') +
      field('IP сервера', '<input class="mc-input" name="server_ip" value="' + esc(st.server_ip) + '">') + '</div>' +
      '<div class="form-row">' + field('Версия Minecraft', '<input class="mc-input" name="minecraft_version" value="' + esc(st.minecraft_version) + '">') +
      field('Загрузчик модов', '<input class="mc-input" name="mod_loader" value="' + esc(st.mod_loader) + '">') + '</div>' +
      field('Слоган под названием', '<input class="mc-input" name="server_tagline" value="' + esc(st.server_tagline) + '">') +
      field('Текст под слоганом', '<input class="mc-input" name="server_notice" value="' + esc(st.server_notice) + '">') +
      field('Текст объявления (полоска сверху сайта)', '<input class="mc-input" name="announcement_text" value="' + esc(st.announcement_text || '') + '" placeholder="Например: Вайп 1 декабря!">') +
      '<label class="checkbox-row"><input type="checkbox" name="announcement_enabled"' + (st.announcement_enabled ? ' checked' : '') + '> Показывать объявление на сайте</label>' +
      '<div class="form-row">' + field('Discord URL', '<input class="mc-input" name="discord_url" value="' + esc(st.discord_url || '') + '">') +
      field('Telegram URL', '<input class="mc-input" name="telegram_url" value="' + esc(st.telegram_url || '') + '">') + '</div>' +
      '<div class="form-row">' + field('GitHub URL', '<input class="mc-input" name="github_url" value="' + esc(st.github_url || '') + '">') +
      field('Ссылка поддержки (Donate)', '<input class="mc-input" name="donate_url" value="' + esc(st.donate_url || '') + '">') + '</div>' +
      '<div style="display:flex;justify-content:flex-end;margin-top:0.8rem;"><button type="submit" class="mc-btn">Сохранить настройки</button></div>' +
      '</form></div>' +
      (USE_SB ? '' :
        '<div class="admin-panel-box"><h3>Локальные данные (демо-режим)</h3>' +
        '<p class="form-hint">Экспорт сохраняет все темы, пользователей и настройки в JSON-файл. Сброс возвращает демо-данные.</p>' +
        '<div style="display:flex;gap:0.6rem;flex-wrap:wrap;">' +
        '<button type="button" class="mc-btn stone sm" id="admin-export-btn">⬇ Экспорт данных</button>' +
        '<button type="button" class="mc-btn danger sm" id="admin-reset-btn">Сбросить демо-данные</button></div></div>');
    $('#admin-settings-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var fd = new FormData(e.target);
      var ns = Object.assign({}, st);
      ['server_name', 'server_ip', 'minecraft_version', 'mod_loader', 'server_tagline', 'server_notice', 'announcement_text', 'discord_url', 'telegram_url', 'github_url', 'donate_url'].forEach(function (k) { ns[k] = String(fd.get(k) || '').trim(); });
      ns.announcement_enabled = !!fd.get('announcement_enabled');
      db.saveSettings(ns).then(function () { toast('Настройки сохранены'); loadAll(); }).catch(function (ex) { toast(ex.message, 'error'); });
    });
    var exp = $('#admin-export-btn');
    if (exp) exp.addEventListener('click', function () {
      db.exportData().then(function (json) {
        var blob = new Blob([json], { type: 'application/json' });
        var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'bedrockcraft-export.json'; a.click();
        setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
      });
    });
    var rst = $('#admin-reset-btn');
    if (rst) rst.addEventListener('click', function () {
      if (!confirm('Сбросить все локальные данные к демо-состоянию?')) return;
      db.resetData().then(function () { S.user = null; toast('Демо-данные сброшены'); loadAll(); });
    });
  }

  function renderAdminMods(box) {
    var st = S.settings;
    box.innerHTML =
      '<div class="admin-panel-box"><h3>Сборка модов для сервера</h3>' +
      '<p class="form-hint">По умолчанию кнопка скачивает файл <code>mods/server-mods.zip</code> из папки сайта. Просто замените этот файл своим архивом. Если архив больше 100 МБ — загрузите его в GitHub Releases и вставьте прямую ссылку ниже.</p>' +
      '<form id="admin-mods-form">' +
      field('Ссылка на архив (файл в папке mods/ или URL из GitHub Releases)', '<input class="mc-input" name="mods_download_url" value="' + esc(st.mods_download_url) + '">') +
      '<div class="form-row">' + field('Имя файла при скачивании', '<input class="mc-input" name="mods_filename" value="' + esc(st.mods_filename) + '">') +
      field('Версия сборки', '<input class="mc-input" name="mods_version" value="' + esc(st.mods_version) + '">') + '</div>' +
      '<div class="form-row">' + field('Размер (текст)', '<input class="mc-input" name="mods_size" value="' + esc(st.mods_size) + '">') +
      field('Дата обновления (текст)', '<input class="mc-input" name="mods_updated" value="' + esc(st.mods_updated) + '">') + '</div>' +
      field('Описание сборки', '<textarea class="mc-textarea" name="mods_description" rows="3">' + esc(st.mods_description) + '</textarea>') +
      '<div style="display:flex;justify-content:flex-end;margin-top:0.8rem;"><button type="submit" class="mc-btn">Сохранить</button></div>' +
      '</form></div>' +
      '<div class="admin-panel-box"><h3>Моды в сборке (' + S.mods.length + ')</h3>' +
      '<form id="admin-mod-add-form" style="display:flex;gap:0.6rem;flex-wrap:wrap;margin-bottom:1rem;">' +
      '<input class="mc-input" name="name" required maxlength="80" placeholder="Название мода" style="flex:1;min-width:180px;">' +
      '<input class="mc-input" name="description" maxlength="200" placeholder="Краткое описание" style="flex:2;min-width:220px;">' +
      '<button type="submit" class="mc-btn sm">+ Добавить мод</button></form>' +
      '<div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>Мод</th><th>Описание</th><th></th></tr></thead><tbody>' +
      S.mods.map(function (m) {
        return '<tr><td>' + esc(m.name) + '</td><td>' + esc(m.description || '') + '</td>' +
          '<td><button type="button" class="flat-btn danger-text" data-admin-del-mod="' + esc(m.id) + '">Удалить</button></td></tr>';
      }).join('') + '</tbody></table></div></div>';
    $('#admin-mods-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var fd = new FormData(e.target); var ns = Object.assign({}, st);
      ['mods_download_url', 'mods_filename', 'mods_version', 'mods_size', 'mods_updated', 'mods_description'].forEach(function (k) { ns[k] = String(fd.get(k) || '').trim(); });
      db.saveSettings(ns).then(function () { toast('Настройки сборки сохранены'); loadAll(); }).catch(function (ex) { toast(ex.message, 'error'); });
    });
    $('#admin-mod-add-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var fd = new FormData(e.target);
      db.createMod({ name: String(fd.get('name')).trim(), description: String(fd.get('description') || '').trim(), sort_order: S.mods.length + 1 })
        .then(function () { toast('Мод добавлен'); loadAll(); }).catch(function (ex) { toast(ex.message, 'error'); });
    });
    $$('[data-admin-del-mod]', box).forEach(function (b) {
      b.addEventListener('click', function () {
        if (!confirm('Удалить мод из списка?')) return;
        db.deleteMod(b.getAttribute('data-admin-del-mod')).then(function () { toast('Мод удалён'); loadAll(); });
      });
    });
  }

  function renderAdminUsers(box) {
    var q = S.userQuery.toLowerCase();
    var list = S.users.filter(function (u) {
      return !q || (u.username + ' ' + (u.mcnick || '') + ' ' + u.email).toLowerCase().indexOf(q) !== -1;
    });
    var me = S.user;
    box.innerHTML =
      '<div class="admin-panel-box"><h3>Пользователи и роли (' + S.users.length + ')</h3>' +
      '<div class="searchbox" style="max-width:420px;margin-bottom:1rem;">' +
      '<svg class="search-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>' +
      '<input type="text" id="admin-user-search" placeholder="Поиск по логину, нику или email..." value="' + esc(S.userQuery) + '"></div>' +
      '<div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>Пользователь</th><th>Email</th><th>Роль</th><th>Статус</th><th>Регистрация</th><th>Действия</th></tr></thead><tbody>' +
      list.map(function (u) {
        var isMe = me && u.id === me.id;
        var canChangeRole = !isMe && isOwner(me) || (!isMe && me && me.role === 'admin' && (u.role === 'player' || u.role === 'moderator'));
        var roleOptions = ['player', 'moderator', 'admin', 'owner'].map(function (r) {
          var disabled = false;
          if (!isOwner(me)) disabled = (r === 'owner' || r === 'admin');
          if (me && me.role === 'moderator') disabled = true;
          return '<option value="' + r + '"' + (u.role === r ? ' selected' : '') + (disabled ? ' disabled' : '') + '>' + ROLE_LABELS[r] + '</option>';
        }).join('');
        var canBan = !isMe && u.role !== 'owner' && ROLE_RANK[me.role] >= ROLE_RANK[u.role];
        var canPurge = !isMe && ROLE_RANK[me.role] > ROLE_RANK[u.role];
        return '<tr><td><div style="display:flex;align-items:center;gap:0.5rem;">' + avatarSVG(u, 28) + '<div><div>' + esc(u.username) + (isMe ? ' (вы)' : '') + '</div><div class="form-hint">MC: ' + esc(u.mcnick || '—') + '</div></div></div></td>' +
          '<td>' + esc(u.email) + '</td>' +
          '<td><select class="mc-select" data-admin-role="' + esc(u.id) + '"' + (canChangeRole ? '' : ' disabled') + '>' + roleOptions + '</select></td>' +
          '<td>' + (u.banned ? '<span class="badge role-banned">Забанен</span>' : '<span class="badge role-player">Активен</span>') + (u.banned_reason ? '<div class="form-hint">' + esc(u.banned_reason) + '</div>' : '') + '</td>' +
          '<td>' + fmtDate(u.created_at) + '</td>' +
          '<td><div style="display:flex;gap:0.4rem;flex-wrap:wrap;">' +
          (canBan ? '<button type="button" class="mc-btn ' + (u.banned ? 'sm' : 'danger sm') + '" data-admin-ban="' + esc(u.id) + '">' + (u.banned ? 'Разбанить' : 'Забанить') + '</button>' : '') +
          (canPurge ? '<button type="button" class="mc-btn stone sm" data-admin-purge="' + esc(u.id) + '">Удалить посты</button>' : '') +
          '</div></td></tr>';
      }).join('') + '</tbody></table></div></div>';
    var search = $('#admin-user-search');
    if (search) search.addEventListener('input', debounce(function () { S.userQuery = search.value; renderAdminUsers(box); var el = $('#admin-user-search'); if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); } }, 250));
    $$('[data-admin-role]', box).forEach(function (sel) {
      sel.addEventListener('change', function () {
        var id = sel.getAttribute('data-admin-role'); var role = sel.value;
        var target = userById(id);
        if (!confirm('Выдать роль «' + ROLE_LABELS[role] + '» пользователю ' + target.username + '?')) { loadAll(); return; }
        db.updateUser({ id: id, role: role }).then(function () { toast('Роль обновлена'); loadAll(); }).catch(function (ex) { toast(ex.message, 'error'); });
      });
    });
    $$('[data-admin-ban]', box).forEach(function (b) {
      b.addEventListener('click', function () {
        var id = b.getAttribute('data-admin-ban'); var u = userById(id);
        if (u.banned) {
          db.updateUser({ id: id, banned: false, banned_reason: '' }).then(function () { toast('Пользователь разбанен'); loadAll(); });
        } else {
          var reason = prompt('Причина бана для ' + u.username + ' (необязательно):', '');
          if (reason === null) return;
          db.updateUser({ id: id, banned: true, banned_reason: reason || '' }).then(function () { toast('Пользователь забанен'); loadAll(); });
        }
      });
    });
    $$('[data-admin-purge]', box).forEach(function (b) {
      b.addEventListener('click', function () {
        var id = b.getAttribute('data-admin-purge'); var u = userById(id);
        if (!confirm('Удалить ВСЕ темы и ответы пользователя ' + u.username + '? Действие нельзя отменить.')) return;
        db.purgeUserPosts(id).then(function () { toast('Посты пользователя удалены'); loadAll(); }).catch(function (ex) { toast(ex.message, 'error'); });
      });
    });
  }

  function renderAdminForum(box) {
    box.innerHTML =
      '<div class="admin-panel-box"><h3>Разделы форума</h3>' +
      '<form id="admin-cat-add-form" style="display:flex;gap:0.6rem;flex-wrap:wrap;margin-bottom:1rem;">' +
      '<input class="mc-input" name="name" required maxlength="60" placeholder="Название раздела" style="flex:1;min-width:180px;">' +
      '<input class="mc-input" name="description" maxlength="200" placeholder="Описание" style="flex:2;min-width:200px;">' +
      '<label class="checkbox-row"><input type="checkbox" name="admin_only"> Только для администрации</label>' +
      '<button type="submit" class="mc-btn sm">+ Добавить раздел</button></form>' +
      '<div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>Раздел</th><th>Описание</th><th>Доступ</th><th>Тем</th><th></th></tr></thead><tbody>' +
      S.categories.map(function (c) {
        var n = S.threads.filter(function (t) { return t.category_id === c.id; }).length;
        return '<tr><td>' + esc(c.name) + '</td><td>' + esc(c.description || '') + '</td>' +
          '<td>' + (c.admin_only ? '🔒 Только администрация' : 'Все игроки') + '</td><td>' + n + '</td>' +
          '<td><button type="button" class="flat-btn danger-text" data-admin-del-cat="' + esc(c.id) + '">Удалить</button></td></tr>';
      }).join('') + '</tbody></table></div></div>' +
      '<div class="admin-panel-box"><h3>Все темы форума (' + S.threads.length + ')</h3>' +
      '<div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>Тема</th><th>Автор</th><th>Раздел</th><th>Ответов</th><th>Действия</th></tr></thead><tbody>' +
      S.threads.slice().sort(function (a, b) { return new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at); }).map(function (t) {
        var a = userById(t.author_id); var c = catById(t.category_id);
        return '<tr><td><a href="#thread/' + esc(t.id) + '">' + esc(t.title) + '</a>' + (t.pinned ? ' 📌' : '') + (t.locked ? ' 🔒' : '') + '</td>' +
          '<td>' + esc(a.username) + '</td><td>' + esc(c ? c.name : '—') + '</td><td>' + repliesOf(t.id).length + '</td>' +
          '<td><div style="display:flex;gap:0.4rem;flex-wrap:wrap;">' +
          '<button type="button" class="mc-btn stone sm" data-mod-pin="' + esc(t.id) + '">' + (t.pinned ? 'Снять закреп' : 'Закрепить') + '</button>' +
          '<button type="button" class="mc-btn stone sm" data-mod-lock="' + esc(t.id) + '">' + (t.locked ? 'Открыть' : 'Закрыть') + '</button>' +
          '<button type="button" class="mc-btn danger sm" data-mod-delete-thread="' + esc(t.id) + '">Удалить</button>' +
          '</div></td></tr>';
      }).join('') + '</tbody></table></div></div>';
    $('#admin-cat-add-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var fd = new FormData(e.target);
      db.createCategory({ name: String(fd.get('name')).trim(), description: String(fd.get('description') || '').trim(), admin_only: !!fd.get('admin_only'), sort_order: S.categories.length + 1 })
        .then(function () { toast('Раздел добавлен'); loadAll(); }).catch(function (ex) { toast(ex.message, 'error'); });
    });
    $$('[data-admin-del-cat]', box).forEach(function (b) {
      b.addEventListener('click', function () {
        if (!confirm('Удалить раздел? Темы в нём останутся, но без раздела.')) return;
        db.deleteCategory(b.getAttribute('data-admin-del-cat')).then(function () { toast('Раздел удалён'); loadAll(); });
      });
    });
  }

  function renderAdminRules(box) {
    box.innerHTML =
      '<div class="admin-panel-box"><h3>Правила и FAQ</h3>' +
      '<form id="admin-rule-add-form">' +
      field('Заголовок', '<input class="mc-input" name="title" required maxlength="160" placeholder="Например: Запрещены читы">') +
      field('Текст (поддерживается **жирный** и переносы строк)', '<textarea class="mc-textarea" name="body" rows="4" required placeholder="Текст правила..."></textarea>') +
      '<div style="display:flex;justify-content:flex-end;margin-top:0.6rem;"><button type="submit" class="mc-btn sm">+ Добавить правило</button></div></form></div>' +
      '<div class="admin-panel-box"><h3>Опубликованные (' + S.rules.length + ')</h3>' +
      S.rules.map(function (r) {
        return '<div class="admin-item-row"><div style="flex:1;"><strong>' + esc(r.title) + '</strong><div class="form-hint">' + esc(String(r.body || '').slice(0, 120)) + '…</div></div>' +
          '<button type="button" class="flat-btn danger-text" data-admin-del-rule="' + esc(r.id) + '">Удалить</button></div>';
      }).join('') + '</div>';
    $('#admin-rule-add-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var fd = new FormData(e.target);
      db.createRule({ title: String(fd.get('title')).trim(), body: String(fd.get('body')).trim(), sort_order: S.rules.length + 1 })
        .then(function () { toast('Правило добавлено'); loadAll(); }).catch(function (ex) { toast(ex.message, 'error'); });
    });
    $$('[data-admin-del-rule]', box).forEach(function (b) {
      b.addEventListener('click', function () {
        if (!confirm('Удалить правило?')) return;
        db.deleteRule(b.getAttribute('data-admin-del-rule')).then(function () { toast('Правило удалено'); loadAll(); });
      });
    });
  }

  function renderAll() {
    renderNavAuth(); renderSettings(); renderHomeRecent();
    renderCategories(); renderThreadList(); renderMods(); renderRules();
    if (S.threadId) renderThreadDetail();
    renderAdmin();
  }

  /* --------------------------------------------------------------------------
     МОДАЛЬНЫЕ ОКНА
     -------------------------------------------------------------------------- */
  function openModal(id) { var m = $('#' + id); if (m) { m.classList.remove('hidden'); document.body.style.overflow = 'hidden'; } }
  function closeModal(id) { var m = $('#' + id); if (m) { m.classList.add('hidden'); document.body.style.overflow = ''; } }
  function closeAllModals() { $$('.modal-backdrop').forEach(function (m) { m.classList.add('hidden'); }); document.body.style.overflow = ''; }

  function setAuthTab(tab) {
    $$('[data-auth-tab]').forEach(function (b) { b.classList.toggle('active', b.getAttribute('data-auth-tab') === tab); });
    $('#login-form').classList.toggle('hidden', tab !== 'login');
    $('#register-form').classList.toggle('hidden', tab !== 'register');
    $('#auth-modal-title').textContent = tab === 'login' ? 'Вход на сайт' : 'Регистрация игрока';
    var err = $('#auth-error'); if (err) err.classList.add('hidden');
  }
  function showAuthError(msg) { var e = $('#auth-error'); if (e) { e.textContent = msg; e.classList.remove('hidden'); } }

  function renderSwatches(container, selected, onPick) {
    if (!container) return;
    container.innerHTML = AVATAR_COLORS.map(function (c) {
      return '<button type="button" class="color-swatch' + (c === selected ? ' selected' : '') + '" data-color="' + c + '" style="background:' + c + '" title="' + c + '" aria-label="Цвет аватара ' + c + '"></button>';
    }).join('');
    $$('.color-swatch', container).forEach(function (b) {
      b.addEventListener('click', function () { onPick(b.getAttribute('data-color')); renderSwatches(container, selected, onPick); });
    });
  }

  function openProfile() {
    if (!S.user) { openModal('auth-modal'); setAuthTab('login'); return; }
    var u = S.user;
    var body = $('#profile-modal-body');
    body.innerHTML =
      '<div style="display:flex;align-items:center;gap:1rem;margin-bottom:1rem;">' + avatarSVG(u, 64) +
      '<div><div style="font-size:1.2rem;font-weight:700;">' + esc(u.username) + '</div>' +
      '<div style="margin-top:0.3rem;">' + roleBadge(u.role) + (u.banned ? ' <span class="badge role-banned">Забанен</span>' : '') + '</div>' +
      '<div class="form-hint" style="margin-top:0.3rem;">На сайте с ' + fmtDate(u.created_at) + '</div></div></div>' +
      '<form id="profile-form">' +
      field('Ник в Minecraft', '<input class="mc-input" name="mcnick" maxlength="20" value="' + esc(u.mcnick || '') + '" placeholder="Необязательно">') +
      field('Email', '<input class="mc-input" value="' + esc(u.email) + '" disabled>') +
      '<div class="form-group"><label>Цвет пиксель-аватара</label><div class="color-swatches" id="profile-swatches"></div></div>' +
      '<div style="display:flex;justify-content:flex-end;margin-top:0.8rem;"><button type="submit" class="mc-btn sm">Сохранить профиль</button></div></form>' +
      '<hr style="border:none;border-top:1px solid var(--border-main);margin:1.2rem 0;">' +
      '<form id="password-form"><h3 style="margin-bottom:0.6rem;">Смена пароля</h3>' +
      '<div class="form-row">' + field('Старый пароль', '<input class="mc-input" type="password" name="old" required autocomplete="current-password">') +
      field('Новый пароль', '<input class="mc-input" type="password" name="new" required minlength="6" autocomplete="new-password">') + '</div>' +
      '<div style="display:flex;justify-content:flex-end;"><button type="submit" class="mc-btn stone sm">Сменить пароль</button></div></form>';
    var color = u.avatar_color || AVATAR_COLORS[0];
    renderSwatches($('#profile-swatches'), color, function (c) { color = c; });
    $('#profile-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var mcnick = String(new FormData(e.target).get('mcnick') || '').trim();
      db.updateUser({ id: u.id, mcnick: mcnick, avatar_color: color }).then(function () {
        toast('Профиль обновлён'); closeModal('profile-modal'); loadAll();
      }).catch(function (ex) { toast(ex.message, 'error'); });
    });
    $('#password-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var fd = new FormData(e.target);
      db.changePassword(u.id, String(fd.get('old')), String(fd.get('new'))).then(function () {
        toast('Пароль изменён'); closeModal('profile-modal');
      }).catch(function (ex) { toast(ex.message, 'error'); });
    });
    openModal('profile-modal');
  }

  function openThreadModal(editThread) {
    if (!S.user) { openModal('auth-modal'); setAuthTab('login'); toast('Войдите, чтобы создать тему'); return; }
    if (S.user.banned) { toast('Ваш аккаунт заблокирован', 'error'); return; }
    var cats = visibleCategories();
    var sel = $('#thread-category');
    sel.innerHTML = cats.map(function (c) { return '<option value="' + esc(c.id) + '">' + esc(c.name) + '</option>'; }).join('');
    $('#thread-edit-id').value = editThread ? editThread.id : '';
    $('#thread-title-input').value = editThread ? editThread.title : '';
    $('#thread-body-input').value = editThread ? editThread.body : '';
    if (editThread) sel.value = editThread.category_id;
    $('#thread-modal-title').textContent = editThread ? 'Редактирование темы' : 'Новая тема на форуме';
    $('#thread-submit-btn').textContent = editThread ? 'Сохранить' : 'Опубликовать';
    var err = $('#thread-form-error'); if (err) err.classList.add('hidden');
    openModal('thread-modal');
  }

  /* --------------------------------------------------------------------------
     РОУТЕР (hash-based, работает в подпапке GitHub Pages)
     -------------------------------------------------------------------------- */
  var VIEWS = ['home', 'forum', 'thread', 'mods', 'rules', 'admin'];
  function showView(name) {
    VIEWS.forEach(function (v) { var el = $('#view-' + v); if (el) el.classList.toggle('hidden', v !== name); });
    $$('.nav-link').forEach(function (a) {
      var r = a.getAttribute('data-route');
      a.classList.toggle('active', r === name || (name === 'thread' && r === 'forum'));
    });
    window.scrollTo(0, 0);
  }
  function route() {
    var hash = (location.hash || '#home').replace(/^#/, '');
    var parts = hash.split('/');
    var name = parts[0] || 'home';
    closeDrawer();
    if (name === 'thread' && parts[1]) {
      S.threadId = decodeURIComponent(parts[1]);
      showView('thread');
      var t = threadById(S.threadId);
      if (t) { t.views = (t.views || 0) + 1; db.updateThread(t).then(function () { renderThreadDetail(); }); }
      renderThreadDetail();
      return;
    }
    if (VIEWS.indexOf(name) === -1) name = 'home';
    if (name === 'admin' && !isStaff(S.user)) {
      toast('Админ-панель доступна только администрации', 'error');
      location.hash = '#forum';
      return;
    }
    showView(name);
    if (name === 'forum') { renderCategories(); renderThreadList(); }
    if (name === 'admin') renderAdmin();
  }

  function closeDrawer() { var d = $('#mobile-drawer'); if (d) d.classList.remove('open'); }

  /* --------------------------------------------------------------------------
     СОБЫТИЯ
     -------------------------------------------------------------------------- */
  function bindEvents() {
    window.addEventListener('hashchange', route);

    /* Мобильное меню */
    var hb = $('#hamburger-btn');
    if (hb) hb.addEventListener('click', function () { var d = $('#mobile-drawer'); if (d) d.classList.toggle('open'); });
    $$('[data-close-drawer]').forEach(function (a) { a.addEventListener('click', closeDrawer); });
    document.addEventListener('click', function (e) {
      var d = $('#mobile-drawer');
      if (d && d.classList.contains('open') && !d.contains(e.target) && e.target !== hb && !hb.contains(e.target)) closeDrawer();
    });

    /* Копирование IP */
    function bindCopy(sel) { var b = $(sel); if (b) b.addEventListener('click', function () { copyText((S.settings && S.settings.server_ip) || CFG.SERVER_IP, 'IP сервера скопирован!'); }); }
    bindCopy('#copy-ip-btn'); bindCopy('#mods-copy-ip-btn');
    var ipBox = $('.ip-box'); if (ipBox) ipBox.addEventListener('click', function (e) { if (e.target.closest('#copy-ip-btn')) return; copyText((S.settings && S.settings.server_ip) || CFG.SERVER_IP, 'IP сервера скопирован!'); });

    var sd = $('#scroll-down-btn');
    if (sd) sd.addEventListener('click', function () { var el = $('#home-below'); if (el) el.scrollIntoView({ behavior: 'smooth' }); });

    var heroBtn = $('#hero-secondary-btn');
    if (heroBtn) heroBtn.addEventListener('click', function () {
      if (S.user) openProfile();
      else { openModal('auth-modal'); setAuthTab('register'); }
    });

    /* Делегирование кликов (авторизация, профиль, выход, темы, лайки, модерация) */
    document.addEventListener('click', function (e) {
      var authBtn = e.target.closest('[data-open-auth]');
      if (authBtn) { e.preventDefault(); openModal('auth-modal'); setAuthTab(authBtn.getAttribute('data-open-auth')); return; }
      var profBtn = e.target.closest('[data-open-profile]');
      if (profBtn) { e.preventDefault(); openProfile(); return; }
      var outBtn = e.target.closest('[data-logout]');
      if (outBtn) {
        e.preventDefault();
        db.logout().then(function () { S.user = null; toast('Вы вышли из аккаунта'); loadAll(); if (location.hash.indexOf('admin') !== -1) location.hash = '#home'; });
        return;
      }
      var closeBtn = e.target.closest('[data-close-modal]');
      if (closeBtn) { closeModal(closeBtn.getAttribute('data-close-modal')); return; }
      if (e.target.classList && e.target.classList.contains('modal-backdrop')) { e.target.classList.add('hidden'); document.body.style.overflow = ''; return; }

      var likeT = e.target.closest('[data-like-thread]');
      if (likeT) { toggleLike('thread', likeT.getAttribute('data-like-thread')); return; }
      var likeR = e.target.closest('[data-like-reply]');
      if (likeR) { toggleLike('reply', likeR.getAttribute('data-like-reply')); return; }

      var quote = e.target.closest('[data-quote-reply]');
      if (quote) {
        var r = S.replies.filter(function (x) { return x.id === quote.getAttribute('data-quote-reply'); })[0];
        var ta = $('#reply-body');
        if (r && ta) {
          var a = userById(r.author_id);
          ta.value = '> ' + String(r.body).split('\n').join('\n> ') + '\n\n';
          ta.focus();
        }
        return;
      }
      var editT = e.target.closest('[data-edit-thread]');
      if (editT) { var tt = threadById(editT.getAttribute('data-edit-thread')); if (tt) openThreadModal(tt); return; }
      var editR = e.target.closest('[data-edit-reply]');
      if (editR) { editReply(editR.getAttribute('data-edit-reply')); return; }
      var delT = e.target.closest('[data-delete-thread]');
      if (delT) { deleteThread(delT.getAttribute('data-delete-thread')); return; }
      var delR = e.target.closest('[data-delete-reply]');
      if (delR) { deleteReply(delR.getAttribute('data-delete-reply')); return; }

      var pin = e.target.closest('[data-mod-pin]');
      if (pin) { modThread(pin.getAttribute('data-mod-pin'), 'pin'); return; }
      var lock = e.target.closest('[data-mod-lock]');
      if (lock) { modThread(lock.getAttribute('data-mod-lock'), 'lock'); return; }
      var delMod = e.target.closest('[data-mod-delete-thread]');
      if (delMod) { deleteThread(delMod.getAttribute('data-mod-delete-thread')); return; }

      var catPill = e.target.closest('[data-cat]');
      if (catPill) { S.forum.cat = catPill.getAttribute('data-cat'); S.forum.page = 1; renderCategories(); renderThreadList(); return; }

      var pageBtn = e.target.closest('[data-page]');
      if (pageBtn) {
        var p = pageBtn.getAttribute('data-page');
        var total = Math.max(1, Math.ceil(filteredThreads().length / S.forum.perPage));
        if (p === 'prev') S.forum.page = Math.max(1, S.forum.page - 1);
        else if (p === 'next') S.forum.page = Math.min(total, S.forum.page + 1);
        else S.forum.page = parseInt(p, 10);
        renderThreadList(); return;
      }

      var tabBtn = e.target.closest('[data-admin-tab]');
      if (tabBtn) { S.adminTab = tabBtn.getAttribute('data-admin-tab'); renderAdmin(); return; }
      var authTab = e.target.closest('[data-auth-tab]');
      if (authTab) { setAuthTab(authTab.getAttribute('data-auth-tab')); return; }

      var row = e.target.closest('[data-thread-id]');
      if (row && !e.target.closest('button') && !e.target.closest('a')) {
        location.hash = '#thread/' + encodeURIComponent(row.getAttribute('data-thread-id'));
        return;
      }
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeAllModals();
      if (e.key === 'Enter') {
        var row = e.target.closest && e.target.closest('[data-thread-id]');
        if (row) location.hash = '#thread/' + encodeURIComponent(row.getAttribute('data-thread-id'));
      }
    });

    /* Форум: поиск, сортировка, новая тема */
    var search = $('#forum-search');
    if (search) search.addEventListener('input', debounce(function () { S.forum.q = search.value.trim(); S.forum.page = 1; renderThreadList(); }, 200));
    var clr = $('#forum-search-clear');
    if (clr) clr.addEventListener('click', function () { S.forum.q = ''; S.forum.page = 1; search.value = ''; renderThreadList(); search.focus(); });
    var sort = $('#forum-sort');
    if (sort) sort.addEventListener('change', function () { S.forum.sort = sort.value; S.forum.page = 1; renderThreadList(); });
    var ntb = $('#new-thread-btn');
    if (ntb) ntb.addEventListener('click', function () { openThreadModal(null); });
    var back = $('#back-to-forum-btn');
    if (back) back.addEventListener('click', function () { location.hash = '#forum'; });

    /* Вход */
    var loginForm = $('#login-form');
    if (loginForm) loginForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var identity = $('#login-identity').value.trim();
      var pass = $('#login-password').value;
      var btn = $('#login-submit-btn'); btn.disabled = true; btn.textContent = 'Входим...';
      db.login(identity, pass).then(function (u) {
        S.user = u; toast('С возвращением, ' + u.username + '!');
        closeModal('auth-modal'); loginForm.reset(); loadAll();
      }).catch(function (ex) { showAuthError(ex.message || 'Ошибка входа'); })
      .then(function () { btn.disabled = false; btn.textContent = 'Войти на сайт'; });
    });

    /* Регистрация */
    renderSwatches($('#reg-color-swatches'), S.avatarColor, function (c) { S.avatarColor = c; });
    var regForm = $('#register-form');
    if (regForm) regForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var username = $('#reg-username').value.trim();
      var mcnick = $('#reg-mcnick').value.trim();
      var email = $('#reg-email').value.trim();
      var p1 = $('#reg-password').value, p2 = $('#reg-password2').value;
      if (username.length < 3) return showAuthError('Логин должен быть не короче 3 символов');
      if (p1.length < 6) return showAuthError('Пароль должен быть не короче 6 символов');
      if (p1 !== p2) return showAuthError('Пароли не совпадают');
      var btn = $('#reg-submit-btn'); btn.disabled = true; btn.textContent = 'Создаём...';
      db.register({ username: username, mcnick: mcnick || username, email: email, password: p1, avatar_color: S.avatarColor })
        .then(function (u) {
          S.user = u;
          var isOwner = u.role === 'owner';
          toast(isOwner ? 'Аккаунт создан! Вы получили права Создателя сайта 🎉' : 'Аккаунт создан! Добро пожаловать, ' + u.username);
          closeModal('auth-modal'); regForm.reset(); loadAll();
        }).catch(function (ex) { showAuthError(ex.message || 'Ошибка регистрации'); })
        .then(function () { btn.disabled = false; btn.textContent = 'Создать аккаунт'; });
    });

    /* Демо-вход создателя (только локальный режим) */
    var hint = $('#auth-demo-hint');
    if (hint && !USE_SB) {
      hint.classList.remove('hidden');
      var lbl = $('#demo-creds-label'); if (lbl) lbl.textContent = CFG.DEMO_OWNER_LOGIN + ' / ' + CFG.DEMO_OWNER_PASSWORD;
      var fill = $('#fill-demo-owner-btn');
      if (fill) fill.addEventListener('click', function () {
        $('#login-identity').value = CFG.DEMO_OWNER_LOGIN;
        $('#login-password').value = CFG.DEMO_OWNER_PASSWORD;
        setAuthTab('login');
      });
    }

    /* Форма темы */
    var threadForm = $('#thread-form');
    if (threadForm) threadForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var err = $('#thread-form-error');
      var editId = $('#thread-edit-id').value;
      var data = {
        category_id: $('#thread-category').value,
        title: $('#thread-title-input').value.trim(),
        body: $('#thread-body-input').value.trim()
      };
      if (data.title.length < 4) { err.textContent = 'Заголовок слишком короткий (минимум 4 символа)'; err.classList.remove('hidden'); return; }
      if (data.body.length < 5) { err.textContent = 'Сообщение слишком короткое (минимум 5 символов)'; err.classList.remove('hidden'); return; }
      err.classList.add('hidden');
      var btn = $('#thread-submit-btn'); btn.disabled = true;
      var promise;
      if (editId) {
        var t = threadById(editId);
        promise = db.updateThread(Object.assign({}, t, data, { updated_at: nowISO() }));
      } else {
        promise = db.createThread(Object.assign({}, data, { author_id: S.user.id }));
      }
      promise.then(function (saved) {
        toast(editId ? 'Тема обновлена' : 'Тема опубликована!');
        closeModal('thread-modal');
        location.hash = '#thread/' + encodeURIComponent(saved.id);
        loadAll();
      }).catch(function (ex) { err.textContent = ex.message || 'Ошибка сохранения'; err.classList.remove('hidden'); })
      .then(function () { btn.disabled = false; });
    });
  }

  function toggleLike(kind, id) {
    if (!S.user) { openModal('auth-modal'); setAuthTab('login'); toast('Войдите, чтобы ставить лайки'); return; }
    var item = kind === 'thread'
      ? threadById(id)
      : S.replies.filter(function (r) { return r.id === id; })[0];
    if (!item) return;
    item.likes = item.likes || [];
    var i = item.likes.indexOf(S.user.id);
    if (i === -1) item.likes.push(S.user.id); else item.likes.splice(i, 1);
    var promise = kind === 'thread' ? db.updateThread(item) : db.updateReply(item);
    promise.then(function () { loadAll(); }).catch(function (ex) { toast(ex.message, 'error'); });
  }

  function editReply(id) {
    var r = S.replies.filter(function (x) { return x.id === id; })[0];
    if (!r) return;
    var card = document.querySelector('[data-post-id="' + id + '"] .post-body');
    if (!card) return;
    var old = r.body;
    card.innerHTML = '<textarea class="mc-textarea" id="edit-reply-ta" rows="4">' + esc(old) + '</textarea>' +
      '<div style="display:flex;gap:0.5rem;justify-content:flex-end;margin-top:0.5rem;">' +
      '<button type="button" class="mc-btn stone sm" id="edit-reply-cancel">Отмена</button>' +
      '<button type="button" class="mc-btn sm" id="edit-reply-save">Сохранить</button></div>';
    $('#edit-reply-cancel').addEventListener('click', function () { loadAll(); });
    $('#edit-reply-save').addEventListener('click', function () {
      var val = $('#edit-reply-ta').value.trim();
      if (val.length < 2) { toast('Сообщение слишком короткое', 'error'); return; }
      db.updateReply(Object.assign({}, r, { body: val, updated_at: nowISO() })).then(function () { toast('Ответ обновлён'); loadAll(); });
    });
  }

  function deleteThread(id) {
    if (!confirm('Удалить тему вместе со всеми ответами?')) return;
    db.deleteThread(id).then(function () {
      toast('Тема удалена');
      if (S.threadId === id) location.hash = '#forum';
      loadAll();
    }).catch(function (ex) { toast(ex.message, 'error'); });
  }
  function deleteReply(id) {
    if (!confirm('Удалить ответ?')) return;
    db.deleteReply(id).then(function () { toast('Ответ удалён'); loadAll(); }).catch(function (ex) { toast(ex.message, 'error'); });
  }
  function modThread(id, action) {
    var t = threadById(id); if (!t) return;
    var nt = Object.assign({}, t);
    if (action === 'pin') nt.pinned = !nt.pinned;
    if (action === 'lock') nt.locked = !nt.locked;
    db.updateThread(nt).then(function () { toast('Тема обновлена'); loadAll(); }).catch(function (ex) { toast(ex.message, 'error'); });
  }

  /* --------------------------------------------------------------------------
     ЗАПУСК
     -------------------------------------------------------------------------- */
  document.addEventListener('DOMContentLoaded', function () {
    bindEvents();
    db.init().then(function (u) {
      S.user = u;
      return loadAll();
    }).then(function () {
      route();
    }).catch(function (ex) {
      console.error(ex);
      toast('Ошибка загрузки данных: ' + (ex.message || ex), 'error');
      route();
    });
  });
})();
