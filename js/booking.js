/* =============================================
// HuanYou Travel | Booking Module
   ============================================= */

// ===== Booking Page Logic =====
const BookingPage = {
  routeId: null,
  routeData: null,
  _inited: false,

  async init() {
    if (this._inited) return;
    this._inited = true;
    this.routeId = Utils.getUrlParam('route') || Utils.getUrlParam('id');
    
    if (this.routeId) {
      await this.loadRoute();
    }
    
    this.bindEvents();
  },

  async loadRoute() {
    this.routeData = await RouteRenderer.renderDetail(this.routeId);
    
    if (this.routeData) {
      this.renderSummary();
    }
  },

  renderSummary() {
    const summaryEl = document.getElementById('booking-summary');
    if (summaryEl) {
      const r = this.routeData;
      summaryEl.innerHTML = `
<img src="${r.cover}" alt="${r.title}" class="booking-summary-image" onerror="this.src='https://via.placeholder.com/100x70/E8F5E9/2E7D32?text=Route'">
        <div class="booking-summary-info">
          <div class="booking-summary-title">${r.title}</div>
          <div class="booking-summary-meta">
            <i class="fas fa-map-marker-alt"></i> ${r.destination} ·
<i class="far fa-clock"></i> ${r.days} Days ${r.nights || r.days - 1} Nights
          </div>
        </div>
        <div class="booking-summary-price">
          <div class="price" style="font-size:var(--font-size-2xl)">¥${r.price.toLocaleString()}</div>
<div class="price-unit">From /person</div>
        </div>
      `;
    }
  },

  bindEvents() {
    const form = document.getElementById('booking-form');
    if (!form) return;

// Update total price when traveler count changes
    const peopleInput = form.querySelector('[name="people"]');
    if (peopleInput) {
      peopleInput.addEventListener('input', () => this.updateTotalPrice());
    }

// Submit form
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      this.handleSubmit(form);
    });
  },

  updateTotalPrice() {
    const form = document.getElementById('booking-form');
    const people = parseInt(form.querySelector('[name="people"]')?.value) || 1;
    const price = this.routeData?.price || 0;
    const total = price * people;

    const totalEl = document.getElementById('total-price');
    if (totalEl) {
      totalEl.textContent = '¥' + total.toLocaleString();
    }
  },

  async handleSubmit(form) {
    if (!FormValidator.validate(form)) {
Toast.error('Please check the form');
      return;
    }

    const formData = new FormData(form);
    const data = {
      id: 'O' + Date.now().toString().slice(-8),
      routeId: this.routeId,
routeTitle: this.routeData?.title || 'No route selected',
      routePrice: this.routeData?.price || 0,
      name: formData.get('name'),
      phone: formData.get('phone'),
      email: formData.get('email') || '',
      travelDate: formData.get('travelDate'),
      people: parseInt(formData.get('people')) || 1,
      remark: formData.get('remark') || '',
      totalPrice: (this.routeData?.price || 0) * (parseInt(formData.get('people')) || 1),
      status: 'pending',
      createTime: Utils.formatDateTime(new Date())
    };

// Cloud mode: order to Supabase (visible in admin immediately); local mode: to browser localStorage
    if (Store.isCloud()) {
      this._submitting = true;
      const btn = form.querySelector('button[type="submit"]');
if (btn) { btn.disabled = true; btn.textContent = 'Submitting…'; }
      try {
        await Cloud.upsert('orders', data);
        Cloud.pushCache && Cloud.pushCache('orders', data);
Toast.success('Booking submitted successfully!');
        this.showSuccessModal(data);
        form.reset();
      } catch (err) {
Toast.error('Submission failed, please try again: ' + ((err && err.message) || err));
      } finally {
if (btn) { btn.disabled = false; btn.textContent = 'Submit Booking'; }
        this._submitting = false;
      }
      return;
    }

    Store.saveOrder(data);
    this.showSuccessModal(data);
    form.reset();
  },

  showSuccessModal(order) {
    const html = `
      <div class="modal-overlay" id="booking-success-modal">
        <div class="modal" style="max-width:480px;text-align:center;">
          <div class="modal-body" style="padding:var(--space-2xl);">
            <div style="width:80px;height:80px;background:var(--color-primary-bg);border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto var(--space-lg);font-size:40px;color:var(--color-primary);">
              <i class="fas fa-check"></i>
            </div>
<h2 style="font-size:var(--font-size-2xl);margin-bottom:var(--space-sm);">Booking Submitted!</h2>
<p style="color:var(--color-text-secondary);margin-bottom:var(--space-lg);">Your order has been received. We'll contact you within 24 hours to confirm.</p>
            <div style="background:var(--color-bg);border-radius:var(--radius-lg);padding:var(--space-lg);margin-bottom:var(--space-lg);text-align:left;">
              <div style="display:flex;justify-content:space-between;margin-bottom:var(--space-sm);">
<span style="color:var(--color-text-secondary);">Order ID</span>
                <span style="font-weight:bold;">${order.id}</span>
              </div>
              <div style="display:flex;justify-content:space-between;margin-bottom:var(--space-sm);">
<span style="color:var(--color-text-secondary);">Route</span>
                <span style="font-weight:bold;">${order.routeTitle}</span>
              </div>
              <div style="display:flex;justify-content:space-between;margin-bottom:var(--space-sm);">
<span style="color:var(--color-text-secondary);">Departure Date</span>
                <span>${order.travelDate}</span>
              </div>
              <div style="display:flex;justify-content:space-between;">
<span style="color:var(--color-text-secondary);">Total Amount</span>
                <span style="font-weight:bold;color:var(--color-accent);font-size:var(--font-size-xl);">¥${order.totalPrice.toLocaleString()}</span>
              </div>
            </div>
            <p style="font-size:var(--font-size-sm);color:var(--color-text-secondary);margin-bottom:var(--space-xl);">
              <i class="fas fa-phone" style="color:var(--color-primary);margin-right:4px;"></i>
Questions? Call our hotline: 400-888-6789
            </p>
            <div style="display:flex;gap:var(--space-md);justify-content:center;">
<a href="routes.html" class="btn btn-outline" style="flex:1;">Keep Browsing</a>
<a href="index.html" class="btn btn-primary" style="flex:1;">Back to Home</a>
            </div>
          </div>
        </div>
      </div>
    `;

    const container = document.createElement('div');
    container.innerHTML = html;
    document.body.appendChild(container);
    Modal.show('booking-success-modal');
  }
};

// ===== Page Init ======
document.addEventListener('DOMContentLoaded', () => {
  if (document.getElementById('booking-form')) {
    BookingPage.init();
  }
});

window.BookingPage = BookingPage;
window.BookingForm = BookingPage; // Legacy compatibility (booking.html inline calls)
