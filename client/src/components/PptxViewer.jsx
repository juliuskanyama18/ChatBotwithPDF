import { useState, useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import { FileText, Download, Loader, AlertCircle, Search, X, ChevronUp, ChevronDown } from 'lucide-react';
import { documentsAPI } from '../services/api';

const PptxViewer = forwardRef(function PptxViewer({ fileName, originalName, documentId }, ref) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [slideInfo, setSlideInfo] = useState(null);
  const contentRef = useRef(null);
  const searchDebounceRef = useRef(null);
  const [searchPanelOpen, setSearchPanelOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [currentSearchIndex, setCurrentSearchIndex] = useState(0);
  const [highlightedPages, setHighlightedPages] = useState([]);
  const highlightTimeoutRef = useRef(null);

  // Expose scrollToPage and highlightPages functions to parent
  useImperativeHandle(ref, () => ({
    scrollToPage: (slideNumber) => {
      if (contentRef.current && slideInfo?.extractedText) {
        // Search for slide markers in the text (e.g., "--- Slide 5 ---")
        const slideMarkerPattern = new RegExp(`---\\s*Slide\\s+${slideNumber}\\s*---`, 'i');
        const textContent = contentRef.current.textContent || '';

        if (slideMarkerPattern.test(textContent)) {
          // Find the position in the text
          const markerIndex = textContent.search(slideMarkerPattern);

          if (markerIndex !== -1) {
            // Calculate approximate scroll position
            const totalLength = textContent.length;
            const scrollPercentage = markerIndex / totalLength;
            const scrollTop = contentRef.current.scrollHeight * scrollPercentage;

            // Scroll to that position
            contentRef.current.parentElement.scrollTo({
              top: scrollTop,
              behavior: 'smooth'
            });
          }
        } else {
          // If no slide marker found, scroll to top
          contentRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }
    },
    highlightPages: (slides) => {
      // Set the slides to highlight
      setHighlightedPages(slides);

      // Clear previous timeout
      if (highlightTimeoutRef.current) {
        clearTimeout(highlightTimeoutRef.current);
      }

      // Auto-clear highlights after 10 seconds
      highlightTimeoutRef.current = setTimeout(() => {
        setHighlightedPages([]);
      }, 10000);
    }
    ,
    highlightChunks: (chunks) => {
      if (!chunks || !contentRef.current || !slideInfo?.extractedText) return;

      const results = [];

      for (const chunk of chunks) {
        const slideIndex = Number(chunk.pageNumber) || 1;
        const slideEl = contentRef.current.querySelector(`[data-slide='${slideIndex}']`);
        // If slide markers not present, we'll operate on slide text blocks below
        const raw = (chunk.chunkText || '').replace(/\s+/g, ' ').trim();
        if (!raw) continue;

        const normalizedChunk = raw.toLowerCase();

        // Identify blocks within the slide (fall back to splitting by double newlines)
        const blockEls = slideEl ? Array.from(slideEl.querySelectorAll('.slide-text-block')) : [];

        if (blockEls.length === 0) {
          // Fallback: split the whole slideInfo text into pseudo-blocks by markers
          const slidePattern = new RegExp(`---\\s*Slide\\s+${slideIndex}\\s*---[\\s\\S]*?(?=--- Slide \\d+ ---|$)`, 'i');
          const match = (slideInfo.extractedText || '').match(slidePattern);
          if (match) {
            const section = match[0];
            // create a temporary element to parse into blocks
            const wrapper = document.createElement('div');
            wrapper.innerHTML = section.replace(/\n{2,}/g, '\n\n');
            const paras = section.split(/\n\n+/).map(p => p.trim()).filter(Boolean);
            // create pseudo elements for matching
            for (const p of paras) {
              const el = document.createElement('div');
              el.className = 'slide-text-block';
              el.textContent = p;
              blockEls.push(el);
            }
          }
        }

        const blocks = blockEls.map(tb => ({ el: tb, text: (tb.innerText || tb.textContent || '').replace(/\s+/g, ' ').trim() }));
        const hay = blocks.map(b => b.text.toLowerCase()).join(' ');

        let idx = hay.indexOf(normalizedChunk);
        if (idx === -1) {
          const sample = raw.split(/[\.\?\!]/)[0].slice(0, 120).trim().toLowerCase();
          if (sample) idx = hay.indexOf(sample);
        }

        if (idx !== -1) {
          let offset = 0;
          for (const b of blocks) {
            const start = offset;
            const end = offset + b.text.length;
            if (end > idx && start < idx + normalizedChunk.length) {
              results.push({ slideIndex, element: b.el });
            }
            offset = end + 1;
          }
        } else {
          // fallback: mark blocks that include a sample
          blocks.forEach(b => {
            if (b.text.toLowerCase().includes((raw.slice(0, 80) || '').toLowerCase())) results.push({ slideIndex, element: b.el });
          });
        }
      }

      if (results.length > 0) {
        const unique = Array.from(new Set(results.map(r => r.element))).map(el => ({ element: el }));
        unique.forEach(u => u.element.classList.add('pptx-search-highlight'));
        if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current);
        highlightTimeoutRef.current = setTimeout(() => {
          // restore original text
          contentRef.current.innerHTML = slideInfo.extractedText || '';
        }, 10000);
      }
    }
  }));

  useEffect(() => {
    fetchSlideInfo();
  }, [documentId]);

  // Apply highlighting to slides when highlightedPages changes
  useEffect(() => {
    if (!contentRef.current || !slideInfo?.extractedText) return;

    const textContent = slideInfo.extractedText;

    // If no pages to highlight, show original text
    if (highlightedPages.length === 0) {
      contentRef.current.innerHTML = textContent;
      return;
    }

    // Build highlighted version
    let highlightedText = textContent;

    highlightedPages.forEach(slideNum => {
      // Create regex to match the slide section
      const slidePattern = new RegExp(
        `(--- Slide ${slideNum} ---[\\s\\S]*?)(?=--- Slide \\d+ ---|$)`,
        'gi'
      );

      highlightedText = highlightedText.replace(slidePattern, (match) => {
        return `<span class="pptx-slide-highlight" data-slide="${slideNum}">${match}</span>`;
      });
    });

    contentRef.current.innerHTML = highlightedText;
  }, [highlightedPages, slideInfo]);

  const fetchSlideInfo = async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch document metadata to get slide count and extracted text
      const response = await documentsAPI.getById(documentId);
      const doc = response.data.document;
      setSlideInfo({
        slideCount: doc.pageCount || 1,
        extractedText: doc.extractedText || '',
        fileName: originalName || fileName
      });

      setLoading(false);
    } catch (err) {
      console.error('Error fetching slide info:', err);
      setError('Failed to load presentation information');
      setLoading(false);
    }
  };

  const handleSearchChange = (e) => {
    const value = e.target.value;
    setSearchTerm(value);

    // Clear existing debounce timer
    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current);
    }

    // Clear search if empty
    if (!value.trim()) {
      setSearchResults([]);
      setCurrentSearchIndex(0);
      clearHighlights();
      return;
    }

    // Debounce search by 400ms
    searchDebounceRef.current = setTimeout(() => {
      performSearch(value);
    }, 400);
  };

  const performSearch = (term) => {
    if (!term.trim() || !contentRef.current) return;

    console.log(`🔍 Searching PowerPoint for: "${term}"`);
    clearHighlights();

    // Highlight the search term
    highlightSearchResults(term);

    // Count actual highlight elements created
    const highlights = contentRef.current.querySelectorAll('.pptx-search-highlight');
    const results = Array.from(highlights);

    console.log(`✅ Found ${results.length} match(es) in PowerPoint`);
    setSearchResults(results);
    setCurrentSearchIndex(0);

    if (results.length > 0) {
      scrollToSearchResult(0);
    }
  };

  const highlightSearchResults = (term) => {
    if (!contentRef.current) return;

    // Escape special regex characters to treat search term as literal text
    const escapedTerm = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const searchRegex = new RegExp(`(${escapedTerm})`, 'gi');
    const walker = document.createTreeWalker(
      contentRef.current,
      NodeFilter.SHOW_TEXT,
      null,
      false
    );

    const nodesToReplace = [];
    let node;

    while ((node = walker.nextNode())) {
      if (node.nodeValue && searchRegex.test(node.nodeValue)) {
        nodesToReplace.push(node);
      }
    }

    nodesToReplace.forEach((node) => {
      // Create wrapper with highlighted content
      const wrapper = document.createElement('span');
      wrapper.innerHTML = node.nodeValue.replace(
        searchRegex,
        '<mark class="pptx-search-highlight">$1</mark>'
      );

      // Replace the text node with the wrapper's children (not the wrapper itself)
      // This prevents text duplication in the document
      const parent = node.parentNode;
      const fragment = document.createDocumentFragment();
      while (wrapper.firstChild) {
        fragment.appendChild(wrapper.firstChild);
      }
      parent.replaceChild(fragment, node);
    });
  };

  const clearHighlights = () => {
    if (!contentRef.current) return;

    const highlights = contentRef.current.querySelectorAll('.pptx-search-highlight');
    highlights.forEach((highlight) => {
      const text = document.createTextNode(highlight.textContent);
      highlight.parentNode.replaceChild(text, highlight);
    });
  };

  const scrollToSearchResult = (index) => {
    if (!searchResults || searchResults.length === 0) return;

    // searchResults now contains actual DOM elements
    const highlight = searchResults[index];
    if (highlight && highlight.scrollIntoView) {
      highlight.scrollIntoView({ behavior: 'smooth', block: 'center' });

      // Remove previous active highlight from all
      searchResults.forEach((h) => h.classList.remove('active'));

      // Add active class to current
      highlight.classList.add('active');
    }
  };

  const handleNextSearchResult = () => {
    if (searchResults.length === 0) return;
    const nextIndex = (currentSearchIndex + 1) % searchResults.length;
    setCurrentSearchIndex(nextIndex);
    scrollToSearchResult(nextIndex);
  };

  const handlePrevSearchResult = () => {
    if (searchResults.length === 0) return;
    const prevIndex = (currentSearchIndex - 1 + searchResults.length) % searchResults.length;
    setCurrentSearchIndex(prevIndex);
    scrollToSearchResult(prevIndex);
  };

  const toggleSearchPanel = () => {
    setSearchPanelOpen(!searchPanelOpen);
    if (searchPanelOpen) {
      setSearchTerm('');
      setSearchResults([]);
      setCurrentSearchIndex(0);
      clearHighlights();
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full bg-gray-100">
        <div className="text-center">
          <Loader className="w-12 h-12 text-primary-600 mx-auto mb-4 animate-spin" />
          <p className="text-gray-600">Loading presentation information...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full bg-gray-100">
        <div className="text-center max-w-md p-6">
          <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-gray-900 mb-2">Error</h3>
          <p className="text-gray-600 mb-4">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full relative bg-gradient-to-br from-orange-50 to-red-50 overflow-auto">
      {/* Search Highlight Styles */}
      <style>{`
        .pptx-search-highlight {
          background-color: rgba(255, 235, 59, 0.5);
          padding: 2px 0;
          border-radius: 2px;
        }
        .pptx-search-highlight.active {
          background-color: rgba(255, 152, 0, 0.7);
          box-shadow: 0 0 0 2px rgba(255, 152, 0, 0.5);
        }
        .pptx-slide-highlight {
          display: block;
          background-color: rgba(255, 235, 59, 0.15);
          border-left: 4px solid rgba(255, 193, 7, 0.8);
          padding: 12px;
          margin: 8px -12px;
          border-radius: 4px;
          box-shadow: 0 0 0 2px rgba(255, 193, 7, 0.3);
          animation: pulse-slide 2s ease-in-out infinite;
        }
        @keyframes pulse-slide {
          0%, 100% {
            background-color: rgba(255, 235, 59, 0.15);
          }
          50% {
            background-color: rgba(255, 235, 59, 0.25);
          }
        }
      `}</style>

      {/* Search Panel */}
      {searchPanelOpen && (
        <div className="absolute top-4 right-4 z-20 bg-white rounded-lg shadow-[0_4px_12px_rgba(0,0,0,0.20)] border border-gray-300 p-3">
          <div className="flex items-center gap-2">
            <Search className="w-4 h-4 text-gray-500" />
            <input
              type="text"
              value={searchTerm}
              onChange={handleSearchChange}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && searchResults.length > 0) {
                  e.preventDefault();
                  handleNextSearchResult();
                }
              }}
              placeholder="Search in presentation..."
              className="w-64 px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-orange-500"
              autoFocus
            />

            {/* Result Counter or Helper Text */}
            {searchTerm.trim().length > 0 && searchResults.length === 0 ? (
              <div className="flex items-center gap-1 text-xs text-gray-500 px-2 border-l border-gray-300">
                <span>No results found</span>
              </div>
            ) : searchResults.length > 0 ? (
              <div className="flex items-center gap-1 text-sm text-gray-700 px-2 border-l border-gray-300 font-medium">
                <span>{currentSearchIndex + 1}</span>
                <span>/</span>
                <span>{searchResults.length}</span>
              </div>
            ) : null}

            <button
              onClick={handlePrevSearchResult}
              disabled={searchResults.length === 0}
              className="size-6 rounded inline-flex items-center justify-center hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              title="Previous result"
            >
              <ChevronUp className="w-4 h-4 text-gray-600" />
            </button>
            <button
              onClick={handleNextSearchResult}
              disabled={searchResults.length === 0}
              className="size-6 rounded inline-flex items-center justify-center hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              title="Next result"
            >
              <ChevronDown className="w-4 h-4 text-gray-600" />
            </button>
            <button
              onClick={toggleSearchPanel}
              className="size-6 rounded inline-flex items-center justify-center hover:bg-gray-100 transition-colors ml-1"
              title="Close search"
            >
              <X className="w-4 h-4 text-gray-600" />
            </button>
          </div>
        </div>
      )}

      {/* Floating Search Button (when panel is closed) */}
      {!searchPanelOpen && (
        <div className="absolute top-4 right-4 z-10">
          <button
            onClick={toggleSearchPanel}
            className="size-10 rounded-full inline-flex items-center justify-center bg-white hover:bg-gray-50 shadow-[0_4px_12px_rgba(0,0,0,0.20)] border border-gray-300 transition-colors"
            title="Search in document"
          >
            <Search className="w-5 h-5 text-gray-700" />
          </button>
        </div>
      )}

      <div className="max-w-4xl mx-auto p-8">
        {/* Header Card */}
        <div className="bg-white rounded-xl shadow-lg p-8 mb-6">
          <div className="flex items-start gap-6">
            <div className="flex-shrink-0">
              <div className="w-20 h-20 bg-gradient-to-br from-orange-500 to-red-600 rounded-2xl flex items-center justify-center shadow-lg">
                <FileText className="w-10 h-10 text-white" />
              </div>
            </div>

            <div className="flex-1">
              <h2 className="text-2xl font-bold text-gray-900 mb-2">
                PowerPoint Presentation
              </h2>
              <p className="text-gray-600 mb-4">{slideInfo.fileName}</p>

              <div className="flex items-center gap-6 text-sm">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-orange-500 rounded-full"></div>
                  <span className="text-gray-700 font-medium">
                    {slideInfo.slideCount} {slideInfo.slideCount === 1 ? 'Slide' : 'Slides'}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                  <span className="text-gray-700">Text Extracted</span>
                </div>
              </div>
            </div>

            <a
              href={`/pdfs/${fileName}`}
              download={originalName || fileName}
              className="flex-shrink-0 inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-orange-600 to-red-600 text-white rounded-lg hover:from-orange-700 hover:to-red-700 transition-all shadow-md hover:shadow-lg"
            >
              <Download className="w-5 h-5" />
              Download
            </a>
          </div>
        </div>

        {/* Extracted Content Card */}
        {slideInfo.extractedText && (
          <div className="bg-white rounded-xl shadow-lg p-8">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Extracted Slide Content
            </h3>
            <div className="prose max-w-none">
              <div className="bg-gray-50 rounded-lg p-6 border border-gray-200">
                <pre ref={contentRef} className="whitespace-pre-wrap font-sans text-sm text-gray-700 leading-relaxed">
                  {slideInfo.extractedText}
                </pre>
              </div>
            </div>
          </div>
        )}

        {/* Info Message */}
        <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex gap-3">
            <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-blue-800">
              <p className="font-medium mb-1">Presentation Preview</p>
              <p className="text-blue-700">
                PowerPoint presentations are displayed with extracted text content.
                Download the file to view it with full formatting and animations in PowerPoint.
                Click slide numbers in the chat to jump to that slide's content.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});

export default PptxViewer;
