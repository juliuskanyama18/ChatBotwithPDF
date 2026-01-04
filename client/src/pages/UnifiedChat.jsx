import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Send,
  Sparkles,
  Upload,
  FileText,
  Trash2,
  Plus,
  MessageSquare,
  LogOut,
  ChevronLeft,
  ChevronRight,
  MoreVertical,
  FolderPlus,
  FolderMinus,
  Folder,
  Share2,
  Download,
  RotateCcw,
  Edit2,
  X,
  ChevronDown,
  Info,
} from 'lucide-react';
import { documentsAPI, chatAPI } from '../services/api';
import { useAuth } from '../hooks/useAuth';
import toast from 'react-hot-toast';
import UniversalDocumentViewer from '../components/UniversalDocumentViewer';
import Message from '../components/Message';
import TypingIndicator from '../components/TypingIndicator';
import UploadModal from '../components/UploadModal';

export default function UnifiedChat() {
  const didLoadFolders = useRef(false);
  const { user, logout } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const documentId = searchParams.get('doc');

  // State
  const [documents, setDocuments] = useState([]);
  const [folders, setFolders] = useState([]);
  const [currentDocument, setCurrentDocument] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [conversationId, setConversationId] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [loadingDocuments, setLoadingDocuments] = useState(true);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [allChatsModalOpen, setAllChatsModalOpen] = useState(false);
  const [activeContextMenu, setActiveContextMenu] = useState(null);
  const [documentTitleMenuOpen, setDocumentTitleMenuOpen] = useState(false);
  const [renameModalOpen, setRenameModalOpen] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [renamingDocId, setRenamingDocId] = useState(null);
  const [folderModalOpen, setFolderModalOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [moveToFolderModalOpen, setMoveToFolderModal] = useState(false);
  const [movingDocId, setMovingDocId] = useState(null);
  const [draggedDocId, setDraggedDocId] = useState(null);
  const [dragOverFolderId, setDragOverFolderId] = useState(null);
  const [expandedFolders, setExpandedFolders] = useState({});
  const [folderContextMenu, setFolderContextMenu] = useState(null);
  const [renamingFolderId, setRenamingFolderId] = useState(null);
  const [renamingFolderValue, setRenamingFolderValue] = useState('');
  const [showAllChats, setShowAllChats] = useState(false);

  // FOLDER CHAT MODE STATE
  const [chatMode, setChatMode] = useState('document'); // 'document' | 'folder'
  const [currentFolder, setCurrentFolder] = useState(null);
  const [folderDocuments, setFolderDocuments] = useState([]);
  const [documentDropdownOpen, setDocumentDropdownOpen] = useState(false);
  const [pendingPageScroll, setPendingPageScroll] = useState(null); // {pageNumber, message, documentName}
  const [folderHeaderMenuOpen, setFolderHeaderMenuOpen] = useState(false);

  // VIEW MODE STATE
  const [viewMode, setViewMode] = useState('both'); // 'both' | 'document' | 'chat'

  // Resizable panel widths
  const [sidebarWidth, setSidebarWidth] = useState(280);
  const [documentWidth, setDocumentWidth] = useState(50);
  const [isResizingSidebar, setIsResizingSidebar] = useState(false);
  const [isResizingDocument, setIsResizingDocument] = useState(false);

  const messagesEndRef = useRef(null);
  const documentViewerRef = useRef(null);
  const fileInputRef = useRef(null);
  const containerRef = useRef(null);

  // Load documents and folders on mount
  useEffect(() => {
    loadDocuments();
    if (!didLoadFolders.current) {
      loadFoldersFromStorage();
      didLoadFolders.current = true;
    }
  }, []);

  // Save folders to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem('chatpdf_folders', JSON.stringify(folders));
  }, [folders]);

  // Load conversation when document changes
  useEffect(() => {
    if (documentId) {
      loadDocument(documentId);
      loadConversation(documentId);
    } else {
      setCurrentDocument(null);
      setMessages([]);
      setConversationId(null);
    }
  }, [documentId]);

  // Auto scroll messages
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Handle sidebar resize
  useEffect(() => {
    const handleMouseMove = (e) => {
      if (isResizingSidebar) {
        const newWidth = Math.max(200, Math.min(500, e.clientX));
        setSidebarWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      setIsResizingSidebar(false);
    };

    if (isResizingSidebar) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizingSidebar]);

  // Handle document/chat resize
  useEffect(() => {
    const handleMouseMove = (e) => {
      if (isResizingDocument && containerRef.current) {
        const containerRect = containerRef.current.getBoundingClientRect();
        const offsetX = e.clientX - containerRect.left - (sidebarOpen ? sidebarWidth : 0);
        const containerWidth = containerRect.width - (sidebarOpen ? sidebarWidth : 0);
        const newWidth = Math.max(30, Math.min(70, (offsetX / containerWidth) * 100));
        setDocumentWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      setIsResizingDocument(false);
    };

    if (isResizingDocument) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizingDocument, sidebarOpen, sidebarWidth]);

  // Close menus on click outside
  useEffect(() => {
    const handleClickOutside = () => {
      setActiveContextMenu(null);
      setDocumentTitleMenuOpen(false);
      setFolderHeaderMenuOpen(false);
    };

    if (activeContextMenu || documentTitleMenuOpen || folderHeaderMenuOpen) {
      document.addEventListener('click', handleClickOutside);
    }

    return () => {
      document.removeEventListener('click', handleClickOutside);
    };
  }, [activeContextMenu, documentTitleMenuOpen, folderHeaderMenuOpen]);

  // Handle pending page scroll after document loads (for cross-document navigation)
  useEffect(() => {
    if (pendingPageScroll && currentDocument) {
      // Give the document viewer a moment to render
      const timer = setTimeout(() => {
        scrollToPageInDocument(pendingPageScroll.pageNumber, pendingPageScroll.message);
        toast.dismiss('loading-doc');
        toast.success(`Jumped to page ${pendingPageScroll.pageNumber} in ${pendingPageScroll.documentName}`, {
          duration: 2000,
        });
        setPendingPageScroll(null); // Clear pending scroll
      }, 800); // 800ms gives the document viewer time to fully load

      return () => clearTimeout(timer);
    }
  }, [currentDocument, pendingPageScroll]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const loadFoldersFromStorage = () => {
    try {
      const storedFolders = localStorage.getItem('chatpdf_folders');
      if (storedFolders) {
        setFolders(JSON.parse(storedFolders));
      } else {
        setFolders([]);
      }
    } catch (error) {
      setFolders([]);
      console.error('Error loading folders from storage:', error);
    }
  };

  const loadDocuments = async () => {
    try {
      setLoadingDocuments(true);
      const response = await documentsAPI.getAll();
      setDocuments(response.data.documents || []);
    } catch (error) {
      console.error('Error loading documents:', error);
      toast.error('Failed to load documents');
    } finally {
      setLoadingDocuments(false);
    }
  };

  const loadDocument = async (docId) => {
    try {
      const response = await documentsAPI.getById(docId);
      setCurrentDocument(response.data.document);
    } catch (error) {
      console.error('Error loading document:', error);
      toast.error('Failed to load document');
    }
  };

  const loadConversation = async (docId) => {
    try {
      setMessages([]);
      const response = await documentsAPI.getLatestConversation(docId);
      if (response.data.messages && response.data.messages.length > 0) {
        setMessages(response.data.messages);
        setConversationId(response.data.conversation._id);
      }
    } catch (error) {
      console.error('Error loading conversation:', error);
    }
  };

  const loadFolderConversation = async (folderId) => {
    try {
      setMessages([]);
      const response = await documentsAPI.getFolderConversation(folderId);
      if (response.data.success && response.data.messages && response.data.messages.length > 0) {
        setMessages(response.data.messages);
        setConversationId(response.data.conversation._id);
      }
    } catch (error) {
      console.error('Error loading folder conversation:', error);
    }
  };

  const handleFolderClick = (folderId) => {
    const folder = folders.find(f => f.id === folderId);
    if (!folder) return;

    // Get all documents in this folder
    const docsInFolder = documents.filter(doc =>
      folder.documents.includes(doc._id)
    );

    if (docsInFolder.length === 0) {
      toast.error('This folder is empty. Add documents to start chatting.');
      return;
    }

    // Enter folder chat mode
    setChatMode('folder');
    setCurrentFolder(folder);
    setFolderDocuments(docsInFolder);
    setCurrentDocument(null); // Clear single document
    setMessages([]);
    setConversationId(null);

    // Load folder conversation (if exists)
    loadFolderConversation(folderId);

    toast.success(`Chatting with folder: ${folder.name}`);
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();

    // Validation based on mode
    if (!input.trim() || loading) return;

    if (chatMode === 'document' && !currentDocument) {
      toast.error('Please select a document first');
      return;
    }

    if (chatMode === 'folder' && (!currentFolder || folderDocuments.length === 0)) {
      toast.error('Please select a folder with documents');
      return;
    }

    const userMessage = {
      role: 'user',
      content: input,
      _id: Date.now().toString(),
    };

    setMessages([...messages, userMessage]);
    setInput('');
    setLoading(true);

    try {
      let response;

      if (chatMode === 'folder') {
        // FOLDER MODE: Send multiple document IDs
        response = await chatAPI.sendMessage({
          prompt: input,
          documentIds: folderDocuments.map(doc => doc._id),
          folderId: currentFolder.id,
          conversationId,
        });
      } else {
        // DOCUMENT MODE: Single document ID (existing flow)
        response = await chatAPI.sendMessage({
          prompt: input,
          documentId: currentDocument._id,
          conversationId,
        });
      }

      const aiMessage = {
        role: 'assistant',
        content: response.data.reply,
        _id: (Date.now() + 1).toString(),
        pageReference: response.data.relevantPages?.[0],
        relevantPages: response.data.relevantPages || [],
        relevantChunks: response.data.relevantChunks || [],
        sourceDocument: response.data.sourceDocument || null
      };

      setMessages((prev) => [...prev, aiMessage]);

      if (!conversationId) {
        setConversationId(response.data.conversationId);
      }

      // Do not auto-scroll or auto-highlight; wait for user to click page citations
    } catch (error) {
      console.error('Error sending message:', error);
      toast.error('Failed to send message');
      setMessages((prev) => prev.slice(0, -1));
    } finally {
      setLoading(false);
    }
  };

  const handlePageClick = async (pageNumber, documentName = null, message = null) => {
    // Check if we need to load a different document (folder mode with document name)
    if (chatMode === 'folder' && documentName) {
      // Find the document by name
      const targetDoc = folderDocuments.find(doc =>
        doc.originalName === documentName || doc.fileName === documentName
      );

      if (!targetDoc) {
        toast.error(`Document "${documentName}" not found in folder`);
        return;
      }

      // Check if it's already the current document
      if (currentDocument?._id === targetDoc._id) {
        // Same document - just scroll
        scrollToPageInDocument(pageNumber, message);
        toast.success(`Jumped to page ${pageNumber}`, {
          duration: 2000,
          position: 'top-center',
        });
      } else {
        // Different document - load it and set pending scroll
        toast.loading(`Loading ${documentName}...`, { id: 'loading-doc' });
        setPendingPageScroll({ pageNumber, message, documentName });
        setCurrentDocument(targetDoc);
        // useEffect will handle scrolling after document loads
      }

    } else {
      // Same document or document mode - just scroll
      scrollToPageInDocument(pageNumber, message);
      toast.success(`Jumped to page ${pageNumber}`, {
        duration: 2000,
        position: 'top-center',
      });
    }
  };

  const scrollToPageInDocument = (pageNumber, message = null) => {
    if (documentViewerRef.current && documentViewerRef.current.scrollToPage) {
      documentViewerRef.current.scrollToPage(pageNumber);

      // If the message contains chunk-level info, highlight those chunks for this page
      const chunks = message?.relevantChunks || [];
      const chunksForPage = chunks.filter(c => Number(c.pageNumber) === Number(pageNumber));

      if (chunksForPage.length > 0 && documentViewerRef.current.highlightChunks) {
        try {
          documentViewerRef.current.highlightChunks(chunksForPage);
        } catch (err) {
          // fallback to highlight page only
          if (documentViewerRef.current.highlightPages) {
            documentViewerRef.current.highlightPages([pageNumber]);
          }
        }
      } else if (documentViewerRef.current.highlightPages) {
        documentViewerRef.current.highlightPages([pageNumber]);
      }
    }
  };

  const handleDeleteDocument = async (docId) => {
    if (!window.confirm('Are you sure you want to delete this chat?')) return;

    try {
      await documentsAPI.delete(docId);
      toast.success('Chat deleted successfully');
      setDocuments(documents.filter((doc) => doc._id !== docId));

      // Remove document from any folder it's in
      setFolders(folders.map(folder => ({
        ...folder,
        documents: folder.documents.filter(id => id !== docId)
      })));

      if (currentDocument?._id === docId) {
        setSearchParams({});
      }
    } catch (error) {
      console.error('Error deleting document:', error);
      toast.error('Failed to delete chat');
    }
  };

  const handleRenameChat = (docId, currentName) => {
    setRenamingDocId(docId);
    setRenameValue(currentName);
    setRenameModalOpen(true);
    setActiveContextMenu(null);
  };

  const handleRenameSubmit = async () => {
    if (!renameValue.trim() || !renamingDocId) return;

    try {
      // Update backend first
      await documentsAPI.update(renamingDocId, { originalName: renameValue });

      // Then update locally
      setDocuments(
        documents.map((doc) =>
          doc._id === renamingDocId ? { ...doc, originalName: renameValue } : doc
        )
      );

      if (currentDocument?._id === renamingDocId) {
        setCurrentDocument({ ...currentDocument, originalName: renameValue });
      }

      toast.success('Chat renamed successfully');
      setRenameModalOpen(false);
      setRenameValue('');
      setRenamingDocId(null);
    } catch (error) {
      console.error('Error renaming chat:', error);
      toast.error('Failed to rename chat');
    }
  };

  const handleResetChat = async (docId) => {
    if (!window.confirm('Are you sure you want to reset this chat? All messages will be deleted permanently.')) return;

    try {
      // Delete all conversations and messages from backend
      await chatAPI.resetChat(docId);

      // Clear messages locally if it's the current document
      if (currentDocument?._id === docId) {
        setMessages([]);
        setConversationId(null);
      }

      toast.success('Chat reset successfully');
      setActiveContextMenu(null);
    } catch (error) {
      console.error('Error resetting chat:', error);
      toast.error('Failed to reset chat');
    }
  };

  const handleExportChat = async (docId) => {
    try {
      const doc = documents.find((d) => d._id === docId);
      if (!doc) return;

      // Create export data
      const exportData = {
        documentName: doc.originalName,
        messages: messages,
        exportDate: new Date().toISOString(),
      };

      // Download as JSON
      const blob = new Blob([JSON.stringify(exportData, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${doc.originalName}-chat-export.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success('Chat exported successfully');
      setActiveContextMenu(null);
    } catch (error) {
      console.error('Error exporting chat:', error);
      toast.error('Failed to export chat');
    }
  };

  const handleShareChat = (docId) => {
    const shareUrl = `${window.location.origin}/app?doc=${docId}`;
    navigator.clipboard.writeText(shareUrl);
    toast.success('Share link copied to clipboard!');
    setActiveContextMenu(null);
  };

  const isDocumentInFolder = (docId) => {
    return folders.some(folder => folder.documents.includes(docId));
  };

  const handleMoveToFolder = (docId) => {
    if (folders.length === 0) {
      toast.error('Please create a folder first!');
      setActiveContextMenu(null);
      return;
    }
    setMovingDocId(docId);
    setMoveToFolderModal(true);
    setActiveContextMenu(null);
  };

  const handleRemoveFromFolder = async (docId) => {
    try {
      // Update backend - clear the folder field
      await documentsAPI.update(docId, { folder: null });

      // Remove document from all folders
      setFolders(folders.map(folder => ({
        ...folder,
        documents: folder.documents.filter(id => id !== docId)
      })));

      // Update local document
      setDocuments(documents.map(doc =>
        doc._id === docId ? { ...doc, folder: null } : doc
      ));

      toast.success('Document removed from folder');
      setActiveContextMenu(null);
    } catch (error) {
      console.error('Error removing from folder:', error);
      toast.error('Failed to remove from folder');
    }
  };

  const handleMoveToFolderSubmit = async (folderId) => {
    if (!movingDocId || !folderId) return;

    try {
      // Update backend
      await documentsAPI.update(movingDocId, { folder: folderId });

      // Update folder's documents list
      setFolders(folders.map(folder => {
        if (folder.id === folderId) {
          return {
            ...folder,
            documents: [...folder.documents, movingDocId]
          };
        }
        // Remove from other folders if it was there
        return {
          ...folder,
          documents: folder.documents.filter(id => id !== movingDocId)
        };
      }));

      // Update local document
      setDocuments(documents.map(doc =>
        doc._id === movingDocId ? { ...doc, folder: folderId } : doc
      ));

      toast.success('Document moved to folder successfully');
      setMoveToFolderModal(false);
      setMovingDocId(null);
    } catch (error) {
      console.error('Error moving to folder:', error);
      toast.error('Failed to move to folder');
    }
  };

  const handleCreateFolder = () => {
    if (!newFolderName.trim()) return;

    const newFolder = {
      id: Date.now().toString(),
      name: newFolderName,
      documents: [],
    };

    setFolders(prevFolders => {
      const updatedFolders = [...prevFolders, newFolder];
      // localStorage will be updated by useEffect
      return updatedFolders;
    });
    toast.success('Folder created successfully');
    setFolderModalOpen(false);
    setNewFolderName('');
  };

  // Drag and Drop handlers
  const handleDragStart = (e, docId) => {
    setDraggedDocId(docId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOverFolder = (e, folderId) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverFolderId(folderId);
  };

  const handleDragLeaveFolder = () => {
    setDragOverFolderId(null);
  };

  const handleDropOnFolder = async (e, folderId) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverFolderId(null);

    if (!draggedDocId || !folderId) return;

    try {
      // Update backend
      await documentsAPI.update(draggedDocId, { folder: folderId });

      // Update folder's documents list
      setFolders(folders.map(folder => {
        if (folder.id === folderId) {
          // Add to this folder if not already there
          if (!folder.documents.includes(draggedDocId)) {
            return {
              ...folder,
              documents: [...folder.documents, draggedDocId]
            };
          }
        } else {
          // Remove from other folders
          return {
            ...folder,
            documents: folder.documents.filter(id => id !== draggedDocId)
          };
        }
        return folder;
      }));

      // Update local document
      setDocuments(documents.map(doc =>
        doc._id === draggedDocId ? { ...doc, folder: folderId } : doc
      ));

      toast.success('Document moved to folder successfully');
      setDraggedDocId(null);
    } catch (error) {
      console.error('Error moving to folder:', error);
      toast.error('Failed to move to folder');
      setDraggedDocId(null);
    }
  };

  const handleDragEnd = () => {
    setDraggedDocId(null);
    setDragOverFolderId(null);
  };

  const handleDocumentClick = (docId) => {
    setSearchParams({ doc: docId });
  };

  const handleUploadSuccess = (newDocument) => {
    setDocuments([newDocument, ...documents]);
    setUploadModalOpen(false);
    setSearchParams({ doc: newDocument._id });
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(false);

    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      fileInputRef.current.files = e.dataTransfer.files;
      setUploadModalOpen(true);
    }
  };

  // Get all document IDs that are in folders
  const getDocumentsInFolders = () => {
    const docIdsInFolders = new Set();
    folders.forEach(folder => {
      folder.documents.forEach(docId => {
        docIdsInFolders.add(docId);
      });
    });
    return docIdsInFolders;
  };

  // Organize documents by date (excluding those in folders)
  const organizeDocumentsByDate = (docs) => {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const categorized = {
      today: [],
      yesterday: [],
      older: [],
    };

    const docIdsInFolders = getDocumentsInFolders();

    docs.forEach((doc) => {
      // Skip documents that are in folders
      if (docIdsInFolders.has(doc._id)) {
        return;
      }

      const docDate = new Date(doc.createdAt || doc.uploadDate);
      const docDateStr = docDate.toDateString();

      if (docDateStr === today.toDateString()) {
        categorized.today.push(doc);
      } else if (docDateStr === yesterday.toDateString()) {
        categorized.yesterday.push(doc);
      } else {
        categorized.older.push(doc);
      }
    });

    return categorized;
  };

  const toggleFolder = (folderId) => {
    setExpandedFolders(prev => ({
      ...prev,
      [folderId]: !prev[folderId]
    }));
  };

  const handleRenameFolder = (folderId, folderName) => {
    setRenamingFolderId(folderId);
    setRenamingFolderValue(folderName);
    setFolderContextMenu(null);
  };

  const handleSaveRenameFolder = () => {
    if (!renamingFolderValue.trim()) {
      toast.error('Folder name cannot be empty');
      return;
    }

    setFolders(folders.map(folder =>
      folder.id === renamingFolderId
        ? { ...folder, name: renamingFolderValue }
        : folder
    ));

    toast.success('Folder renamed successfully');
    setRenamingFolderId(null);
    setRenamingFolderValue('');
  };

  const handleDeleteFolder = (folderId) => {
    const folder = folders.find(f => f.id === folderId);
    if (!folder) return;

    if (window.confirm(`Are you sure you want to delete the folder "${folder.name}"? Documents will not be deleted, only removed from the folder.`)) {
      const updatedFolders = folders.filter(f => f.id !== folderId);
      setFolders(updatedFolders);
      // Explicitly save to localStorage
      localStorage.setItem('chatpdf_folders', JSON.stringify(updatedFolders));
      setFolderContextMenu(null);

      // If currently in folder mode and the deleted folder is the current one, exit folder mode
      if (chatMode === 'folder' && currentFolder?.id === folderId) {
        setChatMode('document');
        setCurrentFolder(null);
        setFolderDocuments([]);
        setMessages([]);
        setConversationId(null);
        setCurrentDocument(null);
      }

      toast.success('Folder deleted successfully');
    }
  };

  const categorizedDocs = organizeDocumentsByDate(documents);
  const recentChats = [
    ...categorizedDocs.today.slice(0, 3),
    ...categorizedDocs.yesterday.slice(0, 2),
  ];

  // Context Menu Component
  const ContextMenu = ({ docId, docName, onClose }) => (
    <div
      className="absolute right-0 mt-1 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50"
      onClick={(e) => e.stopPropagation()}
    >
      <button
        onClick={() => {
          handleRenameChat(docId, docName);
          onClose();
        }}
        className="w-full flex items-center space-x-2 px-4 py-2 hover:bg-gray-50 text-gray-700 text-sm"
      >
        <Edit2 className="w-4 h-4" />
        <span>Rename chat</span>
      </button>
      {isDocumentInFolder(docId) ? (
        <button
          onClick={() => {
            handleRemoveFromFolder(docId);
            onClose();
          }}
          className="w-full flex items-center space-x-2 px-4 py-2 hover:bg-gray-50 text-gray-700 text-sm"
        >
          <FolderMinus className="w-4 h-4" />
          <span>Remove from folder</span>
        </button>
      ) : (
        <button
          onClick={() => {
            handleMoveToFolder(docId);
            onClose();
          }}
          className="w-full flex items-center space-x-2 px-4 py-2 hover:bg-gray-50 text-gray-700 text-sm"
        >
          <FolderPlus className="w-4 h-4" />
          <span>Move to folder</span>
        </button>
      )}
      <button
        onClick={() => {
          handleShareChat(docId);
          onClose();
        }}
        className="w-full flex items-center space-x-2 px-4 py-2 hover:bg-gray-50 text-gray-700 text-sm"
      >
        <Share2 className="w-4 h-4" />
        <span>Share chat</span>
      </button>
      <button
        onClick={() => {
          handleExportChat(docId);
          onClose();
        }}
        className="w-full flex items-center space-x-2 px-4 py-2 hover:bg-gray-50 text-gray-700 text-sm"
      >
        <Download className="w-4 h-4" />
        <span>Export chat</span>
      </button>
      <button
        onClick={() => {
          handleResetChat(docId);
          onClose();
        }}
        className="w-full flex items-center space-x-2 px-4 py-2 hover:bg-gray-50 text-gray-700 text-sm"
      >
        <RotateCcw className="w-4 h-4" />
        <span>Reset chat</span>
      </button>
      <div className="border-t border-gray-200 my-1"></div>
      <button
        onClick={() => {
          handleDeleteDocument(docId);
          onClose();
        }}
        className="w-full flex items-center space-x-2 px-4 py-2 hover:bg-red-50 text-red-600 text-sm"
      >
        <Trash2 className="w-4 h-4" />
        <span>Delete chat</span>
      </button>
    </div>
  );

  // Chat Item Component
  const ChatItem = ({ doc, showDate = false }) => (
    <div className="relative">
      <div
        draggable
        onDragStart={(e) => handleDragStart(e, doc._id)}
        onDragEnd={handleDragEnd}
        onClick={() => handleDocumentClick(doc._id)}
        className={`group p-3 rounded-lg cursor-pointer transition-all flex items-center justify-between ${
          currentDocument?._id === doc._id
            ? 'bg-primary-50 border border-primary-200'
            : 'hover:bg-gray-50 border border-transparent'
        } ${draggedDocId === doc._id ? 'opacity-50' : ''}`}
      >
        <div className="flex-1 min-w-0 flex items-center space-x-2">
          <MessageSquare
            className={`w-4 h-4 flex-shrink-0 ${
              currentDocument?._id === doc._id
                ? 'text-primary-600'
                : 'text-gray-400'
            }`}
          />
          <h3 className="text-sm font-medium text-gray-900 truncate">
            {doc.originalName}
          </h3>
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            setActiveContextMenu(activeContextMenu === doc._id ? null : doc._id);
          }}
          className="opacity-0 group-hover:opacity-100 p-1 hover:bg-gray-200 rounded transition-all"
        >
          <MoreVertical className="w-4 h-4 text-gray-600" />
        </button>
      </div>

      {activeContextMenu === doc._id && (
        <ContextMenu
          docId={doc._id}
          docName={doc.originalName}
          onClose={() => setActiveContextMenu(null)}
        />
      )}
    </div>
  );

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between z-10 h-[57px]">
        {/* Left Section */}
        <div className="flex items-center space-x-3">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            title={sidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
          >
            {sidebarOpen ? (
              <ChevronLeft className="w-5 h-5 text-gray-600" />
            ) : (
              <ChevronRight className="w-5 h-5 text-gray-600" />
            )}
          </button>
          <button
            onClick={() => setUploadModalOpen(true)}
            className="flex items-center space-x-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span className="font-medium">New</span>
          </button>
        </div>

        {/* Center Section - Clickable Document/Folder Title */}
        <div className="flex-1 flex items-center justify-center px-4">
          {chatMode === 'folder' ? (
            // FOLDER MODE: Show folder button with name and file count
            <div className="relative">
              <div className="group inline-flex items-center justify-center gap-2 font-medium min-w-0 text-start transition-all duration-200 text-gray-900 rounded-md hover:bg-gray-100 h-8 px-2">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setDocumentDropdownOpen(!documentDropdownOpen);
                  }}
                  className="inline-flex items-center gap-2 focus:outline-none"
                  title={currentFolder?.name}
                >
                  <Folder className="size-3.5 text-gray-700 flex-shrink-0" />
                  <span className="truncate max-w-[200px]">{currentFolder?.name || 'Folder'}</span>
                  <span className="text-gray-500 font-normal flex-shrink-0">{folderDocuments.length} files</span>
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setFolderHeaderMenuOpen(!folderHeaderMenuOpen);
                  }}
                  className="ml-auto flex-shrink-0 p-1 rounded hover:bg-gray-200 transition-colors focus:outline-none"
                  title="Folder options"
                >
                  <MoreVertical className="size-4 text-gray-500 group-hover:text-gray-900" />
                </button>
              </div>

              {/* Document Dropdown Menu */}
              {documentDropdownOpen && (
                <>
                  <div
                    className="fixed inset-0 z-10"
                    onClick={() => setDocumentDropdownOpen(false)}
                  />
                  <div className="absolute top-full left-1/2 transform -translate-x-1/2 mt-2 w-64 bg-white rounded-lg shadow-lg border border-gray-200 py-2 z-20 max-h-96 overflow-y-auto">
                    <div className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase">
                      Documents in folder
                    </div>
                    {folderDocuments.map((doc) => (
                      <button
                        key={doc._id}
                        onClick={() => {
                          setCurrentDocument(doc);
                          setDocumentDropdownOpen(false);
                          toast.success(`Viewing: ${doc.originalName}`);
                        }}
                        className={`w-full flex items-center space-x-2 px-4 py-2 hover:bg-gray-50 text-left text-sm ${
                          currentDocument?._id === doc._id ? 'bg-primary-50 text-primary-700' : 'text-gray-700'
                        }`}
                      >
                        <FileText className="w-4 h-4 flex-shrink-0" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium">{doc.originalName}</p>
                          <p className="text-xs text-gray-500">{doc.pageCount} pages</p>
                        </div>
                        {currentDocument?._id === doc._id && (
                          <div className="w-2 h-2 bg-primary-600 rounded-full flex-shrink-0" />
                        )}
                      </button>
                    ))}
                  </div>
                </>
              )}

              {/* Folder Context Menu */}
              {folderHeaderMenuOpen && (
                <>
                  <div
                    className="fixed inset-0 z-10"
                    onClick={() => setFolderHeaderMenuOpen(false)}
                  />
                  <div className="absolute top-full left-1/2 transform -translate-x-1/2 mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-20">
                    <button
                      onClick={() => {
                        handleRenameFolder(currentFolder.id, currentFolder.name);
                        setFolderHeaderMenuOpen(false);
                      }}
                      className="w-full flex items-center space-x-2 px-4 py-2 hover:bg-gray-50 text-gray-700 text-sm"
                    >
                      <Edit2 className="w-4 h-4" />
                      <span>Rename chat</span>
                    </button>
                    <button
                      onClick={() => {
                        if (window.confirm('Are you sure you want to reset this folder chat? All messages will be deleted.')) {
                          setMessages([]);
                          setConversationId(null);
                          toast.success('Folder chat reset successfully');
                        }
                        setFolderHeaderMenuOpen(false);
                      }}
                      className="w-full flex items-center space-x-2 px-4 py-2 hover:bg-gray-50 text-gray-700 text-sm"
                    >
                      <RotateCcw className="w-4 h-4" />
                      <span>Reset chat</span>
                    </button>
                    <div className="border-t border-gray-200 my-1"></div>
                    <button
                      onClick={() => {
                        handleDeleteFolder(currentFolder.id);
                        setFolderHeaderMenuOpen(false);
                      }}
                      className="w-full flex items-center space-x-2 px-4 py-2 hover:bg-red-50 text-red-600 text-sm"
                    >
                      <Trash2 className="w-4 h-4" />
                      <span>Delete</span>
                    </button>
                  </div>
                </>
              )}
            </div>
          ) : currentDocument ? (
            // DOCUMENT MODE: Show single document title
            <div className="relative">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setDocumentTitleMenuOpen(!documentTitleMenuOpen);
                }}
                className="flex items-center space-x-2 max-w-md p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <FileText className="w-5 h-5 text-gray-600 flex-shrink-0" />
                <div className="min-w-0 text-left">
                  <h2 className="font-semibold text-gray-900 truncate">
                    {currentDocument.originalName}
                  </h2>
                  <p className="text-xs text-gray-500">
                    {currentDocument.pageCount} pages
                  </p>
                </div>
                <ChevronDown className="w-4 h-4 text-gray-500 flex-shrink-0" />
              </button>

              {/* Document Title Context Menu */}
              {documentTitleMenuOpen && (
                <>
                  <div
                    className="fixed inset-0 z-10"
                    onClick={() => setDocumentTitleMenuOpen(false)}
                  />
                  <div className="absolute top-full left-1/2 transform -translate-x-1/2 mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-20">
                    <button
                      onClick={() => {
                        handleRenameChat(currentDocument._id, currentDocument.originalName);
                        setDocumentTitleMenuOpen(false);
                      }}
                      className="w-full flex items-center space-x-2 px-4 py-2 hover:bg-gray-50 text-gray-700 text-sm"
                    >
                      <Edit2 className="w-4 h-4" />
                      <span>Rename chat</span>
                    </button>
                    {isDocumentInFolder(currentDocument._id) ? (
                      <button
                        onClick={() => {
                          handleRemoveFromFolder(currentDocument._id);
                          setDocumentTitleMenuOpen(false);
                        }}
                        className="w-full flex items-center space-x-2 px-4 py-2 hover:bg-gray-50 text-gray-700 text-sm"
                      >
                        <FolderMinus className="w-4 h-4" />
                        <span>Remove from folder</span>
                      </button>
                    ) : (
                      <button
                        onClick={() => {
                          handleMoveToFolder(currentDocument._id);
                          setDocumentTitleMenuOpen(false);
                        }}
                        className="w-full flex items-center space-x-2 px-4 py-2 hover:bg-gray-50 text-gray-700 text-sm"
                      >
                        <FolderPlus className="w-4 h-4" />
                        <span>Move to folder</span>
                      </button>
                    )}
                    <button
                      onClick={() => {
                        handleShareChat(currentDocument._id);
                        setDocumentTitleMenuOpen(false);
                      }}
                      className="w-full flex items-center space-x-2 px-4 py-2 hover:bg-gray-50 text-gray-700 text-sm"
                    >
                      <Share2 className="w-4 h-4" />
                      <span>Share chat</span>
                    </button>
                    <button
                      onClick={() => {
                        handleExportChat(currentDocument._id);
                        setDocumentTitleMenuOpen(false);
                      }}
                      className="w-full flex items-center space-x-2 px-4 py-2 hover:bg-gray-50 text-gray-700 text-sm"
                    >
                      <Download className="w-4 h-4" />
                      <span>Export chat</span>
                    </button>
                    <button
                      onClick={() => {
                        handleResetChat(currentDocument._id);
                        setDocumentTitleMenuOpen(false);
                      }}
                      className="w-full flex items-center space-x-2 px-4 py-2 hover:bg-gray-50 text-gray-700 text-sm"
                    >
                      <RotateCcw className="w-4 h-4" />
                      <span>Reset chat</span>
                    </button>
                    <div className="border-t border-gray-200 my-1"></div>
                    <button
                      onClick={() => {
                        handleDeleteDocument(currentDocument._id);
                        setDocumentTitleMenuOpen(false);
                      }}
                      className="w-full flex items-center space-x-2 px-4 py-2 hover:bg-red-50 text-red-600 text-sm"
                    >
                      <Trash2 className="w-4 h-4" />
                      <span>Delete chat</span>
                    </button>
                  </div>
                </>
              )}
            </div>
          ) : (
            // NO SELECTION: Show ChatPDF branding
            <div className="flex items-center space-x-2">
              <Sparkles className="w-5 h-5 text-primary-600" />
              <span className="font-semibold text-gray-900">ChatPDF</span>
            </div>
          )}
        </div>

        {/* Right Section - User Profile */}
        <div className="flex items-center space-x-3">
          {/* VIEW MODE BUTTONS */}
          <div className="flex items-center space-x-2 mr-4">
            <button
              className={`inline-flex items-center justify-center flex-shrink-0 transition-all duration-200 focus-visible:outline-none disabled:pointer-events-none relative overflow-hidden cursor-pointer text-text-main size-8 rounded-md ${viewMode === 'document' ? 'bg-primary-100 border border-primary-400' : ''}`}
              title="Document Only"
              onClick={() => setViewMode('document')}
            >
              <FileText className="w-5 h-5" />
            </button>
            <button
              className={`inline-flex items-center justify-center flex-shrink-0 transition-all duration-200 focus-visible:outline-none disabled:pointer-events-none relative overflow-hidden cursor-pointer text-text-main size-8 rounded-md ${viewMode === 'both' ? 'bg-primary-100 border border-primary-400' : ''}`}
              title="Document and Chat"
              onClick={() => setViewMode('both')}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><path d="M8 19H5c-1 0-2-1-2-2V7c0-1 1-2 2-2h3"></path><path d="M16 5h3c1 0 2 1 2 2v10c0 1-1 2-2 2h-3"></path><line x1="12" x2="12" y1="4" y2="20"></line></svg>
            </button>
            <button
              className={`inline-flex items-center justify-center flex-shrink-0 transition-all duration-200 focus-visible:outline-none disabled:pointer-events-none relative overflow-hidden cursor-pointer text-text-main size-8 rounded-md ${viewMode === 'chat' ? 'bg-primary-100 border border-primary-400' : ''}`}
              title="Chat Only"
              onClick={() => setViewMode('chat')}
            >
              <MessageSquare className="w-5 h-5" />
            </button>
          </div>

          <div className="relative">
            <button
              onClick={() => setProfileMenuOpen(!profileMenuOpen)}
              className="flex items-center space-x-2 p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <div className="w-8 h-8 bg-primary-600 rounded-full flex items-center justify-center text-white font-semibold">
                {user?.fullName?.charAt(0).toUpperCase() || 'U'}
              </div>
            </button>

            {profileMenuOpen && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setProfileMenuOpen(false)}
                />
                <div className="absolute right-0 mt-2 w-64 bg-white rounded-lg shadow-lg border border-gray-200 py-2 z-20">
                  <div className="px-4 py-3 border-b border-gray-200">
                    <p className="font-semibold text-gray-900">
                      {user?.fullName || 'User'}
                    </p>
                    <p className="text-sm text-gray-600">{user?.email}</p>
                  </div>
                  <button
                    onClick={() => {
                      logout();
                      setProfileMenuOpen(false);
                    }}
                    className="w-full flex items-center space-x-2 px-4 py-2 hover:bg-gray-50 text-red-600 transition-colors"
                  >
                    <LogOut className="w-4 h-4" />
                    <span>Logout</span>
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      <div ref={containerRef} className="flex-1 flex overflow-hidden relative">
        {/* Sidebar */}
        {sidebarOpen && (
          <>
            <aside
              style={{ width: `${sidebarWidth}px` }}
              className="bg-white border-r border-gray-200 flex flex-col overflow-hidden"
            >
              {/* Sidebar Content - Scrollable */}
              <div className="flex-1 overflow-y-auto p-3">
                {loadingDocuments ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
                  </div>
                ) : (
                  <>
                    {/* Chats Section */}
                    <div className="mb-6">
                      <button
                        onClick={() => setShowAllChats(!showAllChats)}
                        className="w-full flex items-center justify-between px-2 py-1 mb-2 hover:bg-gray-100 rounded transition-colors"
                      >
                        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider flex items-center space-x-1">
                          <MessageSquare className="w-3 h-3" />
                          <span>Chats</span>
                        </h3>
                        <div className="flex items-center space-x-2">
                          {documents.length > 0 && (
                            <span className="text-xs bg-gray-200 text-gray-700 px-2 py-0.5 rounded-full">
                              {documents.length}
                            </span>
                          )}
                          <ChevronDown
                            className={`w-4 h-4 text-gray-400 transition-transform ${
                              showAllChats ? 'transform rotate-180' : ''
                            }`}
                          />
                        </div>
                      </button>

                      {documents.length === 0 ? (
                        <div className="text-center py-8 px-4">
                          <MessageSquare className="w-12 h-12 text-gray-400 mx-auto mb-2" />
                          <p className="text-sm text-gray-600">No chats yet</p>
                          <p className="text-xs text-gray-500 mt-1">
                            Upload a document to start
                          </p>
                        </div>
                      ) : (
                        <div className="space-y-1">
                          {showAllChats ? (
                            // Show all documents
                            <>
                              {/* Today */}
                              {categorizedDocs.today.length > 0 && (
                                <>
                                  <p className="text-xs text-gray-500 px-2 py-1">Today</p>
                                  {categorizedDocs.today.map((doc) => (
                                    <ChatItem key={doc._id} doc={doc} />
                                  ))}
                                </>
                              )}

                              {/* Yesterday */}
                              {categorizedDocs.yesterday.length > 0 && (
                                <>
                                  <p className="text-xs text-gray-500 px-2 py-1 mt-2">
                                    Yesterday
                                  </p>
                                  {categorizedDocs.yesterday.map((doc) => (
                                    <ChatItem key={doc._id} doc={doc} />
                                  ))}
                                </>
                              )}

                              {/* Older */}
                              {categorizedDocs.older.length > 0 && (
                                <>
                                  <p className="text-xs text-gray-500 px-2 py-1 mt-2">Older</p>
                                  {categorizedDocs.older.map((doc) => (
                                    <ChatItem key={doc._id} doc={doc} />
                                  ))}
                                </>
                              )}
                            </>
                          ) : (
                            // Show limited documents (original behavior)
                            <>
                              {/* Today */}
                              {categorizedDocs.today.length > 0 && (
                                <>
                                  <p className="text-xs text-gray-500 px-2 py-1">Today</p>
                                  {categorizedDocs.today.slice(0, 5).map((doc) => (
                                    <ChatItem key={doc._id} doc={doc} />
                                  ))}
                                </>
                              )}

                              {/* Yesterday */}
                              {categorizedDocs.yesterday.length > 0 && (
                                <>
                                  <p className="text-xs text-gray-500 px-2 py-1 mt-2">
                                    Yesterday
                                  </p>
                                  {categorizedDocs.yesterday.slice(0, 3).map((doc) => (
                                    <ChatItem key={doc._id} doc={doc} />
                                  ))}
                                </>
                              )}

                              {/* Older */}
                              {categorizedDocs.older.length > 0 && (
                                <>
                                  <p className="text-xs text-gray-500 px-2 py-1 mt-2">Older</p>
                                  {categorizedDocs.older.slice(0, 2).map((doc) => (
                                    <ChatItem key={doc._id} doc={doc} />
                                  ))}
                                  {categorizedDocs.older.length > 2 && !showAllChats && (
                                    <p className="text-xs text-gray-500 px-2 py-1">
                                      +{categorizedDocs.older.length - 2} more
                                    </p>
                                  )}
                                </>
                              )}
                            </>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Folders Section */}
                    <div className="mb-6">
                      <div className="flex items-center justify-between px-2 py-1 mb-2">
                        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider flex items-center space-x-1">
                          <Folder className="w-3 h-3" />
                          <span>Folders</span>
                        </h3>
                      </div>

                      <button
                        onClick={() => setFolderModalOpen(true)}
                        className="w-full flex items-center space-x-2 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 rounded-lg transition-colors"
                      >
                        <Plus className="w-4 h-4" />
                        <span>New folder</span>
                      </button>

                      {folders.length > 0 && (
                        <div className="mt-2 space-y-1">
                          {folders.map((folder) => {
                            const isExpanded = expandedFolders[folder.id];
                            const folderDocs = documents.filter(doc =>
                              folder.documents.includes(doc._id)
                            );

                            return (
                              <div
                                key={folder.id}
                                onDragOver={(e) => handleDragOverFolder(e, folder.id)}
                                onDragLeave={handleDragLeaveFolder}
                                onDrop={(e) => handleDropOnFolder(e, folder.id)}
                                className={`rounded-lg transition-all ${
                                  dragOverFolderId === folder.id ? 'bg-primary-100 border-2 border-primary-400' : ''
                                }`}
                              >
                                {/* Folder Header */}
                                <div className="flex items-center space-x-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 rounded-lg transition-colors group">
                                  <button
                                    onClick={() => toggleFolder(folder.id)}
                                    className="flex items-center"
                                  >
                                    {isExpanded ? (
                                      <ChevronDown className="w-4 h-4 text-gray-400" />
                                    ) : (
                                      <ChevronRight className="w-4 h-4 text-gray-400" />
                                    )}
                                  </button>

                                  {/* CLICKABLE FOLDER NAME */}
                                  <button
                                    onClick={() => handleFolderClick(folder.id)}
                                    className="flex items-center space-x-2 flex-1 hover:text-primary-600 transition-colors"
                                    title={`Chat with folder: ${folder.name}`}
                                  >
                                    <Folder className="w-4 h-4 text-gray-400" />
                                    {renamingFolderId === folder.id ? (
                                      <input
                                        type="text"
                                        value={renamingFolderValue}
                                        onChange={(e) => setRenamingFolderValue(e.target.value)}
                                        onKeyDown={(e) => {
                                          if (e.key === 'Enter') {
                                            handleSaveRenameFolder();
                                          } else if (e.key === 'Escape') {
                                            setRenamingFolderId(null);
                                            setRenamingFolderValue('');
                                          }
                                        }}
                                        onBlur={handleSaveRenameFolder}
                                        autoFocus
                                        className="flex-1 px-2 py-1 text-sm rounded border border-primary-400 focus:outline-none focus:ring-1 focus:ring-primary-500"
                                        onClick={(e) => e.stopPropagation()}
                                      />
                                    ) : (
                                      <span className="flex-1 truncate text-left font-medium">
                                        {folder.name}
                                        {folderDocs.length > 0 && (
                                          <span className="ml-2 text-xs text-gray-500">
                                            ({folderDocs.length} docs)
                                          </span>
                                        )}
                                      </span>
                                    )}
                                  </button>

                                  {/* Three Dots Menu */}
                                  <div className="relative">
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setFolderContextMenu(
                                          folderContextMenu === folder.id ? null : folder.id
                                        );
                                      }}
                                      className="p-1 hover:bg-gray-200 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                                      title="Folder options"
                                    >
                                      <MoreVertical className="w-4 h-4 text-gray-500" />
                                    </button>

                                    {/* Dropdown Menu */}
                                    {folderContextMenu === folder.id && (
                                      <div
                                        className="absolute right-0 mt-1 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50"
                                        onClick={(e) => e.stopPropagation()}
                                      >
                                        <button
                                          onClick={() => handleRenameFolder(folder.id, folder.name)}
                                          className="w-full flex items-center space-x-2 px-4 py-2 hover:bg-gray-50 text-gray-700 text-sm"
                                        >
                                          <Edit2 className="w-4 h-4" />
                                          <span>Rename folder</span>
                                        </button>
                                        <button
                                          onClick={() => handleDeleteFolder(folder.id)}
                                          className="w-full flex items-center space-x-2 px-4 py-2 hover:bg-red-50 text-red-700 text-sm"
                                        >
                                          <Trash2 className="w-4 h-4" />
                                          <span>Delete folder</span>
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                </div>

                                {/* Folder Contents */}
                                {isExpanded && folderDocs.length > 0 && (
                                  <div className="ml-6 mt-1 space-y-1 border-l-2 border-gray-200 pl-2">
                                    {folderDocs.map((doc) => (
                                      <ChatItem key={doc._id} doc={doc} />
                                    ))}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            </aside>

            {/* Sidebar Resize Handle */}
            <div
              onMouseDown={() => setIsResizingSidebar(true)}
              className="w-1 bg-gray-200 hover:bg-primary-400 cursor-col-resize transition-colors flex-shrink-0"
              style={{ cursor: 'col-resize' }}
            />
          </>
        )}

        {/* Main Content */}
        <div className={`flex-1 overflow-hidden flex relative ${viewMode === 'both' ? 'flex-row' : 'flex-col'}`}>
          {viewMode === 'document' && (
            <>
              {currentDocument ? (
                <div className="flex-1 bg-gray-900 overflow-y-auto overflow-x-hidden">
                  <UniversalDocumentViewer
                    ref={documentViewerRef}
                    documentId={currentDocument._id}
                    fileName={currentDocument.fileName}
                    originalName={currentDocument.originalName}
                  />
                </div>
              ) : chatMode === 'folder' ? (
                // FOLDER MODE: No document selected - Show folder placeholder
                <div className="flex-1 bg-gray-50 flex items-center justify-center p-8">
                  <div className="text-center max-w-md">
                    <Folder className="w-16 h-16 text-primary-600 mx-auto mb-4" />
                    <h3 className="text-xl font-semibold text-gray-900 mb-2">
                      Folder: {currentFolder?.name}
                    </h3>
                    <p className="text-gray-600 mb-6">
                      This folder contains {folderDocuments.length} document{folderDocuments.length !== 1 ? 's' : ''}.
                      Select a document from the dropdown above to view it.
                    </p>
                    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 max-h-96 overflow-y-auto">
                      <p className="text-sm font-semibold text-gray-700 mb-3 text-left">
                        Documents in this folder:
                      </p>
                      <div className="space-y-2">
                        {folderDocuments.map((doc) => (
                          <button
                            key={doc._id}
                            onClick={() => {
                              setCurrentDocument(doc);
                              toast.success(`Viewing: ${doc.originalName}`);
                            }}
                            className="w-full flex items-center space-x-3 p-3 hover:bg-gray-50 rounded-lg transition-colors text-left border border-gray-200"
                          >
                            <FileText className="w-5 h-5 text-gray-600 flex-shrink-0" />
                            <div className="min-w-0 flex-1">
                              <p className="font-medium text-gray-900 truncate">{doc.originalName}</p>
                              <p className="text-xs text-gray-500">{doc.pageCount} pages</p>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}
            </>
          )}
          {viewMode === 'chat' && (
            <div className="flex-1 flex flex-col bg-white">
              {/* Chat Header - Small info bar */}
              {chatMode === 'folder' && (
                <div className="flex items-center px-3 py-2 text-gray-600 justify-between text-sm border-b border-gray-200 bg-gray-50">
                  <div className="flex items-center gap-2">
                    <Info className="size-3.5 shrink-0" />
                    <span className="text-sm">You are chatting with the folder</span>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setDocumentDropdownOpen(!documentDropdownOpen);
                    }}
                    className="relative inline-flex items-center gap-1.5 px-2.5 py-1 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
                  >
                    <span className="truncate max-w-[150px]">
                      {currentDocument ? currentDocument.originalName : 'Chat with file'}
                    </span>
                    <ChevronDown className="size-4 shrink-0" />

                    {/* Document Dropdown Menu */}
                    {documentDropdownOpen && (
                      <>
                        <div
                          className="fixed inset-0 z-10"
                          onClick={() => setDocumentDropdownOpen(false)}
                        />
                        <div className="absolute top-full right-0 mt-2 w-64 bg-white rounded-lg shadow-lg border border-gray-200 py-2 z-20 max-h-96 overflow-y-auto">
                          <div className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase">
                            Documents in folder
                          </div>
                          {folderDocuments.map((doc) => (
                            <button
                              key={doc._id}
                              onClick={() => {
                                setCurrentDocument(doc);
                                setDocumentDropdownOpen(false);
                                toast.success(`Viewing: ${doc.originalName}`);
                              }}
                              className={`w-full flex items-center space-x-2 px-4 py-2 hover:bg-gray-50 text-left text-sm ${
                                currentDocument?._id === doc._id ? 'bg-primary-50 text-primary-700' : 'text-gray-700'
                              }`}
                            >
                              <FileText className="w-4 h-4 flex-shrink-0" />
                              <div className="min-w-0 flex-1">
                                <p className="truncate font-medium">{doc.originalName}</p>
                                <p className="text-xs text-gray-500">{doc.pageCount} pages</p>
                              </div>
                              {currentDocument?._id === doc._id && (
                                <div className="w-2 h-2 bg-primary-600 rounded-full flex-shrink-0" />
                              )}
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                  </button>
                </div>
              )}

              {/* Messages Area - Scrollable */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {messages.length === 0 ? (
                  <div className="flex items-center justify-center h-full text-center px-4">
                    <div>
                      <MessageSquare className="w-12 h-12 text-primary-600 mx-auto mb-4" />
                      <h3 className="text-lg font-semibold text-gray-900 mb-2">
                        Start a Conversation
                      </h3>
                      <p className="text-gray-600 mb-4">
                        Ask me anything about this document. I'll provide
                        accurate answers with page references.
                      </p>
                      <div className="text-left inline-block">
                        <p className="text-sm text-gray-600 font-medium mb-2">
                          Try asking:
                        </p>
                        <ul className="text-sm text-gray-600 space-y-1">
                          <li>• "What is this document about?"</li>
                          <li>• "Summarize the main points"</li>
                          <li>• "Find information about..."</li>
                        </ul>
                      </div>
                    </div>
                  </div>
                ) : (
                  messages.map((message) => (
                    <Message
                      key={message._id}
                      message={message}
                      onPageClick={handlePageClick}
                    />
                  ))
                )}
                {loading && <TypingIndicator />}
                <div ref={messagesEndRef} />
              </div>
              {/* Input Area - Fixed */}
              <div className="border-t border-gray-200 p-4 bg-white">
                <form
                  onSubmit={handleSendMessage}
                  className="flex items-end space-x-2"
                >
                  <textarea
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSendMessage(e);
                      }
                    }}
                    placeholder="Ask a question about this document..."
                    rows={1}
                    className="flex-1 resize-none input-field max-h-32"
                    style={{ minHeight: '42px' }}
                  />
                  <button
                    type="submit"
                    disabled={!input.trim() || loading}
                    className="btn-primary p-3"
                  >
                    <Send className="w-5 h-5" />
                  </button>
                </form>
                <p className="text-xs text-gray-500 mt-2 text-center">
                  Press Enter to send, Shift+Enter for new line
                </p>
              </div>
            </div>
          )}
          {viewMode === 'both' && (
            <>
              {currentDocument ? (
                <div
                  className="bg-gray-900 overflow-y-auto overflow-x-hidden"
                  style={{ width: `${documentWidth}%` }}
                >
                  <UniversalDocumentViewer
                    ref={documentViewerRef}
                    documentId={currentDocument._id}
                    fileName={currentDocument.fileName}
                    originalName={currentDocument.originalName}
                  />
                </div>
              ) : chatMode === 'folder' ? (
                // FOLDER MODE: No document selected - Show folder placeholder
                <div
                  className="bg-gray-50 flex items-center justify-center p-8"
                  style={{ width: `${documentWidth}%` }}
                >
                  <div className="text-center max-w-md">
                    <Folder className="w-16 h-16 text-primary-600 mx-auto mb-4" />
                    <h3 className="text-xl font-semibold text-gray-900 mb-2">
                      Folder: {currentFolder?.name}
                    </h3>
                    <p className="text-gray-600 mb-6">
                      This folder contains {folderDocuments.length} document{folderDocuments.length !== 1 ? 's' : ''}.
                      Select a document from the dropdown above to view it.
                    </p>
                    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 max-h-96 overflow-y-auto">
                      <p className="text-sm font-semibold text-gray-700 mb-3 text-left">
                        Documents in this folder:
                      </p>
                      <div className="space-y-2">
                        {folderDocuments.map((doc) => (
                          <button
                            key={doc._id}
                            onClick={() => {
                              setCurrentDocument(doc);
                              toast.success(`Viewing: ${doc.originalName}`);
                            }}
                            className="w-full flex items-center space-x-3 p-3 hover:bg-gray-50 rounded-lg transition-colors text-left border border-gray-200"
                          >
                            <FileText className="w-5 h-5 text-gray-600 flex-shrink-0" />
                            <div className="min-w-0 flex-1">
                              <p className="font-medium text-gray-900 truncate">{doc.originalName}</p>
                              <p className="text-xs text-gray-500">{doc.pageCount} pages</p>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div
                  className="bg-gray-50"
                  style={{ width: `${documentWidth}%` }}
                />
              )}

              {/* Resizable divider */}
              <div
                className="w-1 bg-gray-300 hover:bg-primary-500 cursor-col-resize transition-colors flex-shrink-0"
                onMouseDown={() => setIsResizingDocument(true)}
              />

              <div
                className="flex flex-col bg-white"
                style={{ width: `${100 - documentWidth}%` }}
              >
                {/* Chat Header - Small info bar */}
                {chatMode === 'folder' && (
                  <div className="flex items-center px-3 py-2 text-gray-600 justify-between text-sm border-b border-gray-200 bg-gray-50">
                    <div className="flex items-center gap-2">
                      <Info className="size-3.5 shrink-0" />
                      <span className="text-sm">You are chatting with the folder</span>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setDocumentDropdownOpen(!documentDropdownOpen);
                      }}
                      className="relative inline-flex items-center gap-1.5 px-2.5 py-1 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
                    >
                      <span className="truncate max-w-[150px]">
                        {currentDocument ? currentDocument.originalName : 'Chat with file'}
                      </span>
                      <ChevronDown className="size-4 shrink-0" />

                      {/* Document Dropdown Menu */}
                      {documentDropdownOpen && (
                        <>
                          <div
                            className="fixed inset-0 z-10"
                            onClick={() => setDocumentDropdownOpen(false)}
                          />
                          <div className="absolute top-full right-0 mt-2 w-64 bg-white rounded-lg shadow-lg border border-gray-200 py-2 z-20 max-h-96 overflow-y-auto">
                            <div className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase">
                              Documents in folder
                            </div>
                            {folderDocuments.map((doc) => (
                              <button
                                key={doc._id}
                                onClick={() => {
                                  setCurrentDocument(doc);
                                  setDocumentDropdownOpen(false);
                                  toast.success(`Viewing: ${doc.originalName}`);
                                }}
                                className={`w-full flex items-center space-x-2 px-4 py-2 hover:bg-gray-50 text-left text-sm ${
                                  currentDocument?._id === doc._id ? 'bg-primary-50 text-primary-700' : 'text-gray-700'
                                }`}
                              >
                                <FileText className="w-4 h-4 flex-shrink-0" />
                                <div className="min-w-0 flex-1">
                                  <p className="truncate font-medium">{doc.originalName}</p>
                                  <p className="text-xs text-gray-500">{doc.pageCount} pages</p>
                                </div>
                                {currentDocument?._id === doc._id && (
                                  <div className="w-2 h-2 bg-primary-600 rounded-full flex-shrink-0" />
                                )}
                              </button>
                            ))}
                          </div>
                        </>
                      )}
                    </button>
                  </div>
                )}

                {/* Messages Area - Scrollable */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                  {messages.length === 0 ? (
                    <div className="flex items-center justify-center h-full text-center px-4">
                      <div>
                        <MessageSquare className="w-12 h-12 text-primary-600 mx-auto mb-4" />
                        <h3 className="text-lg font-semibold text-gray-900 mb-2">
                          Start a Conversation
                        </h3>
                        <p className="text-gray-600 mb-4">
                          Ask me anything about this document. I'll provide
                          accurate answers with page references.
                        </p>
                        <div className="text-left inline-block">
                          <p className="text-sm text-gray-600 font-medium mb-2">
                            Try asking:
                          </p>
                          <ul className="text-sm text-gray-600 space-y-1">
                            <li>• "What is this document about?"</li>
                            <li>• "Summarize the main points"</li>
                            <li>• "Find information about..."</li>
                          </ul>
                        </div>
                      </div>
                    </div>
                  ) : (
                    messages.map((message) => (
                      <Message
                        key={message._id}
                        message={message}
                        onPageClick={handlePageClick}
                      />
                    ))
                  )}
                  {loading && <TypingIndicator />}
                  <div ref={messagesEndRef} />
                </div>
                {/* Input Area - Fixed */}
                <div className="border-t border-gray-200 p-4 bg-white">
                  <form
                    onSubmit={handleSendMessage}
                    className="flex items-end space-x-2"
                  >
                    <textarea
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          handleSendMessage(e);
                        }
                      }}
                      placeholder="Ask a question about this document..."
                      rows={1}
                      className="flex-1 resize-none input-field max-h-32"
                      style={{ minHeight: '42px' }}
                    />
                    <button
                      type="submit"
                      disabled={!input.trim() || loading}
                      className="btn-primary p-3"
                    >
                      <Send className="w-5 h-5" />
                    </button>
                  </form>
                  <p className="text-xs text-gray-500 mt-2 text-center">
                    Press Enter to send, Shift+Enter for new line
                  </p>
                </div>
              </div>
            </>
          )}
        </div>

        {/* All Chats Modal */}
        {allChatsModalOpen && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] flex flex-col">
              <div className="flex items-center justify-between p-4 border-b border-gray-200">
                <h2 className="text-lg font-semibold text-gray-900">All chats</h2>
                <button
                  onClick={() => setAllChatsModalOpen(false)}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5 text-gray-600" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-4">
                {/* Today */}
                {categorizedDocs.today.length > 0 && (
                  <>
                    <p className="text-sm font-semibold text-gray-700 mb-2">Today</p>
                    <div className="space-y-1 mb-4">
                      {categorizedDocs.today.map((doc) => (
                        <ChatItem key={doc._id} doc={doc} />
                      ))}
                    </div>
                  </>
                )}

                {/* Yesterday */}
                {categorizedDocs.yesterday.length > 0 && (
                  <>
                    <p className="text-sm font-semibold text-gray-700 mb-2">Yesterday</p>
                    <div className="space-y-1 mb-4">
                      {categorizedDocs.yesterday.map((doc) => (
                        <ChatItem key={doc._id} doc={doc} />
                      ))}
                    </div>
                  </>
                )}

                {/* Older */}
                {categorizedDocs.older.length > 0 && (
                  <>
                    <p className="text-sm font-semibold text-gray-700 mb-2">Older</p>
                    <div className="space-y-1">
                      {categorizedDocs.older.map((doc) => (
                        <ChatItem key={doc._id} doc={doc} />
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Rename Modal */}
        {renameModalOpen && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Rename chat</h2>
              <input
                type="text"
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleRenameSubmit();
                  if (e.key === 'Escape') {
                    setRenameModalOpen(false);
                    setRenameValue('');
                  }
                }}
                className="input-field w-full mb-4"
                placeholder="Enter new chat name"
                autoFocus
              />
              <div className="flex items-center justify-end space-x-2">
                <button
                  onClick={() => {
                    setRenameModalOpen(false);
                    setRenameValue('');
                  }}
                  className="btn-secondary"
                >
                  Cancel
                </button>
                <button onClick={handleRenameSubmit} className="btn-primary">
                  Rename
                </button>
              </div>
            </div>
          </div>
        )}

        {/* New Folder Modal */}
        {folderModalOpen && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Create new folder</h2>
              <input
                type="text"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreateFolder();
                  if (e.key === 'Escape') {
                    setFolderModalOpen(false);
                    setNewFolderName('');
                  }
                }}
                className="input-field w-full mb-4"
                placeholder="Enter folder name"
                autoFocus
              />
              <div className="flex items-center justify-end space-x-2">
                <button
                  onClick={() => {
                    setFolderModalOpen(false);
                    setNewFolderName('');
                  }}
                  className="btn-secondary"
                >
                  Cancel
                </button>
                <button onClick={handleCreateFolder} className="btn-primary">
                  Create
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Move to Folder Modal */}
        {moveToFolderModalOpen && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Move to folder</h2>
              {folders.length === 0 ? (
                <p className="text-gray-500 text-sm mb-4">No folders available. Create a folder first.</p>
              ) : (
                <div className="space-y-2 mb-4 max-h-64 overflow-y-auto">
                  {folders.map((folder) => (
                    <button
                      key={folder.id}
                      onClick={() => handleMoveToFolderSubmit(folder.id)}
                      className="w-full flex items-center space-x-3 px-4 py-3 text-left rounded-lg border border-gray-200 hover:border-primary-400 hover:bg-primary-50 transition-colors"
                    >
                      <Folder className="w-5 h-5 text-gray-400" />
                      <div className="flex-1">
                        <div className="font-medium text-gray-900">{folder.name}</div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
              <div className="flex items-center justify-end space-x-2">
                <button
                  onClick={() => {
                    setMoveToFolderModal(false);
                    setMovingDocId(null);
                  }}
                  className="btn-secondary"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Upload Modal */}
        {uploadModalOpen && (
          <UploadModal
            onClose={() => setUploadModalOpen(false)}
            onSuccess={handleUploadSuccess}
          />
        )}
      </div>
    </div>
  );
}
