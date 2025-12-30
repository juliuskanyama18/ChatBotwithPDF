import { useEffect, useRef, useState, useImperativeHandle, forwardRef } from 'react';
import { renderAsync } from 'docx-preview';
import { Loader, AlertCircle, Minus, Plus, RotateCcw, Search, X, ChevronUp, ChevronDown } from 'lucide-react';

const DocxViewer = forwardRef(function DocxViewer({ fileName }, ref) {
  const containerRef = useRef(null);
  const wrapperRef = useRef(null);
  const searchDebounceRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [scale, setScale] = useState(1.0);
  const [searchPanelOpen, setSearchPanelOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [currentSearchIndex, setCurrentSearchIndex] = useState(0);
  const [pageElements, setPageElements] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageInput, setPageInput] = useState('1');
  const [totalPages, setTotalPages] = useState(0);
  const [highlightedPages, setHighlightedPages] = useState([]);
  const highlightTimeoutRef = useRef(null);
  // Expose scrollToPage, highlightPages and highlightChunks functions to parent
  useImperativeHandle(ref, () => ({
    scrollToPage: (page) => {
      const pageNum = Number(page) || 1;
      const target = pageElements[pageNum - 1];
      if (target && wrapperRef.current) {
        const top = target.offsetTop || 0;
        wrapperRef.current.scrollTo({ top: Math.max(0, top - 40), behavior: 'smooth' });
        setCurrentPage(pageNum);
      }
    },

    highlightPages: (pages) => {
      setHighlightedPages(pages || []);
      if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current);
      highlightTimeoutRef.current = setTimeout(() => setHighlightedPages([]), 10000);
    },

    highlightChunks: (chunks) => {
      if (!chunks || !containerRef.current) return;

      clearHighlights();

      const results = [];

      for (const chunk of chunks) {
        const pageNum = Number(chunk.pageNumber) || 1;
        const pageEl = pageElements[pageNum - 1];
        if (!pageEl) continue;

        const rawChunk = (chunk.chunkText || '').replace(/\s+/g, ' ').trim();
        if (!rawChunk) continue;

        const normalizedChunk = rawChunk.toLowerCase();

        const nodes = [];
        const walker = document.createTreeWalker(pageEl, NodeFilter.SHOW_TEXT, null, false);
        let concat = '';
        while (walker.nextNode()) {
          const node = walker.currentNode;
          const txt = (node.nodeValue || '').replace(/\s+/g, ' ').trim();
          if (!txt) continue;
          const start = concat.length;
          concat += (start === 0 ? '' : ' ') + txt;
          const end = concat.length;
          nodes.push({ node, start, end, raw: txt });
        }

        const hay = concat.toLowerCase();
        let idx = hay.indexOf(normalizedChunk);
        if (idx === -1) {
          const sample = rawChunk.split(/[\.\?\!]/)[0].slice(0, 120).trim().toLowerCase();
          if (sample) idx = hay.indexOf(sample);
        }

        if (idx !== -1) {
          const matchStart = idx;
          const matchEnd = idx + normalizedChunk.length;
          const matchedNodes = nodes.filter(n => n.end > matchStart && n.start < matchEnd).map(n => n.node);
          matchedNodes.forEach(node => results.push({ pageNum, node }));
        } else {
          if (hay.includes(normalizedChunk.slice(0, 80))) {
            nodes.forEach(n => results.push({ pageNum, node: n.node }));
          }
        }
      }

      if (results.length > 0) {
        const wrapped = new Set();
        results.forEach(r => {
          const n = r.node;
          if (wrapped.has(n)) return;
          const span = document.createElement('span');
          span.className = 'search-highlight';
          n.parentNode.replaceChild(span, n);
          span.appendChild(n);
          wrapped.add(n);
        });
      }

      if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current);
      highlightTimeoutRef.current = setTimeout(() => clearHighlights(), 10000);
    }
  }));
 

  useEffect(() => {
    loadAndRenderDocx();
  }, [fileName]);

  const loadAndRenderDocx = async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch the DOCX file as a blob
      const response = await fetch(`/pdfs/${fileName}`);
      if (!response.ok) {
        throw new Error('Failed to load document');
      }

      const blob = await response.blob();

      // Clear the container
      if (containerRef.current) {
        containerRef.current.innerHTML = '';

        // Render the DOCX file
        await renderAsync(blob, containerRef.current, null, {
          className: 'docx-wrapper',
          inWrapper: true,
          ignoreWidth: false,
          ignoreHeight: false,
          ignoreFonts: false,
          breakPages: true,
          ignoreLastRenderedPageBreak: false,
          experimental: false,
          trimXmlDeclaration: true,
          useBase64URL: false,
          renderHeaders: true,
          renderFooters: true,
          renderFootnotes: true,
          renderEndnotes: true
        });

        // After rendering, identify page elements
        identifyPages();
      }

      setLoading(false);
    } catch (err) {
      console.error('Error rendering DOCX:', err);
      setError('Failed to render document. The file may be corrupted or in an unsupported format.');
      setLoading(false);
    }
  };

  const identifyPages = () => {
    if (!containerRef.current) return;

    console.log('🔍 Identifying pages in Word document...');
    const pages = [];

    // Strategy 1: Look for section elements (common in docx-preview)
    const sections = containerRef.current.querySelectorAll('section');
    console.log(`   Found ${sections.length} section elements`);

    if (sections.length > 0) {
      sections.forEach((section, index) => {
        section.setAttribute('data-page-number', index + 1);
        pages.push(section);
      });
      console.log(`✅ Using ${pages.length} section(s) as pages`);
      setPageElements(pages);
      setTotalPages(pages.length);
      return;
    }

    // Strategy 2: Look for explicit page break elements
    const pageBreaks = containerRef.current.querySelectorAll('[style*="break-after"], [style*="page-break-after"], .docx-page-break');
    console.log(`   Found ${pageBreaks.length} page break elements`);

    if (pageBreaks.length > 0) {
      // Create page markers based on page breaks
      let currentPage = [];
      const wrapper = containerRef.current.querySelector('.docx-wrapper') || containerRef.current;
      const allElements = Array.from(wrapper.children);

      allElements.forEach((element) => {
        currentPage.push(element);

        // Check if this element has a page break
        const hasBreak = element.style.breakAfter === 'page' ||
                        element.style.pageBreakAfter === 'always' ||
                        element.classList.contains('docx-page-break');

        if (hasBreak || element.matches('[style*="break-after"], [style*="page-break-after"]')) {
          // This is the end of a page
          if (currentPage.length > 0) {
            const firstElement = currentPage[0];
            firstElement.setAttribute('data-page-number', pages.length + 1);
            pages.push(firstElement);
          }
          currentPage = [];
        }
      });

      // Add remaining elements as the last page
      if (currentPage.length > 0) {
        const firstElement = currentPage[0];
        firstElement.setAttribute('data-page-number', pages.length + 1);
        pages.push(firstElement);
      }

      if (pages.length > 0) {
        console.log(`✅ Using ${pages.length} page(s) based on page breaks`);
        setPageElements(pages);
        setTotalPages(pages.length);
        return;
      }
    }

    // Strategy 3: Look for wrapper children (fallback)
    const wrapper = containerRef.current.querySelector('.docx-wrapper');
    if (wrapper) {
      const children = Array.from(wrapper.children);
      console.log(`   Found ${children.length} wrapper children`);

      if (children.length > 0) {
        // Each top-level child might be a page or section
        children.forEach((child, index) => {
          child.setAttribute('data-page-number', index + 1);
          pages.push(child);
        });
        console.log(`✅ Using ${pages.length} wrapper child(ren) as pages`);
        setPageElements(pages);
        setTotalPages(pages.length);
        return;
      }
    }

    // Strategy 4: Treat entire document as single page (last resort)
    console.warn('⚠️  Could not identify multiple pages, treating as single page');
    const singlePage = containerRef.current.querySelector('.docx-wrapper') || containerRef.current.firstElementChild || containerRef.current;
    singlePage.setAttribute('data-page-number', '1');
    pages.push(singlePage);

    setPageElements(pages);
    setTotalPages(pages.length);
    console.log(`📄 Final: ${pages.length} page(s) identified`);
  };

  // Apply highlighting to pages when highlightedPages changes
  useEffect(() => {
    if (!containerRef.current) return;

    // Remove all existing highlights
    const allPages = containerRef.current.querySelectorAll('[data-page-number]');
    allPages.forEach(page => {
      page.style.boxShadow = '';
      page.style.outline = '';
      page.style.backgroundColor = '';
    });

    // Apply highlights to specified pages
    if (highlightedPages.length > 0) {
      highlightedPages.forEach(pageNum => {
        const page = containerRef.current.querySelector(`[data-page-number="${pageNum}"]`);
        if (page) {
          page.style.boxShadow = '0 0 0 4px rgba(255, 193, 7, 0.8), 0 4px 12px rgba(255, 193, 7, 0.4)';
          page.style.outline = '3px solid rgba(255, 193, 7, 0.6)';
          page.style.backgroundColor = 'rgba(255, 235, 59, 0.08)';
          page.style.transition = 'all 0.3s ease';
        }
      });
    }
  }, [highlightedPages]);

  const handlePageInputChange = (e) => {
    setPageInput(e.target.value);
  };

  const handlePageInputKeyPress = (e) => {
    if (e.key === 'Enter') {
      const pageNum = parseInt(pageInput, 10);
      if (pageNum >= 1 && pageNum <= totalPages) {
        // Use the scrollToPage function
        if (ref && ref.current && ref.current.scrollToPage) {
          ref.current.scrollToPage(pageNum);
        } else {
          // Fallback: directly scroll
          const targetElement = pageElements[pageNum - 1];
          if (targetElement && wrapperRef.current) {
            const elementTop = targetElement.offsetTop;
            wrapperRef.current.scrollTo({
              top: elementTop - 40,
              behavior: 'smooth'
            });
            setCurrentPage(pageNum);
          }
        }
      } else {
        // Reset to current page if invalid
        setPageInput(currentPage.toString());
      }
    }
  };

  const handleResetZoom = () => {
    setScale(1.0);
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
    if (!term.trim() || !containerRef.current) return;

    console.log(`🔍 Searching Word document for: "${term}"`);
    clearHighlights();

    // Highlight the search term
    highlightSearchResults(term);

    // Count actual highlight elements created
    const highlights = containerRef.current.querySelectorAll('.docx-search-highlight');
    const results = Array.from(highlights);

    console.log(`✅ Found ${results.length} match(es) in Word document`);
    setSearchResults(results);
    setCurrentSearchIndex(0);

    if (results.length > 0) {
      scrollToSearchResult(0);
    }
  };

  const highlightSearchResults = (term) => {
    if (!containerRef.current) return;

    // Escape special regex characters to treat search term as literal text
    const escapedTerm = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const searchRegex = new RegExp(`(${escapedTerm})`, 'gi');
    const walker = document.createTreeWalker(
      containerRef.current,
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
        '<mark class="docx-search-highlight">$1</mark>'
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
    if (!containerRef.current) return;

    const highlights = containerRef.current.querySelectorAll('.docx-search-highlight');
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
          <p className="text-gray-600">Loading Word document...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full bg-gray-100">
        <div className="text-center max-w-md">
          <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-gray-900 mb-2">Error Loading Document</h3>
          <p className="text-gray-600">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full relative bg-gray-100">
      {/* Custom styles for search highlighting */}
      <style>{`
        .docx-search-highlight {
          background-color: rgba(255, 235, 59, 0.5);
          padding: 2px 0;
          border-radius: 2px;
        }
        .docx-search-highlight.active {
          background-color: rgba(255, 152, 0, 0.7);
          box-shadow: 0 0 0 2px rgba(255, 152, 0, 0.5);
        }
        .docx-viewer-container {
          max-width: 100%;
        }
      `}</style>

      {/* Search Panel (appears at top when opened) */}
      {searchPanelOpen && (
        <div className="absolute top-0 left-0 right-0 bg-white border-b border-gray-300 px-4 py-3 z-20 shadow-md">
          <div className="flex items-center space-x-2">
            <div className="flex-1 relative">
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
                placeholder="Search in document..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                autoFocus
              />
            </div>

            {/* Result Counter or Helper Text */}
            {searchTerm.trim().length > 0 && searchResults.length === 0 ? (
              <div className="flex items-center space-x-2">
                <span className="text-xs text-gray-500">No results found</span>
              </div>
            ) : searchResults.length > 0 ? (
              <div className="flex items-center space-x-2">
                <span className="text-sm text-gray-700 font-medium">
                  {currentSearchIndex + 1} of {searchResults.length}
                </span>

                <button
                  onClick={handlePrevSearchResult}
                  className="p-1.5 hover:bg-gray-200 rounded transition-colors"
                  title="Previous Result"
                >
                  <ChevronUp className="w-4 h-4 text-gray-700" />
                </button>

                <button
                  onClick={handleNextSearchResult}
                  className="p-1.5 hover:bg-gray-200 rounded transition-colors"
                  title="Next Result"
                >
                  <ChevronDown className="w-4 h-4 text-gray-700" />
                </button>
              </div>
            ) : null}

            <button
              onClick={toggleSearchPanel}
              className="p-1.5 hover:bg-gray-200 rounded transition-colors"
              title="Close Search"
            >
              <X className="w-4 h-4 text-gray-700" />
            </button>
          </div>
        </div>
      )}

      {/* Document Container */}
      <div
        ref={wrapperRef}
        className="h-full overflow-auto bg-gray-100"
        style={{ position: 'relative' }}
      >
        <div
          ref={containerRef}
          className="docx-viewer-container"
          style={{
            padding: '40px 20px',
            minHeight: '100%',
            transform: `scale(${scale})`,
            transformOrigin: 'top center',
            transition: 'transform 0.2s ease-in-out'
          }}
        />
      </div>

      {/* Floating Toolbar */}
      {totalPages > 0 && (
        <div className="absolute bottom-4 left-0 right-0 flex justify-center z-10 pointer-events-none">
          <div className="flex items-center p-1 rounded-lg shadow-[0_4px_12px_rgba(0,0,0,0.20)] border border-gray-300 bg-[rgba(249,249,251,0.90)] backdrop-blur-[6px] max-w-[calc(100%-8px)] pointer-events-auto text-gray-600 text-sm">
            {/* Zoom Out */}
            <button
              onClick={() => setScale(Math.max(0.5, scale - 0.1))}
              disabled={scale <= 0.5}
              className="size-8 rounded-md inline-flex items-center justify-center hover:bg-gray-200/50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              title="Zoom out"
            >
              <Minus className="w-4 h-4 text-gray-600" />
            </button>

            {/* Reset Zoom */}
            <button
              onClick={handleResetZoom}
              className="size-8 rounded-md inline-flex items-center justify-center hover:bg-gray-200/50 transition-colors"
              title="Reset zoom"
            >
              <RotateCcw className="w-4 h-4 text-gray-600" />
            </button>

            {/* Zoom In */}
            <button
              onClick={() => setScale(Math.min(2.5, scale + 0.1))}
              disabled={scale >= 2.5}
              className="size-8 rounded-md inline-flex items-center justify-center hover:bg-gray-200/50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              title="Zoom in"
            >
              <Plus className="w-4 h-4 text-gray-600" />
            </button>

            {/* Divider */}
            <div className="w-px h-4 bg-gray-300 mx-1"></div>

            {/* Page Navigation */}
            <div className="mx-2 flex items-center text-gray-500 gap-1">
              <input
                type="text"
                value={pageInput}
                onChange={handlePageInputChange}
                onKeyDown={handlePageInputKeyPress}
                className="w-12 px-2 py-1 text-center text-sm border border-gray-300 rounded bg-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                aria-label="Enter a page number"
              />
              <span>of</span>
              <span className="font-medium">{totalPages}</span>
            </div>

            {/* Divider */}
            <div className="w-px h-4 bg-gray-300 mx-1"></div>

            {/* Search */}
            <button
              onClick={toggleSearchPanel}
              className="size-8 rounded-md inline-flex items-center justify-center hover:bg-gray-200/50 transition-colors"
              title="Search"
            >
              <Search className="w-4 h-4 text-gray-600" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
});

export default DocxViewer;
