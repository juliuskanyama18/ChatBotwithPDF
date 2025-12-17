import { motion } from 'framer-motion';
import { User, Sparkles } from 'lucide-react';
import PageCitation from './PageCitation';

export default function Message({ message, onPageClick }) {
  const isUser = message.role === 'user';

  // Parse message content to extract and render page citations
  const renderContentWithCitations = (content) => {
    // Combined pattern to match:
    // 1. [Page 5] or [Slide 10] - citation format
    // 2. page 31, on page 5, Page 10 shows - natural mentions
    const combinedPattern = /(\[(Page|Slide)\s+(\d+(?:\s*,\s*\d+)*)\])|(?:(?:on|at|in|from)?\s*(?:page|slide|Page|Slide)\s+(\d+))/gi;

    const parts = [];
    let lastIndex = 0;
    let match;
    let key = 0;

    while ((match = combinedPattern.exec(content)) !== null) {
      // Add text before match
      if (match.index > lastIndex) {
        const textContent = content.substring(lastIndex, match.index);
        parts.push(
          <span key={`text-${key++}`}>
            {textContent}
          </span>
        );
      }

      // Check if it's citation format [Page X] or natural mention
      if (match[1]) {
        // Citation format: [Page 5] or [Page 5, 6, 7]
        const pageNumbers = match[3].split(/\s*,\s*/).map(num => parseInt(num.trim()));
        pageNumbers.forEach((pageNum, idx) => {
          parts.push(
            <PageCitation
              key={`citation-${key++}`}
              pageNumber={pageNum}
              onClick={onPageClick}
            />
          );
          if (idx < pageNumbers.length - 1) {
            parts.push(<span key={`comma-${key++}`}>, </span>);
          }
        });
      } else if (match[4]) {
        // Natural mention: "page 31" or "on page 5"
        const pageNum = parseInt(match[4]);
        const fullMatch = match[0];
        const prefix = fullMatch.substring(0, fullMatch.lastIndexOf(match[4]));

        // Add the prefix text (e.g., "on page " or "page ")
        if (prefix) {
          parts.push(
            <span key={`prefix-${key++}`}>
              {prefix}
            </span>
          );
        }

        // Add clickable page number
        parts.push(
          <PageCitation
            key={`citation-${key++}`}
            pageNumber={pageNum}
            onClick={onPageClick}
          />
        );
      }

      lastIndex = match.index + match[0].length;
    }

    // Add remaining text
    if (lastIndex < content.length) {
      parts.push(
        <span key={`text-${key++}`}>
          {content.substring(lastIndex)}
        </span>
      );
    }

    return parts.length > 0 ? parts : content;
  };

  // Split content by paragraphs and render each with citations
  const renderParagraphsWithCitations = (content) => {
    const paragraphs = content.split('\n\n').filter(p => p.trim());

    return paragraphs.map((paragraph, idx) => (
      <p key={idx} className="m-0 mb-2 last:mb-0 whitespace-pre-wrap">
        {renderContentWithCitations(paragraph)}
      </p>
    ));
  };

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
              <div>
                {renderParagraphsWithCitations(message.content)}
              </div>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
