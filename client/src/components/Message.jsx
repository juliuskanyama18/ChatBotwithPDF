import { motion } from 'framer-motion';
import { User, Sparkles } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

export default function Message({ message }) {
  const isUser = message.role === 'user';

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
    >
      <div className={`flex gap-3 max-w-3xl ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
        {/* Avatar */}
        <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
          isUser ? 'bg-primary-600' : 'bg-gray-200'
        }`}>
          {isUser ? (
            <User className="w-5 h-5 text-white" />
          ) : (
            <Sparkles className="w-5 h-5 text-primary-600" />
          )}
        </div>

        {/* Message Content */}
        <div className={`rounded-2xl px-4 py-3 ${
          isUser
            ? 'bg-primary-600 text-white'
            : 'bg-gray-100 text-gray-900'
        }`}>
          <div className="prose prose-sm max-w-none">
            {isUser ? (
              <p className="m-0 whitespace-pre-wrap">{message.content}</p>
            ) : (
              <ReactMarkdown
                components={{
                  p: ({ children }) => <p className="m-0 mb-2 last:mb-0">{children}</p>,
                  ul: ({ children }) => <ul className="m-0 mb-2 last:mb-0 pl-4">{children}</ul>,
                  ol: ({ children }) => <ol className="m-0 mb-2 last:mb-0 pl-4">{children}</ol>,
                  li: ({ children }) => <li className="mb-1">{children}</li>,
                  code: ({ inline, children }) =>
                    inline ? (
                      <code className="bg-gray-200 px-1 py-0.5 rounded text-sm">{children}</code>
                    ) : (
                      <code className="block bg-gray-200 p-2 rounded text-sm overflow-x-auto">
                        {children}
                      </code>
                    ),
                }}
              >
                {message.content}
              </ReactMarkdown>
            )}
          </div>

          {/* Page Reference */}
          {message.pageReference && (
            <div className="mt-2 text-xs opacity-75">
              📄 Page {message.pageReference}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
