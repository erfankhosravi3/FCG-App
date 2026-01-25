// API Configuration and HTTP client for n8n backend
const API = {
  // Base URL - will be configured to point to n8n webhooks
  baseUrl: '', // Set this to your n8n webhook base URL
  token: null, // Auth token stored after login

  // Set the API base URL
  setBaseUrl(url) {
    this.baseUrl = url.replace(/\/$/, ''); // Remove trailing slash
  },

  // Set auth token
  setToken(token) {
    this.token = token;
    localStorage.setItem('fcg_token', token);
  },

  // Get stored token
  getToken() {
    if (!this.token) {
      this.token = localStorage.getItem('fcg_token');
    }
    return this.token;
  },

  // Clear auth
  logout() {
    this.token = null;
    localStorage.removeItem('fcg_token');
  },

  // Generic fetch wrapper
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

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.message || `HTTP ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('API Error:', error);
      throw error;
    }
  },

  // GET request
  get(endpoint) {
    return this.request(endpoint, { method: 'GET' });
  },

  // POST request
  post(endpoint, data) {
    return this.request(endpoint, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // PUT request
  put(endpoint, data) {
    return this.request(endpoint, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  // DELETE request
  delete(endpoint) {
    return this.request(endpoint, { method: 'DELETE' });
  },

  // ============================================
  // Contacts API
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
  // Messages API
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
  // Calls API
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
  // Tasks API
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
  // Dashboard / Stats API
  // ============================================

  async getDashboardStats() {
    return this.get('/dashboard/stats');
  },

  async getRecentActivity() {
    return this.get('/dashboard/activity');
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

// Export for use in other modules
window.API = API;
