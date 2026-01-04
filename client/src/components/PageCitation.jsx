import { ArrowUpRight, FileText } from 'lucide-react';

/**
 * PageCitation Component
 * Renders clickable page number references with optional document name
 *
 * @param {number} pageNumber - The page number to display
 * @param {string} documentName - Optional document name for multi-doc mode
 * @param {Function} onClick - Callback when citation is clicked
 */
export default function PageCitation({ pageNumber, documentName = null, onClick }) {
  const handleClick = () => {
    if (onClick) {
      onClick(pageNumber, documentName);
    }
  };

  const displayText = documentName
    ? `${documentName} - ${pageNumber}`
    : pageNumber.toString();

  const tooltip = documentName
    ? `Go to page ${pageNumber} in ${documentName}`
    : `Go to page ${pageNumber}`;

  return (
    <span
      onClick={handleClick}
      className={`inline-flex items-center rounded-full cursor-pointer bg-gray-200 ps-1 pe-1.5 h-5 text-xs font-medium select-none hover:bg-gray-300 transition-colors ml-0.5 ${
        documentName ? 'text-primary-700' : 'text-gray-600'
      }`}
      title={tooltip}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleClick();
        }
      }}
    >
      {documentName && <FileText className="size-3 mr-0.5" aria-hidden="true" />}
      <ArrowUpRight className="size-3" aria-hidden="true" />
      <span className={documentName ? 'max-w-[200px] truncate' : ''}>
        {displayText}
      </span>
    </span>
  );
}
