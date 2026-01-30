// Friendly Car Guy - Main App Logic

// ============================================
// App State
// ============================================
const App = {
  currentView: 'messagesView',
  currentContact: null,
  currentConversation: null,
  contacts: [],
  conversations: [],
  calls: [],
  enteredPin: '',

  // Initialize the app
  init() {
    // Check if already authenticated
    if (API.isAuthenticated()) {
      this.showApp();
    } else {
      this.showLogin();
    }
    this.bindLogin();
  },

  // Show login screen
  showLogin() {
    document.getElementById('loginScreen').classList.remove('hidden');
    document.getElementById('app').classList.add('hidden');
    this.enteredPin = '';
    this.updatePinDisplay();
  },

  // Show main app
  showApp() {
    document.getElementById('loginScreen').classList.add('hidden');
    document.getElementById('app').classList.remove('hidden');
    this.initApp();
  },

  // Initialize app after login
  initApp() {
    this.bindNavigation();
    this.bindDetailViews();
    this.bindSearch();
    this.bindMessageInput();
    this.bindLogout();
    this.registerServiceWorker();
    this.loadInitialData();
  },

  // Bind logout button
  bindLogout() {
    document.getElementById('logoutBtn').addEventListener('click', () => {
      if (confirm('Are you sure you want to log out?')) {
        API.logout();
        this.showLogin();
      }
    });
  },

  // ============================================
  // Login
  // ============================================

  bindLogin() {
    const pinBtns = document.querySelectorAll('.pin-btn[data-digit]');
    const deleteBtn = document.getElementById('pinDelete');

    pinBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const digit = btn.dataset.digit;
        if (this.enteredPin.length < 6) {
          this.enteredPin += digit;
          this.updatePinDisplay();
          if (this.enteredPin.length === 6) {
            this.attemptLogin();
          }
        }
      });
    });

    deleteBtn.addEventListener('click', () => {
      if (this.enteredPin.length > 0) {
        this.enteredPin = this.enteredPin.slice(0, -1);
        this.updatePinDisplay();
        this.clearPinError();
      }
    });
  },

  updatePinDisplay() {
    const dots = document.querySelectorAll('.pin-dot');
    dots.forEach((dot, i) => {
      dot.classList.remove('filled', 'error');
      if (i < this.enteredPin.length) {
        dot.classList.add('filled');
      }
    });
  },

  async attemptLogin() {
    const result = await API.authenticate(this.enteredPin);
    if (result.success) {
      this.showApp();
    } else {
      this.showPinError('Invalid PIN');
      const dots = document.querySelectorAll('.pin-dot');
      dots.forEach(dot => dot.classList.add('error'));
      setTimeout(() => {
        this.enteredPin = '';
        this.updatePinDisplay();
      }, 500);
    }
  },

  showPinError(message) {
    document.getElementById('pinError').textContent = message;
  },

  clearPinError() {
    document.getElementById('pinError').textContent = '';
  },

  // ============================================
  // Navigation
  // ============================================

  bindNavigation() {
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
      item.addEventListener('click', () => {
        const viewId = item.dataset.view;
        this.switchView(viewId);

        // Update active state
        navItems.forEach(nav => nav.classList.remove('active'));
        item.classList.add('active');

        // Update header title
        const titles = {
          messagesView: 'Messages',
          callsView: 'Calls',
          contactsView: 'Contacts',
          dashboardView: 'Dashboard'
        };
        document.querySelector('.header-title').textContent = titles[viewId];
      });
    });

    // Compose button
    document.getElementById('composeBtn').addEventListener('click', () => {
      this.showToast('New message - Coming soon');
    });
  },

  switchView(viewId) {
    document.querySelectorAll('.view').forEach(view => {
      view.classList.remove('active');
    });
    document.getElementById(viewId).classList.add('active');
    this.currentView = viewId;
  },

  // ============================================
  // Detail Views (Overlays)
  // ============================================

  bindDetailViews() {
    // Conversation detail
    document.getElementById('backFromConvo').addEventListener('click', () => {
      this.hideConversationDetail();
    });

    document.getElementById('callFromConvo').addEventListener('click', () => {
      if (this.currentConversation) {
        this.initiateCall(this.currentConversation.phone);
      }
    });

    // Contact detail
    document.getElementById('backFromContact').addEventListener('click', () => {
      this.hideContactDetail();
    });

    document.getElementById('editContact').addEventListener('click', () => {
      this.showToast('Edit contact - Coming soon');
    });
  },

  showConversationDetail(conversation) {
    this.currentConversation = conversation;
    document.getElementById('convoName').textContent = conversation.name;
    document.getElementById('convoPhone').textContent = this.formatPhone(conversation.phone);
    document.getElementById('conversationDetail').classList.add('active');
    this.loadMessages(conversation.id);
  },

  hideConversationDetail() {
    document.getElementById('conversationDetail').classList.remove('active');
    this.currentConversation = null;
  },

  showContactDetail(contact) {
    this.currentContact = contact;
    document.getElementById('contactDetailName').textContent = contact.name;
    document.getElementById('contactDetailStatus').textContent = contact.status || 'New Lead';
    document.getElementById('contactDetail').classList.add('active');
    this.renderContactContent(contact);
  },

  hideContactDetail() {
    document.getElementById('contactDetail').classList.remove('active');
    this.currentContact = null;
  },

  renderContactContent(contact) {
    const content = document.getElementById('contactContent');
    content.innerHTML = `
      <div class="contact-section">
        <h3>Contact Info</h3>
        <div class="contact-field">
          <div class="contact-field-label">Phone</div>
          <div class="contact-field-value">${this.formatPhone(contact.phone)}</div>
        </div>
        ${contact.email ? `
        <div class="contact-field">
          <div class="contact-field-label">Email</div>
          <div class="contact-field-value">${contact.email}</div>
        </div>
        ` : ''}
      </div>

      ${contact.vehicleInterest || contact.budget ? `
      <div class="contact-section">
        <h3>Interest</h3>
        ${contact.vehicleInterest ? `
        <div class="contact-field">
          <div class="contact-field-label">Vehicle Interest</div>
          <div class="contact-field-value">${contact.vehicleInterest}</div>
        </div>
        ` : ''}
        ${contact.budget ? `
        <div class="contact-field">
          <div class="contact-field-label">Budget</div>
          <div class="contact-field-value">$${contact.budget.toLocaleString()}</div>
        </div>
        ` : ''}
      </div>
      ` : ''}

      ${contact.notes ? `
      <div class="contact-section">
        <h3>Notes</h3>
        <div class="contact-field">
          <div class="contact-field-value">${contact.notes}</div>
        </div>
      </div>
      ` : ''}

      <div class="contact-actions">
        <button class="contact-action-btn primary" onclick="App.initiateCall('${contact.phone}')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
          </svg>
          Call
        </button>
        <button class="contact-action-btn secondary" onclick="App.startConversation('${contact.id}')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
          Text
        </button>
      </div>
    `;
  },

  // ============================================
  // Search
  // ============================================

  bindSearch() {
    document.getElementById('messageSearch').addEventListener('input', (e) => {
      this.filterConversations(e.target.value);
    });

    document.getElementById('callSearch').addEventListener('input', (e) => {
      this.filterCalls(e.target.value);
    });

    document.getElementById('contactSearch').addEventListener('input', (e) => {
      this.filterContacts(e.target.value);
    });
  },

  filterConversations(query) {
    const filtered = this.conversations.filter(c =>
      c.name.toLowerCase().includes(query.toLowerCase()) ||
      c.phone.includes(query)
    );
    this.renderConversations(filtered);
  },

  filterCalls(query) {
    const filtered = this.calls.filter(c =>
      c.name.toLowerCase().includes(query.toLowerCase()) ||
      c.phone.includes(query)
    );
    this.renderCalls(filtered);
  },

  filterContacts(query) {
    const filtered = this.contacts.filter(c =>
      c.name.toLowerCase().includes(query.toLowerCase()) ||
      c.phone.includes(query)
    );
    this.renderContacts(filtered);
  },

  // ============================================
  // Message Input
  // ============================================

  bindMessageInput() {
    const input = document.getElementById('messageInput');
    const sendBtn = document.getElementById('sendBtn');

    sendBtn.addEventListener('click', () => {
      this.sendMessage();
    });

    input.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        this.sendMessage();
      }
    });
  },

  async sendMessage() {
    const input = document.getElementById('messageInput');
    const body = input.value.trim();

    if (!body || !this.currentConversation) return;

    // Optimistically add message to UI
    this.addMessageToUI({
      body,
      direction: 'Outbound',
      timestamp: new Date().toISOString()
    });

    input.value = '';

    try {
      await API.sendMessage(this.currentConversation.contactId, body);
    } catch (error) {
      this.showToast('Failed to send message');
    }
  },

  addMessageToUI(message) {
    const container = document.getElementById('messagesContainer');
    const div = document.createElement('div');
    div.className = `message ${message.direction === 'Outbound' ? 'sent' : 'received'}`;
    div.textContent = message.body;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
  },

  // ============================================
  // Data Loading
  // ============================================

  async loadInitialData() {
    // For now, load sample data. Will be replaced with API calls.
    this.loadSampleData();
  },

  loadSampleData() {
    // Sample conversations
    this.conversations = [
      { id: '1', contactId: 'c1', name: 'John Smith', phone: '5551234567', lastMessage: 'Thanks for the info!', time: '2:30 PM', unread: 2 },
      { id: '2', contactId: 'c2', name: 'Sarah Johnson', phone: '5559876543', lastMessage: 'When can I come see the car?', time: '11:45 AM', unread: 0 },
    ];

    // Sample calls
    this.calls = [
      { id: '1', contactId: 'c1', name: 'John Smith', phone: '5551234567', direction: 'incoming', duration: 245, time: '3:15 PM' },
      { id: '2', contactId: 'c3', name: 'Unknown', phone: '5555555555', direction: 'missed', duration: 0, time: '1:30 PM' },
      { id: '3', contactId: 'c2', name: 'Sarah Johnson', phone: '5559876543', direction: 'outgoing', duration: 180, time: 'Yesterday' },
    ];

    // Sample contacts
    this.contacts = [
      { id: 'c1', name: 'John Smith', phone: '5551234567', email: 'john@email.com', status: 'Hot', vehicleInterest: '2024 Camry', budget: 35000 },
      { id: 'c2', name: 'Sarah Johnson', phone: '5559876543', status: 'New', vehicleInterest: 'RAV4 Hybrid' },
      { id: 'c3', name: 'Mike Wilson', phone: '5555555555', status: 'Contacted' },
    ];

    this.renderConversations(this.conversations);
    this.renderCalls(this.calls);
    this.renderContacts(this.contacts);
    this.renderDashboard();
  },

  async loadMessages(conversationId) {
    const container = document.getElementById('messagesContainer');
    container.innerHTML = '<div class="spinner" style="margin: 20px auto;"></div>';

    // Sample messages for now
    const messages = [
      { body: 'Hi, I saw your listing for the Camry', direction: 'Inbound', timestamp: '2:25 PM' },
      { body: 'Yes! It\'s still available. Would you like to schedule a test drive?', direction: 'Outbound', timestamp: '2:27 PM' },
      { body: 'That would be great. What times work?', direction: 'Inbound', timestamp: '2:28 PM' },
      { body: 'I\'m free tomorrow afternoon or Saturday morning. Which works better for you?', direction: 'Outbound', timestamp: '2:29 PM' },
      { body: 'Thanks for the info!', direction: 'Inbound', timestamp: '2:30 PM' },
    ];

    container.innerHTML = '';
    messages.forEach(msg => this.addMessageToUI(msg));
  },

  // ============================================
  // Rendering
  // ============================================

  renderConversations(conversations) {
    const list = document.getElementById('conversationList');

    if (conversations.length === 0) {
      list.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">💬</div>
          <p>No messages yet</p>
          <small>Messages with customers will appear here</small>
        </div>
      `;
      return;
    }

    list.innerHTML = conversations.map(convo => `
      <div class="conversation-item" data-id="${convo.id}">
        <div class="avatar">${this.getInitials(convo.name)}</div>
        <div class="conversation-info">
          <div class="conversation-name">${convo.name}</div>
          <div class="conversation-preview">${convo.lastMessage}</div>
        </div>
        <div class="conversation-meta">
          <div class="conversation-time">${convo.time}</div>
          ${convo.unread > 0 ? `<div class="unread-badge">${convo.unread}</div>` : ''}
        </div>
      </div>
    `).join('');

    // Bind click events
    list.querySelectorAll('.conversation-item').forEach(item => {
      item.addEventListener('click', () => {
        const id = item.dataset.id;
        const convo = this.conversations.find(c => c.id === id);
        if (convo) this.showConversationDetail(convo);
      });
    });
  },

  renderCalls(calls) {
    const list = document.getElementById('callList');

    if (calls.length === 0) {
      list.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">📞</div>
          <p>No calls yet</p>
          <small>Your call history will appear here</small>
        </div>
      `;
      return;
    }

    list.innerHTML = calls.map(call => `
      <div class="call-item" data-id="${call.id}">
        <div class="avatar">${this.getInitials(call.name)}</div>
        <div class="call-info">
          <div class="call-name">${call.name}</div>
          <div class="call-type ${call.direction}">
            ${this.getCallIcon(call.direction)}
            ${call.direction.charAt(0).toUpperCase() + call.direction.slice(1)}
            ${call.duration > 0 ? ` • ${this.formatDuration(call.duration)}` : ''}
          </div>
        </div>
        <div class="call-meta">
          <div class="call-time">${call.time}</div>
        </div>
      </div>
    `).join('');
  },

  renderContacts(contacts) {
    const list = document.getElementById('contactList');

    if (contacts.length === 0) {
      list.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">👥</div>
          <p>No contacts yet</p>
          <small>Add your first contact to get started</small>
        </div>
      `;
      return;
    }

    list.innerHTML = contacts.map(contact => `
      <div class="contact-item" data-id="${contact.id}">
        <div class="avatar">${this.getInitials(contact.name)}</div>
        <div class="contact-info">
          <div class="contact-name">${contact.name}</div>
          <div class="contact-phone">${this.formatPhone(contact.phone)}</div>
        </div>
        ${contact.status ? `<span class="contact-status ${contact.status.toLowerCase()}">${contact.status}</span>` : ''}
      </div>
    `).join('');

    // Bind click events
    list.querySelectorAll('.contact-item').forEach(item => {
      item.addEventListener('click', () => {
        const id = item.dataset.id;
        const contact = this.contacts.find(c => c.id === id);
        if (contact) this.showContactDetail(contact);
      });
    });
  },

  renderDashboard() {
    document.getElementById('statCalls').textContent = this.calls.filter(c => c.time.includes('PM') || c.time.includes('AM')).length;
    document.getElementById('statTexts').textContent = this.conversations.reduce((sum, c) => sum + (c.unread || 0), 0) + this.conversations.length;
    document.getElementById('statLeads').textContent = this.contacts.filter(c => c.status === 'New').length;
    document.getElementById('statFollowups').textContent = '0';

    // Recent activity
    const activityList = document.getElementById('activityList');
    const activities = [
      ...this.calls.slice(0, 2).map(c => ({ type: 'call', text: `${c.direction} call with ${c.name}`, time: c.time })),
      ...this.conversations.slice(0, 2).map(c => ({ type: 'message', text: `Message from ${c.name}`, time: c.time }))
    ].sort(() => Math.random() - 0.5).slice(0, 4);

    if (activities.length === 0) {
      activityList.innerHTML = '<div class="empty-state"><p>No recent activity</p></div>';
    } else {
      activityList.innerHTML = activities.map(a => `
        <div class="activity-item">
          <div class="activity-icon">
            ${a.type === 'call' ?
              '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>' :
              '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>'
            }
          </div>
          <div class="activity-text">${a.text}</div>
          <div class="activity-time">${a.time}</div>
        </div>
      `).join('');
    }
  },

  // ============================================
  // Actions
  // ============================================

  initiateCall(phone) {
    // Opens native phone dialer
    window.location.href = `tel:${phone}`;
  },

  startConversation(contactId) {
    const contact = this.contacts.find(c => c.id === contactId);
    if (contact) {
      this.hideContactDetail();
      this.showConversationDetail({
        id: 'new',
        contactId: contact.id,
        name: contact.name,
        phone: contact.phone
      });
    }
  },

  // ============================================
  // Utilities
  // ============================================

  getInitials(name) {
    if (!name || name === 'Unknown') return '?';
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  },

  formatPhone(phone) {
    if (!phone) return '';
    const cleaned = phone.replace(/\D/g, '');
    if (cleaned.length === 10) {
      return `(${cleaned.slice(0,3)}) ${cleaned.slice(3,6)}-${cleaned.slice(6)}`;
    }
    return phone;
  },

  formatDuration(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  },

  getCallIcon(direction) {
    const icons = {
      incoming: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>',
      outgoing: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>',
      missed: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 2 5a2 2 0 0 1 2-2"/><path d="m15 3 6 6M21 3l-6 6"/></svg>'
    };
    return icons[direction] || '';
  },

  showToast(message) {
    const toast = document.getElementById('toast');
    document.getElementById('toastMessage').textContent = message;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3000);
  },

  // ============================================
  // Service Worker & Push
  // ============================================

  async registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      try {
        const registration = await navigator.serviceWorker.register('/sw.js');
        console.log('Service Worker registered:', registration.scope);

        // Request notification permission
        if ('Notification' in window && Notification.permission === 'default') {
          const permission = await Notification.requestPermission();
          console.log('Notification permission:', permission);
        }
      } catch (error) {
        console.error('Service Worker registration failed:', error);
      }
    }
  }
};

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => App.init());
