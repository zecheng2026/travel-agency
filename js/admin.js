/* =============================================
   TravelWay 管理系统核心脚本
   ============================================= */

const Admin = {
  isLoggedIn: false,

  init() {
    this.checkLogin();
    this.bindEvents();
    this.updateTime();
    this.syncLoginHint();
    setInterval(() => this.updateTime(), 1000);
  },

  // 登录框提示随模式切换（本地用户名 / 云邮箱）
  syncLoginHint() {
    const lu = document.getElementById('login-username');
    if (lu) lu.placeholder = Store.isCloud() ? '邮箱（如 admin@example.com）' : '用户名（默认 admin）';
    const lp = document.getElementById('login-password');
    if (lp) lp.placeholder = Store.isCloud() ? '密码' : '密码（默认 admin123）';
    const hint = document.getElementById('login-mode-hint');
    if (hint) hint.textContent = Store.isCloud() ? '云模式 · 使用 Supabase 管理员账号登录' : '本地演示模式 · 数据仅存于当前浏览器';
  },

  async checkLogin() {
    // 云模式：恢复 Supabase 会话（刷新/重开页面保持登录）
    if (Store.isCloud()) {
      try {
        const ok = await Cloud.restoreSession();
        if (ok && Cloud.profile) {
          Store.setAdminUser(Cloud.profile);
          this.isLoggedIn = true;
          this.enterAdmin(Cloud.profile);
          await this.loadAll();
          return;
        }
      } catch (e) { /* 会话失效则走登录页 */ }
      Store.remove('tw_admin');
      return;
    }
    const user = Store.getAdminUser();
    if (user) {
      this.isLoggedIn = true;
      this.enterAdmin(user);
      this.loadAll();
    }
  },

  showLoginError(msg) {
    const el = document.getElementById('login-error');
    if (el) { el.textContent = msg; el.style.display = 'block'; }
  },

  hideLoginError() {
    const el = document.getElementById('login-error');
    if (el) { el.textContent = ''; el.style.display = 'none'; }
  },

  enterAdmin(user) {
    this.isLoggedIn = true;
    document.getElementById('login-overlay').classList.add('hidden');
    document.getElementById('admin-main').style.display = 'flex';
    this.hideLoginError();
    const nameEl = document.getElementById('admin-name');
    if (nameEl) nameEl.textContent = user.name || user.username || '管理员';
    const avatarEl = document.getElementById('admin-user-avatar');
    if (avatarEl) avatarEl.textContent = (user.name || user.username || 'A').charAt(0).toUpperCase();
    const roleEl = document.getElementById('admin-role');
    if (roleEl) roleEl.textContent = user.role === 'admin' ? '超级管理员' : '运营人员';
  },

  async login(username, password) {
    // 云模式：Supabase Auth 邮箱+密码登录
    if (Store.isCloud()) {
      try {
        const profile = await Cloud.signIn(String(username).trim(), password);
        Store.setAdminUser(profile);
        this.enterAdmin(profile);
        Toast.success(`欢迎回来，${profile.name}！`);
        await this.loadAll();
      } catch (err) {
        const raw = (err && err.message) || '';
        if (raw.includes('Invalid login credentials')) this.showLoginError('邮箱或密码错误');
        else if (raw.includes('Email not confirmed')) this.showLoginError('邮箱尚未验证，请先查收验证邮件');
        else if (raw.includes('rate limit') || raw.includes('Too many')) this.showLoginError('尝试次数过多，请稍后再试');
        else this.showLoginError(raw || '登录失败，请检查网络或云配置');
      }
      return;
    }

    const remain = AdminAuth.remainingLock();
    if (remain > 0) {
      this.showLoginError(`登录失败次数过多，账号已锁定，请 ${Math.ceil(remain / 60)} 分钟后再试`);
      return;
    }

    const user = await AdminAuth.verify(username, password);
    if (user) {
      AdminAuth.resetLock();
      AdminAuth.markLogin(user.username);
      const session = { name: user.name || user.username, role: user.role, username: user.username };
      Store.setAdminUser(session);
      this.enterAdmin(session);
      Toast.success(`欢迎回来，${session.name}！`);
      this.loadAll();
    } else {
      const lock = await AdminAuth.recordFail();
      if (lock.until > Date.now()) {
        this.showLoginError('错误次数过多，账号已锁定 5 分钟，请稍后再试');
      } else {
        this.showLoginError(`账号或密码错误！（连续错误 ${lock.count} 次 / 5 次将被锁定）`);
      }
    }
  },

  async logout() {
    if (Store.isCloud()) {
      try { await Cloud.signOut(); } catch (e) { /* 忽略 */ }
    }
    Store.remove('tw_admin');
    this.isLoggedIn = false;
    document.getElementById('login-overlay').classList.remove('hidden');
    document.getElementById('admin-main').style.display = 'none';
    this.hideLoginError();
    Toast.info('已退出登录');
  },

  refresh() {
    this.loadAll();
    Toast.show('数据已刷新', 'success', 1500);
  },

  updateTime() {
    const el = document.getElementById('admin-time');
    if (el) {
      const now = new Date();
      el.textContent = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')} ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}:${String(now.getSeconds()).padStart(2,'0')}`;
    }
  },

  switchPage(pageName) {
    // 运营账号无系统管理权限（设置/管理员仅超级管理员可用）
    const cur = Store.getAdminUser();
    if (cur && cur.role === 'operator' && (pageName === 'settings' || pageName === 'admins')) {
      Toast.warning('当前为运营账号，仅超级管理员可访问该页面');
      return;
    }
    document.querySelectorAll('.admin-page').forEach(p => p.classList.remove('active'));
    document.getElementById('page-' + pageName)?.classList.add('active');
    document.querySelectorAll('.admin-nav-item').forEach(n => n.classList.remove('active'));
    document.querySelector(`.admin-nav-item[data-page="${pageName}"]`)?.classList.add('active');
    const titles = { dashboard:'数据看板', orders:'订单管理', messages:'留言咨询', routes:'旅游线路', destinations:'目的地', guides:'攻略资讯', users:'用户管理', homepage:'首页配置', settings:'系统设置', admins:'管理员' };
    document.getElementById('current-page-title').textContent = titles[pageName] || pageName;
    
    // 触发对应模块的 render
    if (pageName === 'dashboard') this.loadDashboard();
    if (pageName === 'orders') AdminOrders.render();
    if (pageName === 'messages') AdminMessages.render();
    if (pageName === 'routes') AdminRoutes.render();
    if (pageName === 'destinations') AdminDestinations.render();
    if (pageName === 'guides') AdminGuides.render();
    if (pageName === 'homepage') AdminHomepage.load();
    if (pageName === 'contact') AdminContact.load();
    if (pageName === 'settings') AdminSettings.load();
    if (pageName === 'users') AdminUsers.render();
    if (pageName === 'admins') AdminAdmins.render();
  },

  async loadAll() {
    // 云模式：登录后同步业务数据（订单/留言/用户）与管理员列表
    if (Store.isCloud()) {
      try {
        await Cloud.syncBusiness();
        await Cloud.loadAdmins().catch(() => {});
      } catch (e) {
        Toast.error('云数据同步失败：' + ((e && e.message) || e));
      }
    }
    this.loadDashboard();
    this.updateBadges();
  },

  updateBadges() {
    const orders = Store.getOrders();
    const messages = Store.getMessages();
    const setBadge = (id, n) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.textContent = n || '';
      el.style.display = n ? 'inline-flex' : 'none';
    };
    setBadge('badge-orders', orders.filter(o => o.status === 'pending').length || 0);
    setBadge('badge-messages', messages.filter(m => m.status === 'unread').length || 0);
  },

  async loadDashboard() {
    const orders = Store.getOrders();
    const messages = Store.getMessages();
    const routes = await DataLoader.loadRoutes();
    
    document.getElementById('stat-orders').textContent = orders.length;
    document.getElementById('stat-routes').textContent = routes?.filter(r => r.status === 'published').length || 0;
    document.getElementById('stat-messages').textContent = messages.filter(m => m.status === 'unread').length;
    const usersEl = document.getElementById('stat-users');
    if (usersEl) usersEl.textContent = AdminUsers.collect().size;

    // 最近订单
    const recent = orders.slice(0, 5);
    const recentEl = document.getElementById('recent-orders');
    if (recentEl) {
      recentEl.innerHTML = recent.length ? recent.map(o => `
        <tr>
          <td><strong>${o.id}</strong></td>
          <td><a href="../route-detail.html?id=${o.routeId}" target="_blank" style="color:var(--color-primary);">${o.routeTitle || '未选择线路'}</a></td>
          <td>${o.name} · ${o.phone}</td>
          <td><strong style="color:var(--color-accent);">¥${(o.totalPrice || 0).toLocaleString()}</strong></td>
          <td><span class="status-badge ${o.status === 'pending' ? 'warning' : o.status === 'confirmed' ? 'success' : 'gray'}">${o.status === 'pending' ? '待处理' : o.status === 'confirmed' ? '已确认' : o.status === 'completed' ? '已完成' : '已取消'}</span></td>
        </tr>
      `).join('') : '<tr><td colspan="5" style="text-align:center;padding:40px;color:var(--color-text-secondary);">暂无订单数据</td></tr>';
    }
  },

  bindEvents() {
    // 登录
    document.getElementById('login-form')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const u = document.getElementById('login-username').value;
      const p = document.getElementById('login-password').value;
      this.login(u, p);
    });

    // 登录输入框清空错误提示
    ['login-username', 'login-password'].forEach(id => {
      document.getElementById(id)?.addEventListener('input', () => this.hideLoginError());
    });

    // 导航切换
    document.querySelectorAll('.admin-nav-item').forEach(item => {
      item.addEventListener('click', (e) => {
        e.preventDefault();
        const page = item.dataset.page;
        if (page) this.switchPage(page);
      });
    });

    // 侧边栏切换（移动端）
    const toggleBtn = document.getElementById('sidebar-toggle');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', () => {
        document.getElementById('admin-sidebar').classList.toggle('open');
      });
    }

    // ESC 关闭弹窗
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        AdminModal.close();
        document.getElementById('msg-modal')?.classList.remove('active');
      }
    });
  }
};

// ===== HTML 转义（防止用户输入破坏弹窗结构） =====
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ===== 管理员认证（多账号 + 密码哈希 + 登录锁定） =====
const AdminAuth = {
  key: 'tw_admins',
  SALT: 'travelway::2026',

  async hash(pwd) {
    const data = this.SALT + ':' + pwd;
    try {
      if (window.crypto && crypto.subtle) {
        const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(data));
        return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
      }
    } catch (e) { /* 非安全上下文时降级 */ }
    let h1 = 0x811c9dc5;
    for (let i = 0; i < data.length; i++) { h1 ^= data.charCodeAt(i); h1 = Math.imul(h1, 0x01000193); }
    return 'djb2_' + (h1 >>> 0).toString(16);
  },

  async ensureSeed() {
    let list = Store.get(this.key);
    if (!Array.isArray(list) || !list.length) {
      const hash = await this.hash('admin123');
      list = [{
        id: 'A' + Date.now().toString(36),
        username: 'admin', name: '管理员', role: 'admin',
        passHash: hash, status: 'active',
        createdAt: new Date().toISOString(), lastLogin: null
      }];
      Store.set(this.key, list);
    }
    return list;
  },

  list() {
    return Store.get(this.key, []);
  },

  async verify(username, password) {
    const list = await this.ensureSeed();
    const u = list.find(x => x.username === username && x.status === 'active');
    if (!u) return null;
    const h = await this.hash(password);
    return h === u.passHash ? u : null;
  },

  async markLogin(username) {
    const list = Store.get(this.key, []);
    const u = list.find(x => x.username === username);
    if (u) { u.lastLogin = new Date().toISOString(); Store.set(this.key, list); }
  },

  lockKey: 'tw_login_lock',
  getLock() { return Store.get(this.lockKey, { count: 0, until: 0 }); },
  setLock(l) { Store.set(this.lockKey, l); },

  remainingLock() {
    const l = this.getLock();
    return l.until > Date.now() ? Math.ceil((l.until - Date.now()) / 1000) : 0;
  },

  async recordFail() {
    const l = this.getLock();
    if (l.until > Date.now()) return l;
    l.count = (l.count || 0) + 1;
    if (l.count >= 5) { l.until = Date.now() + 5 * 60 * 1000; l.count = 0; }
    this.setLock(l);
    return l;
  },

  resetLock() { this.setLock({ count: 0, until: 0 }); }
};

// ===== 图片上传辅助 =====
const AdminImageUpload = {
  MAX_SIZE: 2 * 1024 * 1024,

  setup(prefix) {
    setTimeout(() => {
      const fileInput   = document.getElementById(prefix + '-cover-file');
      const preview     = document.getElementById(prefix + '-cover-preview');
      const placeholder = document.getElementById(prefix + '-cover-placeholder');
      const urlInput    = document.getElementById(prefix + '-cover-url');
      const area        = document.getElementById(prefix + '-cover-area');
      if (!fileInput || !preview) return;

      fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        if (!file.type.startsWith('image/')) { Toast.error('请选择图片文件'); fileInput.value = ''; return; }
        this.compressFile(file, (dataUrl) => {
          preview.src = dataUrl;
          preview.style.display = 'block';
          if (placeholder) placeholder.style.display = 'none';
          if (urlInput) urlInput.value = '';
        });
      });

      if (urlInput) {
        urlInput.addEventListener('input', (e) => {
          const url = e.target.value.trim();
          if (url) {
            preview.src = url;
            preview.style.display = 'block';
            if (placeholder) placeholder.style.display = 'none';
          } else if (!fileInput.files[0]) {
            preview.src = '';
            preview.style.display = 'none';
            if (placeholder) placeholder.style.display = '';
          }
        });
      }

      if (area) {
        area.addEventListener('click', () => fileInput.click());
        area.addEventListener('dragover', (e) => { e.preventDefault(); area.classList.add('dragging'); });
        area.addEventListener('dragleave', () => area.classList.remove('dragging'));
        area.addEventListener('drop', (e) => {
          e.preventDefault();
          area.classList.remove('dragging');
          const file = e.dataTransfer.files[0];
          if (file) {
            const dt = new DataTransfer();
            dt.items.add(file);
            fileInput.files = dt.files;
            fileInput.dispatchEvent(new Event('change'));
          }
        });
      }
    }, 60);
  },

  clear(prefix) {
    const fileInput  = document.getElementById(prefix + '-cover-file');
    const preview    = document.getElementById(prefix + '-cover-preview');
    const placeholder= document.getElementById(prefix + '-cover-placeholder');
    const urlInput   = document.getElementById(prefix + '-cover-url');
    if (fileInput) fileInput.value = '';
    if (urlInput) urlInput.value = '';
    if (preview) { preview.src = ''; preview.style.display = 'none'; }
    if (placeholder) placeholder.style.display = '';
  },

  getValue(prefix) {
    const preview  = document.getElementById(prefix + '-cover-preview');
    const urlInput = document.getElementById(prefix + '-cover-url');
    if (preview && preview.src && preview.style.display !== 'none' && preview.src !== window.location.href) return preview.src;
    if (urlInput && urlInput.value.trim()) return urlInput.value.trim();
    return '';
  },

  // 通用：给任意 URL 输入框提供"上传图片"（压缩后写入 dataURL，并触发 input 事件联动预览）
  pickUrl(inputRef) {
    const input = typeof inputRef === 'string' ? document.getElementById(inputRef) : inputRef;
    if (!input) return;
    if (!this._pick) {
      this._pick = document.createElement('input');
      this._pick.type = 'file';
      this._pick.accept = 'image/*';
      this._pick.style.display = 'none';
      document.body.appendChild(this._pick);
    }
    const fi = this._pick;
    fi.value = '';
    fi.onchange = () => {
      const file = fi.files[0];
      if (!file) return;
      if (!file.type.startsWith('image/')) { Toast.error('请选择图片文件'); return; }
      this.compressFile(file, (dataUrl) => {
        input.value = dataUrl;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        Toast.success('图片已上传');
      });
    };
    fi.click();
  },

  // 交付：云模式上传到 Supabase Storage 并回传公开 URL；本地模式直接回传 dataURL
  _deliver(fileLike, dataUrl, done) {
    if (!Store.isCloud()) { done(dataUrl); return; }
    const mime = fileLike.type || (dataUrl.startsWith('data:image/png') ? 'image/png' : 'image/jpeg');
    const ext = mime.includes('png') ? 'png' : mime.includes('webp') ? 'webp' : 'jpg';
    Cloud.uploadImage(fileLike, ext)
      .then(pub => { done(pub); Toast.success('图片已上传'); })
      .catch(err => Toast.error('图片上传失败：' + ((err && err.message) || err)));
  },

  // 图片压缩：>2MB 拒绝；宽高 >1280px 或原文件 >300KB 时压缩（PNG 保留透明，过大转 JPEG）
  compressFile(file, done) {
    if (file.size > this.MAX_SIZE) { Toast.error('图片不能超过 2MB'); return; }
    const reader = new FileReader();
    reader.onload = (e) => {
      const raw = e.target.result;
      const img = new Image();
      img.onload = () => {
        const MAX = 1280;
        if (img.width <= MAX && img.height <= MAX && file.size < 300 * 1024) { this._deliver(file, raw, done); return; }
        const scale = Math.min(1, MAX / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        let out;
        if (file.type === 'image/png') {
          out = canvas.toDataURL('image/png');
          if (out.length > 350 * 1024) out = canvas.toDataURL('image/jpeg', 0.85);
        } else {
          out = canvas.toDataURL('image/jpeg', 0.85);
        }
        // 转 Blob 交付（云上传需要 Blob）
        fetch(out).then(r => r.blob()).then(blob => {
          const f2 = new File([blob], 'img', { type: blob.type || 'image/jpeg' });
          this._deliver(f2, out, done);
        }).catch(() => this._deliver(file, out, done));
      };
      img.onerror = () => this._deliver(file, raw, done);
      img.src = raw;
    };
    reader.readAsDataURL(file);
  }
};
window.AdminImageUpload = AdminImageUpload;

// ===== Modal 系统 =====
const AdminModal = {
  saveCallback: null,

  open(title, bodyHtml, saveCallback, size) {
    document.getElementById('modal-title').textContent = title;
    document.getElementById('modal-body').innerHTML = bodyHtml;
    document.getElementById('admin-modal').classList.add('active');
    this.saveCallback = saveCallback;
    const modal = document.querySelector('#admin-modal .modal');
    if (modal) modal.classList.toggle('modal-lg', size === 'lg');
  },

  close() {
    document.getElementById('admin-modal').classList.remove('active');
    document.querySelector('#admin-modal .modal')?.classList.remove('modal-lg');
    this.saveCallback = null;
  },

  save() {
    if (!this.saveCallback) { this.close(); return; }
    let r;
    try {
      r = this.saveCallback();
    } catch (err) {
      console.error('保存失败:', err);
      if (window.Toast && Toast.error) Toast.error('保存失败：' + (err && err.message ? err.message : err));
      return;
    }
    // 支持异步回调（如哈希计算）：Promise resolve false 时不关闭
    if (r && typeof r.then === 'function') {
      r.then(ok => { if (ok !== false) this.close(); })
       .catch(err => {
         console.error('保存失败:', err);
         if (window.Toast && Toast.error) Toast.error('保存失败：' + (err && err.message ? err.message : err));
       });
      return;
    }
    if (r === false) return;
    this.close();
  }
};

// ===== 订单管理 =====
const AdminOrders = {
  page: 1,
  pageSize: 10,

  render() {
    let orders = Store.getOrders();
    const keyword = document.getElementById('orders-search')?.value || '';
    const status = document.getElementById('orders-status-filter')?.value || '';

    if (keyword) orders = orders.filter(o => 
      o.id.includes(keyword) || o.name.includes(keyword) || (o.phone || '').includes(keyword)
    );
    if (status) orders = orders.filter(o => o.status === status);

    const total = orders.length;
    const totalPages = Math.ceil(total / this.pageSize);
    const start = (this.page - 1) * this.pageSize;
    const pageData = orders.slice(start, start + this.pageSize);

    document.getElementById('orders-pagination-info').textContent = `共 ${total} 条`;
    document.getElementById('orders-tbody').innerHTML = pageData.length ? pageData.map(o => `
      <tr>
        <td><strong>${o.id}</strong></td>
        <td><a href="../route-detail.html?id=${o.routeId}" target="_blank" style="color:var(--color-primary);">${o.routeTitle || '未选择线路'}</a></td>
        <td>${o.name}</td>
        <td>${o.phone}</td>
        <td>${o.travelDate || '-'}</td>
        <td>${o.people}人</td>
        <td><strong style="color:var(--color-accent);">¥${(o.totalPrice || 0).toLocaleString()}</strong></td>
        <td>
          <select class="form-control form-control-sm" style="width:100px;" onchange="AdminOrders.changeStatus('${o.id}', this.value)">
            <option value="pending" ${o.status==='pending'?'selected':''}>待处理</option>
            <option value="confirmed" ${o.status==='confirmed'?'selected':''}>已确认</option>
            <option value="completed" ${o.status==='completed'?'selected':''}>已完成</option>
            <option value="cancelled" ${o.status==='cancelled'?'selected':''}>已取消</option>
          </select>
        </td>
        <td>${o.createTime || '-'}</td>
        <td>
          <button class="action-btn danger" onclick="AdminOrders.delete('${o.id}')"><i class="fas fa-trash"></i></button>
        </td>
      </tr>
    `).join('') : '<tr><td colspan="10" style="text-align:center;padding:40px;color:var(--color-text-secondary);">暂无订单数据</td></tr>';

    this.renderPagination(totalPages);
  },

  renderPagination(totalPages) {
    const btns = document.getElementById('orders-pagination');
    if (totalPages <= 1) { btns.innerHTML = ''; return; }
    let html = `<button class="admin-pagination-btn" ${this.page<=1?'disabled':''} onclick="AdminOrders.page--;AdminOrders.render()"><i class="fas fa-chevron-left"></i></button>`;
    for (let i = 1; i <= totalPages; i++) {
      html += `<button class="admin-pagination-btn ${i===this.page?'active':''}" onclick="AdminOrders.page=${i};AdminOrders.render()">${i}</button>`;
    }
    html += `<button class="admin-pagination-btn" ${this.page>=totalPages?'disabled':''} onclick="AdminOrders.page++;AdminOrders.render()"><i class="fas fa-chevron-right"></i></button>`;
    btns.innerHTML = html;
  },

  async changeStatus(id, status) {
    if (Store.isCloud()) {
      const o = Cloud.cache.orders.find(x => x.id === id);
      if (o) { o.status = status; await Cloud.upsert('orders', o); }
    } else {
      Store.updateOrder(id, { status });
    }
    Toast.success('状态已更新');
    Admin.loadDashboard();
    Admin.updateBadges();
  },

  async delete(id) {
    if (confirm('确定要删除此订单吗？')) {
      if (Store.isCloud()) await Cloud.remove('orders', id);
      else Store.deleteOrder(id);
      this.render();
      Toast.success('订单已删除');
      Admin.loadDashboard();
      Admin.updateBadges();
    }
  }
};

// ===== 留言管理 =====
const AdminMessages = {
  page: 1,
  pageSize: 10,

  render() {
    let messages = Store.getMessages();
    const keyword = document.getElementById('messages-search')?.value || '';
    const status = document.getElementById('messages-status-filter')?.value || '';

    if (keyword) messages = messages.filter(m => 
      m.name.includes(keyword) || (m.phone || '').includes(keyword)
    );
    if (status) messages = messages.filter(m => m.status === status);

    const total = messages.length;
    const totalPages = Math.ceil(total / this.pageSize);
    const start = (this.page - 1) * this.pageSize;
    const pageData = messages.slice(start, start + this.pageSize);

    document.getElementById('messages-pagination-info').textContent = `共 ${total} 条`;
    document.getElementById('messages-tbody').innerHTML = pageData.length ? pageData.map(m => `
      <tr>
        <td>${m.id}</td>
        <td>${m.name}</td>
        <td>${m.phone}</td>
        <td>${m.subject || '-'}</td>
        <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${m.content || '-'}</td>
        <td><span class="status-badge ${m.status==='unread'?'warning':'success'}">${m.status==='unread'?'未回复':'已回复'}</span></td>
        <td>${m.createTime || '-'}</td>
        <td>
          <button class="action-btn primary" onclick="AdminMessages.showDetail('${m.id}')"><i class="fas fa-eye"></i></button>
          ${m.status==='unread' ? `<button class="action-btn success" onclick="AdminMessages.markReplied('${m.id}')"><i class="fas fa-check"></i></button>` : ''}
          <button class="action-btn danger" onclick="AdminMessages.delete('${m.id}')"><i class="fas fa-trash"></i></button>
        </td>
      </tr>
    `).join('') : '<tr><td colspan="8" style="text-align:center;padding:40px;color:var(--color-text-secondary);">暂无留言数据</td></tr>';

    this.renderPagination(totalPages);
  },

  renderPagination(totalPages) {
    const btns = document.getElementById('messages-pagination');
    if (totalPages <= 1) { btns.innerHTML = ''; return; }
    let html = `<button class="admin-pagination-btn" ${this.page<=1?'disabled':''} onclick="AdminMessages.page--;AdminMessages.render()"><i class="fas fa-chevron-left"></i></button>`;
    for (let i = 1; i <= totalPages; i++) {
      html += `<button class="admin-pagination-btn ${i===this.page?'active':''}" onclick="AdminMessages.page=${i};AdminMessages.render()">${i}</button>`;
    }
    html += `<button class="admin-pagination-btn" ${this.page>=totalPages?'disabled':''} onclick="AdminMessages.page++;AdminMessages.render()"><i class="fas fa-chevron-right"></i></button>`;
    btns.innerHTML = html;
  },

  showDetail(id) {
    const msg = Store.getMessages().find(m => m.id === id);
    if (!msg) return;
    if (!Store.isCloud()) Store.updateMessage(id, { status: 'replied' }); // 云模式在保存回复时统一落库

    const replyBox = `
      <div style="margin-top:16px;">
        <div style="font-size:12px;color:var(--color-text-secondary);margin-bottom:6px;">回复内容</div>
        <textarea class="admin-form-control" id="msg-reply-input" rows="3" placeholder="输入回复内容…">${msg.reply || ''}</textarea>
      </div>
    `;

    AdminModal.open('留言详情', `
      <div style="margin-bottom:16px;">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;font-size:14px;">
          <div><strong>姓名：</strong>${msg.name}</div>
          <div><strong>电话：</strong>${msg.phone}</div>
          <div><strong>邮箱：</strong>${msg.email || '-'}</div>
          <div><strong>时间：</strong>${msg.createTime || '-'}</div>
        </div>
      </div>
      <div style="margin-bottom:16px;">
        <div style="font-size:12px;color:var(--color-text-secondary);margin-bottom:6px;">咨询内容</div>
        <div style="background:var(--color-bg,#f8f9fa);padding:16px;border-radius:8px;font-size:14px;line-height:1.8;">${msg.content}</div>
      </div>
      ${msg.reply ? `
      <div style="margin-bottom:16px;">
        <div style="font-size:12px;color:var(--color-text-secondary);margin-bottom:6px;">我的回复</div>
        <div style="background:var(--color-primary-bg,#eef2ff);padding:16px;border-radius:8px;font-size:14px;line-height:1.8;color:var(--color-primary);">${msg.reply}</div>
      </div>
      ` : ''}
      ${replyBox}
    `, () => {
      const reply = document.getElementById('msg-reply-input')?.value.trim();
      if (!reply) { Toast.warning('请输入回复内容'); return false; }
      if (Store.isCloud()) {
        const m = Cloud.cache.messages.find(x => x.id === id);
        if (m) {
          m.reply = reply; m.status = 'replied';
          return Cloud.upsert('messages', m).then(() => {
            Toast.success('回复已保存');
            this.render();
            Admin.updateBadges();
          }).catch(err => { Toast.error('保存失败：' + ((err && err.message) || err)); });
        }
      } else {
        Store.updateMessage(id, { reply, status: 'replied' });
        Toast.success('回复已保存');
        this.render();
        Admin.updateBadges();
      }
    });
  },

  async markReplied(id) {
    if (Store.isCloud()) {
      const m = Cloud.cache.messages.find(x => x.id === id);
      if (m) { m.status = 'replied'; await Cloud.upsert('messages', m); }
    } else {
      Store.updateMessage(id, { status: 'replied' });
    }
    Toast.success('已标记为已回复');
    this.render();
    Admin.updateBadges();
  },

  async delete(id) {
    if (confirm('确定要删除此留言吗？')) {
      if (Store.isCloud()) await Cloud.remove('messages', id);
      else Store.deleteMessage(id);
      this.render();
      Toast.success('留言已删除');
      Admin.updateBadges();
    }
  }
};

// ===== 线路管理 =====
const AdminRoutes = {
  page: 1,
  pageSize: 8,
  data: [],
  editingId: null,

  async render() {
    this.data = await DataLoader.loadRoutes() || [];
    const total = this.data.length;
    const totalPages = Math.ceil(total / this.pageSize);
    const start = (this.page - 1) * this.pageSize;
    const pageData = this.data.slice(start, start + this.pageSize);

    document.getElementById('routes-pagination-info').textContent = `共 ${total} 条`;
    document.getElementById('routes-tbody').innerHTML = pageData.length ? pageData.map(r => `
      <tr>
        <td><img src="${esc(r.cover)}" alt="" class="image-preview" onerror="this.src='https://via.placeholder.com/80x50/E8F5E9/2E7D32?text=图'"></td>
        <td><a href="../route-detail.html?id=${esc(r.id)}" target="_blank" style="color:var(--color-primary);font-weight:500;">${esc(r.title)}</a></td>
        <td>${esc(r.destination)}</td>
        <td>${r.days}天</td>
        <td><strong style="color:var(--color-accent);">¥${(r.price||0).toLocaleString()}</strong></td>
        <td>
          <button class="action-btn ${r.status==='published'?'success':'warning'}" onclick="AdminRoutes.toggleStatus('${esc(r.id)}')">
            <i class="fas fa-${r.status==='published'?'eye':'eye-slash'}"></i> ${r.status==='published'?'已发布':'已下架'}
          </button>
        </td>
        <td>${(r.views||0).toLocaleString()}</td>
        <td>
          <button class="action-btn primary" onclick="AdminRoutes.showModal('${esc(r.id)}')"><i class="fas fa-edit"></i></button>
          <button class="action-btn danger" onclick="AdminRoutes.delete('${esc(r.id)}')"><i class="fas fa-trash"></i></button>
        </td>
      </tr>
    `).join('') : '<tr><td colspan="8" style="text-align:center;padding:40px;color:var(--color-text-secondary);">暂无线路数据</td></tr>';

    this.renderPagination(totalPages);
  },

  renderPagination(totalPages) {
    const btns = document.getElementById('routes-pagination');
    if (!btns) return;
    if (totalPages <= 1) { btns.innerHTML = ''; return; }
    let html = `<button class="admin-pagination-btn" ${this.page<=1?'disabled':''} onclick="AdminRoutes.page--;AdminRoutes.render()"><i class="fas fa-chevron-left"></i></button>`;
    for (let i = 1; i <= totalPages; i++) {
      html += `<button class="admin-pagination-btn ${i===this.page?'active':''}" onclick="AdminRoutes.page=${i};AdminRoutes.render()">${i}</button>`;
    }
    html += `<button class="admin-pagination-btn" ${this.page>=totalPages?'disabled':''} onclick="AdminRoutes.page++;AdminRoutes.render()"><i class="fas fa-chevron-right"></i></button>`;
    btns.innerHTML = html;
  },

  showModal(id = null) {
    this.editingId = id;
    const route = id ? this.data.find(r => r.id === id) : {
      id: 'R' + Date.now().toString().slice(-6),
      title: '', destination: '', days: 4, price: 0, originalPrice: 0,
      cover: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=600&q=80',
      tags: [], highlights: [], included: [], excluded: [],
      itinerary: [], status: 'published', featured: false, views: 0
    };

    const itineraryRows = (route.itinerary || []).map((it, i) => this.itineraryRowHtml(it, i + 1)).join('');
    const body = `
      <div class="admin-form-grid">
        <input type="hidden" id="r-id" value="${esc(route.id)}">
        <div class="form-group full"><label class="admin-form-label">线路名称</label><input type="text" class="admin-form-control" id="r-title" value="${esc(route.title)}" placeholder="例如：云南丽江大理6日深度游"></div>
        <div class="form-group"><label class="admin-form-label">目的地</label><input type="text" class="admin-form-control" id="r-destination" value="${esc(route.destination)}" placeholder="例如：云南"></div>
        <div class="form-group"><label class="admin-form-label">行程天数</label><input type="number" class="admin-form-control" id="r-days" value="${route.days}" min="1"></div>
        <div class="form-group"><label class="admin-form-label">现价（元/人）</label><input type="number" class="admin-form-control" id="r-price" value="${route.price}" min="0"></div>
        <div class="form-group"><label class="admin-form-label">原价（元/人）</label><input type="number" class="admin-form-control" id="r-originalPrice" value="${route.originalPrice || route.price}" min="0"></div>
        <div class="form-group"><label class="admin-form-label">封面图片</label><div class="image-uploader"><input type="file" id="r-cover-file" accept="image/*" style="display:none"><div class="image-uploader-area" id="r-cover-area"><img id="r-cover-preview" class="upload-preview" src="${esc(route.cover)}" style="${route.cover?'':'display:none;'}"><div class="image-uploader-placeholder" id="r-cover-placeholder" style="${route.cover?'display:none;':''}"><i class="fas fa-cloud-upload-alt"></i><p>点击或拖拽上传图片</p><small>支持 JPG / PNG / WebP，最大 2MB</small></div></div><div class="image-uploader-url-row"><input type="text" class="admin-form-control" id="r-cover-url" placeholder="或粘贴图片 URL" value="${esc(route.cover)}"><button type="button" class="btn btn-sm btn-secondary" onclick="AdminImageUpload.clear('r-cover')" style="flex-shrink:0;"><i class="fas fa-times"></i></button></div></div></div>
        <div class="form-group"><label class="admin-form-label">封面宽度（px）</label>
          <div style="display:flex;gap:8px;align-items:center;">
            <input type="number" class="admin-form-control" id="r-coverWidth" value="${route.coverWidth || ''}" min="200" max="3840" placeholder="留空则全宽自适应" style="width:120px;">
            <span style="font-size:12px;color:#888;">px（高度按图片比例自动计算）</span>
          </div>
        </div>
        <div class="form-group"><label class="admin-form-label">标签（逗号分隔）</label><input type="text" class="admin-form-control" id="r-tags" value="${esc(route.tags ? route.tags.join(',') : '')}" placeholder="热门,纯玩团,深度游"></div>
        <div class="form-group full" style="background:#f0f7ff;padding:12px;border-radius:8px;margin-top:8px;">
          <label class="admin-form-label" style="color:#1565c0;font-weight:700;">SEO Settings</label>
          <div class="form-group"><label class="admin-form-label">SEO Title</label><input type="text" class="admin-form-control" id="r-seoTitle" value="${esc(route.seoTitle || '')}" placeholder="Leave blank = auto"></div>
          <div class="form-group"><label class="admin-form-label">SEO Description</label><input type="text" class="admin-form-control" id="r-seoDescription" value="${esc(route.seoDescription || '')}" placeholder="80-160 chars"></div>
        </div>
        <div class="form-group"><label class="admin-form-label">封面图片宽度（px）</label>
          <div style="display:flex;gap:8px;align-items:center;">
            <input type="number" class="admin-form-control" id="r-heroWidth" value="${route.heroWidth || ''}" min="200" max="3840" placeholder="留空则全宽自适应" style="width:120px;">
            <span style="font-size:12px;color:#888;">px（高度按图片比例自动计算）</span>
          </div>
        </div>
        <div class="form-group full"><label class="admin-form-label">亮点（每行一个）</label><textarea class="admin-form-control" id="r-highlights" rows="3" placeholder="丽江古城&#10;玉龙雪山&#10;洱海">${esc(route.highlights ? route.highlights.join('\n') : '')}</textarea></div>
        <div class="form-group full"><label class="admin-form-label">费用包含（每行一个）</label><textarea class="admin-form-control" id="r-included" rows="3" placeholder="全程5晚特色客栈住宿&#10;行程所列景点门票">${esc(route.included ? route.included.join('\n') : '')}</textarea></div>
        <div class="form-group full"><label class="admin-form-label">费用不含（每行一个）</label><textarea class="admin-form-control" id="r-excluded" rows="3" placeholder="往返大交通&#10;个人消费">${esc(route.excluded ? route.excluded.join('\n') : '')}</textarea></div>
        <div class="form-group full">
          <label class="admin-form-label">详细行程（第 N 天，前台详情页按此渲染）</label>
          <div id="r-itinerary-rows">${itineraryRows || '<div class="empty-hint">暂无行程安排，点击下方按钮逐天添加</div>'}</div>
          <button type="button" class="btn btn-sm btn-secondary" onclick="AdminRoutes.addItineraryRow()"><i class="fas fa-plus"></i> 添加一天行程</button>
        </div>
        <div class="form-group"><label class="admin-form-label">状态</label><select class="admin-form-control" id="r-status"><option value="published" ${route.status==='published'?'selected':''}>发布</option><option value="draft" ${route.status==='draft'?'selected':''}>草稿</option></select></div>
        <div class="form-group"><label class="admin-form-label">推荐</label><select class="admin-form-control" id="r-featured"><option value="true" ${route.featured?'selected':''}>是</option><option value="false" ${!route.featured?'selected':''}>否</option></select></div>
      </div>
    `;

    AdminModal.open(id ? '编辑线路' : '新增线路', body, () => this.save(), 'lg');
    AdminImageUpload.setup('r');
  },

  itineraryRowHtml(it, day) {
    return `
      <div class="itin-row">
        <div class="itin-row-head">
          <span class="itin-day-badge">第 ${day} 天</span>
          <button type="button" class="btn-icon danger" onclick="AdminRoutes.removeItineraryRow(this)"><i class="fas fa-trash"></i></button>
        </div>
        <div class="grid2">
          <input type="text" class="admin-form-control itin-title" placeholder="当日主题（如：丽江古城漫步）" value="${esc(it.title)}">
          <div style="display:flex;gap:6px;align-items:center;min-width:0;">
            <input type="text" class="admin-form-control itin-image" style="flex:1;min-width:0;" placeholder="当日配图 URL（可选）" value="${esc(it.image)}">
            <button type="button" class="btn-icon upload" title="上传当日图片" onclick="AdminImageUpload.pickUrl(this.previousElementSibling)"><i class="fas fa-image"></i></button>
            <input type="number" class="admin-form-control itin-image-width" style="width:110px;" placeholder="宽度px" min="200" max="3840" title="当日图片宽度（留空全宽）" value="${esc(it.imageWidth)}">
          </div>
        </div>
        <textarea class="admin-form-control itin-desc" rows="2" placeholder="当日行程安排说明…">${esc(it.description)}</textarea>
      </div>`;
  },

  addItineraryRow() {
    const wrap = document.getElementById('r-itinerary-rows');
    if (!wrap) return;
    const empty = wrap.querySelector('.empty-hint');
    if (empty) empty.remove();
    wrap.insertAdjacentHTML('beforeend', this.itineraryRowHtml({}, wrap.querySelectorAll('.itin-row').length + 1));
  },

  removeItineraryRow(btn) {
    const row = btn.closest('.itin-row');
    if (row) row.remove();
    const wrap = document.getElementById('r-itinerary-rows');
    if (wrap) {
      wrap.querySelectorAll('.itin-row').forEach((r, i) => {
        const badge = r.querySelector('.itin-day-badge');
        if (badge) badge.textContent = '第 ' + (i + 1) + ' 天';
      });
      if (!wrap.querySelectorAll('.itin-row').length) {
        wrap.innerHTML = '<div class="empty-hint">暂无行程安排，点击下方按钮逐天添加</div>';
      }
    }
  },

  async save() {
    const title = document.getElementById('r-title').value.trim();
    if (!title) { Toast.error('请填写线路名称'); return false; }
    const days = parseInt(document.getElementById('r-days').value) || 4;
    const itinerary = Array.from(document.querySelectorAll('#r-itinerary-rows .itin-row')).map((row, i) => ({
      day: i + 1,
      title: row.querySelector('.itin-title') ? row.querySelector('.itin-title').value.trim() : '',
      description: row.querySelector('.itin-desc') ? row.querySelector('.itin-desc').value.trim() : '',
      image: row.querySelector('.itin-image') ? row.querySelector('.itin-image').value.trim() : '',
      imageWidth: parseInt(row.querySelector('.itin-image-width') ? row.querySelector('.itin-image-width').value : 0) || 0
    })).filter(t => t.title || t.description);

    const cover = AdminImageUpload.getValue('r');
    const coverWidth = parseInt(document.getElementById('r-coverWidth').value) || 0;
    const old = this.data.find(r => r.id === this.editingId);
    const route = {
      id: this.editingId || document.getElementById('r-id') ? document.getElementById('r-id').value : 'R' + Date.now().toString().slice(-6),
      title,
      destination: document.getElementById('r-destination').value.trim(),
      days,
      price: parseInt(document.getElementById('r-price').value) || 0,
      originalPrice: parseInt(document.getElementById('r-originalPrice').value) || 0,
      cover,
      coverWidth: coverWidth,
      tags: document.getElementById('r-tags').value.split(',').map(t => t.trim()).filter(Boolean),
      highlights: document.getElementById('r-highlights').value.split('\n').map(t => t.trim()).filter(Boolean),
      included: document.getElementById('r-included').value.split('\n').map(t => t.trim()).filter(Boolean),
      excluded: document.getElementById('r-excluded').value.split('\n').map(t => t.trim()).filter(Boolean),
      itinerary,
      status: document.getElementById('r-status').value,
      featured: document.getElementById('r-featured').value === 'true',
      views: old ? (old.views || 0) : 0,
      heroWidth: parseInt(document.getElementById('r-heroWidth').value) || 0,
      seoTitle: document.getElementById('r-seoTitle') ? document.getElementById('r-seoTitle').value.trim() : '',
      seoDescription: document.getElementById('r-seoDescription') ? document.getElementById('r-seoDescription').value.trim() : '',
      coverWidth,
      banner: cover,
      createdAt: old ? (old.createdAt || new Date().toISOString()) : new Date().toISOString()
    };

    const idx = this.data.findIndex(r => r.id === route.id);
    if (idx !== -1) this.data[idx] = route;
    else this.data.unshift(route);

    // 持久化：云模式 → Supabase（前台所有访客立即可见）；本地模式 → localStorage
    if (Store.isCloud()) await Cloud.upsert('routes', route);
    else Store.set('tw_routes', this.data);
    DataLoader.clearCache();
    Toast.success('线路保存成功！');
    this.render();
    Admin.loadDashboard();
  },

  async toggleStatus(id) {
    const route = this.data.find(r => r.id === id);
    if (route) {
      route.status = route.status === 'published' ? 'draft' : 'published';
      if (Store.isCloud()) await Cloud.upsert('routes', route);
      else Store.set('tw_routes', this.data);
      DataLoader.clearCache();
      this.render();
      Toast.show(route.status === 'published' ? '已发布' : '已下架');
    }
  },

  async delete(id) {
    if (confirm('确定要删除此线路吗？')) {
      this.data = this.data.filter(r => r.id !== id);
      if (Store.isCloud()) await Cloud.remove('routes', id);
      else Store.set('tw_routes', this.data);
      DataLoader.clearCache();
      this.render();
      Toast.success('线路已删除');
    }
  }
};
// ===== 目的地管理 =====
const AdminDestinations = {
  page: 1, pageSize: 8, data: [], editingId: null, allRoutes: [],

  async render() {
    this.data = await DataLoader.loadDestinations() || [];
    this.allRoutes = await DataLoader.loadRoutes() || [];
    const total = this.data.length;
    const totalPages = Math.ceil(total / this.pageSize);
    const start = (this.page - 1) * this.pageSize;
    const pageData = this.data.slice(start, start + this.pageSize);

    document.getElementById('destinations-pagination-info').textContent = `共 ${total} 条`;
    document.getElementById('destinations-tbody').innerHTML = pageData.length ? pageData.map(d => `
      <tr>
        <td><img src="${esc(d.cover)}" alt="" class="image-preview" onerror="this.src='https://via.placeholder.com/80x50/E8F5E9/2E7D32?text=图'"></td>
        <td><a href="../dest-detail.html?id=${esc(d.id)}" target="_blank" style="color:var(--color-primary);font-weight:500;">${esc(d.name)}</a></td>
        <td>${esc(d.region)}</td>
        <td>${esc((d.tags || []).join(', '))}</td>
        <td>${d.routeCount || 0}条</td>
        <td><span class="status-badge ${d.status==='published'?'success':'warning'}">${d.status==='published'?'已发布':'草稿'}</span></td>
        <td>${(d.views||0).toLocaleString()}</td>
        <td>
          <button class="action-btn primary" onclick="AdminDestinations.showModal('${esc(d.id)}')"><i class="fas fa-edit"></i></button>
          <button class="action-btn danger" onclick="AdminDestinations.delete('${esc(d.id)}')"><i class="fas fa-trash"></i></button>
        </td>
      </tr>
    `).join('') : '<tr><td colspan="8" style="text-align:center;padding:40px;">暂无数据</td></tr>';
    this.renderPagination(totalPages);
  },

  renderPagination(totalPages) {
    const btns = document.getElementById('destinations-pagination');
    if (!btns) return;
    if (totalPages <= 1) { btns.innerHTML = ''; return; }
    let html = `<button class="admin-pagination-btn" ${this.page<=1?'disabled':''} onclick="AdminDestinations.page--;AdminDestinations.render()"><i class="fas fa-chevron-left"></i></button>`;
    for (let i = 1; i <= totalPages; i++) html += `<button class="admin-pagination-btn ${i===this.page?'active':''}" onclick="AdminDestinations.page=${i};AdminDestinations.render()">${i}</button>`;
    html += `<button class="admin-pagination-btn" ${this.page>=totalPages?'disabled':''} onclick="AdminDestinations.page++;AdminDestinations.render()"><i class="fas fa-chevron-right"></i></button>`;
    btns.innerHTML = html;
  },

  showModal(id = null) {
    this.editingId = id;
    const dest = id ? this.data.find(d => d.id === id) : { id: 'D' + Date.now().toString().slice(-6), name:'', region:'', cover:'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800&q=80', tags:[], summary:'', content:'', highlights:[], recommendedRoutes:[], bestSeason:'', status:'published', featured:false, views:0, routeCount:0 };

    // 必游景点行
    const hlRows = (dest.highlights || []).map((h, i) => this.hlRowHtml(h, i + 1)).join('');
    // 推荐线路候选（全部已发布线路，勾选关联到详情页「相关推荐」）
    const chosen = (dest.recommendedRoutes || []).slice();
    const routeOpts = (this.allRoutes.length ? this.allRoutes : []).filter(r => r.status !== 'draft').map(r => `
      <label class="rec-opt"><input type="checkbox" class="rec-route-cb" value="${esc(r.id)}" ${chosen.includes(r.id) ? 'checked' : ''}> ${esc(r.title)}</label>
    `).join('') || '<p class="admin-note">暂无可选线路，请先在线路管理中创建</p>';

    const body = `
      <div class="admin-form-grid">
        <input type="hidden" id="d-id" value="${esc(dest.id)}">
        <div class="form-group"><label class="admin-form-label">名称</label><input type="text" class="admin-form-control" id="d-name" value="${esc(dest.name)}" placeholder="例如：丽江"></div>
        <div class="form-group"><label class="admin-form-label">所属区域</label><input type="text" class="admin-form-control" id="d-region" value="${esc(dest.region)}" placeholder="例如：云南"></div>
        <div class="form-group full"><label class="admin-form-label">封面图片</label><div class="image-uploader"><input type="file" id="d-cover-file" accept="image/*" style="display:none"><div class="image-uploader-area" id="d-cover-area"><img id="d-cover-preview" class="upload-preview" src="${esc(dest.cover)}" style="${dest.cover?'':'display:none;'}"><div class="image-uploader-placeholder" id="d-cover-placeholder" style="${dest.cover?'display:none;':''}"><i class="fas fa-cloud-upload-alt"></i><p>点击或拖拽上传图片</p><small>支持 JPG / PNG / WebP，最大 2MB</small></div></div><div class="image-uploader-url-row"><input type="text" class="admin-form-control" id="d-cover-url" placeholder="或粘贴图片 URL" value="${esc(dest.cover)}"><button type="button" class="btn btn-sm btn-secondary" onclick="AdminImageUpload.clear('d-cover')" style="flex-shrink:0;"><i class="fas fa-times"></i></button></div></div></div>
<div class="form-group"><label class="admin-form-label">封面图片宽度（px）</label>
          <div style="display:flex;gap:8px;align-items:center;">
            <input type="number" class="admin-form-control" id="d-coverWidth" value="${dest.coverWidth || ''}" min="200" max="3840" placeholder="留空则全宽自适应" style="width:120px;">
            <span style="font-size:12px;color:#888;">px</span>
          </div>
        </div>
        <div class="form-group full"><label class="admin-form-label">标签（逗号分隔）</label><input type="text" class="admin-form-control" id="d-tags" value="${esc(dest.tags ? dest.tags.join(',') : '')}" placeholder="古城,雪山,慢生活"></div>
        <div class="form-group full" style="background:#f0f7ff;padding:12px;border-radius:8px;margin-top:8px;">
          <label class="admin-form-label" style="color:#1565c0;font-weight:700;">SEO Settings</label>
          <div class="form-group"><label class="admin-form-label">SEO Title</label><input type="text" class="admin-form-control" id="d-seoTitle" value="${esc(dest.seoTitle || '')}" placeholder="Leave blank = auto"></div>
          <div class="form-group"><label class="admin-form-label">SEO Description</label><input type="text" class="admin-form-control" id="d-seoDescription" value="${esc(dest.seoDescription || '')}" placeholder="80-160 chars"></div>
        </div>
        <div class="form-group full"><label class="admin-form-label">简介</label><textarea class="admin-form-control" id="d-summary" rows="2">${esc(dest.summary)}</textarea></div>
        <div class="form-group full"><label class="admin-form-label">详细介绍（段落间空行分隔）</label><textarea class="admin-form-control" id="d-content" rows="6">${esc(dest.content)}</textarea></div>
        <div class="form-group full">
          <label class="admin-form-label">必游景点（名称 + 一句话介绍）</label>
          <div id="d-hl-rows">${hlRows || '<div class="empty-hint">暂无必游景点，点击下方按钮添加</div>'}</div>
          <button type="button" class="btn btn-sm btn-secondary" onclick="AdminDestinations.addHighlightRow()"><i class="fas fa-plus"></i> 添加景点</button>
        </div>
        <div class="form-group full">
          <label class="admin-form-label">推荐线路（勾选后出现在该目的地详情页「相关推荐」）</label>
          <div class="check-grid rec-grid">${routeOpts}</div>
        </div>
        <div class="form-group"><label class="admin-form-label">最佳季节</label><input type="text" class="admin-form-control" id="d-bestSeason" value="${esc(dest.bestSeason)}" placeholder="如：3-5月、9-11月"></div>
        <div class="form-group"><label class="admin-form-label">状态</label><select class="admin-form-control" id="d-status"><option value="published" ${dest.status==='published'?'selected':''}>发布</option><option value="draft" ${dest.status==='draft'?'selected':''}>草稿</option></select></div>
      </div>
    `;
    AdminModal.open(id ? '编辑目的地' : '新增目的地', body, () => this.save(), 'lg');
    AdminImageUpload.setup('d');
  },

  hlRowHtml(h, i) {
    return `
      <div class="mini-row">
        <input type="text" class="admin-form-control hl-name" placeholder="景点名称（如：玉龙雪山）" value="${esc(h.name || '')}">
        <input type="text" class="admin-form-control hl-desc" placeholder="一句话介绍" value="${esc(h.desc || '')}">
        <button type="button" class="btn-icon danger" onclick="AdminDestinations.removeHighlightRow(this)"><i class="fas fa-trash"></i></button>
      </div>`;
  },

  addHighlightRow() {
    const wrap = document.getElementById('d-hl-rows');
    if (!wrap) return;
    const empty = wrap.querySelector('.empty-hint');
    if (empty) empty.remove();
    wrap.insertAdjacentHTML('beforeend', this.hlRowHtml({}, wrap.querySelectorAll('.mini-row').length + 1));
  },

  removeHighlightRow(btn) {
    const row = btn.closest('.mini-row');
    if (row) row.remove();
    const wrap = document.getElementById('d-hl-rows');
    if (wrap && !wrap.querySelectorAll('.mini-row').length) {
      wrap.innerHTML = '<div class="empty-hint">暂无必游景点，点击下方按钮添加</div>';
    }
  },

  async save() {
    const name = document.getElementById('d-name').value.trim();
    if (!name) { Toast.error('请填写目的地名称'); return false; }
    const highlights = Array.from(document.querySelectorAll('#d-hl-rows .mini-row')).map(row => ({
      name: row.querySelector('.hl-name') ? row.querySelector('.hl-name').value.trim() : '',
      desc: row.querySelector('.hl-desc') ? row.querySelector('.hl-desc').value.trim() : ''
    })).filter(h => h.name || h.desc);
    const recommendedRoutes = Array.from(document.querySelectorAll('.rec-route-cb:checked')).map(cb => cb.value);
    const cover = AdminImageUpload.getValue('d');
    const coverWidth = parseInt(document.getElementById('d-coverWidth').value) || 0;
    const old = this.data.find(d => d.id === this.editingId);
    const region = document.getElementById('d-region').value.trim();

    const dest = {
      id: this.editingId || document.getElementById('d-id') ? document.getElementById('d-id').value : 'D' + Date.now().toString().slice(-6),
      name, region,
      cover,
      coverWidth,
      images: [cover],
      tags: document.getElementById('d-tags').value.split(',').map(t => t.trim()).filter(Boolean),
      summary: document.getElementById('d-summary').value,
      content: document.getElementById('d-content').value,
      highlights,
      recommendedRoutes,
      routeCount: (this.allRoutes || []).filter(r => (r.destination === region || r.destination === name) && r.status !== 'draft').length,
      bestSeason: document.getElementById('d-bestSeason').value,
      status: document.getElementById('d-status').value,
      featured: old ? !!old.featured : false,
      views: old ? (old.views || 0) : 0,
      createdAt: old ? (old.createdAt || new Date().toISOString()) : new Date().toISOString(),
      seoTitle: document.getElementById('d-seoTitle') ? document.getElementById('d-seoTitle').value.trim() : '',
      seoDescription: document.getElementById('d-seoDescription') ? document.getElementById('d-seoDescription').value.trim() : ''
    };
    const idx = this.data.findIndex(d => d.id === dest.id);
    if (idx !== -1) this.data[idx] = dest;
    else this.data.unshift(dest);
    if (Store.isCloud()) await Cloud.upsert('destinations', dest);
    else Store.set('tw_destinations', this.data);
    DataLoader.clearCache();
    Toast.success('目的地保存成功！');
    this.render();
  },

  async delete(id) {
    if (confirm('确定删除该目的地？')) {
      this.data = this.data.filter(d => d.id !== id);
      if (Store.isCloud()) await Cloud.remove('destinations', id);
      else Store.set('tw_destinations', this.data);
      DataLoader.clearCache();
      this.render();
      Toast.success('已删除');
    }
  }
};
// ===== 攻略管理 =====
const AdminGuides = {
  page: 1, pageSize: 8, data: [], editingId: null,

  async render() {
    this.data = await DataLoader.loadGuides() || [];
    const total = this.data.length;
    const totalPages = Math.ceil(total / this.pageSize);
    const start = (this.page - 1) * this.pageSize;
    const pageData = this.data.slice(start, start + this.pageSize);

    document.getElementById('guides-pagination-info').textContent = `共 ${total} 条`;
    document.getElementById('guides-tbody').innerHTML = pageData.length ? pageData.map(g => `
      <tr>
        <td><img src="${esc(g.cover)}" alt="" class="image-preview" onerror="this.src='https://via.placeholder.com/80x50/E8F5E9/2E7D32?text=图'"></td>
        <td><a href="../guide-detail.html?id=${esc(g.id)}" target="_blank" style="color:var(--color-primary);font-weight:500;">${esc(g.title)}</a></td>
        <td>${esc(g.category || '-')}</td>
        <td>${esc(g.author || '旅途旅行')}</td>
        <td>${(g.views||0).toLocaleString()}</td>
        <td>${(g.likes||0).toLocaleString()}</td>
        <td><span class="status-badge ${g.status==='published'?'success':'warning'}">${g.status==='published'?'已发布':'草稿'}</span></td>
        <td>
          <button class="action-btn primary" onclick="AdminGuides.showModal('${esc(g.id)}')"><i class="fas fa-edit"></i></button>
          <button class="action-btn danger" onclick="AdminGuides.delete('${esc(g.id)}')"><i class="fas fa-trash"></i></button>
        </td>
      </tr>
    `).join('') : '<tr><td colspan="8" style="text-align:center;padding:40px;">暂无数据</td></tr>';
    this.renderPagination(totalPages);
  },

  renderPagination(totalPages) {
    const btns = document.getElementById('guides-pagination');
    if (!btns) return;
    if (totalPages <= 1) { btns.innerHTML = ''; return; }
    let html = `<button class="admin-pagination-btn" ${this.page<=1?'disabled':''} onclick="AdminGuides.page--;AdminGuides.render()"><i class="fas fa-chevron-left"></i></button>`;
    for (let i = 1; i <= totalPages; i++) html += `<button class="admin-pagination-btn ${i===this.page?'active':''}" onclick="AdminGuides.page=${i};AdminGuides.render()">${i}</button>`;
    html += `<button class="admin-pagination-btn" ${this.page>=totalPages?'disabled':''} onclick="AdminGuides.page++;AdminGuides.render()"><i class="fas fa-chevron-right"></i></button>`;
    btns.innerHTML = html;
  },

  showModal(id = null) {
    this.editingId = id;
    const guide = id ? this.data.find(g => g.id === id) : { id:'G'+Date.now().toString().slice(-6), title:'', cover:'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800&q=80', category:'旅行攻略', summary:'', content:'', author:'旅途旅行', publishTime:new Date().toISOString().split('T')[0], status:'published', featured:false, views:0, likes:0 };
    const body = `
      <div class="admin-form-grid">
        <input type="hidden" id="g-id" value="${esc(guide.id)}">
        <div class="form-group full"><label class="admin-form-label">标题</label><input type="text" class="admin-form-control" id="g-title" value="${esc(guide.title)}" placeholder="例如：丽江深度游全攻略"></div>
        <div class="form-group"><label class="admin-form-label">分类</label><select class="admin-form-control" id="g-category"><option value="旅行攻略" ${guide.category==='旅行攻略'?'selected':''}>旅行攻略</option><option value="摄影攻略" ${guide.category==='摄影攻略'?'selected':''}>摄影攻略</option><option value="出行贴士" ${guide.category==='出行贴士'?'selected':''}>出行贴士</option><option value="穿搭攻略" ${guide.category==='穿搭攻略'?'selected':''}>穿搭攻略</option></select></div>
        <div class="form-group"><label class="admin-form-label">作者</label><input type="text" class="admin-form-control" id="g-author" value="${esc(guide.author)}"></div>
        <div class="form-group full"><label class="admin-form-label">封面图片</label><div class="image-uploader"><input type="file" id="g-cover-file" accept="image/*" style="display:none"><div class="image-uploader-area" id="g-cover-area"><img id="g-cover-preview" class="upload-preview" src="${esc(guide.cover)}" style="${guide.cover?'':'display:none;'}"><div class="image-uploader-placeholder" id="g-cover-placeholder" style="${guide.cover?'display:none;':''}"><i class="fas fa-cloud-upload-alt"></i><p>点击或拖拽上传图片</p><small>支持 JPG / PNG / WebP，最大 2MB</small></div></div><div class="image-uploader-url-row"><input type="text" class="admin-form-control" id="g-cover-url" placeholder="或粘贴图片 URL" value="${esc(guide.cover)}"><button type="button" class="btn btn-sm btn-secondary" onclick="AdminImageUpload.clear('g-cover')" style="flex-shrink:0;"><i class="fas fa-times"></i></button>
        <div class="form-group"><label class="admin-form-label">封面图片宽度（px）</label>
          <div style="display:flex;gap:8px;align-items:center;">
            <input type="number" class="admin-form-control" id="g-coverWidth" value="${guide.coverWidth || ''}" min="200" max="3840" placeholder="留空则全宽自适应" style="width:120px;">
            <span style="font-size:12px;color:#888;">px</span>
          </div>
        </div></div></div></div>
        
        <div class="form-group full" style="background:#f0f7ff;padding:12px;border-radius:8px;margin-top:8px;">
          <label class="admin-form-label" style="color:#1565c0;font-weight:700;">SEO Settings</label>
          <div class="form-group"><label class="admin-form-label">SEO Title</label><input type="text" class="admin-form-control" id="g-seoTitle" value="${esc(guide.seoTitle || '')}" placeholder="Leave blank = auto"></div>
          <div class="form-group"><label class="admin-form-label">SEO Description</label><input type="text" class="admin-form-control" id="g-seoDescription" value="${esc(guide.seoDescription || '')}" placeholder="80-160 chars"></div>
        </div>
        <div class="form-group full"><label class="admin-form-label">摘要</label><textarea class="admin-form-control" id="g-summary" rows="2">${esc(guide.summary)}</textarea></div>
        <div class="form-group full"><label class="admin-form-label">正文内容（## 标题，段落空行分隔）</label><textarea class="admin-form-control" id="g-content" rows="10" placeholder="## 标题&#10;&#10;正文内容...">${esc(guide.content)}</textarea></div>
        <div class="form-group"><label class="admin-form-label">发布日期</label><input type="date" class="admin-form-control" id="g-publishTime" value="${esc(guide.publishTime)}"></div>
        <div class="form-group"><label class="admin-form-label">状态</label><select class="admin-form-control" id="g-status"><option value="published" ${guide.status==='published'?'selected':''}>发布</option><option value="draft" ${guide.status==='draft'?'selected':''}>草稿</option></select></div>
      </div>
    `;
    AdminModal.open(id ? '编辑攻略' : '新增攻略', body, () => this.save(), 'lg');
    AdminImageUpload.setup('g')
    AdminImageUpload.setup('hp-about-hero');
    AdminImageUpload.setup('hp-about-story');;
  },

  async save() {
    const title = document.getElementById('g-title').value.trim();
    if (!title) { Toast.error('请填写攻略标题'); return false; }
    const old = this.data.find(g => g.id === this.editingId);
    const guide = {
      id: this.editingId || document.getElementById('g-id') ? document.getElementById('g-id').value : 'G' + Date.now().toString().slice(-6),
      title,
      category: document.getElementById('g-category').value,
      cover: AdminImageUpload.getValue('g'),
      coverWidth: parseInt(document.getElementById('g-coverWidth').value) || 0,
      summary: document.getElementById('g-summary').value,
      content: document.getElementById('g-content').value,
      author: document.getElementById('g-author').value.trim() || '旅途旅行',
      publishTime: document.getElementById('g-publishTime').value,
      status: document.getElementById('g-status').value,
      featured: old ? !!old.featured : false,
      views: old ? (old.views || 0) : 0,
      likes: old ? (old.likes || 0) : 0,
      createdAt: old ? (old.createdAt || new Date().toISOString()) : new Date().toISOString(),
      seoTitle: document.getElementById('g-seoTitle') ? document.getElementById('g-seoTitle').value.trim() : '',
      seoDescription: document.getElementById('g-seoDescription') ? document.getElementById('g-seoDescription').value.trim() : ''
    };
    const idx = this.data.findIndex(g => g.id === guide.id);
    if (idx !== -1) this.data[idx] = guide;
    else this.data.unshift(guide);
    if (Store.isCloud()) await Cloud.upsert('guides', guide);
    else Store.set('tw_guides', this.data);
    DataLoader.clearCache();
    Toast.success('攻略保存成功！');
    this.render();
  },

  async delete(id) {
    if (confirm('确定删除该攻略？')) {
      this.data = this.data.filter(g => g.id !== id);
      if (Store.isCloud()) await Cloud.remove('guides', id);
      else Store.set('tw_guides', this.data);
      DataLoader.clearCache();
      this.render();
      Toast.success('已删除');
    }
  }
};
// ===== 首页配置 =====
const AdminHomepage = {
  async load() {
    const settings = (await Settings.ensureSeeded()) || Settings.get() || {};
    const s = Settings.get() || {};

    // 轮播图行
    const rowsEl = document.getElementById('hp-banner-rows');
    if (rowsEl) {
      rowsEl.innerHTML = '';
      const banner = s.banner || {};
      const imgs = banner.images || [];
      const titles = banner.titles || [];
      const subs = banner.subtitles || [];
      imgs.forEach((img, i) => { if (img) this.addBannerRow({ image: img, title: titles[i], subtitle: subs[i] }); });
      if (!imgs.length) this.addBannerRow({});
    }

    // 游客评价行
    const tEl = document.getElementById('hp-testimonial-rows');
    if (tEl) {
      tEl.innerHTML = '';
      const list = s.testimonials || [];
      list.forEach(t => this.addTestimonialRow(t));
      if (!list.length) this.addTestimonialRow({});
    }

    // 推荐位勾选项
    const [routes, dests, guides] = await Promise.all([
      DataLoader.loadRoutes(), DataLoader.loadDestinations(), DataLoader.loadGuides()
    ]);
    const chosenR = s.featuredRoutes || [];
    const chosenD = s.featuredDestinations || [];
    const chosenG = s.featuredGuides || [];
    const optsEl = document.getElementById('hp-routes-opts');
    if (optsEl) optsEl.innerHTML = (routes || []).filter(r => r.status !== 'draft').map(r =>
      `<label><input type="checkbox" value="${esc(r.id)}" ${chosenR.includes(r.id) ? 'checked' : ''}> ${esc(r.title)}</label>`).join('') || '<p class="admin-note">暂无已发布线路</p>';
    const optsDEl = document.getElementById('hp-dests-opts');
    if (optsDEl) optsDEl.innerHTML = (dests || []).filter(d => d.status !== 'draft').map(d =>
      `<label><input type="checkbox" value="${esc(d.id)}" ${chosenD.includes(d.id) ? 'checked' : ''}> ${esc(d.name)}</label>`).join('') || '<p class="admin-note">暂无已发布目的地</p>';
    const optsGEl = document.getElementById('hp-guides-opts');
    if (optsGEl) optsGEl.innerHTML = (guides || []).filter(g => g.status !== 'draft').map(g =>
      `<label><input type="checkbox" value="${esc(g.id)}" ${chosenG.includes(g.id) ? 'checked' : ''}> ${esc(g.title)}</label>`).join('') || '<p class="admin-note">暂无已发布攻略</p>';

    const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v || ''; };
    set('hp-announcement', s.announcement);
    const ac = s.aboutContent || {};
    set('hp-about', ac.aboutText);
    set('hp-about-hero-url', ac.heroImage);
    set('hp-about-hero-width', ac.heroImageWidth);
    if (ac.teamImages && ac.teamImages.length > 0) {
      ac.teamImages.forEach(function(item) { AdminHomepage.addTeamImageRow(item); });
    } else if (ac.storyImage) {
      AdminHomepage.addTeamImageRow({url: ac.storyImage, width: ac.storyImageWidth || 0});
    }
    this.loadFooterData(s);
  },

  addBannerRow(data = {}) {
    const rows = document.getElementById('hp-banner-rows');
    if (!rows) return;
    if (rows.querySelectorAll('.hp-row').length >= 5) { Toast.warning('轮播图最多 5 张'); return; }
    const div = document.createElement('div');
    div.className = 'hp-row';
    div.innerHTML = `
      <img class="hp-img-pv" alt="预览">
      <input type="text" class="form-control hp-img-url" placeholder="图片 URL（必填）">
      <button type="button" class="btn-icon upload" title="上传图片" onclick="AdminImageUpload.pickUrl(this.previousElementSibling)"><i class="fas fa-image"></i></button>
      <input type="text" class="form-control hp-img-title" placeholder="主标题（可空）">
      <input type="text" class="form-control hp-img-sub" placeholder="副标题（可空）">
      <button type="button" class="btn-icon danger" onclick="this.closest('.hp-row').remove()" title="删除"><i class="fas fa-trash"></i></button>`;
    rows.appendChild(div);
    const img = div.querySelector('img');
    const urlIn = div.querySelector('.hp-img-url');
    const applyPreview = () => {
      const url = urlIn.value.trim();
      if (!url) { img.removeAttribute('src'); img.style.visibility = 'hidden'; return; }
      img.src = url; img.style.visibility = 'visible';
    };
    urlIn.addEventListener('input', applyPreview);
    img.addEventListener('error', () => { img.style.visibility = 'hidden'; });
    if (data.image) urlIn.value = data.image;
    div.querySelector('.hp-img-title').value = data.title || '';
    div.querySelector('.hp-img-sub').value = data.subtitle || '';
    applyPreview();
    return div;
  },

  addTestimonialRow(t = {}) {
    const rows = document.getElementById('hp-testimonial-rows');
    if (!rows) return;
    if (rows.querySelectorAll('.hp-row').length >= 8) { Toast.warning('评价最多 8 条（前台展示 3 条）'); return; }
    const div = document.createElement('div');
    div.className = 'hp-row';
    const rating = t.rating || 5;
    const starOpts = [5, 4, 3, 2, 1].map(n =>
      `<option value="${n}" ${Number(rating) === n ? 'selected' : ''}>${'★'.repeat(n)}${'☆'.repeat(5 - n)}</option>`).join('');
    div.innerHTML = `
      <input type="text" class="form-control t-name" style="flex:0 0 110px;" placeholder="姓名（必填）">
      <input type="text" class="form-control t-from" style="flex:0 0 150px;" placeholder="来自（如：北京 · 云南6日游）">
      <input type="text" class="form-control t-avatar" style="flex:0 0 150px;" placeholder="头像图片 URL（可空）">
      <button type="button" class="btn-icon upload" title="上传头像" onclick="AdminImageUpload.pickUrl(this.previousElementSibling)"><i class="fas fa-image"></i></button>
      <select class="form-control t-rating" style="flex:0 0 130px;">${starOpts}</select>
      <textarea class="form-control t-text" rows="2" style="flex:2 1 240px;" placeholder="评价内容（必填）"></textarea>
      <button type="button" class="btn-icon danger" onclick="this.closest('.hp-row').remove()" title="删除"><i class="fas fa-trash"></i></button>`;
    rows.appendChild(div);
    div.querySelector('.t-name').value = t.name || '';
    div.querySelector('.t-from').value = t.from || '';
    div.querySelector('.t-avatar').value = t.avatar || '';
    div.querySelector('.t-text').value = t.text || '';
    return div;
  },

  addTeamImageRow(item) {
    item = item || {};
    var rows = document.getElementById('hp-about-team-rows');
    if (!rows) return;
    if (document.querySelectorAll('.ti-row').length >= 8) { Toast && Toast.warning && Toast.warning('最多 8 张图片'); return; }
    var row = document.createElement('div');
    row.className = 'ti-row';
    row.innerHTML = '<img class="ti-img-pv" src="" style="display:none;width:80px;height:60px;object-fit:cover;border-radius:6px;flex-shrink:0;">' +
      '<input type="text" class="ti-img-url form-control" placeholder="图片URL" value="">' +
      '<button type="button" class="btn-icon" title="上传" onclick="var inp=this.previousElementSibling;AdminImageUpload.pickUrl(inp)"><i class="fas fa-upload"></i></button>' +
      '<input type="number" class="ti-img-w form-control" placeholder="宽度px" min="200" max="3840" value="" style="width:90px;">' +
      '<input type="text" class="ti-img-name form-control" placeholder="姓名" value="" style="width:90px;">' +
      '<input type="text" class="ti-img-title form-control" placeholder="职位" value="" style="width:130px;">' +
      '<button type="button" class="btn-icon" title="删除" onclick="this.closest(\'.ti-row\').remove();"><i class="fas fa-trash"></i></button>';
    rows.appendChild(row);
    var urlIn = row.querySelector('.ti-img-url');
    var pvImg = row.querySelector('.ti-img-pv');
    var wIn = row.querySelector('.ti-img-w');
    if (item.url) { urlIn.value = item.url; pvImg.src = item.url; pvImg.style.display = 'block'; if (item.width) wIn.value = item.width; }
    var nameIn = row.querySelector('.ti-img-name'); if (nameIn) nameIn.value = item.name || '';
    var titleIn = row.querySelector('.ti-img-title'); if (titleIn) titleIn.value = item.title || '';
    urlIn.oninput = function() { var url = urlIn.value.trim(); pvImg.src = url; pvImg.style.display = url ? 'block' : 'none'; };
  },

  async save() {
    const banner = { images: [], titles: [], subtitles: [] };
    document.querySelectorAll('#hp-banner-rows .hp-row').forEach(row => {
      const img = row.querySelector('.hp-img-url').value.trim();
      if (!img) return;
      banner.images.push(img);
      banner.titles.push(row.querySelector('.hp-img-title').value.trim());
      banner.subtitles.push(row.querySelector('.hp-img-sub').value.trim());
    });
    if (!banner.images.length) { Toast.error('请至少保留一张轮播图'); return; }

    const pick = sel => Array.from(document.querySelectorAll(sel)).map(i => i.value);
    const featuredRoutes = pick('#hp-routes-opts input:checked');
    const featuredDestinations = pick('#hp-dests-opts input:checked');
    const featuredGuides = pick('#hp-guides-opts input:checked');

    const testimonials = Array.from(document.querySelectorAll('#hp-testimonial-rows .hp-row')).map(row => ({
      name: row.querySelector('.t-name').value.trim(),
      from: row.querySelector('.t-from').value.trim(),
      avatar: row.querySelector('.t-avatar').value.trim(),
      rating: parseInt(row.querySelector('.t-rating').value, 10) || 5,
      text: row.querySelector('.t-text').value.trim()
    }));  const fData=this.collectFooterData();

    const g = id => { const el = document.getElementById(id); return el ? el.value.trim() : ''; };
    await Settings.save({
      banner,
      featuredRoutes,
      featuredDestinations,
      featuredGuides,
      announcement: g('hp-announcement'),
      aboutContent: Object.assign(
        {},
        ((Settings.get() || {}).aboutContent) || {},
        {
          heroImage: document.getElementById('hp-about-hero-url').value.trim(),
          heroImageWidth: parseInt(document.getElementById('hp-about-hero-width').value) || 0,
          teamImages: Array.from(document.querySelectorAll('.ti-row')).map(function(row) {
            var nEl = row.querySelector('.ti-img-name');
            var tEl = row.querySelector('.ti-img-title');
            return {
              url: row.querySelector('.ti-img-url').value.trim(),
              width: parseInt(row.querySelector('.ti-img-w').value) || 0,
              name: nEl ? nEl.value.trim() : '',
              title: tEl ? tEl.value.trim() : ''
            };
          }).filter(function(item) { return item.url; }),
          aboutText: g('hp-about')
        }
      ),
      testimonials,
      footerQuickLinks: (fData||{}).footerQuickLinks || [],
      footerDestLinks: (fData||{}).footerDestLinks || [],
      footerSitemap: (fData||{}).footerSitemap || ''
    });
    DataLoader.clearCache();
    Toast.success('首页配置已保存，刷新前台页面即可生效！');
  },
  addFooterLinkRow(type, data) {
    data = data || { label: '', href: '' };
    var rowsId = type === 'quick' ? 'hp-footer-quick-rows' : 'hp-footer-dest-rows';
    var rows = document.getElementById(rowsId);
    if (!rows) return;
    if (rows.querySelectorAll('.fl-row').length >= 8) { Toast && Toast.warning && Toast.warning('最多 8 条'); return; }
    var div = document.createElement('div');
    div.className = 'fl-row';
    div.style.cssText = 'display:flex;gap:8px;align-items:center;margin-bottom:6px;';
    div.innerHTML = `<input type="text" class="form-control fl-label" placeholder="链接文字" value="${(data.label||'').replace(/"/g,'&quot;')}" style="flex:1;">` +
      `<input type="text" class="form-control fl-href" placeholder="/routes 或 https://..." value="${(data.href||'').replace(/"/g,'&quot;')}" style="flex:2;">` +
      `<button type="button" class="btn-icon" onclick="this.closest('.fl-row').remove()" title="删除"><i class="fas fa-trash"></i></button>`;
    rows.appendChild(div);
  },

  loadFooterData(s) {
    var ql = s.footerQuickLinks || [
      { label: 'Tours', href: '/routes' },
      { label: 'Top Destinations', href: '/destinations' },
      { label: 'Travel Guides', href: '/guides' },
      { label: 'About Us', href: 'about.html' }
    ];
    var dl = s.footerDestLinks || [
      { label: 'Yunnan', href: '/destinations' },
      { label: 'Sichuan', href: '/destinations' },
      { label: 'Tibet', href: '/destinations' },
      { label: 'Guangxi', href: '/destinations' }
    ];
    var qr = document.getElementById('hp-footer-quick-rows');
    var dr = document.getElementById('hp-footer-dest-rows');
    if (qr) qr.innerHTML = '';
    if (dr) dr.innerHTML = '';
    var _self = this;
    ql.forEach(function(item) { _self.addFooterLinkRow('quick', item); });
    dl.forEach(function(item) { _self.addFooterLinkRow('dest', item); });
    var sm = document.getElementById('hp-footer-sitemap');
    if (sm) sm.value = s.footerSitemap || '';
  },

  collectFooterData() {
    var ql = Array.from(document.querySelectorAll('#hp-footer-quick-rows .fl-row'))
      .map(function(row) { return { label: row.querySelector('.fl-label').value.trim(), href: row.querySelector('.fl-href').value.trim() }})
      .filter(function(r) { return r.label && r.href; });
    var dl = Array.from(document.querySelectorAll('#hp-footer-dest-rows .fl-row'))
      .map(function(row) { return { label: row.querySelector('.fl-label').value.trim(), href: row.querySelector('.fl-href').value.trim() } })
      .filter(function(r) { return r.label && r.href; });
    var sitemap = (document.getElementById('hp-footer-sitemap') || { value: '' }).value.trim();
    return { footerQuickLinks: ql, footerDestLinks: dl, footerSitemap: sitemap };
  },
};

// ===== 联系我们页面配置（含联系卡片与 FAQ） =====
const AdminContact = {
  cardLimit: 6,
  faqLimit: 20,

  async load() {
    const s = await DataLoader.loadSettings() || {};
    const cc = s.contactContent || {};
    document.getElementById('ct-subtitle').value = cc.subtitle || '';
    // 卡片
    const cardEl = document.getElementById('ct-card-rows');
    if (cardEl) {
      cardEl.innerHTML = '';
      const list = cc.cards || [];
      list.forEach(it => this.addCard(it));
      if (!list.length) this.addCard({});
    }
    // FAQ
    const faqEl = document.getElementById('ct-faq-rows');
    if (faqEl) {
      faqEl.innerHTML = '';
      const list = cc.faqs || [];
      list.forEach(it => this.addFaq(it));
      if (!list.length) this.addFaq({});
    }
  },

  addCard(data) {
    const rows = document.getElementById('ct-card-rows');
    if (!rows) return;
    if (rows.querySelectorAll('.ct-card-row').length >= this.cardLimit) { Toast.warning('最多 ' + this.cardLimit + ' 张卡片'); return; }
    const d = data || {};
    const div = document.createElement('div');
    div.className = 'mini-row ct-card-row';
    div.style.cssText = 'display:flex;gap:8px;align-items:center;margin-bottom:8px;flex-wrap:wrap;';
    div.innerHTML =
      '<input type="text" class="form-control ct-card-icon" placeholder="图标 fa-phone-alt" value="' + (d.icon || 'fa-phone-alt').replace(/"/g, '&quot;') + '" style="width:160px;">' +
      '<input type="text" class="form-control ct-card-title" placeholder="标题" value="' + (d.title || '').replace(/"/g, '&quot;') + '" style="width:140px;">' +
      '<input type="text" class="form-control ct-card-value" placeholder="主内容" value="' + (d.value || '').replace(/"/g, '&quot;') + '" style="flex:2;min-width:160px;">' +
      '<input type="text" class="form-control ct-card-sub" placeholder="辅助说明" value="' + (d.sub || '').replace(/"/g, '&quot;') + '" style="flex:1;min-width:140px;">' +
      '<button type="button" class="btn-icon" onclick="this.closest(\'\.ct-card-row\').remove()" title="删除"><i class="fas fa-trash"></i></button>';
    rows.appendChild(div);
  },

  addFaq(data) {
    const rows = document.getElementById('ct-faq-rows');
    if (!rows) return;
    if (rows.querySelectorAll('.ct-faq-row').length >= this.faqLimit) { Toast.warning('最多 ' + this.faqLimit + ' 条 FAQ'); return; }
    const d = data || {};
    const div = document.createElement('div');
    div.className = 'ct-faq-row';
    div.style.cssText = 'display:flex;gap:8px;align-items:flex-start;margin-bottom:10px;padding:10px;background:#fafbfc;border-radius:8px;';
    div.innerHTML =
      '<div style="flex:1;display:flex;flex-direction:column;gap:6px;">' +
        '<input type="text" class="form-control ct-faq-q" placeholder="问题" value="' + (d.q || '').replace(/"/g, '&quot;') + '">' +
        '<textarea class="form-control ct-faq-a" rows="2" placeholder="答案（支持多行）">' + (d.a || '').replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</textarea>' +
      '</div>' +
      '<button type="button" class="btn-icon" onclick="this.closest(\'\.ct-faq-row\').remove()" title="删除" style="margin-top:4px;"><i class="fas fa-trash"></i></button>';
    rows.appendChild(div);
  },

  async save() {
    try {
    const subtitle = document.getElementById('ct-subtitle').value.trim();
    const cards = Array.from(document.querySelectorAll('.ct-card-row')).map(function(row) {
      return {
        icon: row.querySelector('.ct-card-icon').value.trim() || 'fa-phone-alt',
        title: row.querySelector('.ct-card-title').value.trim(),
        value: row.querySelector('.ct-card-value').value.trim(),
        sub: row.querySelector('.ct-card-sub').value.trim()
      };
    }).filter(function(c) { return c.title || c.value; });
    const faqs = Array.from(document.querySelectorAll('.ct-faq-row')).map(function(row) {
      return {
        q: row.querySelector('.ct-faq-q').value.trim(),
        a: row.querySelector('.ct-faq-a').value
      };
    }).filter(function(f) { return f.q && f.a; });

    const contactContent = { subtitle: subtitle, cards: cards, faqs: faqs };
    // merge with existing to keep other fields
    const cur = (await DataLoader.loadSettings()) || {};
    const merged = Object.assign({}, cur, { contactContent: Object.assign({}, cur.contactContent || {}, contactContent) });

    if (Store.isCloud()) {
      await Cloud.upsert('settings', merged);
    } else {
      Store.set('tw_settings', merged);
    }
    DataLoader.clearCache();
    Toast.success('联系我们页面已保存！');
    } catch (e) {
      console.error('AdminContact.save error:', e);
      Toast.error && Toast.error('保存失败：' + (e && e.message || '未知错误'));
    }
  }
};

// ===== 系统设置 =====
const AdminSettings = {
  async load() {
    await Settings.ensureSeeded();
    const s = Settings.get() || {};
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v || ''; };
    const c = s.contact || {};
    set('set-company', s.siteName);
    set('set-slogan', s.siteSlogan);
    set('set-logo', s.logo);
    set('set-description', s.description);
    set('set-phone', c.phone);
    set('set-mobile', c.mobile);
    set('set-email', c.email);
    set('set-address', c.address);
    set('set-wechat', c.wechat);
    set('set-qq', c.qq);
    set('set-copyright', s.copyright);
    set('set-icp', s.icpNumber);
    if (document.getElementById('set-seo-title')) document.getElementById('set-seo-title').value = s.seoTitle || '';
    if (document.getElementById('set-seo-description')) document.getElementById('set-seo-description').value = s.seoDescription || '';
    // 关于我们 / 联系我们内容
    const ac = s.aboutContent || {};
    set('set-about-intro', ac.intro);
    set('set-about-mission', ac.mission);
    set('set-about-vision', ac.vision);
    const cc = s.contactContent || {};
    set('set-contact-hours', cc.hours);
    const pv = document.getElementById('set-logo-preview');
    if (pv) {
      if (s.logo) { pv.src = s.logo; pv.style.display = 'block'; }
      else pv.style.display = 'none';
    }
    const logoIn = document.getElementById('set-logo');
    if (logoIn && pv) {
      logoIn.oninput = () => {
        const url = logoIn.value.trim();
        if (url) { pv.src = url; pv.style.display = 'block'; }
        else pv.style.display = 'none';
      };
    }
  },

  async save() {
    const v = id => { const el = document.getElementById(id); return el ? el.value.trim() : ''; };
    const siteName = v('set-company');
    if (!siteName) { Toast.error('网站名称不能为空'); return; }
    await Settings.save({
      siteName,
      siteSlogan: v('set-slogan'),
      logo: v('set-logo'),
      description: v('set-description'),
      contact: {
        phone: v('set-phone'), mobile: v('set-mobile'), email: v('set-email'),
        address: v('set-address'), wechat: v('set-wechat'), qq: v('set-qq')
      },
      copyright: v('set-copyright'),
      icpNumber: v('set-icp'),
      seoTitle: v('set-seo-title'),
      seoDescription: v('set-seo-description'),
    });
    DataLoader.clearCache();
    Toast.success('系统设置已保存，刷新前台页面即可生效！');
  },

  async savePwd() {
    const oldPwd = document.getElementById('cfg-oldPwd')?.value || '';
    const newPwd = document.getElementById('cfg-newPwd')?.value || '';
    const confirmPwd = document.getElementById('cfg-confirmPwd')?.value || '';
    const me = Store.getAdminUser();
    if (!me) { Toast.error('登录状态已失效，请重新登录'); return; }

    if (!newPwd || newPwd.length < 6) { Toast.warning('新密码至少 6 位'); return; }
    if (newPwd !== confirmPwd) { Toast.error('两次输入的新密码不一致'); return; }
    if (newPwd === oldPwd) { Toast.warning('新密码不能与当前密码相同'); return; }

    // 云模式：修改 Supabase Auth 账号密码
    if (Store.isCloud()) {
      try {
        await Cloud.changePassword(oldPwd, newPwd);
      } catch (e) {
        Toast.error((e && e.message) || '密码修改失败，请稍后重试');
        return;
      }
      ['cfg-oldPwd', 'cfg-newPwd', 'cfg-confirmPwd'].forEach(id => {
        const el = document.getElementById(id); if (el) el.value = '';
      });
      Toast.success('密码修改成功，下次登录请使用新密码！');
      return;
    }

    // 本地模式：哈希校验 + 更新 tw_admins
    const list = await AdminAuth.ensureSeed();
    const u = list.find(x => x.username === me.username);
    if (!u) { Toast.error('账号不存在'); return; }
    const oldHash = await AdminAuth.hash(oldPwd);
    if (oldHash !== u.passHash) { Toast.error('当前密码错误'); return; }

    u.passHash = await AdminAuth.hash(newPwd);
    Store.set(AdminAuth.key, list);
    ['cfg-oldPwd', 'cfg-newPwd', 'cfg-confirmPwd'].forEach(id => {
      const el = document.getElementById(id); if (el) el.value = '';
    });
    Toast.success('密码修改成功，下次登录请使用新密码！');
  }
};

// ===== 用户管理（聚合：注册用户 + 下单 + 留言沉淀的客户） =====
const AdminUsers = {
  collect() {
    const map = new Map();
    const put = (phone, name, time) => {
      if (!phone) return;
      const k = String(phone).trim();
      if (!map.has(k)) map.set(k, { phone: k, name: name || k, count: 0, first: time || '' });
    };
    (Store.getUsers?.() || []).forEach(u => put(u.phone, u.name, u.createdAt || u.registerTime));
    (Store.getOrders?.() || []).forEach(o => put(o.phone, o.name, o.createTime));
    (Store.getMessages?.() || []).forEach(m => put(m.phone, m.name, m.createTime));
    (Store.getOrders?.() || []).forEach(o => {
      const k = String(o.phone || '').trim();
      const rec = map.get(k);
      if (rec) rec.count++;
    });
    return map;
  },

  render() {
    const map = this.collect();
    const rows = Array.from(map.values()).sort((a, b) => String(b.first).localeCompare(String(a.first)));
    const tbody = document.getElementById('users-tbody');
    if (!tbody) return;
    tbody.innerHTML = rows.length ? rows.map(u => `
      <tr>
        <td>${esc(u.phone)}</td>
        <td>${esc(u.name)}</td>
        <td>${esc(u.phone)}</td>
        <td>${esc((u.first || '').toString().slice(0, 10))}</td>
        <td>${u.count}</td>
        <td><span style="color:var(--color-text-secondary);font-size:12px;">来自订单/留言/注册</span></td>
      </tr>`).join('') : '<tr><td colspan="6" style="text-align:center;padding:40px;color:var(--color-text-secondary);">暂无用户数据（用户下单或留言后自动出现在这里）</td></tr>';
  }
};

// ===== 管理员管理 =====
// 本地模式：账号存 localStorage（tw_admins，哈希密码）；云模式：账号为 Supabase Auth 用户（admins 表记录角色），
// 增删改请使用项目内 supabase/seed-cloud.js 脚本（避免在浏览器中暴露高权限操作）
const AdminAdmins = {
  render() {
    const tbody = document.getElementById('admins-tbody');
    if (!tbody) return;
    const me = Store.getAdminUser();

    // 云模式：只读展示（数据来自 Cloud.loadAdmins）
    if (Store.isCloud()) {
      const list = Cloud.cache.admins || [];
      const roleName = r => r === 'operator' ? '运营人员' : '超级管理员';
      tbody.innerHTML = (list.length ? list.map(u => {
        const isSelf = me && (u.username === me.username || u.id === me.id);
        return `
        <tr>
          <td><strong>${esc(u.username)}</strong>${isSelf ? ' <span class="status-badge success" style="margin-left:4px;">当前</span>' : ''}</td>
          <td>${esc(u.name || u.username)}</td>
          <td><span class="status-badge ${u.role === 'admin' ? 'success' : 'gray'}">${roleName(u.role)}</span></td>
          <td style="font-size:13px;color:var(--color-text-secondary);">—</td>
          <td><span class="status-badge success">正常</span></td>
          <td style="white-space:nowrap;color:var(--color-text-secondary);font-size:12px;">云模式</td>
        </tr>`;
      }).join('') : '') +
      '<tr><td colspan="6" style="text-align:center;padding:24px;color:var(--color-text-secondary);">管理员账号由 Supabase 管理（Auth + admins 表）。<br>新增/删除/重置密码请在项目目录运行：<code>node supabase/seed-cloud.js admin ...</code></td></tr>';
      return;
    }

    const list = AdminAuth.list();
    const fmt = iso => iso ? new Date(iso).toLocaleString('zh-CN', { hour12: false }) : '从未登录';
    tbody.innerHTML = list.length ? list.map(u => {
      const isSelf = me && u.username === me.username;
      const roleName = u.role === 'operator' ? '运营人员' : '超级管理员';
      return `
      <tr>
        <td><strong>${esc(u.username)}</strong>${isSelf ? ' <span class="status-badge success" style="margin-left:4px;">当前</span>' : ''}</td>
        <td>${esc(u.name)}</td>
        <td><span class="status-badge ${u.role === 'admin' ? 'success' : 'gray'}">${roleName}</span></td>
        <td style="font-size:13px;">${fmt(u.lastLogin)}</td>
        <td><span class="status-badge ${u.status === 'active' ? 'success' : 'warning'}">${u.status === 'active' ? '正常' : '已停用'}</span></td>
        <td style="white-space:nowrap;">
          <button class="action-btn primary" onclick="AdminAdmins.showModal('${esc(u.id)}')" title="编辑"><i class="fas fa-edit"></i></button>
          <button class="action-btn warning" onclick="AdminAdmins.resetPwd('${esc(u.id)}')" title="重置密码"><i class="fas fa-key"></i></button>
          ${u.username !== 'admin' && !isSelf ? `
          <button class="action-btn ${u.status === 'active' ? 'gray' : 'success'}" onclick="AdminAdmins.toggleStatus('${esc(u.id)}')" title="${u.status === 'active' ? '停用' : '启用'}"><i class="fas fa-${u.status === 'active' ? 'ban' : 'check'}"></i></button>
          <button class="action-btn danger" onclick="AdminAdmins.delete('${esc(u.id)}')" title="删除"><i class="fas fa-trash"></i></button>` : ''}
        </td>
      </tr>`;
    }).join('') : '<tr><td colspan="6" style="text-align:center;padding:40px;">暂无管理员</td></tr>';
  },

  showModal(id = null) {
    if (Store.isCloud()) {
      Toast.info('云模式下管理员账号请使用 node supabase/seed-cloud.js admin 管理');
      return;
    }
    const list = AdminAuth.list();
    const u = id ? list.find(x => x.id === id) : null;
    const body = `
      <div class="admin-form-grid">
        <div class="form-group"><label class="admin-form-label">用户名（登录账号）</label>
          <input type="text" class="admin-form-control" id="adm-username" value="${esc(u ? u.username : '')}" ${u ? 'disabled' : ''} placeholder="字母或数字，如：admin">
          ${u ? '<input type="hidden" id="adm-username-val" value="' + esc(u.username) + '">' : ''}
        </div>
        <div class="form-group"><label class="admin-form-label">姓名 / 称呼</label>
          <input type="text" class="admin-form-control" id="adm-name" value="${esc(u ? u.name : '')}" placeholder="如：王小明">
        </div>
        <div class="form-group"><label class="admin-form-label">角色</label>
          <select class="admin-form-control" id="adm-role">
            <option value="operator" ${u && u.role === 'operator' ? 'selected' : ''}>运营人员（可管理内容，无系统设置权限）</option>
            <option value="admin" ${!u || u.role === 'admin' ? 'selected' : ''}>超级管理员（全部权限）</option>
          </select>
        </div>
        ${u ? '' : `
        <div class="form-group full"><label class="admin-form-label">初始密码（至少 6 位，留空则与用户名相同）</label>
          <input type="text" class="admin-form-control" id="adm-password" placeholder="建议设置独立密码">
        </div>`}
        <p class="admin-note full" style="grid-column:1/-1;">账号密码经 SHA-256 加盐存储，后台不保存明文。</p>
      </div>`;
    AdminModal.open(u ? '编辑管理员' : '新增管理员', body, () => this.save(u));
  },

  save(u) {
    const v = id => { const el = document.getElementById(id); return el ? el.value.trim() : ''; };
    const username = u ? (document.getElementById('adm-username-val')?.value || u.username) : v('adm-username');
    const name = v('adm-name');
    const role = v('adm-role') || 'operator';
    if (!username) { Toast.error('请填写用户名'); return false; }
    if (!name) { Toast.error('请填写姓名'); return false; }

    if (u) {
      const list = AdminAuth.list();
      const target = list.find(x => x.id === u.id);
      if (!target) { Toast.error('账号不存在或已被删除'); return false; }
      target.name = name;
      target.role = role;
      // 若改的是自己且当前是超级管理员，同步会话显示
      const me = Store.getAdminUser();
      if (me && me.username === target.username) {
        Store.setAdminUser({ ...me, name: target.name, role: target.role });
      }
      Store.set(AdminAuth.key, list);
      Toast.success('管理员信息已更新');
      this.render();
      return;
    }

    const list = AdminAuth.list();
    if (list.some(x => x.username === username)) { Toast.error('该用户名已存在'); return false; }
    const pwd = v('adm-password') || username;
    if (pwd.length < 6) { Toast.error('密码至少 6 位'); return false; }
    return AdminAuth.hash(pwd).then(hash => {
      list.push({
        id: 'A' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        username, name, role,
        passHash: hash, status: 'active',
        createdAt: new Date().toISOString(), lastLogin: null
      });
      Store.set(AdminAuth.key, list);
      Toast.success('管理员已创建');
      this.render();
      return true;
    });
  },

  toggleStatus(id) {
    if (Store.isCloud()) { Toast.info('云模式下请使用 node supabase/seed-cloud.js admin 管理'); return; }
    const list = AdminAuth.list();
    const u = list.find(x => x.id === id);
    if (!u) return;
    const me = Store.getAdminUser();
    if (me && u.username === me.username) { Toast.warning('不能停用自己的账号'); return; }
    if (u.username === 'admin') { Toast.warning('内置超级管理员不可停用'); return; }
    u.status = u.status === 'active' ? 'disabled' : 'active';
    Store.set(AdminAuth.key, list);
    Toast.success(u.status === 'active' ? '已启用该账号' : '已停用该账号');
    this.render();
  },

  delete(id) {
    if (Store.isCloud()) { Toast.info('云模式下请使用 node supabase/seed-cloud.js admin 管理'); return; }
    const list = AdminAuth.list();
    const u = list.find(x => x.id === id);
    if (!u) return;
    const me = Store.getAdminUser();
    if (me && u.username === me.username) { Toast.warning('不能删除当前登录的账号'); return; }
    if (u.username === 'admin') { Toast.warning('内置超级管理员不可删除'); return; }
    if (!confirm(`确定删除管理员「${u.name}（${u.username}）」吗？`)) return;
    Store.set(AdminAuth.key, list.filter(x => x.id !== id));
    Toast.success('管理员已删除');
    this.render();
  },

  resetPwd(id) {
    if (Store.isCloud()) { Toast.info('云模式下请使用 node supabase/seed-cloud.js admin 管理'); return; }
    const list = AdminAuth.list();
    const u = list.find(x => x.id === id);
    if (!u) return;
    AdminModal.open(`重置密码 - ${u.username}`, `
      <div class="form-group">
        <label class="admin-form-label">新密码（至少 6 位）</label>
        <input type="text" class="admin-form-control" id="adm-newpwd" placeholder="输入新密码">
        <p class="admin-note">重置后该账号旧密码立即失效</p>
      </div>`, () => {
      const pwd = (document.getElementById('adm-newpwd')?.value || '').trim();
      if (!pwd || pwd.length < 6) { Toast.error('新密码至少 6 位'); return false; }
      return AdminAuth.hash(pwd).then(hash => {
        const list2 = AdminAuth.list();
        const target = list2.find(x => x.id === id);
        if (!target) return false;
        target.passHash = hash;
        Store.set(AdminAuth.key, list2);
        Toast.success('密码已重置');
        this.render();
        return true;
      });
    });
  }
};
// ===== 初始化 =====
// Admin.init() 由 admin.html 内联脚本在 DOMContentLoaded 时触发（避免双重初始化）

window.Admin = Admin;
window.AdminOrders = AdminOrders;
window.AdminMessages = AdminMessages;
window.AdminRoutes = AdminRoutes;
window.AdminDestinations = AdminDestinations;
window.AdminGuides = AdminGuides;
window.AdminHomepage = AdminHomepage;
window.AdminSettings = AdminSettings;
window.AdminModal = AdminModal;
window.AdminAuth = AdminAuth;
window.AdminUsers = AdminUsers;
window.AdminAdmins = AdminAdmins;
