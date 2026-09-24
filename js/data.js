/* =============================================
// HuanYou Travel | Data Layer
   ============================================= */

// ===== Async Data Loading (dual mode: cloud Supabase → local localStorage → JSON) =====
const DataLoader = {
  cache: {},

  async loadJSON(url) {
    if (this.cache[url]) return this.cache[url];
    
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      this.cache[url] = data;
      return data;
    } catch (error) {
console.warn('Failed to load data:', url, error);
      return null;
    }
  },

// Cloud mode: read Cloud memory snapshot (bootstrap already pulled all); local mode: localStorage → JSON
  async loadRoutes() {
    if (window.Cloud?.enabled()) { await Cloud.bootstrap(); return Cloud.cache.routes || []; }
// Admin-saved data takes priority in localStorage
    const local = Store.get('tw_routes');
    if (local) return local;
    return this.loadJSON('data/routes.json');
  },

  async loadDestinations() {
    if (window.Cloud?.enabled()) { await Cloud.bootstrap(); return Cloud.cache.destinations || []; }
    const local = Store.get('tw_destinations');
    if (local) return local;
    return this.loadJSON('data/destinations.json');
  },

  async loadGuides() {
    if (window.Cloud?.enabled()) { await Cloud.bootstrap(); return Cloud.cache.guides || []; }
    const local = Store.get('tw_guides');
    if (local) return local;
    return this.loadJSON('data/guides.json');
  },

  async loadSettings() {
    if (window.Cloud?.enabled()) { await Cloud.bootstrap(); return Cloud.cache.settings || {}; }
    const local = Store.get('tw_settings');
    if (local) return local;
    return this.loadJSON('data/settings.json');
  },

  clearCache() {
    this.cache = {};
// Cloud mode: data is synced to Cloud.cache; clear cache as fallback for consistency
    if (window.Cloud?.enabled()) Cloud.bootstrap(true).catch(() => {});
  }
};

// ===== Site Settings (dual mode: cloud settings table / local settings.json defaults + admin overrides) =====
const Settings = {
  KEY: 'tw_settings',
  _seeding: null,

// Full config (sync read; cloud mode reads Cloud memory snapshot — call await ensureSeeded() first)
  get() {
    if (window.Cloud?.enabled()) return (Cloud.cache.settings && Object.keys(Cloud.cache.settings).length) ? Cloud.cache.settings : null;
    return Store.get(this.KEY) || null;
  },

// Cloud mode: bootstrap pulls cloud config (empty on first run, saved by admin); local mode: JSON merges into localStorage (idempotent, concurrent-safe)
  ensureSeeded() {
    if (window.Cloud?.enabled()) return Cloud.bootstrap().then(() => this.get() || {});
    if (this.get()) return Promise.resolve(this.get());
    if (this._seeding) return this._seeding;
    this._seeding = DataLoader.loadJSON('data/settings.json').then(json => {
      this._seeding = null;
      if (json && !this.get()) Store.saveSettings(json);
      return this.get() || json;
    });
    return this._seeding;
  },

// Deep merge save: patch only overwrites given fields, rest preserved; cloud mode writes DB + updates Cloud cache
  async save(patch) {
    const cur = this.get() || {};
    const merge = (t, s) => {
      if (s && typeof s === 'object' && !Array.isArray(s)) {
        t = t && typeof t === 'object' && !Array.isArray(t) ? t : {};
        Object.keys(s).forEach(k => { t[k] = merge(t[k], s[k]); });
        return t;
      }
      return s === undefined ? t : s;
    };
    const next = merge(JSON.parse(JSON.stringify(cur)), patch);
    if (window.Cloud?.enabled()) {
      await Cloud.upsert('settings', next);
      Cloud.cache.settings = next;
      return next;
    }
    Store.saveSettings(next);
    return next;
  }
};

// ===== Route Renderer =====
const RouteRenderer = {
  async renderList(containerId, options = {}) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const routes = await DataLoader.loadRoutes();
    if (!routes) {
container.innerHTML = '<div class="empty-state"><p>No routes available yet</p></div>';
      return;
    }

    let filtered = routes.filter(r => r.status === 'published');

// Render in specified ID order (for admin homepage featured sections)
    if (options.ids && options.ids.length) {
      filtered = options.ids.map(id => routes.find(r => r.id === id && r.status === 'published')).filter(Boolean);
      if (options.limit) filtered = filtered.slice(0, options.limit);
      container.innerHTML = filtered.map(route => this.createCard(route)).join('');
      this.bindCardEvents(container);
      return;
    }
    
// Filters
    if (options.destination) {
      filtered = filtered.filter(r => r.destination === options.destination);
    }
    if (options.maxPrice) {
      filtered = filtered.filter(r => r.price <= options.maxPrice);
    }
    if (options.featured) {
      filtered = filtered.filter(r => r.featured);
    }

// Sort
    if (options.sort === 'price_asc') {
      filtered.sort((a, b) => a.price - b.price);
    } else if (options.sort === 'price_desc') {
      filtered.sort((a, b) => b.price - a.price);
    } else if (options.sort === 'price') {
      filtered.sort((a, b) => a.price - b.price);
    } else {
      filtered.sort((a, b) => b.views - a.views);
    }

// Limit
    if (options.limit) {
      filtered = filtered.slice(0, options.limit);
    }

    container.innerHTML = filtered.map(route => this.createCard(route)).join('');
    this.bindCardEvents(container);
  },

  createCard(route) {
    const tags = route.tags?.map(tag => {
const cls = tag === 'Popular' ? 'badge-hot' : tag === 'New' ? 'badge-new-badge' : tag === 'Deal' ? 'badge-sale' : 'badge-recommend';
      return `<span class="route-card-badge ${cls}">${tag}</span>`;
    }).join('') || '';

    const isFav = Store.isFavorite(route.id, 'route');
    
    return `
      <article class="route-card" data-id="${route.id}">
        <div class="route-card-image">
          <a href="route-detail.html?id=${route.id}">
<img src="${route.cover}" alt="${route.title}" loading="lazy" onerror="this.src='https://via.placeholder.com/400x220/E8F5E9/2E7D32?text=Route'">
          </a>
          <div class="route-card-badges">${tags}</div>
<button class="route-card-favorite ${isFav ? 'active' : ''}" data-id="${route.id}" title="Favorite">
            <i class="far fa-heart"></i>
          </button>
        </div>
        <div class="route-card-body">
          <div class="route-card-meta">
            <span><i class="fas fa-map-marker-alt"></i> ${route.destination}</span>
<span><i class="far fa-clock"></i> ${route.days} Days ${route.nights || route.days - 1} Nights</span>
          </div>
          <h3 class="route-card-title">
            <a href="route-detail.html?id=${route.id}">${route.title}</a>
          </h3>
          <div class="route-card-highlights">
            ${route.highlights?.slice(0, 3).map(h => `<span class="route-card-highlight">${h}</span>`).join('') || ''}
          </div>
          <div class="route-card-footer">
            <div class="route-card-price">
              <span class="route-card-price-value">$${route.price.toLocaleString()}</span>
<span class="route-card-price-unit">/person</span>
              ${route.originalPrice > route.price ? `<span class="route-card-price-original">$${route.originalPrice.toLocaleString()}</span>` : ''}
            </div>
<a href="route-detail.html?id=${route.id}" class="route-card-btn">View Details</a>
          </div>
        </div>
      </article>
    `;
  },

  bindCardEvents(container) {
    container.querySelectorAll('.route-card-favorite').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const id = btn.dataset.id;
        const isFav = Store.toggleFavorite(id, 'route');
        btn.classList.toggle('active', isFav);
Toast.show(isFav ? 'Added to favorites' : 'Removed from favorites', 'success');
      });
    });
  },

  async renderDetail(id) {
    const routes = await DataLoader.loadRoutes();
    return routes?.find(r => r.id === id) || null;
  }
};

// ===== Destinations Renderer =====
const DestinationRenderer = {
  async renderList(containerId, options = {}) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const destinations = await DataLoader.loadDestinations();
    if (!destinations) {
container.innerHTML = '<div class="empty-state"><p>No destinations available yet</p></div>';
      return;
    }

    let filtered = destinations.filter(d => d.status === 'published');

// Auto-count routes per destination (use admin-configured field; fall back to live calculation)
    const routes = await DataLoader.loadRoutes();
    filtered.forEach(d => {
      if (!d.routeCount) {
        d.routeCount = (routes || []).filter(r => r.destination === d.region || r.destination === d.name).length;
      }
    });

// Render in specified ID order
    if (options.ids && options.ids.length) {
      filtered = options.ids.map(id => destinations.find(d => d.id === id && d.status === 'published')).filter(Boolean);
      if (options.limit) filtered = filtered.slice(0, options.limit);
      container.innerHTML = filtered.map(dest => this.createCard(dest, false)).join('');
      return;
    }
    
    if (options.region) {
      filtered = filtered.filter(d => d.region === options.region);
    }
    if (options.featured) {
      filtered = filtered.filter(d => d.featured);
    }
    if (options.limit) {
      filtered = filtered.slice(0, options.limit);
    }

    container.innerHTML = filtered.map(dest => this.createCard(dest, false)).join('');
  },

  createCard(dest, large = false) {
    return `
      <a href="dest-detail.html?id=${dest.id}" class="destination-card ${large ? 'destination-card-large' : ''}">
        <img src="${dest.cover}" alt="${dest.name}" loading="lazy" onerror="this.src='https://via.placeholder.com/400x500/E8F5E9/2E7D32?text=${dest.name}'">
        <div class="destination-card-overlay">
          <h3 class="destination-card-name">${dest.name}</h3>
          <div class="destination-card-region">
            <i class="fas fa-map-marker-alt"></i> ${dest.region}
          </div>
<div class="destination-card-count">${dest.routeCount || 0} routes</div>
        </div>
      </a>
    `;
  },

  async renderDetail(id) {
    const destinations = await DataLoader.loadDestinations();
    return destinations?.find(d => d.id === id) || null;
  }
};

// ===== Guide Renderer =====
const GuideRenderer = {
  async renderList(containerId, options = {}) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const guides = await DataLoader.loadGuides();
    if (!guides) {
container.innerHTML = '<div class="empty-state"><p>No guides available yet</p></div>';
      return;
    }

    let filtered = guides.filter(g => g.status === 'published');

// Render in specified ID order
    if (options.ids && options.ids.length) {
      filtered = options.ids.map(id => guides.find(g => g.id === id && g.status === 'published')).filter(Boolean);
      if (options.limit) filtered = filtered.slice(0, options.limit);
      container.innerHTML = filtered.map(guide => this.createCard(guide)).join('');
      return;
    }
    
    if (options.category) {
      filtered = filtered.filter(g => g.category === options.category);
    }
    if (options.featured) {
      filtered = filtered.filter(g => g.featured);
    }
    if (options.limit) {
      filtered = filtered.slice(0, options.limit);
    }

    container.innerHTML = filtered.map(guide => this.createCard(guide)).join('');
  },

  createCard(guide) {
    return `
      <article class="guide-card" data-id="${guide.id}">
        <div class="guide-card-image">
          <a href="guide-detail.html?id=${guide.id}">
<img src="${guide.cover}" alt="${guide.title}" loading="lazy" onerror="this.src='https://via.placeholder.com/400x200/E8F5E9/2E7D32?text=Guide'">
          </a>
        </div>
        <div class="guide-card-body">
          <span class="guide-card-category">${guide.category}</span>
          <h3 class="guide-card-title">
            <a href="guide-detail.html?id=${guide.id}">${guide.title}</a>
          </h3>
          <p class="guide-card-summary">${guide.summary}</p>
          <div class="guide-card-meta">
            <span><i class="far fa-calendar"></i> ${guide.publishTime}</span>
            <div class="guide-card-stats">
              <span class="guide-card-stat"><i class="far fa-eye"></i> ${guide.views?.toLocaleString() || 0}</span>
              <span class="guide-card-stat"><i class="far fa-heart"></i> ${guide.likes?.toLocaleString() || 0}</span>
            </div>
          </div>
        </div>
      </article>
    `;
  },

  async renderDetail(id) {
    const guides = await DataLoader.loadGuides();
    return guides?.find(g => g.id === id) || null;
  }
};

// ===== Exports =====
window.DataLoader = DataLoader;
window.RouteRenderer = RouteRenderer;
window.DestinationRenderer = DestinationRenderer;
window.GuideRenderer = GuideRenderer;
window.Settings = Settings;
