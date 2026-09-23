/* =============================================
// HuanYou Travel | Contact / Message Module
(Original file had encoding issues; this file was rewritten in UTF-8)
   ============================================= */

const ContactPage = {
  _inited: false,

  async init() {
    if (this._inited) return;
    this._inited = true;
    this.bindEvents();
  },

  bindEvents() {
    const contactForm = document.getElementById('contact-form');
    const messageForm = document.getElementById('message-form');

    if (contactForm) {
      contactForm.addEventListener('submit', (e) => {
        e.preventDefault();
        this.handleSubmit(contactForm);
      });
    }
    if (messageForm) {
      messageForm.addEventListener('submit', (e) => {
        e.preventDefault();
        this.handleSubmit(messageForm);
      });
    }
  },

  async handleSubmit(form) {
    if (form.dataset.busy === '1') return;
    if (!FormValidator.validate(form)) {
Toast.error('Please check the form');
      return;
    }

    const formData = new FormData(form);
    const data = {
      id: 'M' + Date.now().toString().slice(-8),
      name: formData.get('name') || '',
      phone: formData.get('phone') || '',
      email: formData.get('email') || '',
      subject: formData.get('type') || formData.get('subject') || '',
      content: formData.get('content') || formData.get('message') || '',
      status: 'unread',
      reply: '',
      createTime: Utils.formatDateTime(new Date())
    };

// Cloud mode: message to Supabase messages table (visible in admin immediately)
    if (Store.isCloud()) {
      form.dataset.busy = '1';
      const btn = form.querySelector('button[type="submit"]');
if (btn) { btn.disabled = true; btn.textContent = 'Sending…'; }
      try {
        await Cloud.upsert('messages', data);
Toast.success('Message sent! We\'ll get back to you soon.');
        form.reset();
      } catch (err) {
Toast.error('Submission failed, please try again: ' + ((err && err.message) || err));
      } finally {
if (btn) { btn.disabled = false; btn.textContent = 'Send Message'; }
        delete form.dataset.busy;
      }
      return;
    }

    Store.saveMessage(data);
Toast.success('Message sent! We\'ll get back to you soon.');
    form.reset();
  }
};

// ===== Page Init ======
document.addEventListener('DOMContentLoaded', () => {
  if (document.getElementById('contact-form') || document.getElementById('message-form')) {
    ContactPage.init();
  }
});

window.ContactPage = ContactPage;
window.ContactForm = ContactPage; // Legacy compatibility (contact.html inline calls)
