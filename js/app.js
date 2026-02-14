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
    const [contacts, conversations, calls, tasks] = await Promise.allSettled([
      API.getContacts(),
      API.getConversations(),
      API.getCalls(),
      API.getTasks(),
    ]);

    this.contacts = this.extractData(contacts);
    this.conversations = this.extractData(conversations);
    this.calls = this.extractData(calls);
    this.tasks = this.extractData(tasks);

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
    this.renderDashboard();
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
        </div>
      </div>
    `).join('');
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
