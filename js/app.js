// Friendly Car Guy — Dealer Sales System
// All data flows through n8n → Airtable. No sample data.

const App = {
  currentView: 'todayView',
  currentContact: null,
  currentConversation: null,
  contacts: [],
  conversations: [],
  calls: [],
  tasks: [],
  inventory: [],
  enteredPin: '',
  pollTimer: null,
  user: null,
  currentCallDetail: null,

  // ============================================
  // Init
  // ============================================

  init() {
    if (API.isAuthenticated()) {
      this.showApp();
    } else {
      this.showLogin();
    }
    this.bindLogin();
    window.addEventListener('fcg:auth-expired', () => this.showLogin());
    window.addEventListener('online', () => this.hideOfflineBanner());
    window.addEventListener('offline', () => this.showOfflineBanner());
  },

  // ============================================
  // Login
  // ============================================

  showLogin() {
    this.stopPolling();
    document.getElementById('loginScreen').classList.remove('hidden');
    document.getElementById('app').classList.add('hidden');
    this.enteredPin = '';
    this.updatePinDisplay();
    this.clearPinError();
  },

  showApp() {
    document.getElementById('loginScreen').classList.add('hidden');
    document.getElementById('app').classList.remove('hidden');
    this.initApp();
  },

  initApp() {
    this.bindNavigation();
    this.bindDetailViews();
    this.bindSearch();
    this.bindMessageInput();
    this.bindLogout();
    this.bindAddContact();
    this.bindAddTask();
    this.bindInventory();
    this.bindDialer();
    this.registerServiceWorker();
    this.loadInitialData();
    this.startPolling();
  },

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
      if (i < this.enteredPin.length) dot.classList.add('filled');
    });
  },

  async attemptLogin() {
    const result = await API.authenticate(this.enteredPin);
    if (result.success) {
      this.user = result.user || null;
      this.showApp();
    } else {
      this.showPinError(result.error || 'Invalid PIN');
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

  bindLogout() {
    document.getElementById('logoutBtn').addEventListener('click', () => {
      if (confirm('Log out?')) {
        API.logout();
        this.showLogin();
      }
    });
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
        navItems.forEach(nav => nav.classList.remove('active'));
        item.classList.add('active');
        const titles = {
          todayView: 'Today',
          messagesView: 'Messages',
          callsView: 'Calls',
          contactsView: 'Contacts',
          inventoryView: 'Inventory',
          dialerView: 'Dialer',
          dashboardView: 'Dashboard'
        };
        document.querySelector('.header-title').textContent = titles[viewId] || '';
      });
    });

    document.getElementById('composeBtn').addEventListener('click', () => {
      this.showAddContactModal();
    });
    document.getElementById('addTaskBtn').addEventListener('click', () => {
      this.showAddTaskModal();
    });
  },

  switchView(viewId) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById(viewId).classList.add('active');
    this.currentView = viewId;
  },

  // ============================================
  // Data Loading — Real API
  // ============================================

  async loadInitialData() {
    this.showLoadingState();
    const [contacts, conversations, calls, tasks, inventory] = await Promise.allSettled([
      API.getContacts(),
      API.getConversations(),
      API.getCalls(),
      API.getTasks(),
      API.getInventory(),
    ]);

    this.contacts = this.extractData(contacts);
    this.conversations = this.extractData(conversations);
    this.calls = this.extractData(calls);
    this.tasks = this.extractData(tasks);
    this.inventory = this.extractData(inventory);

    this.renderAll();
  },

  extractData(result) {
    if (result.status !== 'fulfilled') return [];
    const v = result.value;
    if (Array.isArray(v)) return v;
    if (v && Array.isArray(v.records)) return v.records;
    if (v && typeof v === 'object' && !Array.isArray(v)) return [];
    return [];
  },

  showLoadingState() {
    ['conversationList', 'callList', 'contactList', 'todayList', 'activityList'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = '<div class="loading-state"><div class="spinner"></div></div>';
    });
  },

  renderAll() {
    this.renderToday();
    this.renderConversations(this.conversations);
    this.renderCalls(this.calls);
    this.renderContacts(this.contacts);
    this.renderInventory();
    this.renderDashboard();
    this.updateDialerQueueStats();
  },

  // ============================================
  // Polling — lightweight real-time
  // ============================================

  startPolling() {
    this.stopPolling();
    this.pollTimer = setInterval(() => this.poll(), 30000);
  },

  stopPolling() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  },

  async poll() {
    if (!API.isAuthenticated()) return;
    try {
      const [conversations, tasks] = await Promise.allSettled([
        API.getConversations(),
        API.getTasks(),
      ]);
      if (conversations.status === 'fulfilled') {
        this.conversations = Array.isArray(conversations.value) ? conversations.value : conversations.value.records || [];
        if (this.currentView === 'messagesView') this.renderConversations(this.conversations);
      }
      if (tasks.status === 'fulfilled') {
        this.tasks = Array.isArray(tasks.value) ? tasks.value : tasks.value.records || [];
        if (this.currentView === 'todayView') this.renderToday();
      }
    } catch (e) {
      // Silent — polling failures are non-critical
    }
  },

  // ============================================
  // Today View
  // ============================================

  renderToday() {
    const list = document.getElementById('todayList');
    if (!list) return;

    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);

    const overdue = this.tasks.filter(t => t.status !== 'Done' && t.dueDate && t.dueDate < todayStr);
    const dueToday = this.tasks.filter(t => t.status !== 'Done' && t.dueDate === todayStr);
    const hotLeads = this.contacts.filter(c => c.temperature === 'hot' || c.temperature === 'Hot');
    const newLeads = this.contacts.filter(c => c.stage === 'New' || c.stage === 'NEW');

    if (overdue.length === 0 && dueToday.length === 0 && hotLeads.length === 0 && newLeads.length === 0) {
      list.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">&#9996;</div>
          <p>All clear</p>
          <small>No tasks due, no hot leads. Go find some.</small>
        </div>
      `;
      return;
    }

    let html = '';

    if (overdue.length > 0) {
      html += `<div class="today-section"><h3 class="today-section-title overdue">Overdue (${overdue.length})</h3>`;
      html += overdue.map(t => this.renderTaskItem(t, 'overdue')).join('');
      html += `</div>`;
    }

    if (dueToday.length > 0) {
      html += `<div class="today-section"><h3 class="today-section-title due-today">Due Today (${dueToday.length})</h3>`;
      html += dueToday.map(t => this.renderTaskItem(t, 'due-today')).join('');
      html += `</div>`;
    }

    if (hotLeads.length > 0) {
      html += `<div class="today-section"><h3 class="today-section-title hot">Hot Leads (${hotLeads.length})</h3>`;
      html += hotLeads.map(c => `
        <div class="today-item hot" data-contact-id="${c.id}">
          <div class="avatar">${this.getInitials(c.name)}</div>
          <div class="today-item-info">
            <div class="today-item-title">${this.esc(c.name)}</div>
            <div class="today-item-sub">${this.esc(c.vehicleInterest || c.stage || '')}</div>
          </div>
          <span class="temp-badge hot">HOT</span>
        </div>
      `).join('');
      html += `</div>`;
    }

    if (newLeads.length > 0) {
      html += `<div class="today-section"><h3 class="today-section-title new-lead">New Leads (${newLeads.length})</h3>`;
      html += newLeads.map(c => `
        <div class="today-item new" data-contact-id="${c.id}">
          <div class="avatar">${this.getInitials(c.name)}</div>
          <div class="today-item-info">
            <div class="today-item-title">${this.esc(c.name)}</div>
            <div class="today-item-sub">${this.esc(c.source || 'New lead')}</div>
          </div>
          <span class="temp-badge new">NEW</span>
        </div>
      `).join('');
      html += `</div>`;
    }

    list.innerHTML = html;

    list.querySelectorAll('.today-item[data-contact-id]').forEach(item => {
      item.addEventListener('click', () => {
        const contact = this.contacts.find(c => c.id === item.dataset.contactId);
        if (contact) this.showContactDetail(contact);
      });
    });

    list.querySelectorAll('.task-item[data-task-id]').forEach(item => {
      item.addEventListener('click', () => {
        const taskId = item.dataset.taskId;
        const task = this.tasks.find(t => t.id === taskId);
        if (task && task.contactId) {
          const contact = this.contacts.find(c => c.id === task.contactId);
          if (contact) this.showContactDetail(contact);
        }
      });
    });

    list.querySelectorAll('.task-check').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.completeTaskFromUI(btn.dataset.taskId);
      });
    });
  },

  renderTaskItem(task, type) {
    return `
      <div class="task-item ${type}" data-task-id="${task.id}">
        <button class="task-check" data-task-id="${task.id}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/></svg>
        </button>
        <div class="task-item-info">
          <div class="task-item-title">${this.esc(task.title || task.name || '')}</div>
          <div class="task-item-sub">${this.esc(task.contactName || '')} ${task.dueDate ? '· ' + task.dueDate : ''}</div>
        </div>
      </div>
    `;
  },

  async completeTaskFromUI(taskId) {
    try {
      await API.completeTask(taskId);
      this.tasks = this.tasks.filter(t => t.id !== taskId);
      this.renderToday();
      this.showToast('Task completed');
    } catch (error) {
      this.showToast('Failed to complete task');
    }
  },

  // ============================================
  // Detail Views (Overlays)
  // ============================================

  bindDetailViews() {
    document.getElementById('backFromConvo').addEventListener('click', () => this.hideConversationDetail());
    document.getElementById('callFromConvo').addEventListener('click', () => {
      if (this.currentConversation) this.initiateCall(this.currentConversation.phone);
    });
    document.getElementById('backFromContact').addEventListener('click', () => this.hideContactDetail());
    document.getElementById('editContact').addEventListener('click', () => this.showToast('Edit coming soon'));
    document.getElementById('backFromCall').addEventListener('click', () => this.hideCallDetail());
    document.getElementById('callBackFromDetail').addEventListener('click', () => {
      if (this.currentCallDetail) this.initiateCall(this.currentCallDetail.phone);
    });
  },

  showConversationDetail(conversation) {
    this.currentConversation = conversation;
    document.getElementById('convoName').textContent = conversation.name;
    document.getElementById('convoPhone').textContent = this.formatPhone(conversation.phone);
    document.getElementById('conversationDetail').classList.add('active');
    this.loadMessages(conversation.contactId || conversation.id);
  },

  hideConversationDetail() {
    document.getElementById('conversationDetail').classList.remove('active');
    this.currentConversation = null;
  },

  showContactDetail(contact) {
    this.currentContact = contact;
    document.getElementById('contactDetailName').textContent = contact.name;
    document.getElementById('contactDetailStatus').textContent = contact.stage || contact.status || 'New Lead';
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
          <div class="contact-field-value">${this.esc(contact.email)}</div>
        </div>` : ''}
        ${contact.source ? `
        <div class="contact-field">
          <div class="contact-field-label">Source</div>
          <div class="contact-field-value">${this.esc(contact.source)}</div>
        </div>` : ''}
      </div>

      ${contact.vehicleInterest || contact.budget ? `
      <div class="contact-section">
        <h3>Interest</h3>
        ${contact.vehicleInterest ? `
        <div class="contact-field">
          <div class="contact-field-label">Vehicle</div>
          <div class="contact-field-value">${this.esc(contact.vehicleInterest)}</div>
        </div>` : ''}
        ${contact.budget ? `
        <div class="contact-field">
          <div class="contact-field-label">Budget</div>
          <div class="contact-field-value">$${Number(contact.budget).toLocaleString()}</div>
        </div>` : ''}
        ${contact.timeline ? `
        <div class="contact-field">
          <div class="contact-field-label">Timeline</div>
          <div class="contact-field-value">${this.esc(contact.timeline)}</div>
        </div>` : ''}
      </div>` : ''}

      ${contact.temperature ? `
      <div class="contact-section">
        <h3>Status</h3>
        <div class="contact-field">
          <div class="contact-field-label">Temperature</div>
          <div class="contact-field-value"><span class="temp-badge ${(contact.temperature || '').toLowerCase()}">${this.esc(contact.temperature)}</span></div>
        </div>
        ${contact.stage ? `
        <div class="contact-field">
          <div class="contact-field-label">Stage</div>
          <div class="contact-field-value">${this.esc(contact.stage)}</div>
        </div>` : ''}
      </div>` : ''}

      ${contact.notes ? `
      <div class="contact-section">
        <h3>Notes</h3>
        <div class="contact-field">
          <div class="contact-field-value">${this.esc(contact.notes)}</div>
        </div>
      </div>` : ''}

      <div class="briefing-card" id="contactBriefing">
        <h3>Pre-Call Briefing</h3>
        <div class="briefing-text" id="briefingText">Tap "Get Briefing" before your next call</div>
      </div>

      <div class="contact-actions">
        <button class="contact-action-btn primary" onclick="App.initiateCall('${this.esc(contact.phone)}')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
          </svg>
          Call
        </button>
        <button class="contact-action-btn secondary" onclick="App.startConversation('${this.esc(contact.id)}')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
          Text
        </button>
      </div>
      <div style="margin-top: 12px;">
        <button class="contact-action-btn secondary" style="width: 100%;" onclick="App.getBriefingForContact('${this.esc(contact.id)}')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
          Get Briefing
        </button>
      </div>
      <div style="margin-top: 12px;">
        <button class="contact-action-btn secondary" style="width: 100%;" onclick="App.showAddTaskModal('${this.esc(contact.id)}')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
          Add Task
        </button>
      </div>
    `;
  },

  // ============================================
  // Messages
  // ============================================

  async loadMessages(contactId) {
    const container = document.getElementById('messagesContainer');
    container.innerHTML = '<div class="loading-state"><div class="spinner"></div></div>';

    try {
      const data = await API.getMessages(contactId);
      const messages = Array.isArray(data) ? data : data.records || [];
      container.innerHTML = '';
      if (messages.length === 0) {
        container.innerHTML = '<div class="empty-state"><p>No messages yet</p></div>';
        return;
      }
      messages.forEach(msg => this.addMessageToUI(msg));
    } catch (error) {
      container.innerHTML = `<div class="empty-state"><p>Could not load messages</p><small>${this.esc(error.message)}</small></div>`;
    }
  },

  addMessageToUI(message) {
    const container = document.getElementById('messagesContainer');
    const div = document.createElement('div');
    const isOutbound = message.direction === 'Outbound' || message.direction === 'outbound';
    div.className = `message ${isOutbound ? 'sent' : 'received'}`;
    div.textContent = message.body || message.text || '';
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
  },

  bindMessageInput() {
    const input = document.getElementById('messageInput');
    const sendBtn = document.getElementById('sendBtn');
    sendBtn.addEventListener('click', () => this.sendMessage());
    input.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') this.sendMessage();
    });
  },

  async sendMessage() {
    const input = document.getElementById('messageInput');
    const body = input.value.trim();
    if (!body || !this.currentConversation) return;

    this.addMessageToUI({ body, direction: 'Outbound' });
    input.value = '';

    try {
      await API.sendMessage(this.currentConversation.contactId || this.currentConversation.id, body);
    } catch (error) {
      this.showToast('Failed to send message');
    }
  },

  // ============================================
  // Search
  // ============================================

  bindSearch() {
    const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

    document.getElementById('messageSearch').addEventListener('input', debounce((e) => {
      const q = e.target.value.toLowerCase();
      const filtered = this.conversations.filter(c =>
        (c.name || '').toLowerCase().includes(q) || (c.phone || '').includes(q)
      );
      this.renderConversations(filtered);
    }, 200));

    document.getElementById('callSearch').addEventListener('input', debounce((e) => {
      const q = e.target.value.toLowerCase();
      const filtered = this.calls.filter(c =>
        (c.name || '').toLowerCase().includes(q) || (c.phone || '').includes(q)
      );
      this.renderCalls(filtered);
    }, 200));

    document.getElementById('contactSearch').addEventListener('input', debounce((e) => {
      const q = e.target.value.toLowerCase();
      const filtered = this.contacts.filter(c =>
        (c.name || '').toLowerCase().includes(q) || (c.phone || '').includes(q)
      );
      this.renderContacts(filtered);
    }, 200));
  },

  // ============================================
  // Rendering — Conversations
  // ============================================

  renderConversations(conversations) {
    const list = document.getElementById('conversationList');

    if (!conversations || conversations.length === 0) {
      list.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">&#128172;</div>
          <p>No messages yet</p>
          <small>Conversations with leads will appear here</small>
        </div>
      `;
      return;
    }

    list.innerHTML = conversations.map(convo => `
      <div class="conversation-item" data-id="${convo.id}">
        <div class="avatar">${this.getInitials(convo.name)}</div>
        <div class="conversation-info">
          <div class="conversation-name">${this.esc(convo.name)}</div>
          <div class="conversation-preview">${this.esc(convo.lastMessage || convo.preview || '')}</div>
        </div>
        <div class="conversation-meta">
          <div class="conversation-time">${this.esc(convo.time || this.formatTime(convo.date || convo.updatedAt))}</div>
          ${convo.unread > 0 ? `<div class="unread-badge">${convo.unread}</div>` : ''}
        </div>
      </div>
    `).join('');

    list.querySelectorAll('.conversation-item').forEach(item => {
      item.addEventListener('click', () => {
        const convo = this.conversations.find(c => c.id === item.dataset.id);
        if (convo) this.showConversationDetail(convo);
      });
    });
  },

  // ============================================
  // Rendering — Calls
  // ============================================

  renderCalls(calls) {
    const list = document.getElementById('callList');

    if (!calls || calls.length === 0) {
      list.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">&#128222;</div>
          <p>No calls yet</p>
          <small>Call history will appear here</small>
        </div>
      `;
      return;
    }

    list.innerHTML = calls.map(call => `
      <div class="call-item" data-id="${call.id}">
        <div class="avatar">${this.getInitials(call.name || 'Unknown')}</div>
        <div class="call-info">
          <div class="call-name">${this.esc(call.name || 'Unknown')}</div>
          <div class="call-type ${call.direction || ''}">
            ${this.getCallIcon(call.direction)}
            ${this.esc((call.direction || 'unknown').charAt(0).toUpperCase() + (call.direction || 'unknown').slice(1))}
            ${call.duration > 0 ? ` &middot; ${this.formatDuration(call.duration)}` : ''}
          </div>
        </div>
        <div class="call-meta">
          <div class="call-time">${this.esc(call.time || this.formatTime(call.date || call.createdAt))}</div>
          ${call.summary ? '<div style="font-size:11px;color:var(--accent);margin-top:2px;">AI Summary</div>' : ''}
        </div>
      </div>
    `).join('');

    list.querySelectorAll('.call-item').forEach(item => {
      item.addEventListener('click', () => {
        const call = this.calls.find(c => c.id === item.dataset.id);
        if (call) this.showCallDetail(call);
      });
    });
  },

  // ============================================
  // Rendering — Contacts
  // ============================================

  renderContacts(contacts) {
    const list = document.getElementById('contactList');

    if (!contacts || contacts.length === 0) {
      list.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">&#128101;</div>
          <p>No contacts yet</p>
          <small>Add your first lead to get started</small>
        </div>
      `;
      return;
    }

    list.innerHTML = contacts.map(contact => `
      <div class="contact-item" data-id="${contact.id}">
        <div class="avatar">${this.getInitials(contact.name)}</div>
        <div class="contact-info">
          <div class="contact-name">${this.esc(contact.name)}</div>
          <div class="contact-phone">${this.formatPhone(contact.phone)}</div>
        </div>
        ${contact.temperature || contact.stage || contact.status ? `
          <span class="contact-status ${(contact.temperature || contact.status || '').toLowerCase()}">${this.esc(contact.temperature || contact.stage || contact.status)}</span>
        ` : ''}
      </div>
    `).join('');

    list.querySelectorAll('.contact-item').forEach(item => {
      item.addEventListener('click', () => {
        const contact = this.contacts.find(c => c.id === item.dataset.id);
        if (contact) this.showContactDetail(contact);
      });
    });
  },

  // ============================================
  // Rendering — Dashboard
  // ============================================

  renderDashboard() {
    const todayStr = new Date().toISOString().slice(0, 10);

    // Compute from loaded data
    const callsToday = this.calls.filter(c => (c.date || c.createdAt || '').slice(0, 10) === todayStr).length;
    const textsToday = this.conversations.filter(c => (c.date || c.updatedAt || '').slice(0, 10) === todayStr).length;
    const newLeads = this.contacts.filter(c => c.stage === 'New' || c.stage === 'NEW').length;
    const followUpsDue = this.tasks.filter(t => t.status !== 'Done' && t.dueDate && t.dueDate <= todayStr).length;

    document.getElementById('statCalls').textContent = callsToday;
    document.getElementById('statTexts').textContent = textsToday;
    document.getElementById('statLeads').textContent = newLeads;
    document.getElementById('statFollowups').textContent = followUpsDue;

    const activityList = document.getElementById('activityList');
    const recent = [
      ...this.calls.slice(0, 3).map(c => ({
        type: 'call',
        text: `${(c.direction || '').charAt(0).toUpperCase() + (c.direction || '').slice(1)} call with ${c.name || 'Unknown'}`,
        time: c.time || this.formatTime(c.date || c.createdAt)
      })),
      ...this.conversations.slice(0, 3).map(c => ({
        type: 'message',
        text: `Message from ${c.name || 'Unknown'}`,
        time: c.time || this.formatTime(c.date || c.updatedAt)
      }))
    ].slice(0, 5);

    if (recent.length === 0) {
      activityList.innerHTML = '<div class="empty-state"><p>No recent activity</p></div>';
    } else {
      activityList.innerHTML = recent.map(a => `
        <div class="activity-item">
          <div class="activity-icon">
            ${a.type === 'call' ?
              '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>' :
              '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>'
            }
          </div>
          <div class="activity-text">${this.esc(a.text)}</div>
          <div class="activity-time">${this.esc(a.time)}</div>
        </div>
      `).join('');
    }
  },

  // ============================================
  // Add Contact Modal
  // ============================================

  bindAddContact() {
    const modal = document.getElementById('addContactModal');
    const form = document.getElementById('addContactForm');
    const cancelBtn = document.getElementById('cancelAddContact');

    cancelBtn.addEventListener('click', () => modal.classList.remove('active'));
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.classList.remove('active');
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const data = {
        name: form.contactName.value.trim(),
        phone: form.contactPhone.value.trim(),
        email: form.contactEmail.value.trim() || undefined,
        vehicleInterest: form.contactVehicle.value.trim() || undefined,
        source: form.contactSource.value || 'Manual',
        stage: 'New',
      };
      if (!data.name || !data.phone) {
        this.showToast('Name and phone are required');
        return;
      }
      const submitBtn = form.querySelector('button[type="submit"]');
      submitBtn.disabled = true;
      submitBtn.textContent = 'Saving...';
      try {
        const created = await API.createContact(data);
        this.contacts.unshift(created);
        this.renderContacts(this.contacts);
        this.renderToday();
        modal.classList.remove('active');
        form.reset();
        this.showToast('Contact added');
      } catch (error) {
        this.showToast('Failed to add contact');
      }
      submitBtn.disabled = false;
      submitBtn.textContent = 'Save Contact';
    });
  },

  showAddContactModal() {
    document.getElementById('addContactModal').classList.add('active');
    document.getElementById('addContactForm').reset();
    setTimeout(() => document.querySelector('#addContactForm input[name="contactName"]').focus(), 300);
  },

  // ============================================
  // Add Task
  // ============================================

  bindAddTask() {
    const modal = document.getElementById('addTaskModal');
    if (!modal) return;
    const form = document.getElementById('addTaskForm');
    const cancelBtn = document.getElementById('cancelAddTask');

    cancelBtn.addEventListener('click', () => modal.classList.remove('active'));
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.classList.remove('active');
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const data = {
        title: form.taskTitle.value.trim(),
        dueDate: form.taskDueDate.value || undefined,
        contactId: form.taskContactId.value || undefined,
      };
      if (!data.title) {
        this.showToast('Task title is required');
        return;
      }
      try {
        const created = await API.createTask(data);
        this.tasks.unshift(created);
        this.renderToday();
        modal.classList.remove('active');
        form.reset();
        this.showToast('Task added');
      } catch (error) {
        this.showToast('Failed to add task');
      }
    });
  },

  showAddTaskModal(contactId) {
    const modal = document.getElementById('addTaskModal');
    if (!modal) return;
    modal.classList.add('active');
    document.getElementById('addTaskForm').reset();
    // Default due date to today
    const today = new Date().toISOString().slice(0, 10);
    document.getElementById('ft-date').value = today;
    if (contactId) document.querySelector('#addTaskForm input[name="taskContactId"]').value = contactId;
    setTimeout(() => document.getElementById('ft-title').focus(), 300);
  },

  // ============================================
  // Inventory
  // ============================================

  bindInventory() {
    const modal = document.getElementById('addCarModal');
    if (!modal) return;
    const form = document.getElementById('addCarForm');
    const cancelBtn = document.getElementById('cancelAddCar');
    const decodeBtn = document.getElementById('vinDecodeBtn');
    const addCarBtn = document.getElementById('addCarBtn');

    addCarBtn.addEventListener('click', () => this.showAddCarModal());
    cancelBtn.addEventListener('click', () => modal.classList.remove('active'));
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.classList.remove('active');
    });

    decodeBtn.addEventListener('click', () => this.decodeVin());

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      await this.saveInventoryItem();
    });

    // Inventory detail close
    const detailModal = document.getElementById('inventoryDetailModal');
    if (detailModal) {
      document.getElementById('closeInvDetail').addEventListener('click', () => detailModal.classList.remove('active'));
      detailModal.addEventListener('click', (e) => {
        if (e.target === detailModal) detailModal.classList.remove('active');
      });
    }
  },

  showAddCarModal() {
    const modal = document.getElementById('addCarModal');
    modal.classList.add('active');
    document.getElementById('addCarForm').reset();
    document.getElementById('vinDecodeResult').innerHTML = '';
    document.getElementById('saveCarBtn').disabled = true;
    this._decodedVin = null;
    setTimeout(() => document.getElementById('fv-vin').focus(), 300);
  },

  async decodeVin() {
    const vinInput = document.getElementById('fv-vin');
    const vin = vinInput.value.trim().toUpperCase();
    if (vin.length !== 17) {
      this.showToast('VIN must be 17 characters');
      return;
    }

    const resultDiv = document.getElementById('vinDecodeResult');
    const decodeBtn = document.getElementById('vinDecodeBtn');
    decodeBtn.disabled = true;
    decodeBtn.textContent = 'Decoding...';
    resultDiv.innerHTML = '<div class="loading-state"><div class="spinner"></div></div>';

    try {
      // Try n8n backend first, fall back to direct NHTSA call
      let decoded;
      try {
        decoded = await API.decodeVin(vin);
      } catch {
        // Direct NHTSA fallback
        const resp = await fetch(`https://vpic.nhtsa.dot.gov/api/vehicles/decodevin/${vin}?format=json`);
        const data = await resp.json();
        const get = (varName) => {
          const r = data.Results.find(r => r.Variable === varName);
          return r && r.Value && r.Value !== 'Not Applicable' ? r.Value : '';
        };
        decoded = {
          vin,
          year: get('Model Year'),
          make: get('Make'),
          model: get('Model'),
          trim: get('Trim'),
          engine: `${get('Displacement (L)')}L ${get('Engine Number of Cylinders')}-Cyl`,
          drivetrain: get('Drive Type'),
          bodyType: get('Body Class'),
          fuelType: get('Fuel Type - Primary'),
        };
      }

      this._decodedVin = decoded;
      resultDiv.innerHTML = `
        <div class="vin-decoded">
          <div class="vin-decoded-title">${this.esc(decoded.year)} ${this.esc(decoded.make)} ${this.esc(decoded.model)} ${this.esc(decoded.trim)}</div>
          <div class="vin-decoded-specs">
            ${decoded.engine ? `<span class="vin-spec">${this.esc(decoded.engine)}</span>` : ''}
            ${decoded.drivetrain ? `<span class="vin-spec">${this.esc(decoded.drivetrain)}</span>` : ''}
            ${decoded.bodyType ? `<span class="vin-spec">${this.esc(decoded.bodyType)}</span>` : ''}
            ${decoded.fuelType ? `<span class="vin-spec">${this.esc(decoded.fuelType)}</span>` : ''}
          </div>
        </div>
      `;
      document.getElementById('saveCarBtn').disabled = false;
    } catch (error) {
      resultDiv.innerHTML = `<div style="padding: 12px; color: var(--danger); font-size: 14px;">Failed to decode VIN. Check the number and try again.</div>`;
    }

    decodeBtn.disabled = false;
    decodeBtn.textContent = 'Decode VIN';
  },

  async saveInventoryItem() {
    if (!this._decodedVin) return;

    const color = document.getElementById('fv-color').value.trim();
    const price = document.getElementById('fv-price').value.trim();
    const saveBtn = document.getElementById('saveCarBtn');
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving...';

    const data = {
      ...this._decodedVin,
      color: color || undefined,
      price: price ? Number(price) : undefined,
      status: 'Available',
      dateAdded: new Date().toISOString().slice(0, 10),
    };

    try {
      const created = await API.processVin(data.vin, []);
      this.inventory.unshift(created || data);
      this.renderInventory();
      document.getElementById('addCarModal').classList.remove('active');
      this.showToast('Car added to inventory');
    } catch {
      // If backend fails, still add locally for display
      data.id = 'local_' + Date.now();
      this.inventory.unshift(data);
      this.renderInventory();
      document.getElementById('addCarModal').classList.remove('active');
      this.showToast('Car added (offline — will sync later)');
    }

    saveBtn.disabled = false;
    saveBtn.textContent = 'Save to Inventory';
    this._decodedVin = null;
  },

  renderInventory() {
    const grid = document.getElementById('inventoryGrid');
    if (!grid) return;

    if (!this.inventory || this.inventory.length === 0) {
      grid.innerHTML = `
        <div class="empty-state" style="grid-column: 1/-1;">
          <div class="empty-icon">&#128663;</div>
          <p>No inventory yet</p>
          <small>Tap "Add Car" to scan a VIN</small>
        </div>
      `;
      return;
    }

    grid.innerHTML = this.inventory.map(car => `
      <div class="inventory-card" data-id="${car.id || ''}">
        <div class="inventory-card-img">
          ${car.photos && car.photos.length > 0
            ? `<img src="${this.esc(car.photos[0])}" alt="${this.esc(car.year + ' ' + car.model)}">`
            : '&#128663;'}
        </div>
        <div class="inventory-card-info">
          <div class="inventory-card-title">${this.esc(car.year)} ${this.esc(car.make)} ${this.esc(car.model)}</div>
          <div class="inventory-card-sub">${car.trim ? this.esc(car.trim) + ' · ' : ''}${car.price ? '$' + Number(car.price).toLocaleString() : 'No price'}</div>
        </div>
      </div>
    `).join('');

    grid.querySelectorAll('.inventory-card').forEach(card => {
      card.addEventListener('click', () => {
        const item = this.inventory.find(c => c.id === card.dataset.id);
        if (item) this.showInventoryDetail(item);
      });
    });
  },

  showInventoryDetail(car) {
    const modal = document.getElementById('inventoryDetailModal');
    if (!modal) return;

    document.getElementById('invDetailTitle').textContent = `${car.year} ${car.make} ${car.model}`;

    const shareUrl = `https://app.friendlycarguy.com/vehicle.html?vin=${encodeURIComponent(car.vin || '')}&year=${encodeURIComponent(car.year || '')}&make=${encodeURIComponent(car.make || '')}&model=${encodeURIComponent(car.model || '')}&trim=${encodeURIComponent(car.trim || '')}&color=${encodeURIComponent(car.color || '')}&engine=${encodeURIComponent(car.engine || '')}&price=${encodeURIComponent(car.price || '')}&name=Erfan&phone=6029057670`;

    document.getElementById('invDetailContent').innerHTML = `
      <div class="inv-detail-specs">
        ${car.trim ? `<div class="inv-spec-card"><div class="inv-spec-label">Trim</div><div class="inv-spec-value">${this.esc(car.trim)}</div></div>` : ''}
        ${car.engine ? `<div class="inv-spec-card"><div class="inv-spec-label">Engine</div><div class="inv-spec-value">${this.esc(car.engine)}</div></div>` : ''}
        ${car.drivetrain ? `<div class="inv-spec-card"><div class="inv-spec-label">Drivetrain</div><div class="inv-spec-value">${this.esc(car.drivetrain)}</div></div>` : ''}
        ${car.color ? `<div class="inv-spec-card"><div class="inv-spec-label">Color</div><div class="inv-spec-value">${this.esc(car.color)}</div></div>` : ''}
        ${car.price ? `<div class="inv-spec-card"><div class="inv-spec-label">Price</div><div class="inv-spec-value">$${Number(car.price).toLocaleString()}</div></div>` : ''}
        ${car.status ? `<div class="inv-spec-card"><div class="inv-spec-label">Status</div><div class="inv-spec-value">${this.esc(car.status)}</div></div>` : ''}
      </div>
      ${car.vin ? `<div style="font-family: monospace; font-size: 13px; color: var(--text-muted); margin-bottom: 16px;">VIN: ${this.esc(car.vin)}</div>` : ''}
      <div class="inv-detail-actions">
        <button class="btn-primary" onclick="navigator.share ? navigator.share({title: '${this.esc(car.year)} ${this.esc(car.make)} ${this.esc(car.model)}', url: '${shareUrl}'}) : navigator.clipboard.writeText('${shareUrl}').then(() => App.showToast('Link copied!'))">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
          Share Vehicle Page
        </button>
        <button class="btn-secondary" onclick="window.open('sms:+16029057670?body=${encodeURIComponent("Hi! I'm interested in the " + (car.year || '') + " " + (car.model || ''))}', '_self')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          Text About This Car
        </button>
      </div>
    `;

    modal.classList.add('active');
  },

  // ============================================
  // Call Detail (Week 3)
  // ============================================

  showCallDetail(call) {
    this.currentCallDetail = call;
    document.getElementById('callDetailName').textContent = call.name || 'Unknown';
    document.getElementById('callDetailMeta').textContent =
      `${(call.direction || 'Call').charAt(0).toUpperCase() + (call.direction || '').slice(1)}${call.duration > 0 ? ' · ' + this.formatDuration(call.duration) : ''}`;
    document.getElementById('callDetail').classList.add('active');
    this.renderCallDetailContent(call);
  },

  hideCallDetail() {
    document.getElementById('callDetail').classList.remove('active');
    this.currentCallDetail = null;
  },

  renderCallDetailContent(call) {
    const content = document.getElementById('callDetailContent');
    let html = '';

    // Summary card
    if (call.summary) {
      html += `
        <div class="call-summary-card">
          <h3>AI Summary</h3>
          <div class="call-summary-text">${this.esc(call.summary)}</div>
          ${call.sentiment ? `<div class="call-sentiment ${call.sentiment}">${this.esc(call.sentiment)}</div>` : ''}
        </div>
      `;
    }

    // Extracted data
    const extracted = [];
    if (call.vehicleInterest) extracted.push({ label: 'Vehicle', value: call.vehicleInterest });
    if (call.temperature) extracted.push({ label: 'Temperature', value: call.temperature });
    if (call.budget) extracted.push({ label: 'Budget', value: '$' + Number(call.budget).toLocaleString() });
    if (call.timeline) extracted.push({ label: 'Timeline', value: call.timeline });
    if (call.nextSteps) extracted.push({ label: 'Next Steps', value: call.nextSteps });

    if (extracted.length > 0) {
      html += `<div class="call-extracted-section"><h3>Extracted Info</h3>`;
      html += extracted.map(e => `
        <div class="extracted-item">
          <div class="extracted-label">${this.esc(e.label)}</div>
          <div class="extracted-value">${this.esc(e.value)}</div>
        </div>
      `).join('');
      html += `</div>`;
    }

    // Transcript
    if (call.transcript) {
      html += `
        <div class="call-transcript-section">
          <h3>Transcript</h3>
          <div class="transcript-text" id="transcriptText" style="display:none;">${this.esc(call.transcript)}</div>
          <button class="transcript-toggle" id="transcriptToggle" onclick="
            const t = document.getElementById('transcriptText');
            const b = document.getElementById('transcriptToggle');
            if (t.style.display === 'none') { t.style.display = 'block'; b.textContent = 'Hide Transcript'; }
            else { t.style.display = 'none'; b.textContent = 'Show Full Transcript'; }
          ">Show Full Transcript</button>
        </div>
      `;
    }

    // Basic info if no AI data
    if (!call.summary && !call.transcript && extracted.length === 0) {
      html += `
        <div class="call-summary-card">
          <h3>Call Info</h3>
          <div class="call-summary-text">
            ${call.direction ? (call.direction.charAt(0).toUpperCase() + call.direction.slice(1)) + ' call' : 'Call'}
            ${call.duration > 0 ? ' lasting ' + this.formatDuration(call.duration) : ''}
            ${call.date ? ' on ' + new Date(call.date).toLocaleDateString() : ''}
          </div>
          <div style="margin-top: 12px; font-size: 13px; color: var(--text-muted);">
            Transcript and AI analysis will appear here once the Call Brain (W11) workflow is built in n8n.
          </div>
        </div>
      `;
    }

    // Contact link
    if (call.contactId) {
      html += `
        <button class="contact-action-btn secondary" style="width: 100%; margin-top: 16px;" onclick="App.openContactFromCall('${this.esc(call.contactId)}')">
          View Contact
        </button>
      `;
    }

    content.innerHTML = html;
  },

  openContactFromCall(contactId) {
    const contact = this.contacts.find(c => c.id === contactId);
    if (contact) {
      this.hideCallDetail();
      setTimeout(() => this.showContactDetail(contact), 350);
    }
  },

  // ============================================
  // Power Dialer (Week 4)
  // ============================================

  dialerState: {
    active: false,
    queue: [],
    currentIndex: 0,
    timerInterval: null,
    timerSeconds: 0,
    stats: { dialed: 0, connected: 0, voicemail: 0, noAnswer: 0, skipped: 0 }
  },

  bindDialer() {
    const startBtn = document.getElementById('dialerStartBtn');
    const stopBtn = document.getElementById('dialerStopBtn');
    const doneBtn = document.getElementById('dialerDoneBtn');
    const goDialerBtn = document.getElementById('goToDialerBtn');
    const goInventoryBtn = document.getElementById('goToInventoryBtn');

    if (startBtn) startBtn.addEventListener('click', () => this.startDialer());
    if (stopBtn) stopBtn.addEventListener('click', () => this.stopDialer());
    if (doneBtn) doneBtn.addEventListener('click', () => this.resetDialer());

    if (goDialerBtn) {
      goDialerBtn.addEventListener('click', () => {
        this.switchView('dialerView');
        document.querySelector('.header-title').textContent = 'Dialer';
        document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
      });
    }

    if (goInventoryBtn) {
      goInventoryBtn.addEventListener('click', () => {
        this.switchView('inventoryView');
        document.querySelector('.header-title').textContent = 'Inventory';
        document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
      });
    }

    // Disposition buttons
    document.querySelectorAll('.dispo-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const dispo = btn.dataset.dispo;
        this.handleDisposition(dispo);
      });
    });
  },

  buildDialerQueue() {
    const todayStr = new Date().toISOString().slice(0, 10);
    // Priority: overdue tasks (hot first), new leads, warm leads
    const withFollowUp = this.contacts.filter(c =>
      c.stage && c.stage !== 'Sold' && c.stage !== 'Dead' && c.phone
    );

    // Sort: hot first, then by stage priority
    const tempOrder = { hot: 0, Hot: 0, warm: 1, Warm: 1 };
    const stageOrder = { New: 0, Contacted: 1, Engaged: 2, Appointment: 3 };

    withFollowUp.sort((a, b) => {
      const ta = tempOrder[a.temperature] ?? 2;
      const tb = tempOrder[b.temperature] ?? 2;
      if (ta !== tb) return ta - tb;
      const sa = stageOrder[a.stage] ?? 5;
      const sb = stageOrder[b.stage] ?? 5;
      return sa - sb;
    });

    return withFollowUp;
  },

  updateDialerQueueStats() {
    const queue = this.buildDialerQueue();
    const todayStr = new Date().toISOString().slice(0, 10);
    const overdue = this.tasks.filter(t => t.status !== 'Done' && t.dueDate && t.dueDate < todayStr).length;
    const hot = this.contacts.filter(c => (c.temperature || '').toLowerCase() === 'hot').length;

    const countEl = document.getElementById('dialerQueueCount');
    const overdueEl = document.getElementById('dialerOverdueCount');
    const hotEl = document.getElementById('dialerHotCount');
    if (countEl) countEl.textContent = queue.length;
    if (overdueEl) overdueEl.textContent = overdue;
    if (hotEl) hotEl.textContent = hot;
  },

  async startDialer() {
    const queue = this.buildDialerQueue();
    if (queue.length === 0) {
      this.showToast('No contacts in queue');
      return;
    }

    this.dialerState = {
      active: true,
      queue,
      currentIndex: 0,
      timerInterval: null,
      timerSeconds: 0,
      stats: { dialed: 0, connected: 0, voicemail: 0, noAnswer: 0, skipped: 0 }
    };

    document.getElementById('dialerIdle').classList.add('hidden');
    document.getElementById('dialerActive').classList.remove('hidden');
    document.getElementById('dialerSummary').classList.add('hidden');
    document.getElementById('dialerTotal').textContent = queue.length;

    // Try to start via n8n backend
    try {
      await API.startDialer(queue.map(c => c.id));
    } catch {
      // Backend not ready — run in local mode (manual dialing)
    }

    this.dialNextContact();
  },

  async dialNextContact() {
    const { queue, currentIndex } = this.dialerState;
    if (currentIndex >= queue.length) {
      this.showDialerSummary();
      return;
    }

    const contact = queue[currentIndex];
    document.getElementById('dialerCurrent').textContent = currentIndex + 1;
    document.getElementById('dialerAvatar').textContent = this.getInitials(contact.name);
    document.getElementById('dialerContactName').textContent = contact.name || 'Unknown';
    document.getElementById('dialerContactSub').textContent =
      `${this.formatPhone(contact.phone)}${contact.vehicleInterest ? ' · ' + contact.vehicleInterest : ''}`;

    // Load briefing
    const briefingEl = document.querySelector('#dialerBriefing .briefing-text');
    briefingEl.textContent = 'Loading briefing...';

    try {
      const briefing = await this.loadBriefing(contact.id);
      briefingEl.textContent = briefing || `${contact.stage || 'Lead'} · ${contact.source || 'Unknown source'}`;
    } catch {
      briefingEl.textContent = `${contact.stage || 'Lead'} · ${contact.source || 'Unknown source'}`;
    }

    // Start timer
    this.dialerState.timerSeconds = 0;
    document.getElementById('dialerTimer').textContent = '0:00';
    this.dialerState.timerInterval = setInterval(() => {
      this.dialerState.timerSeconds++;
      const m = Math.floor(this.dialerState.timerSeconds / 60);
      const s = this.dialerState.timerSeconds % 60;
      document.getElementById('dialerTimer').textContent = `${m}:${s.toString().padStart(2, '0')}`;
    }, 1000);

    // Initiate call via tel: link
    this.initiateCall(contact.phone);
    this.dialerState.stats.dialed++;
  },

  handleDisposition(dispo) {
    clearInterval(this.dialerState.timerInterval);

    switch (dispo) {
      case 'connected': this.dialerState.stats.connected++; break;
      case 'voicemail': this.dialerState.stats.voicemail++; break;
      case 'no-answer': this.dialerState.stats.noAnswer++; break;
      case 'skip': this.dialerState.stats.skipped++; break;
    }

    // Log to backend
    const contact = this.dialerState.queue[this.dialerState.currentIndex];
    if (contact) {
      API.logDialerResult(contact.id, dispo, this.dialerState.timerSeconds).catch(() => {});
    }

    this.dialerState.currentIndex++;
    this.dialNextContact();
  },

  stopDialer() {
    clearInterval(this.dialerState.timerInterval);
    this.dialerState.active = false;
    this.showDialerSummary();
  },

  showDialerSummary() {
    clearInterval(this.dialerState.timerInterval);
    document.getElementById('dialerActive').classList.add('hidden');
    document.getElementById('dialerSummary').classList.remove('hidden');

    const { stats } = this.dialerState;
    document.getElementById('dialerSummaryStats').innerHTML = `
      <div class="summary-stat"><div class="summary-stat-value">${stats.dialed}</div><div class="summary-stat-label">Dialed</div></div>
      <div class="summary-stat"><div class="summary-stat-value">${stats.connected}</div><div class="summary-stat-label">Connected</div></div>
      <div class="summary-stat"><div class="summary-stat-value">${stats.voicemail}</div><div class="summary-stat-label">Voicemail</div></div>
      <div class="summary-stat"><div class="summary-stat-value">${stats.noAnswer + stats.skipped}</div><div class="summary-stat-label">No Answer</div></div>
    `;
  },

  resetDialer() {
    this.dialerState = {
      active: false, queue: [], currentIndex: 0, timerInterval: null, timerSeconds: 0,
      stats: { dialed: 0, connected: 0, voicemail: 0, noAnswer: 0, skipped: 0 }
    };
    document.getElementById('dialerSummary').classList.add('hidden');
    document.getElementById('dialerActive').classList.add('hidden');
    document.getElementById('dialerIdle').classList.remove('hidden');
    this.updateDialerQueueStats();
  },

  // ============================================
  // Briefing Card (Week 3)
  // ============================================

  async loadBriefing(contactId) {
    try {
      const data = await API.getBriefing(contactId);
      return data.briefing || data.text || null;
    } catch {
      return null;
    }
  },

  async getBriefingForContact(contactId) {
    const briefingEl = document.getElementById('briefingText');
    if (!briefingEl) return;
    briefingEl.innerHTML = '<div class="briefing-loading"><div class="spinner"></div> Generating briefing...</div>';
    const briefing = await this.loadBriefing(contactId);
    if (briefing) {
      briefingEl.textContent = briefing;
    } else {
      briefingEl.textContent = 'Briefing not available yet. Build the W12 workflow in n8n first.';
    }
  },

  // ============================================
  // Actions
  // ============================================

  initiateCall(phone) {
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
  // Offline Banner
  // ============================================

  showOfflineBanner() {
    let banner = document.getElementById('offlineBanner');
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'offlineBanner';
      banner.className = 'offline-banner';
      banner.textContent = 'No internet connection';
      document.getElementById('app').prepend(banner);
    }
    banner.classList.add('show');
  },

  hideOfflineBanner() {
    const banner = document.getElementById('offlineBanner');
    if (banner) banner.classList.remove('show');
  },

  // ============================================
  // Utilities
  // ============================================

  esc(str) {
    if (!str) return '';
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  },

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
    if (cleaned.length === 11 && cleaned[0] === '1') {
      return `(${cleaned.slice(1,4)}) ${cleaned.slice(4,7)}-${cleaned.slice(7)}`;
    }
    return phone;
  },

  formatDuration(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  },

  formatTime(isoStr) {
    if (!isoStr) return '';
    try {
      const d = new Date(isoStr);
      const now = new Date();
      const diffDays = Math.floor((now - d) / 86400000);
      if (diffDays === 0) {
        return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
      }
      if (diffDays === 1) return 'Yesterday';
      if (diffDays < 7) return d.toLocaleDateString('en-US', { weekday: 'short' });
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    } catch {
      return '';
    }
  },

  getCallIcon(direction) {
    const icons = {
      incoming: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>',
      outgoing: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>',
      missed: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 2 5a2 2 0 0 1 2-2"/><path d="m15 3 6 6M21 3l-6 6"/></svg>',
      inbound: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>',
      outbound: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>',
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
        console.log('SW registered:', registration.scope);
        if ('Notification' in window && Notification.permission === 'default') {
          await Notification.requestPermission();
        }
      } catch (error) {
        console.error('SW registration failed:', error);
      }
    }
  }
};

document.addEventListener('DOMContentLoaded', () => App.init());
