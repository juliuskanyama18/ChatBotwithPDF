import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Send, Sparkles } from 'lucide-react';
import { documentsAPI, chatAPI } from '../services/api';
import { useAuth } from '../hooks/useAuth';
import toast from 'react-hot-toast';
import UniversalDocumentViewer from '../components/UniversalDocumentViewer';
import Message from '../components/Message';
import TypingIndicator from '../components/TypingIndicator';

export default function ChatInterface() {
  const { documentId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [document, setDocument] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [conversationId, setConversationId] = useState(null);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    loadDocument();
    loadConversation();
  }, [documentId]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const loadDocument = async () => {
    try {
      const response = await documentsAPI.getById(documentId);
      setDocument(response.data.document);
    } catch (error) {
      console.error('Error loading document:', error);
      toast.error('Failed to load document');
      navigate('/workspace');
    }
  };

  const loadConversation = async () => {
    try {
      const response = await documentsAPI.getLatestConversation(documentId);
      if (response.data.messages && response.data.messages.length > 0) {
        setMessages(response.data.messages);
        setConversationId(response.data.conversation._id);
      }
    } catch (error) {
      console.error('Error loading conversation:', error);
    }
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const userMessage = {
      role: 'user',
      content: input,
      _id: Date.now().toString(),
    };

    setMessages([...messages, userMessage]);
    setInput('');
    setLoading(true);

    try {
      const response = await chatAPI.sendMessage({
        prompt: input,
        documentId,
        conversationId,
      });

      const aiMessage = {
        role: 'assistant',
        content: response.data.reply,
        _id: (Date.now() + 1).toString(),
        pageReference: response.data.relevantPages?.[0],
      };

      setMessages(prev => [...prev, aiMessage]);

      if (!conversationId) {
        setConversationId(response.data.conversationId);
      }
    } catch (error) {
      console.error('Error sending message:', error);
      toast.error('Failed to send message');
      setMessages(prev => prev.slice(0, -1));
    } finally {
      setLoading(false);
    }
  };

  if (!document) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <button
            onClick={() => navigate('/workspace')}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="font-semibold text-gray-900">{document.originalName}</h1>
            <p className="text-sm text-gray-600">{document.pageCount} pages</p>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <Sparkles className="w-5 h-5 text-primary-600" />
          <span className="text-sm text-gray-600">AI Assistant</span>
        </div>
      </header>

      {/* Main Content - Split View */}
      <div className="flex-1 flex overflow-hidden">
        {/* Document Viewer - Left Side - Always visible */}
        <div className="w-full lg:w-1/2 bg-gray-900 overflow-auto">
          <UniversalDocumentViewer
            documentId={documentId}
            fileName={document.fileName}
            originalName={document.originalName}
          />
        </div>

        {/* Chat - Right Side */}
        <div className="w-full lg:w-1/2 flex flex-col bg-white hidden lg:flex">
          {/* Messages Area */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.length === 0 ? (
              <div className="flex items-center justify-center h-full text-center px-4">
                <div>
                  <Sparkles className="w-12 h-12 text-primary-600 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">
                    Start a Conversation
                  </h3>
                  <p className="text-gray-600">
                    Ask me anything about this document. I'll provide accurate answers
                    with page references.
                  </p>
                </div>
              </div>
            ) : (
              messages.map((message) => (
                <Message key={message._id} message={message} />
              ))
            )}

            {loading && <TypingIndicator />}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <div className="border-t border-gray-200 p-4 bg-white">
            <form onSubmit={handleSendMessage} className="flex items-end space-x-2">
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
      </div>
    </div>
  );
}
