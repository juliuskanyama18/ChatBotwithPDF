import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3600';

// Create axios instance with default config
const api = axios.create({
  baseURL: API_URL,
  withCredentials: true, // Important for cookies
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor for adding auth token
api.interceptors.request.use(
  (config) => {
    // Token is in HTTP-only cookie, so we don't need to add it manually
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor for handling errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    // Don't auto-redirect on 401 - let components handle it
    // This prevents infinite loops during auth checks
    return Promise.reject(error);
  }
);

// Auth API
export const authAPI = {
  register: (userData) => api.post('/api/auth/register', userData),
  login: (credentials) => api.post('/api/auth/login', credentials),
  logout: () => api.post('/api/auth/logout'),
  getMe: () => api.get('/api/auth/me'),
};

// Documents API
export const documentsAPI = {
  getAll: () => api.get('/api/documents'),
  getById: (id) => api.get(`/api/documents/${id}`),
  upload: (formData) => {
    return api.post('/uploadPdf', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  update: (id, data) => api.put(`/api/documents/${id}`, data),
  delete: (id) => api.delete(`/api/documents/${id}`),
  getLatestConversation: (documentId) =>
    api.get(`/api/documents/${documentId}/latest-conversation`),
  getFolderConversation: (folderId) =>
    api.get(`/api/documents/folders/${folderId}/latest-conversation`),
};

// Chat API
export const chatAPI = {
  sendMessage: (data) => api.post('/generate-response', data),
  getMessages: (conversationId) => api.get(`/api/conversations/${conversationId}/messages`),
  resetChat: (documentId) => api.delete(`/api/documents/${documentId}/reset`),
};

export default api;
