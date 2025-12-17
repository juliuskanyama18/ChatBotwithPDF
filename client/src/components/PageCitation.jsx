import { ArrowUpRight } from 'lucide-react';

/**
 * PageCitation Component
 * Renders clickable page number references like ChatPDF
 *
 * @param {number} pageNumber - The page number to display
 * @param {Function} onClick - Callback when citation is clicked
 */
export default function PageCitation({ pageNumber, onClick }) {
  const handleClick = () => {
    if (onClick) {
      onClick(pageNumber);
    }
  };

  return (
    <span
      onClick={handleClick}
      className="inline-flex items-center rounded-full cursor-pointer text-gray-600 bg-gray-200 ps-1 pe-1.5 h-4 text-xs font-medium select-none hover:bg-gray-300 transition-colors ml-0.5"
      title={`Go to page ${pageNumber}`}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleClick();
        }
      }}
    >
      <ArrowUpRight className="size-3" aria-hidden="true" />
      {pageNumber}
    </span>
  );
}
