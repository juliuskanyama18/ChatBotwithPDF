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
};

// Chat API
export const chatAPI = {
  sendMessage: (data) => api.post('/generate-response', data),
  getMessages: (conversationId) => api.get(`/api/conversations/${conversationId}/messages`),
  resetChat: (documentId) => api.delete(`/api/documents/${documentId}/reset`),
};

// Workspace API (for managed RAG)
export const workspacesAPI = {
  getAll: () => api.get('/api/workspaces'),
  create: (data) => api.post('/api/workspaces', data),
  getById: (id) => api.get(`/api/workspaces/${id}`),
  update: (id, data) => api.put(`/api/workspaces/${id}`, data),
  delete: (id) => api.delete(`/api/workspaces/${id}`),
  migrateDocuments: (data) => api.post('/api/workspaces/migrate-documents', data),
};

// Managed RAG API (OpenAI Vector Stores + Assistants)
export const managedRagAPI = {
  uploadDocument: (formData) => {
    return api.post('/api/managed-rag/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  chat: (data) => api.post('/api/managed-rag/chat', data),
  summarize: (data) => api.post('/api/managed-rag/summarize', data),
  deleteDocument: (id) => api.delete(`/api/managed-rag/documents/${id}`),
  getDocumentStatus: (id) => api.get(`/api/managed-rag/documents/${id}/status`),
};

export default api;
