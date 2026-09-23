/**
 * HuanYou Travel — SSR Function (增强版)
 * 
 * 拦截：
 *   详情页  /destination/lijiang  /guide/zhangjiajie-guide  /route/guilin-5d
 *   旧格式  /dest-detail.html?id=D001
 *   列表页  /routes  /destinations  /guides
 * 
 * 从 Supabase 拉取真实数据，服务端渲染后返回完整 HTML
 */

const path = require('path');
const fs   = require('fs');

// ─── 配置 ────────────────────────────────────────────────────────────────────
const SB_URL  = 'https://zkmfwjsexfosgotaxmnj.supabase.co';
const SB_KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InprbWZ3anNleGZvc2dvdGF4bW5qIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg4NDk4NzgsImV4cCI6MjEwNDQyNTg3OH0.L6KbpVifThZYjg7TSo182qKXaXKvfzyVhfJhzv9sgrk';
const SB_HEADERS = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` };

const TEMPLATE_BASE = path.join(__dirname, '..', '..');
const TEMPLATES = {
  destination: path.join(TEMPLATE_BASE, 'dest-detail.html'),
  guide:       path.join(TEMPLATE_BASE, 'guide-detail.html'),
  route:       path.join(TEMPLATE_BASE, 'route-detail.html'),
  routes:      path.join(TEMPLATE_BASE, 'routes.html'),
  destinations:path.join(TEMPLATE_BASE, 'destinations.html'),
  guides:      path.join(TEMPLATE_BASE, 'guides.html'),
  home:        path.join(TEMPLATE_BASE, 'index.html'),
};

// ─── 工具函数 ────────────────────────────────────────────────────────────────
async function sfetch(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const r = await fetch(url, { headers: SB_HEADERS, signal: ctrl.signal });
    if (!r.ok) return null;
    try { return await r.json(); } catch { return null; }
  } catch {
    return null; // 超时或网络错误 → 降级为静态/默认值
  } finally {
    clearTimeout(timer);
  }
}

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function mdToHtml(raw) {
  if (!raw) return '';
  let s = String(raw).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (m, alt, url) =>
    /^https?:\/\//i.test(url) ? `<img src="${url}" alt="${esc(alt)}" loading="lazy" class="md-img">` : m);
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, text, url) =>
    /^https?:\/\//i.test(url) ? `<a href="${url}" target="_blank" rel="noopener noreferrer">${text}</a>` : m);
  const inline = t => t.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  const lines = s.split('\n');
  let out = '', para = [], lt = null, li = [];
  function fp() { if (para.length) { out += '<p>' + para.join('<br>') + '</p>'; para = []; } }
  function fl() { if (lt && li.length) { out += '<' + lt + '>'; li.forEach(x => out += '<li>' + inline(x) + '</li>'); out += '</' + lt + '>'; } lt = null; li = []; }
  for (const ln of lines) {
    if (/^###\s+/.test(ln))      { fp(); fl(); out += '<h4>' + ln.replace(/^###\s+/, '') + '</h4>'; }
    else if (/^##\s+/.test(ln))  { fp(); fl(); out += '<h3>' + ln.replace(/^##\s+/, '') + '</h3>'; }
    else if (/^#\s+/.test(ln))  { fp(); fl(); out += '<h2>' + ln.replace(/^#\s+/, '') + '</h2>'; }
    else if (/^(\d+)\.\s+(.*)$/.test(ln)) {
      const m = ln.match(/^(\d+)\.\s+(.*)$/);
      if (lt !== 'ol') { fp(); fl(); lt = 'ol'; }
      li.push(m[2]);
    } else if (/^[-*]\s+(.*)$/.test(ln)) {
      const m = ln.match(/^[-*]\s+(.*)$/);
      if (lt !== 'ul') { fp(); fl(); lt = 'ul'; }
      li.push(m[1]);
    } else if (ln.trim() === '') { fp(); fl(); }
    else { if (lt) li[li.length - 1] += '<br>' + ln; else para.push(ln); }
  }
  fp(); fl();
  return out;
}

function makeDesc(raw, suffix) {
  if (!raw) return '';
  const budget = Math.max(40, 160 - (suffix || '').length);
  let cut = String(raw).replace(/^#+ .*$/gm, '').replace(/[*_`>\[\]()]/g, '').replace(/\n+/g, ' ').trim();
  if (cut.length > budget) {
    const idx = cut.lastIndexOf(' ', budget);
    cut = idx > 40 ? cut.slice(0, idx) : cut.slice(0, budget);
  }
  return cut + (suffix || '');
}

function slugify(name) {
  if (!name) return '';
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function readTemplate(name) {
  const fp = TEMPLATES[name];
  if (!fp || !fs.existsSync(fp)) return null;
  return fs.readFileSync(fp, 'utf8');
}

// ─── 首页 SSR ────────────────────────────────────────────────────────────────
// 平衡 div 深度匹配：返回与 openStart（'<' 位置）对应的 </div> 起始位置
function findMatchingCloseDiv(s, openStart) {
  let depth = 1;
  let i = openStart + 4; // past '<div'
  while (i < s.length) {
    const nextLT = s.indexOf('<', i);
    if (nextLT === -1) return -1;
    if (s.startsWith('</div>', nextLT)) {
      depth--;
      if (depth === 0) return nextLT;
      i = nextLT + 6;
    } else if (s.startsWith('<div', nextLT) && /[\s>]/.test(s[nextLT + 4] || '')) {
      depth++;
      const gt = s.indexOf('>', nextLT);
      if (gt === -1) return -1;
      i = gt + 1;
    } else {
      const gt = s.indexOf('>', nextLT);
      if (gt === -1) return -1;
      i = gt + 1;
    }
  }
  return -1;
}

// 渲染首页：用 settings.banner 替换 hero 默认轮播（消除首屏老图闪烁）
function renderHome(tpl, settings) {
  if (!tpl) return null;
  let html = tpl;
  const banner = settings && settings.banner ? settings.banner : null;
  const images = banner && Array.isArray(banner.images)
    ? banner.images.filter(i => i && typeof i === 'string') : [];

  // SEO <title> 与 meta description
  const seoTitle = (banner && banner.siteTitle) ? banner.siteTitle
    : 'HuanYou Travel - Making Every Journey a Beautiful Memory';
  const seoDesc = (banner && banner.siteDescription) ? banner.siteDescription
    : 'Professional travel booking platform offering guided tours and self-guided travel services across China.';
  html = html.replace(/<title>[^<]*<\/title>/, `<title>${esc(seoTitle)}</title>`);
  html = html.replace(/<meta name="description" content="[^"]*"/, `<meta name="description" content="${esc(seoDesc)}"`);

  if (images.length === 0) return html; // 无 banner 数据，保持默认静态图

  const titles    = Array.isArray(banner.titles)    ? banner.titles    : [];
  const subtitles = Array.isArray(banner.subtitles) ? banner.subtitles : [];

  // 1) 替换 hero-carousel 内部的 3 张默认 slide 为 settings.banner.images
  const carouselStart = html.indexOf('<div class="hero-carousel" id="hero-carousel">');
  if (carouselStart >= 0) {
    const openTagEnd  = html.indexOf('>', carouselStart) + 1;
    const carouselEnd = findMatchingCloseDiv(html, carouselStart);
    if (carouselEnd > openTagEnd) {
      const closeTagEnd = carouselEnd + '</div>'.length;
      const slidesHtml  = images.map((img, i) =>
        `      <div class="hero-slide${i === 0 ? ' active' : ''}">\n` +
        `<img src="${esc(img)}" class="hero-slide-bg" alt="">\n` +
        `        <div class="hero-overlay"></div>\n` +
        `      </div>`
      ).join('\n');
      html = html.slice(0, openTagEnd) + '\n' + slidesHtml + '\n    ' + html.slice(carouselEnd);
    }
  }

  // 2) 替换 hero-indicators
  const indHtml = images.map((_, i) =>
    `      <button class="hero-indicator${i === 0 ? ' active' : ''}" data-index="${i}"></button>`
  ).join('\n');
  html = html.replace(/(<div class="hero-indicators">\s*)[\s\S]*?(\s*<\/div>)/, '$1' + indHtml + '$2');

  // 3) 替换 hero-title / hero-subtitle（取第一张图的标题/副标题）
  if (titles[0]) {
    html = html.replace(/(<h1 class="hero-title">)[^<]*(<\/h1>)/, '$1' + esc(titles[0]) + '$2');
  }
  if (subtitles[0]) {
    html = html.replace(/(<p class="hero-subtitle">)[^<]*(<\/p>)/, '$1' + esc(subtitles[0]) + '$2');
  }

  return html;
}

// ─── 目的地 SSR ───────────────────────────────────────────────────────────────
function renderDest(tpl, dest) {
  if (!tpl || !dest) return null;
  const tags  = Array.isArray(dest.tags) ? dest.tags : [];
  const highs = Array.isArray(dest.highlights) ? dest.highlights : [];

  const seoTitle = dest.seoTitle ? esc(dest.seoTitle) : `${esc(dest.name)}${tags.length ? ' | ' + tags.slice(0, 2).join(' & ') : ''} - HuanYou Travel`;
  const seoDesc  = dest.seoDescription ? esc(dest.seoDescription) : makeDesc(dest.summary || dest.content, tags.length ? ` Highlights: ${tags.join(', ')}.` : '');

  let html = tpl;
  html = html.replace(/<title[^>]*>[^<]*<\/title>/, `<title>${seoTitle}</title>`);
  html = html.replace(/<meta name="description"[^>]*>/, `<meta name="description" content="${esc(seoDesc)}">`);
  html = html.replace(/<img src="" alt="[^"]*"/, `<img src="${esc(dest.cover || dest.image || '')}" alt="${esc(dest.name)}"`);
  html = html.replace(/(<h1 class="page-title">)[^<]*(<\/h1>)/, `$1${esc(dest.name)}$2`);
  html = html.replace(/(<h1 class="dest-detail-title">)[^<]*(<\/h1>)/, `$1${esc(dest.name)}$2`);
  html = html.replace(/(<span class="current">)[^<]*(<\/span>)/, `$1${esc(dest.name)}$2`);
  html = html.replace(/(<div class="dest-detail-desc">)[^<]*(<\/div>)/,
    `<div class="dest-detail-desc">${mdToHtml(dest.content || dest.summary || '')}</div>`);
  if (tags.length) {
    const tagsHtml = tags.map(t => `<span class="dest-detail-tag-chip"><i class="fas fa-tag"></i> ${esc(t)}</span>`).join('');
    html = html.replace(/(<div class="dest-detail-tags" id="dest-tags">)[^<]*(<\/div>)/,
      `<div class="dest-detail-tags" id="dest-tags">${tagsHtml}</div>`);
  }
  if (highs.length) {
    const attHtml = highs.map(h =>
      `<div class="dest-attraction-item">
        <div class="dest-attraction-name"><i class="fas fa-map-marker-alt"></i> ${esc(h.name || h.title || '')}</div>
        <div class="dest-attraction-desc">${esc(h.desc || h.description || h.summary || '')}</div>
      </div>`
    ).join('');
    html = html.replace(/(<div class="dest-attractions" id="dest-attractions">)[^<]*(<\/div>)/,
      `<div class="dest-attractions" id="dest-attractions">${attHtml}</div>`);
  }
  return html;
}

// ─── 攻略 SSR ────────────────────────────────────────────────────────────────
function renderGuide(tpl, guide) {
  if (!tpl || !guide) return null;
  const tags = Array.isArray(guide.tags) ? guide.tags : [];
  const subParts = [];
  if (guide.category) subParts.push(guide.category);
  if (tags.length) subParts.push(tags[0]);
  const subTitle = subParts.length ? ' | ' + subParts.slice(0, 2).join(' · ') : '';
  const seoTitle = guide.seoTitle ? esc(guide.seoTitle) : `${esc(guide.title || 'Guide')}${subTitle} - HuanYou Travel`;
  const seoDesc  = guide.seoDescription ? esc(guide.seoDescription) : makeDesc(guide.summary, tags.length ? ` Tags: ${tags.join(', ')}.` : guide.category ? ` Category: ${guide.category}.` : '');

  let html = tpl;
  html = html.replace(/<title[^>]*>[^<]*<\/title>/, `<title>${seoTitle}</title>`);
  html = html.replace(/<meta name="description"[^>]*>/, `<meta name="description" content="${esc(seoDesc)}">`);
  html = html.replace(/<img src="" alt="[^"]*"/, `<img src="${esc(guide.cover || guide.image || '')}" alt="${esc(guide.title || '')}"`);
  html = html.replace(/(<h1 class="page-title">)[^<]*(<\/h1>)/, `$1${esc(guide.title || '')}$2`);
  html = html.replace(/(<div class="guide-detail-body">\s*<h1>)[^<]*(<\/h1>)/, `$1${esc(guide.title || '')}$2`);
  html = html.replace(/(<span class="current">)[^<]*(<\/span>)/, `$1${esc(guide.title || '')}$2`);
  const metaHtml = `<span><i class="fas fa-eye"></i> ${guide.views || 0} views</span>` +
    (guide.category ? `<span><i class="fas fa-tag"></i> ${esc(guide.category)}</span>` : '');
  html = html.replace(/(<div class="guide-detail-meta">)[^<]*(<\/div>)/, `$1${metaHtml}$2`);
  html = html.replace(/(<div class="guide-detail-text">)[\s\S]*?(<\/div>)/m,
    `$1${mdToHtml(guide.content || guide.summary || '')}$2`);
  return html;
}

// ─── 线路 SSR ────────────────────────────────────────────────────────────────
function renderRoute(tpl, route) {
  if (!tpl || !route) return null;
  const tags      = Array.isArray(route.tags) ? route.tags : [];
  const itinerary = Array.isArray(route.itinerary) ? route.itinerary : [];
  const included  = Array.isArray(route.included) ? route.included : [];
  const excluded  = Array.isArray(route.excluded) ? route.excluded : [];

  const subParts = [];
  if (route.destination) subParts.push(route.destination);
  if (route.days) subParts.push(`${route.days} Days`);
  if (tags.length) subParts.push(tags[0]);
  const subTitle = subParts.length ? ' | ' + subParts.join(' · ') : '';
  const seoTitle = route.seoTitle ? esc(route.seoTitle) : `${esc(route.title || 'Tour')}${subTitle} - HuanYou Travel`;
  const seoDesc  = route.seoDescription ? esc(route.seoDescription) : makeDesc(route.description || route.summary || route.content || '',
    tags.length ? ` Highlights: ${tags.join(', ')}.` : '');

  let html = tpl;
  html = html.replace(/<title[^>]*>[^<]*<\/title>/, `<title>${seoTitle}</title>`);
  html = html.replace(/<meta name="description"[^>]*>/, `<meta name="description" content="${esc(seoDesc)}">`);
  const heroImg = route.cover || route.image || route.banner || '';
  html = html.replace(/(<img id="hero-img" src=")[^"]*(")/, `$1${esc(heroImg)}$2`);
  html = html.replace(/(<img id="hero-img"[^>]*alt=")[^"]*(")/, `$1${esc(route.title || '')}$2`);
  if (route.heroWidth) {
    html = html.replace(/(<div class="route-detail-hero"[^>]*)>/, '$1 style="max-width:' + parseInt(route.heroWidth) + 'px;">');
  }
  const pageSub = `${route.destination ? route.destination + ' · ' : ''}${route.days || 0} Days ${Math.max(0, (route.days || 0) - 1)} Nights`;
  html = html.replace(/(<h1[^>]*id="page-title">)[^<]*(<\/h1>)/, `$1${esc(route.title || '')}$2`);
  html = html.replace(/(<p class="page-subtitle" id="page-subtitle">)[^<]*(<\/p>)/, `$1${esc(pageSub)}$2`);
  html = html.replace(/(<h1[^>]*id="info-title">)[^<]*(<\/h1>)/, `$1${esc(route.title || '')}$2`);
  const subtitle2 = route.subtitle || `${route.days || 0}-Day ${route.destination || ''} Tour`;
  html = html.replace(/(<p class="route-detail-subtitle" id="info-subtitle">)[^<]*(<\/p>)/, `$1${esc(subtitle2)}$2`);
  const tagsHtml = tags.map(esc).join(' · ');
  const metaHtml =
    `<span><i class="fas fa-eye"></i> ${route.views || 0} views</span>` +
    (route.destination ? `<span><i class="fas fa-map-marker-alt"></i> ${esc(route.destination)}</span>` : '') +
    (tagsHtml ? `<span><i class="fas fa-tag"></i> ${tagsHtml}</span>` : '');
  html = html.replace(/(<div class="route-detail-meta" id="info-meta">)[^<]*(<\/div>)/, `$1${metaHtml}$2`);
  html = html.replace(/(<span class="price-big[^"]*" id="price-big">)[^<]*(<\/span>)/, `$1¥${route.price || 0}$2`);
  const origPrice = route.originalPrice || Math.round((route.price || 0) * 1.2);
  html = html.replace(/(<span class="price-original[^"]*" id="price-original">)[^<]*(<\/span>)/, `$1¥${origPrice}$2`);
  html = html.replace(/(<a[^>]*id="booking-btn"[^>]*href=")[^"]*(")/, `$1booking.html?route=${route.id}$2`);
  let summary = route.description || route.summary || '';
  if (!summary && route.highlights && route.highlights.length) {
    summary = `Explore ${route.destination || ''} on this ${route.days || 0}-day tour covering ${route.highlights.slice(0, 3).join('、')}.`;
  }
  html = html.replace(/(<p class="route-overview-summary" id="overview-summary">)[^<]*(<\/p>)/, `$1${esc(summary)}$2`);
  if (itinerary.length) {
    const nodes = [];
    itinerary.forEach(d => (d.title || '').split('→').map(s => s.trim()).filter(Boolean).forEach(p => { if (!nodes.includes(p)) nodes.push(p); }));
    const routeHtml = nodes.map((n, i) => `${i > 0 ? '<li class="arrow">→</li>' : ''}<li>${esc(n)}</li>`).join('');
    html = html.replace(/(<ul class="route-route-list" id="overview-route">)[^<]*(<\/ul>)/,
      `<ul class="route-route-list" id="overview-route">${routeHtml}</ul>`);
  }
  if (route.highlights && route.highlights.length) {
    const hlHtml = route.highlights.map(h => `<li><i class="fas fa-star"></i> ${esc(h)}</li>`).join('');
    html = html.replace(/(<ul class="highlight-list" id="overview-highlights">)[^<]*(<\/ul>)/,
      `<ul class="highlight-list" id="overview-highlights">${hlHtml}</ul>`);
  }
  if (itinerary.length) {
    const itHtml = itinerary.map(function(d) {
      var imgHtml = '';
      if (d.image) {
        imgHtml = '<img class="itinerary-day-image" src="' + esc(d.image) + '" alt="' + esc(d.title || '') + '" loading="lazy" onerror="this.style.display=\'none\'"' + (d.imageWidth ? ' style="max-width:' + parseInt(d.imageWidth) + 'px"' : '') + '>';
      }
      return '<div class="itinerary-day">' +
        '<div class="itinerary-day-header">' +
          '<span class="itinerary-day-num">Day ' + esc(d.day || '') + '</span>' +
          '<span class="itinerary-day-title">' + esc(d.title || '') + '</span>' +
        '</div>' +
        '<p>' + esc(d.description || '') + '</p>' +
        imgHtml +
      '</div>';
    }).join('');
    html = html.replace(/(<div id="itinerary-list">)[^<]*(<\/div>)/, '<div id="itinerary-list">' + itHtml + '</div>');
  }
  if (included.length) {
    html = html.replace(/(<ul class="included-list" id="included-list">)[^<]*(<\/ul>)/,
      `<ul class="included-list" id="included-list">${included.map(x => `<li>${esc(x)}</li>`).join('')}</ul>`);
  }
  if (excluded.length) {
    html = html.replace(/(<ul class="excluded-list" id="excluded-list">)[^<]*(<\/ul>)/,
      `<ul class="excluded-list" id="excluded-list">${excluded.map(x => `<li>${esc(x)}</li>`).join('')}</ul>`);
  }
  html = html.replace(/class="route-detail-placeholder"/g, '');
  return html;
}

// ─── 列表页 SSR ─────────────────────────────────────────────────────────────

// 线路卡片（复刻 data.js createCard 逻辑，无收藏按钮）
function makeRouteCard(route) {
  const tags = (route.tags || []).map(tag => {
    const cls = tag === 'Popular' ? 'badge-hot' : tag === 'New' ? 'badge-new-badge' : tag === 'Deal' ? 'badge-sale' : 'badge-recommend';
    return `<span class="route-card-badge ${cls}">${esc(tag)}</span>`;
  }).join('');
  const nights = route.nights || Math.max(0, (route.days || 0) - 1);
  const highlights = (route.highlights || []).slice(0, 3).map(h => `<span class="route-card-highlight">${esc(h)}</span>`).join('');
  const origPriceHtml = (route.originalPrice > route.price)
    ? `<span class="route-card-price-original">¥${route.originalPrice.toLocaleString()}</span>` : '';

  return `<article class="route-card" data-id="${esc(route.id)}">
    <div class="route-card-image">
      <a href="route-detail.html?id=${esc(route.id)}">
        <img src="${esc(route.cover || '')}" alt="${esc(route.title || '')}" loading="lazy" onerror="this.src='https://via.placeholder.com/400x220/E8F5E9/2E7D32?text=Route'">
      </a>
      <div class="route-card-badges">${tags}</div>
    </div>
    <div class="route-card-body">
      <div class="route-card-meta">
        <span><i class="fas fa-map-marker-alt"></i> ${esc(route.destination || '')}</span>
        <span><i class="far fa-clock"></i> ${route.days || 0} Days ${nights} Nights</span>
      </div>
      <h3 class="route-card-title">
        <a href="route-detail.html?id=${esc(route.id)}">${esc(route.title || '')}</a>
      </h3>
      <div class="route-card-highlights">${highlights}</div>
      <div class="route-card-footer">
        <div class="route-card-price">
          <span class="route-card-price-value">¥${(route.price || 0).toLocaleString()}</span>
          <span class="route-card-price-unit">/person</span>
          ${origPriceHtml}
        </div>
        <a href="route-detail.html?id=${esc(route.id)}" class="route-card-btn">View Details</a>
      </div>
    </div>
  </article>`;
}

// 目的地卡片（复刻 data.js createCard 逻辑）
function makeDestCard(dest) {
  const tags = (dest.tags || []).map(t => `<span class="dest-tag">${esc(t)}</span>`).join('');
  return `<article class="dest-card" data-id="${esc(dest.id)}">
    <a href="dest-detail.html?id=${esc(dest.id)}" class="dest-card-link">
      <div class="dest-card-image">
        <img src="${esc(dest.cover || '')}" alt="${esc(dest.name || '')}" loading="lazy" onerror="this.src='https://via.placeholder.com/400x300/E8F5E9/2E7D32?text=Dest'">
        ${dest.featured ? '<span class="dest-card-badge">Featured</span>' : ''}
      </div>
      <div class="dest-card-body">
        <h3 class="dest-card-title">${esc(dest.name || '')}</h3>
        <p class="dest-card-region"><i class="fas fa-map-marker-alt"></i> ${esc(dest.region || '')}</p>
        <p class="dest-card-summary">${esc(dest.summary || '')}</p>
        <div class="dest-card-tags">${tags}</div>
        <div class="dest-card-footer">
          <span class="dest-card-meta"><i class="fas fa-route"></i> ${dest.routeCount || 0} routes</span>
          <span class="dest-card-meta"><i class="fas fa-book-open"></i> ${dest.guideCount || 0} guides</span>
        </div>
      </div>
    </a>
  </article>`;
}

// 攻略卡片（复刻 data.js createCard 逻辑）
function makeGuideCard(guide) {
  const cat = guide.category ? `<span class="guide-card-category">${esc(guide.category)}</span>` : '';
  return `<article class="guide-card" data-id="${esc(guide.id)}">
    <a href="guide-detail.html?id=${esc(guide.id)}" class="guide-card-link">
      <div class="guide-card-image">
        <img src="${esc(guide.cover || '')}" alt="${esc(guide.title || '')}" loading="lazy" onerror="this.src='https://via.placeholder.com/400x250/E8F5E9/2E7D32?text=Guide'">
        ${cat}
      </div>
      <div class="guide-card-body">
        <h3 class="guide-card-title">${esc(guide.title || '')}</h3>
        <p class="guide-card-summary">${esc(guide.summary || '')}</p>
        <div class="guide-card-meta">
          <span><i class="fas fa-user"></i> ${esc(guide.author || 'HuanYou Travel')}</span>
          <span><i class="fas fa-eye"></i> ${guide.views || 0}</span>
          ${guide.publishTime ? `<span><i class="far fa-calendar"></i> ${esc(guide.publishTime)}</span>` : ''}
        </div>
      </div>
    </a>
  </article>`;
}

// 渲染列表页
function renderListPage(tpl, items, makeCardFn, pageTitle, seoDesc, containerId) {
  if (!tpl) return null;
  let html = tpl;
  const cardsHtml = items.map(makeCardFn).join('');
  html = html.replace(/<title[^>]*>[^<]*<\/title>/, `<title>${pageTitle}</title>`);
  if (seoDesc) {
    html = html.replace(/<meta name="description"[^>]*>/, `<meta name="description" content="${esc(seoDesc)}">`);
  }
  html = html.replace(new RegExp(`(<div[^>]*id="${containerId}"[^>]*>)[^<]*(</div>)`, 'i'),
    `$1${cardsHtml}$2`);
  return html;
}

// ─── 主入口 ──────────────────────────────────────────────────────────────────
function generateSitemap(routes, destinations, guides) {
  const BASE = 'https://tuyou001.com';
  const now = new Date().toISOString().split('T')[0];
  const urls = [];

  const staticPages = [
    { path: '/', priority: '1.0', changefreq: 'daily' },
    { path: '/about.html', priority: '0.8', changefreq: 'monthly' },
    { path: '/routes.html', priority: '0.9', changefreq: 'weekly' },
    { path: '/destinations.html', priority: '0.9', changefreq: 'weekly' },
    { path: '/guides.html', priority: '0.8', changefreq: 'weekly' },
    { path: '/contact.html', priority: '0.6', changefreq: 'monthly' },
    { path: '/booking.html', priority: '0.7', changefreq: 'monthly' }
  ];
  staticPages.forEach(function(p) {
    urls.push('  <url>\n    <loc>' + BASE + p.path + '</loc>\n    <lastmod>' + now + '</lastmod>\n    <changefreq>' + p.changefreq + '</changefreq>\n    <priority>' + p.priority + '</priority>\n  </url>');
  });

  if (Array.isArray(routes)) {
    routes.forEach(function(r) {
      var slug = r.slug || r.id;
      urls.push('  <url>\n    <loc>' + BASE + '/route/' + slug + '</loc>\n    <lastmod>' + (r.createdAt ? String(r.createdAt).split('T')[0] : now) + '</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>0.8</priority>\n  </url>');
    });
  }
  if (Array.isArray(destinations)) {
    destinations.forEach(function(d) {
      var slug = d.slug || d.id;
      urls.push('  <url>\n    <loc>' + BASE + '/destination/' + slug + '</loc>\n    <lastmod>' + (d.createdAt ? String(d.createdAt).split('T')[0] : now) + '</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>0.8</priority>\n  </url>');
    });
  }
  if (Array.isArray(guides)) {
    guides.forEach(function(g) {
      var slug = g.slug || g.id;
      urls.push('  <url>\n    <loc>' + BASE + '/guide/' + slug + '</loc>\n    <lastmod>' + (g.createdAt ? String(g.createdAt).split('T')[0] : now) + '</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>0.7</priority>\n  </url>');
    });
  }

  return '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + urls.join('\n') + '\n</urlset>';
}

exports.handler = async function (event, context) {
  const { path: rawPath, queryStringParameters: qp } = event;
  const urlPath = (rawPath || '/').replace(/\/$/, '');

  // --- Sitemap ---
  if (urlPath === '/sitemap.xml') {
    try {
      const [rRows, dRows, gRows] = await Promise.all([
        sfetch(SB_URL + '/rest/v1/routes?select=id,data'),
        sfetch(SB_URL + '/rest/v1/destinations?select=id,data'),
        sfetch(SB_URL + '/rest/v1/guides?select=id,data')
      ]);
      const routes = (rRows || []).map(r => r.data).filter(d => d && d.status === 'published');
      const destinations = (dRows || []).map(d => d.data).filter(d => d && d.status !== 'draft');
      const guides = (gRows || []).map(g => g.data).filter(d => d && d.status === 'published');
      const xml = generateSitemap(routes, destinations, guides);
      return { statusCode: 200, headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=3600' }, body: xml };
    } catch (e) { return { statusCode: 500, body: 'Sitemap error' }; }
  }

  // --- robots.txt ---
  if (urlPath === '/robots.txt') {
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'text/plain' },
      body: 'User-agent: *\nAllow: /\n\nSitemap: https://tuyou001.com/sitemap.xml\n'
    };
  }

  // ── 首页 SSR ──────────────────────────────────────────────────────────────
  if (urlPath === '' || urlPath === '/' || urlPath === '/index.html') {
    const tpl = readTemplate('home');
    if (!tpl) return { statusCode: 500, body: 'Template error' };
    const rows = await sfetch(`${SB_URL}/rest/v1/settings?id=eq.site&select=data`);
    const settings = rows && rows[0] ? rows[0].data : null;
    const html = renderHome(tpl, settings);
    if (!html) return { statusCode: 500, body: 'Render error' };
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'public, max-age=60, stale-while-revalidate=300',
        'X-SSR': 'true',
      },
      body: html,
    };
  }

  // ── 列表页 SSR ────────────────────────────────────────────────────────────
  if (urlPath === '/routes' || urlPath === '/routes.html') {
    const tpl = readTemplate('routes');
    const rows = await sfetch(`${SB_URL}/rest/v1/routes?select=id,data&order=id`);
    if (!rows || !rows.length) return { statusCode: 500, body: 'Database error' };
    const routes = rows.map(r => r.data).filter(d => d && d.status === 'published');
    routes.sort((a, b) => (b.views || 0) - (a.views || 0));
    const count = routes.length;
    const title = `Tours (${count}) - HuanYou Travel`;
    const desc = `Browse ${count} curated multi-day tour routes across China. From Yunnan to Sichuan, find your perfect trip with HuanYou Travel.`;
    const html = renderListPage(tpl, routes, makeRouteCard, title, desc, 'routes-grid');
    if (!html) return { statusCode: 500, body: 'Render error' };
    return { statusCode: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=60, stale-while-revalidate=300', 'X-SSR': 'true' }, body: html };
  }

  if (urlPath === '/destinations' || urlPath === '/destinations.html') {
    const tpl = readTemplate('destinations');
    const rows = await sfetch(`${SB_URL}/rest/v1/destinations?select=id,data&order=id`);
    if (!rows || !rows.length) return { statusCode: 500, body: 'Database error' };
    const dests = rows.map(r => r.data).filter(d => d && d.status === 'published');
    dests.sort((a, b) => (b.popularity || '').length - (a.popularity || '').length || (b.routeCount || 0) - (a.routeCount || 0));
    const count = dests.length;
    const title = `Popular Destinations (${count}) - HuanYou Travel`;
    const desc = `Explore ${count} extraordinary destinations across China. From Lijiang to Zhangjiajie, discover hidden beauty with HuanYou Travel.`;
    const html = renderListPage(tpl, dests, makeDestCard, title, desc, 'destinations-grid');
    if (!html) return { statusCode: 500, body: 'Render error' };
    return { statusCode: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=60, stale-while-revalidate=300', 'X-SSR': 'true' }, body: html };
  }

  if (urlPath === '/guides' || urlPath === '/guides.html') {
    const tpl = readTemplate('guides');
    const rows = await sfetch(`${SB_URL}/rest/v1/guides?select=id,data&order=id`);
    if (!rows || !rows.length) return { statusCode: 500, body: 'Database error' };
    const guides = rows.map(r => r.data).filter(d => d && d.status === 'published');
    guides.sort((a, b) => new Date(b.publishTime || 0) - new Date(a.publishTime || 0));
    const count = guides.length;
    const title = `Travel Guides (${count}) - HuanYou Travel`;
    const desc = `Expert travel guides for China destinations. Practical tips, photography advice, cultural insights and seasonal recommendations from HuanYou Travel.`;
    const html = renderListPage(tpl, guides, makeGuideCard, title, desc, 'guides-grid');
    if (!html) return { statusCode: 500, body: 'Render error' };
    return { statusCode: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=60, stale-while-revalidate=300', 'X-SSR': 'true' }, body: html };
  }

  // ── 详情页 SSR ────────────────────────────────────────────────────────────
  let type, idOrSlug;
  if (urlPath === '/dest-detail.html' || urlPath === '/guide-detail.html' || urlPath === '/route-detail.html') {
    type = urlPath === '/dest-detail.html' ? 'destination' : urlPath === '/guide-detail.html' ? 'guide' : 'route';
    if (!qp || !qp.id) return { statusCode: 404, body: 'Missing id' };
    idOrSlug = qp.id;
  } else {
    const parts = urlPath.split('/').filter(Boolean);
    if (parts.length < 2) return { statusCode: 404, body: 'Not Found' };
    [type, idOrSlug] = parts;
  }
  const slugLower = (idOrSlug || '').toLowerCase();

  let item = null;

  if (type === 'destination') {
    const rows = await sfetch(`${SB_URL}/rest/v1/destinations?select=id,data&order=id`);
    if (!rows || !rows.length) return { statusCode: 500, body: 'Database error' };
    item = rows.map(r => r.data).find(d => d && slugify(d.name || '') === slugLower);
    if (!item) item = rows.map(r => r.data).find(d => d && d.id === idOrSlug);
  } else if (type === 'guide') {
    const rows = await sfetch(`${SB_URL}/rest/v1/guides?select=id,data&order=id`);
    if (!rows || !rows.length) return { statusCode: 500, body: 'Database error' };
    item = rows.map(r => r.data).find(d => d && slugify(d.title || '') === slugLower);
    if (!item) item = rows.map(r => r.data).find(d => d && d.id === idOrSlug);
  } else if (type === 'route') {
    const rows = await sfetch(`${SB_URL}/rest/v1/routes?select=id,data&order=id`);
    if (!rows || !rows.length) return { statusCode: 500, body: 'Database error' };
    item = rows.map(r => r.data).find(d => d && slugify(d.title || '') === slugLower);
    if (!item) item = rows.map(r => r.data).find(d => d && d.id === idOrSlug);
  } else {
    return { statusCode: 404, body: 'Not Found' };
  }

  if (!item) return { statusCode: 404, body: 'Not Found' };

  let html;
  if (type === 'destination') html = renderDest(readTemplate('destination'), item);
  else if (type === 'guide')  html = renderGuide(readTemplate('guide'), item);
  else                        html = renderRoute(readTemplate('route'), item);

  if (!html) return { statusCode: 500, body: 'Render error' };

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=60, stale-while-revalidate=300',
      'X-SSR': 'true',
    },
    body: html,
  };
};
