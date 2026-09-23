
/* =============================================
// HuanYou Travel | Global Application Script
   ============================================= */

// ===== Utilities =====
const Utils = {
// Get URL parameter
  getUrlParam(name) {
    const params = new URLSearchParams(window.location.search);
    return params.get(name);
  },

// Format currency
  formatPrice(price) {
    return '$' + price.toLocaleString('en-US');
  },

// Format date
  formatDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  },

// Format time
  formatDateTime(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  },

// Generate unique ID
  generateId(prefix = '') {
    return prefix + Date.now().toString(36) + Math.random().toString(36).substr(2, 4);
  },

// Debounce
  debounce(fn, delay = 300) {
    let timer = null;
    return function(...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), delay);
    };
  },

// Throttle
  throttle(fn, delay = 300) {
    let last = 0;
    return function(...args) {
      const now = Date.now();
      if (now - last > delay) {
        last = now;
        fn.apply(this, args);
      }
    };
  },

// Deep clone
  deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
  },

// localStorage set
  storage(key, value) {
    if (value === undefined) {
      try { return JSON.parse(localStorage.getItem(key)); } 
      catch { return null; }
    }
    localStorage.setItem(key, JSON.stringify(value));
  },

// Get DOM element
  $(selector) { return document.querySelector(selector); },
  $$(selector) { return document.querySelectorAll(selector); }
};

// ===== HTML Escape =====
function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ===== Toast Notifications =====
const Toast = {
  container: null,

  init() {
    if (!this.container) {
      this.container = document.createElement('div');
      this.container.className = 'toast-container';
      document.body.appendChild(this.container);
    }
  },

  show(message, type = 'success', duration = 3000) {
    this.init();
    const icons = {
      success: 'fa-check-circle',
      error: 'fa-times-circle',
      warning: 'fa-exclamation-circle',
      info: 'fa-info-circle'
    };
    const titles = {
success: 'Success',
error: 'Error',
warning: 'Notice',
info: 'Info'
    };

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
      <i class="toast-icon fas ${icons[type]}"></i>
      <div class="toast-content">
        <div class="toast-title">${titles[type]}</div>
        <div class="toast-message">${message}</div>
      </div>
    `;
    this.container.appendChild(toast);

    setTimeout(() => toast.classList.add('animate-fade-in-up'), 10);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(100%)';
      setTimeout(() => toast.remove(), 300);
    }, duration);
  },

  success(msg) { this.show(msg, 'success'); },
  error(msg) { this.show(msg, 'error'); },
  warning(msg) { this.show(msg, 'warning'); },
  info(msg) { this.show(msg, 'info'); }
};

// ===== Modal System =====
const Modal = {
  show(id) {
    const overlay = document.getElementById(id);
    if (overlay) {
      overlay.classList.add('active');
      document.body.style.overflow = 'hidden';
    }
  },

  hide(id) {
    const overlay = document.getElementById(id);
    if (overlay) {
      overlay.classList.remove('active');
      document.body.style.overflow = '';
    }
  },

// Confirmation dialog
  confirm(options) {
    return new Promise((resolve) => {
const { title = 'Confirm', message = 'Are you sure you want to proceed?', confirmText = 'Confirm', cancelText = 'Cancel' } = options;
      
      const html = `
        <div class="modal-overlay" id="modal-confirm">
          <div class="modal" style="max-width:400px">
            <div class="modal-header">
              <h3 class="modal-title">${title}</h3>
              <button class="modal-close" onclick="Modal.confirmResolve(false)"><i class="fas fa-times"></i></button>
            </div>
            <div class="modal-body">
              <p>${message}</p>
            </div>
            <div class="modal-footer">
              <button class="btn btn-ghost" onclick="Modal.confirmResolve(false)">${cancelText}</button>
              <button class="btn btn-primary" onclick="Modal.confirmResolve(true)">${confirmText}</button>
            </div>
          </div>
        </div>
      `;
      
      const container = document.createElement('div');
      container.innerHTML = html;
      document.body.appendChild(container);
      
      this._confirmResolve = resolve;
    });
  },

  confirmResolve(result) {
    if (this._confirmResolve) {
      this._confirmResolve(result);
      this._confirmResolve = null;
    }
    const modal = document.getElementById('modal-confirm');
    if (modal) modal.remove();
  }
};

// ===== Data Storage (localStorage wrapper) =====
const Store = {
  get(key, defaultValue = null) {
    try {
      const data = localStorage.getItem(key);
      return data ? JSON.parse(data) : defaultValue;
    } catch {
      return defaultValue;
    }
  },

  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  },

  remove(key) {
    localStorage.removeItem(key);
  },

// Order management (cloud mode reads Cloud memory snapshot)
  getOrders() {
    if (this.isCloud()) return Cloud.cache.orders || [];
    return this.get('tw_orders', []);
  },

  saveOrder(order) {
    const orders = this.getOrders();
    orders.unshift(order);
    this.set('tw_orders', orders);
    return order;
  },

  updateOrder(id, updates) {
    const orders = this.getOrders();
    const index = orders.findIndex(o => o.id === id);
    if (index !== -1) {
      orders[index] = { ...orders[index], ...updates };
      this.set('tw_orders', orders);
      return orders[index];
    }
    return null;
  },

  deleteOrder(id) {
    const orders = this.getOrders().filter(o => o.id !== id);
    this.set('tw_orders', orders);
  },

// Message management (cloud mode reads Cloud memory snapshot)
  getMessages() {
    if (this.isCloud()) return Cloud.cache.messages || [];
    return this.get('tw_messages', []);
  },

  saveMessage(message) {
    const messages = this.getMessages();
    messages.unshift(message);
    this.set('tw_messages', messages);
    return message;
  },

  updateMessage(id, updates) {
    const messages = this.getMessages();
    const index = messages.findIndex(m => m.id === id);
    if (index !== -1) {
      messages[index] = { ...messages[index], ...updates };
      this.set('tw_messages', messages);
      return messages[index];
    }
    return null;
  },

  deleteMessage(id) {
    const messages = this.getMessages().filter(m => m.id !== id);
    this.set('tw_messages', messages);
  },

// User management (cloud mode reads Cloud memory snapshot)
  getUsers() {
    if (this.isCloud()) return Cloud.cache.users || [];
    return this.get('tw_users', []);
  },

  saveUser(user) {
    const users = this.getUsers();
    users.unshift(user);
    this.set('tw_users', users);
    return user;
  },

  updateUser(id, updates) {
    const users = this.getUsers();
    const index = users.findIndex(u => u.id === id);
    if (index !== -1) {
      users[index] = { ...users[index], ...updates };
      this.set('tw_users', users);
      return users[index];
    }
    return null;
  },

// System settings (cloud mode reads Cloud memory snapshot, local mode reads localStorage)
  getSettings() {
    if (window.Cloud?.enabled() && Cloud.cache.settings) return Cloud.cache.settings;
    return this.get('tw_settings', null);
  },

  saveSettings(settings) {
    this.set('tw_settings', settings);
    return settings;
  },

// Cloud-mode session mirror: set/get/remove still go to localStorage (written by Admin login flow)
  isCloud() {
    return !!(window.Cloud && window.Cloud.enabled());
  },

// Favorites management
  getFavorites() {
    return this.get('tw_favorites', []);
  },

  toggleFavorite(id, type = 'route') {
    const favs = this.getFavorites();
    const key = `${type}_${id}`;
    const index = favs.indexOf(key);
    if (index !== -1) {
      favs.splice(index, 1);
      this.set('tw_favorites', favs);
      return false;
    } else {
      favs.push(key);
      this.set('tw_favorites', favs);
      return true;
    }
  },

  isFavorite(id, type = 'route') {
    return this.getFavorites().includes(`${type}_${id}`);
  },

// ===== Admin Auth =====
  getAdminUser() {
    return this.get('tw_admin', null);
  },

  setAdminUser(user) {
    this.set('tw_admin', user);
  },

  logout() {
    this.remove('tw_admin');
  }
};

// ===== Header Navigation =====
const Header = {
  _inited: false,
  async init() {
    if (this._inited) return;
    this._inited = true;
// Anti-FOUC: hide header immediately (prevent HTML defaults like "HuanYou Travel / 400-xxx" from flashing)
    const _hdr = document.querySelector('.header');
    if (_hdr) _hdr.classList.add('header-pre-init');
    try {
      if (window.Settings && window.Settings.ensureSeeded) {
        await Settings.ensureSeeded();
      }
      this.render();
    } finally {
// Always show header regardless (avoid permanent hide)
      if (_hdr) _hdr.classList.remove('header-pre-init');
    }
    this.bindEvents();
    this.handleScroll();
  },

  render() {
    const currentPage = window.location.pathname.split('/').pop() || 'index.html';
    const s = Store.getSettings() || {};
    const defaultNav = [
{ href: 'index.html', label: 'Home', icon: 'fa-home' },
{ href: '/routes', label: 'Tours', icon: 'fa-route' },
{ href: '/destinations', label: 'Destinations', icon: 'fa-map-marker-alt' },
{ href: '/guides', label: 'Travel Guides', icon: 'fa-book-open' },
{ href: 'about.html', label: 'About Us', icon: 'fa-info-circle' },
{ href: 'contact.html', label: 'Contact', icon: 'fa-envelope' }
    ];
// Navbar: prefer admin-configured "Header Settings" (settings.navItems); fall back to default menu
    const navLinks = (Array.isArray(s.navItems) && s.navItems.length)
      ? s.navItems.filter(n => n && n.label && n.href)
      : defaultNav;

    const navHTML = navLinks.map(link => `
      <a href="${link.href}" class="nav-link ${currentPage === link.href ? 'active' : ''}" data-page="${link.href}">
        ${link.label}
      </a>
    `).join('');

    const header = document.querySelector('.header');
    if (header) {
      const navMenu = header.querySelector('.nav-menu');
      if (navMenu) navMenu.innerHTML = navHTML;
      // Mobile nav: reuse the same navItems source so desktop & mobile stay in sync
      const mobileNavEl = document.getElementById('mobile-nav');
      if (mobileNavEl) mobileNavEl.innerHTML = navHTML;

// Site config: logo / site name / phone / page title
      const s = Store.getSettings() || {};
      const logoEl = header.querySelector('.logo');
      if (logoEl) {
        const iconEl = logoEl.querySelector('.logo-icon');
        const spanEl = logoEl.querySelector('span');
        if (s.logo && iconEl) {
          iconEl.innerHTML = `<img src="${s.logo}" alt="logo" style="width:100%;height:100%;object-fit:contain;border-radius:6px;">`;
        }
        if (s.siteName && spanEl) spanEl.textContent = s.siteName;
      }
      const phoneEl = header.querySelector('.header-phone');
      if (phoneEl && s.contact?.phone) {
        phoneEl.href = 'tel:' + s.contact.phone.replace(/-/g, '');
        phoneEl.innerHTML = '<i class="fas fa-phone-alt"></i> ' + s.contact.phone;
      }
      if (s.siteName) {
        document.title = s.siteSlogan ? `${s.siteName} - ${s.siteSlogan}` : s.siteName;
      }
    }
  },

  bindEvents() {
// Mobile menu toggle handled by MobileNav.init() to avoid double-binding

// Scroll effects
    window.addEventListener('scroll', Utils.throttle(() => this.handleScroll(), 100));

// Header height CSS variable
    document.documentElement.style.setProperty('--header-height', '72px');
  },

  handleScroll() {
    const header = document.querySelector('.header');
    if (header) {
      if (window.scrollY > 50) {
        header.classList.add('scrolled');
      } else {
        header.classList.remove('scrolled');
      }
    }
  }
};

// ===== Footer ======
const Footer = {
  _inited: false,
  init() {
    if (this._inited) return;
    this._inited = true;
    this.render();
  },

  render() {
    const footer = document.querySelector('.footer');
    if (!footer) return;

    const s = Store.getSettings() || {};
    const settings = {
siteName: s.siteName || 'HuanYou Travel',
      logo: s.logo || '',
description: s.description || '',
      contact: s.contact || {},
copyright: s.copyright || '© 2026 HuanYou Travel. All rights reserved.',
      icpNumber: s.icpNumber || ''
    };

    footer.innerHTML = `
      <div class="container">
        <div class="footer-grid">
          <div>
            <div class="footer-brand">
              <div class="footer-brand-icon">${settings.logo ? `<img src="${settings.logo}" alt="logo" style="width:100%;height:100%;object-fit:contain;border-radius:6px;">` : '<i class="fas fa-paper-plane"></i>'}</div>
              <span>${settings.siteName}</span>
            </div>
            <p class="footer-desc">${settings.description}</p>
            <div class="footer-payments">
              <span class="footer-payments-label">We accept</span>
              <div class="footer-payments-row">
                <img src="assets/payments/visa.svg" alt="Visa" />
                <img src="assets/payments/mastercard.svg" alt="Mastercard" />
                <img src="assets/payments/amex.svg" alt="American Express" />
                <img src="assets/payments/jcb.svg" alt="JCB" />
                <img src="assets/payments/discover.svg" alt="Discover" />
                <img src="assets/payments/diners.svg" alt="Diners Club" />
                <img src="assets/payments/maestro.svg" alt="Maestro" />
              </div>
            </div>
          </div>
          <div>
<h4 class="footer-title">Quick Links</h4>
            <div class="footer-links">${(Array.isArray(s.footerQuickLinks)&&s.footerQuickLinks.length>0?s.footerQuickLinks:[{label:'Tours',href:'/routes'},{label:'Top Destinations',href:'/destinations'},{label:'Travel Guides',href:'/guides'},{label:'About Us',href:'about.html'}]).map(r=>'<a href="'+esc(r.href||'#')+'">'+esc(r.label||'')+'</a>').join('')}</div>
          </div>
          <div>
            <h4 class="footer-title">Destinations</h4>
            <div class="footer-links">${(Array.isArray(s.footerDestLinks)&&s.footerDestLinks.length>0?s.footerDestLinks:[{label:'Yunnan',href:'/destinations'},{label:'Sichuan',href:'/destinations'},{label:'Tibet',href:'/destinations'},{label:'Guangxi',href:'/destinations'}]).map(r=>'<a href="'+esc(r.href||'#')+'">'+esc(r.label||'')+'</a>').join('')}</div>
          </div>
          <div>
<h4 class="footer-title">Contact Us</h4>
            <div class="footer-contact-item">
              <i class="fas fa-phone"></i>
              <span>${settings.contact?.phone || '400-888-6789'}</span>
            </div>
            <div class="footer-contact-item">
              <i class="fas fa-envelope"></i>
              <span>${settings.contact?.email || 'service@travelway.com'}</span>
            </div>
            <div class="footer-contact-item">
              <i class="fas fa-map-marker-alt"></i>
<span>${settings.contact.address || 'China (Beijing)'}</span>
            </div>
          </div>
        </div>
        <div class="footer-bottom">
<span>${settings.copyright || '© 2026 HuanYou Travel. All rights reserved.'}</span>
          <div class="footer-bottom-links">
<a href="#">Privacy Policy</a>
<a href="#">Terms of Service</a>
<a href="${esc(s.footerSitemap || '#')}">Sitemap</a>
            ${settings.icpNumber ? `<a href="https://beian.miit.gov.cn/" target="_blank" rel="noopener">${settings.icpNumber}</a>` : ''}
          </div>
        </div>
      </div>
    `;
  }
};

// ===== Hero Carousel =====
const HeroCarousel = {
  banners: null,
  _inited: false,

  async init() {
    if (this._inited) return;
    this._inited = true;
    this.container = document.querySelector('.hero-carousel');
    if (!this.container) return;

// Use settings.banner to rebuild slides (title/subtitle toggles with carousel)
    await Settings.ensureSeeded();
    this.applyBannerSettings();

    this.slides = this.container.querySelectorAll('.hero-slide');
    this.indicators = document.querySelectorAll('.hero-indicator');
    this.leftBtn = document.querySelector('.hero-arrow-left');
    this.rightBtn = document.querySelector('.hero-arrow-right');

    this.current = 0;
    this.autoplayInterval = null;
    this.autoplayDelay = 5000;

    this.bindEvents();
    this.goTo(0);
    this.startAutoplay();
  },

// Rebuild slides
  applyBannerSettings() {
    const s = Settings.get();
    const banner = s && s.banner ? s.banner : null;
    const images = banner && Array.isArray(banner.images) ? banner.images.filter(i => i && typeof i === 'string') : [];
    if (!images.length) { this.banners = null; return; }

    const titles = banner.titles || [];
    const subtitles = banner.subtitles || [];
    this.banners = images.map((img, i) => ({ img, title: titles[i] || '', subtitle: subtitles[i] || '' }));

// Rebuild indicators
    this.container.querySelectorAll('.hero-slide').forEach(el => el.remove());
    this.banners.forEach((b, i) => {
      const div = document.createElement('div');
      div.className = 'hero-slide' + (i === 0 ? ' active' : '');
      div.innerHTML = `<img src="${b.img}" class="hero-slide-bg" alt=""><div class="hero-overlay"></div>`;
      this.container.appendChild(div);
    });

// Hover to pause
    const indWrap = document.querySelector('.hero-indicators');
    if (indWrap) {
      indWrap.innerHTML = this.banners.map((_, i) =>
        `<button class="hero-indicator${i === 0 ? ' active' : ''}" data-index="${i}"></button>`).join('');
    }
  },

  bindEvents() {
    if (this.leftBtn) this.leftBtn.addEventListener('click', () => this.prev());
    if (this.rightBtn) this.rightBtn.addEventListener('click', () => this.next());
    
    this.indicators.forEach((ind, i) => {
      ind.addEventListener('click', () => this.goTo(i));
    });

// ===== Scroll Reveal ======
    if (this.container) {
      this.container.addEventListener('mouseenter', () => this.stopAutoplay());
      this.container.addEventListener('mouseleave', () => this.startAutoplay());
    }
  },

  goTo(index) {
    this.slides[this.current].classList.remove('active');
    this.indicators[this.current].classList.remove('active');

    this.current = (index + this.slides.length) % this.slides.length;

    this.slides[this.current].classList.add('active');
    this.indicators[this.current].classList.add('active');
    this.updateHeroText();
  },

  updateHeroText() {
    if (!this.banners) return;
    const t = this.banners[this.current];
    if (!t) return;
    const titleEl = document.querySelector('.hero-title');
    const subEl = document.querySelector('.hero-subtitle');
    if (titleEl && t.title) titleEl.textContent = t.title;
    if (subEl && t.subtitle) subEl.textContent = t.subtitle;
  },

  prev() { this.goTo(this.current - 1); },
  next() { this.goTo(this.current + 1); },

  startAutoplay() {
    this.stopAutoplay();
    this.autoplayInterval = setInterval(() => this.next(), this.autoplayDelay);
  },

  stopAutoplay() {
    if (this.autoplayInterval) {
      clearInterval(this.autoplayInterval);
      this.autoplayInterval = null;
    }
  }
};

// ===== Scroll to Top ======
const ScrollReveal = {
  _inited: false,
  init() {
    if (this._inited) return;
    this._inited = true;
    this.elements = document.querySelectorAll('.reveal');
    if (!this.elements.length) return;

    this.observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          this.observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.1, rootMargin: '0px 0px -50px 0px' });

    this.elements.forEach(el => this.observer.observe(el));
  }
};

// ===== Form Validator ======
const ScrollTop = {
  _inited: false,
  init() {
    if (this._inited) return;
    this._inited = true;
    this.btn = document.querySelector('.scroll-top');
    if (!this.btn) return;

    window.addEventListener('scroll', Utils.throttle(() => {
      if (window.scrollY > 400) {
        this.btn.classList.add('visible');
      } else {
        this.btn.classList.remove('visible');
      }
    }, 100));

    this.btn.addEventListener('click', () => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }
};

const FormValidator = {
  rules: {
    required(value) {
      return value && value.trim().length > 0;
    },
    phone(value) {
      return /^1[3-9]\d{9}$/.test(value);
    },
    email(value) {
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
    },
    minLength(value, len) {
      return value && value.length >= len;
    }
  },
  messages: {
    required: 'This field is required',
    phone: 'Please enter a valid phone number',
    email: 'Please enter a valid email address',
    minLength: 'Input is too short'
  },
  validate(form) {
    let valid = true;
    const inputs = form.querySelectorAll('[data-validate]');
    inputs.forEach(input => {
      const rules = input.dataset.validate.split(',').map(r => r.trim());
      const value = input.value;
      const errorEl = input.parentElement.querySelector('.form-error');
      for (const rule of rules) {
        let pass = false;
        if (rule.includes(':')) {
          const [name, param] = rule.split(':');
          pass = this.rules[name]?.(value, param);
        } else {
          pass = this.rules[rule]?.(value);
        }
        if (!pass) {
          input.classList.add('error');
          if (errorEl) errorEl.textContent = this.messages[rule] || this.messages.required || 'Invalid input';
          valid = false;
          break;
        } else {
          input.classList.remove('error');
          if (errorEl) errorEl.textContent = '';
        }
      }
    });
    return valid;
  }
};

// ===== Page Init ======

// Anti-FOUC: hide header the moment DOMContentLoaded fires (prevent HTML defaults like "HuanYou Travel 400-xxx" from flashing)
document.addEventListener('DOMContentLoaded', async () => {
// Add header-pre-init class to prevent FOUC (HTML default "HuanYou Travel 400-xxx" from flashing)
  const _hdr = document.querySelector('.header');
  if (_hdr) _hdr.classList.add('header-pre-init');

// Wait for data.js to load before calling Settings (app.js loads before data.js)
  const _waitSettings = () => new Promise(resolve => {
    if (window.Settings) { resolve(); return; }
    const iv = setInterval(() => { if (window.Settings) { clearInterval(iv); resolve(); } }, 50);
  });
  await _waitSettings();
  await Settings.ensureSeeded();

// Init page components
  await Header.init();
  Footer.init();
  await HeroCarousel.init();
  ScrollReveal.init();
  ScrollTop.init();
  MobileNav.init();

// ===== Exports =====
  document.querySelectorAll('form[data-validate-form]').forEach(form => {
    form.addEventListener('submit', (e) => {
      if (!FormValidator.validate(form)) {
        e.preventDefault();
      }
    });
  });
});


const MobileNav = {
  _inited: false,
  init: function() {
    if (this._inited) return;
    this._inited = true;
    const btn = document.getElementById('mobile-menu-btn');
    const nav = document.getElementById('mobile-nav');
    if (!btn || !nav) return;
    btn.addEventListener('click', function() {
      nav.classList.toggle('active');
      btn.classList.toggle('active');
    });
    document.addEventListener('click', function(e) {
      if (!btn.contains(e.target) && !nav.contains(e.target)) {
        nav.classList.remove('active');
        btn.classList.remove('active');
      }
    });
  }
};

// ===== Export Global Variables =====
window.Utils = Utils;
window.Toast = Toast;
window.Modal = Modal;
window.Store = Store;
window.Header = Header;
window.Footer = Footer;
window.HeroCarousel = HeroCarousel;
window.ScrollReveal = ScrollReveal;
window.ScrollTop = ScrollTop;
window.FormValidator = FormValidator;
window.MobileNav = MobileNav;

// ===== Language Dropdown (Self-hosted i18n) =====
(function initLangDropdown() {
  // UI translation dictionary
  var I18N = {
    'en': { home:'Home', tours:'Tours', destinations:'Destinations', guides:'Travel Guides', about:'About Us', contact:'Contact',
            phone:'400-888-6789', bookNow:'Book Now', browseTours:'Browse Tours', getQuote:'Get a Quote',
            popularDest:'Popular Destinations', popularTours:'Popular Tours', travelGuides:'Travel Guides',
            viewAll:'View All Destinations', viewAllTours:'View All Tours', moreGuides:'More Travel Guides',
            searchTours:'Search Tours', destination:'Destination', duration:'Duration', budget:'Budget',
            allDest:'All Destinations', allDur:'All Durations', allBud:'All Budgets',
            learnMore:'Learn More', satisfaction:'Satisfaction', happyTravelers:'Happy Travelers',
            curatedTours:'Curated Tours', featuredDest:'Featured Destinations', testimonials:'Testimonials',
            qualityGuaranteed:'Quality Guaranteed', dedicatedSupport:'Dedicated Support',
            thoughtfulService:'Thoughtful Service', greatValue:'Great Value',
            qualityDesc:'Carefully selected suppliers with strict itinerary control',
            supportDesc:'24/7 online, real-time response to your needs',
            thoughtDesc:'Attention to detail for a worry-free journey',
            valueDesc:'No middlemen — better quality at better prices' },
    'zh-CN': { home:'首页', tours:'线路', destinations:'目的地', guides:'旅游攻略', about:'关于我们', contact:'联系我们',
            phone:'400-888-6789', bookNow:'立即预订', browseTours:'浏览线路', getQuote:'获取报价',
            popularDest:'热门目的地', popularTours:'热门线路', travelGuides:'旅游攻略',
            viewAll:'查看全部目的地', viewAllTours:'查看全部线路', moreGuides:'更多攻略',
            searchTours:'搜索线路', destination:'目的地', duration:'行程天数', budget:'预算',
            allDest:'全部目的地', allDur:'全部天数', allBud:'全部预算',
            learnMore:'了解更多', satisfaction:'满意度', happyTravelers:'满意旅客',
            curatedTours:'精选线路', featuredDest:'精选目的地', testimonials:'旅客评价',
            qualityGuaranteed:'品质保证', dedicatedSupport:'专属支持',
            thoughtfulService:'贴心服务', greatValue:'超高性价比',
            qualityDesc:'精心筛选供应商，严格把控行程质量',
            supportDesc:'7×24小时在线，实时响应您的需求',
            thoughtDesc:'注重细节，让旅途无忧',
            valueDesc:'没有中间商——更优品质更优价格' },
    'ja': { home:'ホーム', tours:'ツアー', destinations:'目的地', guides:'旅行ガイド', about:'会社概要', contact:'お問合せ',
            bookNow:'今すぐ予約', browseTours:'ツアーを見る', getQuote:'見積もりを取得',
            popularDest:'人気の目的地', popularTours:'人気ツアー', travelGuides:'旅行ガイド',
            viewAll:'全目的地を見る', viewAllTours:'全ツアーを見る', moreGuides:'もっと見る',
            searchTours:'ツアー検索', destination:'目的地', duration:'期間', budget:'予算',
            allDest:'全目的地', allDur:'全期間', allBud:'全予算',
            learnMore:'詳細' },
    'es': { home:'Inicio', tours:'Tours', destinations:'Destinos', guides:'Guías', about:'Sobre Nosotros', contact:'Contacto',
            bookNow:'Reservar', browseTours:'Ver Tours', getQuote:'Cotizar',
            popularDest:'Destinos Populares', popularTours:'Tours Populares', travelGuides:'Guías de Viaje',
            viewAll:'Ver Todos los Destinos', viewAllTours:'Ver Todos los Tours', moreGuides:'Más Guías',
            searchTours:'Buscar Tours', destination:'Destino', duration:'Duración', budget:'Presupuesto',
            allDest:'Todos los Destinos', allDur:'Todas las Duraciones', allBud:'Todos los Presupuestos',
            learnMore:'Más información' },
    'ar': { home:'الرئيسية', tours:'الجولات', destinations:'الوجهات', guides:'أدلة السفر', about:'من نحن', contact:'اتصل بنا',
            bookNow:'احجز الآن', browseTours:'تصفح الجولات', getQuote:'احصل على عرض',
            popularDest:'الوجهات الشائعة', popularTours:'الجولات الشائعة', travelGuides:'أدلة السفر',
            viewAll:'عرض جميع الوجهات', viewAllTours:'عرض جميع الجولات', moreGuides:'المزيد من الأدلة',
            searchTours:'بحث', destination:'الوجهة', duration:'المدة', budget:'الميزانية',
            allDest:'جميع الوجهات', allDur:'جميع المدد', allBud:'جميع الميزانيات',
            learnMore:'اعرف المزيد' }
  };

  var langLabelCodes = { 'en':'EN', 'zh-CN':'中文', 'ja':'日本語', 'es':'ES', 'ar':'AR' };

  // Map data-i18n keys to dictionary keys
  function applyLang(lang) {
    var dict = I18N[lang] || I18N['en'];
    // Update nav menu items (may not exist yet if Header.init is still running)
    var navLinks = document.querySelectorAll('.nav-menu a');
    var navKeys = ['home','tours','destinations','guides','about','contact'];
    navLinks.forEach(function(a, i) {
      if (navKeys[i]) a.textContent = dict[navKeys[i]] || a.textContent;
    });
    // Update any element with data-i18n
    document.querySelectorAll('[data-i18n]').forEach(function(el) {
      var key = el.getAttribute('data-i18n');
      if (dict[key]) el.textContent = dict[key];
    });
    // Update document direction for Arabic
    document.documentElement.dir = (lang === 'ar') ? 'rtl' : 'ltr';
    document.documentElement.lang = lang;
    // If nav wasn't ready yet, retry after a delay
    if (navLinks.length === 0 && lang !== 'en') {
      setTimeout(function() { applyLang(lang); }, 500);
    }
  }

  document.addEventListener("DOMContentLoaded", function () {
    var dd = document.getElementById("lang-dropdown");
    if (!dd) return;
    var btn = dd.querySelector(".lang-btn");
    var menu = dd.querySelector(".lang-menu");
    var items = menu.querySelectorAll("li");
    var btnLabel = btn.querySelector('.lang-btn-label');

    function setActive(lang) {
      items.forEach(function (li) {
        li.classList.toggle("active", li.dataset.lang === lang);
      });
      if (btnLabel) {
        btnLabel.textContent = langLabelCodes[lang] || (lang ? lang.toUpperCase() : 'EN');
      }
    }

    function changeLanguage(lang) {
      applyLang(lang);
      setActive(lang);
      try { localStorage.setItem("hyt_lang", lang); } catch (err) {}
    }

    btn.addEventListener("click", function (e) {
      e.stopPropagation();
      var open = dd.classList.toggle("open");
      btn.setAttribute("aria-expanded", open ? "true" : "false");
    });

    document.addEventListener("click", function () {
      dd.classList.remove("open");
      btn.setAttribute("aria-expanded", "false");
    });

    items.forEach(function (item) {
      item.addEventListener("click", function (e) {
        e.stopPropagation();
        var lang = this.dataset.lang;
        changeLanguage(lang);
        dd.classList.remove("open");
        btn.setAttribute("aria-expanded", "false");
      });
    });

    // Restore saved preference
    try {
      var saved = localStorage.getItem("hyt_lang");
      if (saved && saved !== "en") {
        changeLanguage(saved);
      }
    } catch (err) {}
  });
})();