// API Configuration and HTTP client for n8n backend
const API = {
  // Base URL for n8n webhooks
  baseUrl: 'https://erfank.app.n8n.cloud/webhook',
  token: null,

  // ============================================
  // Token Management
  // ============================================

  setToken(token) {
    this.token = token;
    localStorage.setItem('fcg_token', token);
  },

  getToken() {
    if (!this.token) {
      this.token = localStorage.getItem('fcg_token');
    }
    return this.token;
  },

  logout() {
    this.token = null;
    localStorage.removeItem('fcg_token');
    localStorage.removeItem('fcg_token_expiry');
  },

  isAuthenticated() {
    const token = this.getToken();
    const expiry = localStorage.getItem('fcg_token_expiry');
    if (!token || !expiry) return false;
    if (Date.now() > parseInt(expiry)) {
      this.logout();
      return false;
    }
    return true;
  },

  // ============================================
  // Authentication — server-side PIN validation
  // ============================================

  async authenticate(pin) {
    // Try server-side auth first (n8n workflow)
    try {
      const response = await fetch(`${this.baseUrl}/auth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }),
      });

      const data = await response.json();

      if (data.success && data.token) {
        this.setToken(data.token);
        const expiry = Date.now() + (7 * 24 * 60 * 60 * 1000); // 7 days
        localStorage.setItem('fcg_token_expiry', expiry.toString());
        return { success: true, user: data.user };
      }

      return { success: false, error: data.error || 'Invalid PIN' };
    } catch (error) {
      // Fallback: local PIN check when n8n auth workflow isn't built yet
      console.warn('Auth endpoint unreachable, using local fallback');
      if (pin === '685467') {
        const fallbackToken = 'local_' + Date.now();
        this.setToken(fallbackToken);
        const expiry = Date.now() + (7 * 24 * 60 * 60 * 1000);
        localStorage.setItem('fcg_token_expiry', expiry.toString());
        return { success: true, user: { name: 'Erfan', role: 'admin' } };
      }
      return { success: false, error: 'Invalid PIN' };
    }
  },

  // ============================================
  // Generic HTTP Client
  // ============================================

  async request(endpoint, options = {}) {
    const url = `${this.baseUrl}${endpoint}`;
    const token = this.getToken();

    const config = {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token && { 'Authorization': `Bearer ${token}` }),
        ...options.headers,
      },
    };

    try {
      const response = await fetch(url, config);

      // Handle 401 — token expired or invalid
      if (response.status === 401) {
        this.logout();
        window.dispatchEvent(new Event('fcg:auth-expired'));
        throw new Error('Session expired. Please log in again.');
      }

      // Try to parse as JSON
      const text = await response.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error(`Server returned non-JSON response (HTTP ${response.status})`);
      }

      if (!response.ok) {
        throw new Error(data.message || data.error || `HTTP ${response.status}`);
      }

      return data;
    } catch (error) {
      if (error.message === 'Session expired. Please log in again.') throw error;
      if (!navigator.onLine) throw new Error('No internet connection');
      console.error(`API Error [${options.method || 'GET'} ${endpoint}]:`, error);
      throw error;
    }
  },

  get(endpoint) {
    return this.request(endpoint, { method: 'GET' });
  },

  post(endpoint, data) {
    return this.request(endpoint, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  put(endpoint, data) {
    return this.request(endpoint, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  delete(endpoint) {
    return this.request(endpoint, { method: 'DELETE' });
  },

  // ============================================
  // Contacts (W16, W17)
  // ============================================

  async getContacts() {
    return this.get('/contacts');
  },

  async getContact(id) {
    return this.get(`/contacts/${id}`);
  },

  async createContact(data) {
    return this.post('/contacts', data);
  },

  async updateContact(id, data) {
    return this.put(`/contacts/${id}`, data);
  },

  async deleteContact(id) {
    return this.delete(`/contacts/${id}`);
  },

  async searchContacts(query) {
    return this.get(`/contacts/search?q=${encodeURIComponent(query)}`);
  },

  // ============================================
  // Messages (W18, W19)
  // ============================================

  async getConversations() {
    return this.get('/messages/conversations');
  },

  async getMessages(contactId) {
    return this.get(`/messages/${contactId}`);
  },

  async sendMessage(contactId, body) {
    return this.post('/messages/send', { contactId, body });
  },

  // ============================================
  // Calls (W20)
  // ============================================

  async getCalls() {
    return this.get('/calls');
  },

  async getCall(id) {
    return this.get(`/calls/${id}`);
  },

  async getCallsByContact(contactId) {
    return this.get(`/calls/contact/${contactId}`);
  },

  // ============================================
  // Tasks (W21)
  // ============================================

  async getTasks() {
    return this.get('/tasks');
  },

  async createTask(data) {
    return this.post('/tasks', data);
  },

  async updateTask(id, data) {
    return this.put(`/tasks/${id}`, data);
  },

  async completeTask(id) {
    return this.put(`/tasks/${id}`, { status: 'Done' });
  },

  // ============================================
  // Dashboard / Stats (W22)
  // ============================================

  async getDashboardStats() {
    return this.get('/dashboard/stats');
  },

  async getRecentActivity() {
    return this.get('/dashboard/activity');
  },

  // ============================================
  // Person Intelligence (W12)
  // ============================================

  async getPersonIntel(contactId) {
    return this.post('/person-intel', { personId: contactId });
  },

  async getPersonIntelByPhone(phone) {
    return this.post('/person-intel', { phone });
  },

  // ============================================
  // Pre-Call Briefing (W12)
  // ============================================

  async getBriefing(contactId) {
    return this.post('/briefing/generate', { contactId });
  },

  // ============================================
  // Inventory (W23)
  // ============================================

  async getInventory() {
    return this.get('/inventory');
  },

  async getInventoryItem(id) {
    return this.get(`/inventory/${id}`);
  },

  async processVin(vin, photos) {
    return this.post('/vin/process', { vin, photos });
  },

  async decodeVin(vin) {
    return this.post('/vin/decode', { vin });
  },

  // ============================================
  // Power Dialer (W13, W14)
  // ============================================

  async startDialerSession(listId) {
    return this.post('/dialer/start', { listId });
  },

  async dialNext(sessionId) {
    return this.post('/dialer/next', { sessionId });
  },

  async pauseDialer(sessionId) {
    return this.post('/dialer/pause', { sessionId });
  },

  async stopDialer(sessionId) {
    return this.post('/dialer/stop', { sessionId });
  },

  // ============================================
  // Push Notifications
  // ============================================

  async registerPushSubscription(subscription) {
    return this.post('/push/subscribe', { subscription });
  },

  async unregisterPushSubscription() {
    return this.post('/push/unsubscribe', {});
  },
};

window.API = API;
