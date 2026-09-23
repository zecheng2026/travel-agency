/* =============================================
// HuanYou Travel | Cloud Data Layer (Supabase)
   =============================================
Dual-mode design:
- supabase-config.js not configured → Cloud.enabled() = false, all content uses original localStorage demo mode
- Configured → content data sourced from database:
* Frontend reads cloud: DataLoader → Cloud.cache (bootstrap pulls all into memory)
* Admin writes cloud: Cloud.upsert / Cloud.remove (syncs memory cache + DB)
* Images: uploaded to Storage public bucket "images", URL stored in DB
* Auth: Supabase Auth (email + password), roles stored in admins table
Table schema (minimal columnar, business fields stored as JSONB — see supabase/schema.sql):
     routes/destinations/guides/messages/orders/users: (id text PK, data jsonb)
     settings: (id='site', data jsonb)   admins: (id uuid → auth.users, role/name/username)
   ============================================= */

const Cloud = {
  _client: null,
  _broken: false,
  _bootPromise: null,
  _authPromise: null,

// In-memory cache (authoritative snapshot in cloud mode, read by DataLoader)
  cache: {
    routes: [],
    destinations: [],
    guides: [],
    messages: [],
    orders: [],
    users: [],
    settings: null,
    admins: []
  },

// Current admin session mirror (local mode uses Store tw_admin; cloud mode stores auth profile here)
  profile: null,

/* ---------- Feature Toggle ---------- */
  enabled() {
    if (this._broken) return false;
    const c = window.SUPABASE_CONFIG;
    return !!(c && c.url && c.anonKey);
  },

/* ---------- SDK Client (lazy-loaded from CDN: supabase-js v2) ---------- */
  async client() {
    if (this._client) return this._client;
    if (!this.enabled()) return null;
    if (!window.supabase) {
      await new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
        s.onload = resolve;
s.onerror = () => reject(new Error('Supabase SDK failed to load (check your network connection)'));
        document.head.appendChild(s);
      });
    }
    const c = window.SUPABASE_CONFIG;
    this._client = window.supabase.createClient(c.url, c.anonKey, {
      auth: { persistSession: true, autoRefreshToken: true }
    });
    return this._client;
  },

/* Degrade to local mode on network/SDK failure (content falls back to JSON; admin writes show errors) */
  _degrade(err) {
    this._broken = true;
console.warn('[Cloud] Cloud mode unavailable, falling back to local mode:', err);
  },

/* ---------- Public Data Bulk Pull (frontend/backend startup) ---------- */
  async bootstrap(force = false) {
    if (!this.enabled()) return null;
    if (this._bootPromise && !force) return this._bootPromise;
    if (force) this._bootPromise = null;
    this._bootPromise = (async () => {
      const sb = await this.client();
      if (!sb) return null;
      for (const key of ['routes', 'destinations', 'guides']) {
        const { data, error } = await sb.from(key).select('id, data').order('id');
        if (error) throw error;
        this.cache[key] = (data || []).map(r => r.data).filter(Boolean);
      }
      const { data: set, error: se } = await sb.from('settings').select('id, data');
      if (se) throw se;
      const merged = {};
      (set || []).forEach(r => {
        if (r.data && typeof r.data === 'object') Object.assign(merged, r.data);
      });
      this.cache.settings = merged;
      return this.cache;
    })().catch(err => { this._degrade(err); return null; });
    return this._bootPromise;
  },

/* Admin business data (pulled after login) */
  async syncBusiness() {
    if (!this.enabled()) return;
    const sb = await this.client();
    if (!sb) return;
    for (const key of ['orders', 'messages', 'users']) {
      const { data, error } = await sb.from(key).select('id, data').order('id');
      if (error) throw error;
      this.cache[key] = (data || []).map(r => r.data).filter(Boolean);
    }
  },

/* Admin list (pulled after login; admins table carries role info) */
  async loadAdmins() {
    const sb = await this.client();
    if (!sb) return [];
    const { data, error } = await sb.from('admins').select('id, username, name, role');
    if (error) throw error;
    this.cache.admins = data || [];
    return this.cache.admins;
  },

/* Current logged-in admin profile */
  async fetchProfile() {
    const sb = await this.client();
    if (!sb) return null;
    const { data: u, error } = await sb.auth.getUser();
    if (error || !u?.user) return null;
    const { data: rows, error: e2 } = await sb.from('admins')
      .select('username, name, role').eq('id', u.user.id).limit(1);
if (e2 || !rows || !rows.length) return null; // Not a backend admin
    const p = rows[0];
    this.profile = {
      id: u.user.id, email: u.user.email || p.username,
      username: p.username || u.user.email, name: p.name || u.user.email, role: p.role
    };
    return this.profile;
  },

/* ---------- Content Write ---------- */
  _row(item) {
    return { id: item.id, data: item, updated_at: new Date().toISOString() };
  },

/* Upsert single/multiple; after write, sync to in-memory cache */
  async upsert(table, items) {
    const sb = await this.client();
    if (!sb) return false;
    const list = Array.isArray(items) ? items : [items];
    if (!list.length) return true;
// settings table is single-row (id fixed to 'site'); callers usually pass only business object; auto-fill id to prevent write failure
    list.forEach(it => { if (table === 'settings' && !it.id) it.id = 'site'; });
    const { error } = await sb.from(table)
      .upsert(list.map(i => this._row(i)), { onConflict: 'id' });
    if (error) throw error;
    list.forEach(item => this.replaceCache(table, item));
    return true;
  },

  async remove(table, ids) {
    const sb = await this.client();
    if (!sb) return false;
    const list = Array.isArray(ids) ? ids : [ids];
    if (!list.length) return true;
    const { error } = await sb.from(table).delete().in('id', list);
    if (error) throw error;
    list.forEach(id => this.removeCache(table, id));
    return true;
  },

  replaceCache(table, item) {
    if (table === 'settings') { this.cache.settings = { ...(this.cache.settings || {}), ...item }; return; }
    if (!Array.isArray(this.cache[table])) this.cache[table] = [];
    const arr = this.cache[table];
    const i = arr.findIndex(x => x.id === item.id);
    if (i >= 0) arr[i] = item;
    else arr.push(item);
  },

/* New entries prepended to cache head (local-first delivery, avoids full table refresh) */
  pushCache(table, item) {
    if (!Array.isArray(this.cache[table])) this.cache[table] = [];
    const arr = this.cache[table];
    const i = arr.findIndex(x => x.id === item.id);
    if (i >= 0) arr.splice(i, 1);
    arr.unshift(item);
  },

  removeCache(table, id) {
    if (Array.isArray(this.cache[table])) this.cache[table] = this.cache[table].filter(x => x.id !== id);
  },

  cacheMap(table) {
    const arr = this.cache[table];
    const m = new Map();
    if (Array.isArray(arr)) arr.forEach(i => m.set(i.id, i));
    return m;
  },

/* Unified read entry point: cloud mode reads memory snapshot; auto-waits bootstrap if not ready */
  async list(table) {
    if (!this.enabled()) return null;
    await this.bootstrap();
    return this.cache[table] || [];
  },

/* ---------- Image Upload (Supabase Storage public bucket "images") ---------- */
  async uploadImage(file, ext) {
    const sb = await this.client();
    if (!sb) return null;
    const name = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext || 'jpg'}`;
    const { error } = await sb.storage.from('images').upload(name, file, {
      contentType: file.type || 'image/jpeg', upsert: false
    });
    if (error) throw error;
    return `${window.SUPABASE_CONFIG.url}/storage/v1/object/public/images/${name}`;
  },

/* ---------- Auth ---------- */
  async signIn(email, password) {
    const sb = await this.client();
    if (!sb) return null;
    const { error } = await sb.auth.signInWithPassword({ email, password });
    if (error) throw error;
    const profile = await this.fetchProfile();
if (!profile) { await sb.auth.signOut(); throw new Error('This account has no admin access'); }
    return profile;
  },

  async signOut() {
    const sb = await this.client();
    this.profile = null;
    if (sb) await sb.auth.signOut();
  },

  async restoreSession() {
    if (!this.enabled()) return false;
    const sb = await this.client();
    if (!sb) return false;
    const { data } = await sb.auth.getSession();
    if (!data?.session) return false;
    const profile = await this.fetchProfile();
    if (!profile) { await sb.auth.signOut(); return false; }
    return true;
  },

  async changePassword(oldPwd, newPwd) {
    const sb = await this.client();
    if (!sb) return false;
// Verify old password (re-login for new token), then update
    const email = (this.profile || {}).email;
if (!email) throw new Error('Session expired, please log in again');
    const { error: se } = await sb.auth.signInWithPassword({ email, password: oldPwd });
if (se) throw new Error('Current password is incorrect');
    const { error } = await sb.auth.updateUser({ password: newPwd });
if (error) throw new Error('Password change failed: ' + error.message);
    return true;
  }
};

window.Cloud = Cloud;
