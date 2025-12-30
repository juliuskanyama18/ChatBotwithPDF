import { useState, useMemo, useImperativeHandle, forwardRef, useRef, useEffect } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { AlertCircle, Minus, Plus, RotateCcw, Search, ChevronUp, ChevronDown, X } from 'lucide-react';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

// Configure PDF.js worker - Use local worker from public folder
pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.js';

const PDFViewer = forwardRef(function PDFViewer({ fileName }, ref) {
  const [numPages, setNumPages] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageInput, setPageInput] = useState('1');
  const [scale, setScale] = useState(1.0);
  const [loadError, setLoadError] = useState(null);
  const [pageWidth, setPageWidth] = useState(null);
  const [searchPanelOpen, setSearchPanelOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [currentSearchIndex, setCurrentSearchIndex] = useState(0);
  const [highlightedPages, setHighlightedPages] = useState([]);

  // Toggle search panel open / close
  const toggleSearchPanel = () => {
    setSearchPanelOpen(prev => !prev);
  };

  const pageRefs = useRef({});
  const containerRef = useRef(null);
  const resizeTimeoutRef = useRef(null);
  const searchDebounceRef = useRef(null);
  const highlightTimeoutRef = useRef(null);



  // Update page input when current page changes
  useEffect(() => {
    setPageInput(currentPage.toString());
  }, [currentPage]);

  // Automatic zoom adjustment on container resize
  useEffect(() => {
    if (!containerRef.current || !pageWidth) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (let entry of entries) {
        // Debounce the resize to avoid too many updates
        if (resizeTimeoutRef.current) {
          clearTimeout(resizeTimeoutRef.current);
        }

        resizeTimeoutRef.current = setTimeout(() => {
          const containerWidth = entry.contentRect.width;
          // Calculate scale to fit page with some padding (40px total padding)
          const targetWidth = containerWidth - 80;
          const optimalScale = targetWidth / pageWidth;

          // Clamp between 0.5 and 2.5
          const clampedScale = Math.max(0.5, Math.min(2.5, optimalScale));
          setScale(clampedScale);
        }, 100);
      }
    });

    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      if (resizeTimeoutRef.current) {
        clearTimeout(resizeTimeoutRef.current);
      }
    };
  }, [pageWidth]);

  // Expose scrollToPage and highlightPages functions to parent via ref
  useImperativeHandle(ref, () => ({
    scrollToPage: (page) => {
      if (page >= 1 && page <= (numPages || 1)) {
        const pageElement = pageRefs.current[page];
        if (pageElement) {
          pageElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
          setCurrentPage(page);
        }
      }
    },
    highlightPages: (pages) => {
      // Set the pages to highlight
      setHighlightedPages(pages);

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
      highlightChunks(chunks);
    }
  }));

  // Memoize options to prevent unnecessary re-renders
  const pdfOptions = useMemo(() => ({
    cMapUrl: 'https://unpkg.com/pdfjs-dist@4.8.69/cmaps/',
    cMapPacked: true,
  }), []);

  function onDocumentLoadSuccess({ numPages }) {
    console.log('✅ PDF loaded successfully:', fileName, 'Pages:', numPages);
    setNumPages(numPages);
    setLoadError(null);
  }

  function onDocumentLoadError(error) {
    console.error('❌ PDF load error:', error);
    console.error('PDF URL:', pdfUrl);
    setLoadError(error.message || 'Failed to load PDF');
  }

  // Capture page width when first page loads
  const onPageLoadSuccess = (page) => {
    if (!pageWidth && page.pageNumber === 1) {
      const { width } = page.originalWidth ? { width: page.originalWidth } : page;
      setPageWidth(width || 612); // 612 is standard letter width in points
    }
  };

  const handlePageInputChange = (e) => {
    setPageInput(e.target.value);
  };

  const handlePageInputKeyPress = (e) => {
    if (e.key === 'Enter') {
      const pageNum = parseInt(pageInput, 10);
      if (pageNum >= 1 && pageNum <= numPages) {
        const pageElement = pageRefs.current[pageNum];
        if (pageElement) {
          pageElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
          setCurrentPage(pageNum);
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
    if (!term.trim()) return;

    const searchTerm = term.trim();
    console.log(`🔍 Searching PDF for: "${searchTerm}"`);
    console.log(`📊 Total pages to search: ${numPages}`);

    const searchLower = searchTerm.toLowerCase();

    // Function to check if text layers are ready
    const checkTextLayersReady = () => {
      let readyCount = 0;
      for (let pageNum = 1; pageNum <= numPages; pageNum++) {
        const pageContainer = pageRefs.current[pageNum];
        if (pageContainer) {
          const textLayer = pageContainer.querySelector('.react-pdf__Page__textContent');
          if (textLayer && textLayer.querySelectorAll('span').length > 0) {
            readyCount++;
          }
        }
      }
      console.log(`📝 Text layers ready: ${readyCount}/${numPages} pages`);
      return readyCount;
    };

    // Retry search with increasing delays if text layers aren't ready
    const attemptSearch = (retryCount = 0) => {
      const readyCount = checkTextLayersReady();

      // If we have at least some text layers ready, or we've retried enough times, proceed with search
      if (readyCount > 0 || retryCount >= 3) {
        const results = [];

        // Search through all pages
        for (let pageNum = 1; pageNum <= numPages; pageNum++) {
          const pageContainer = pageRefs.current[pageNum];

          if (pageContainer) {
            const textLayer = pageContainer.querySelector('.react-pdf__Page__textContent');

            if (textLayer) {
              const textSpans = textLayer.querySelectorAll('span');

              if (textSpans.length > 0) {
                let pageMatches = 0;

                // Search within each span individually to avoid duplicates
                textSpans.forEach((span, spanIndex) => {
                  const spanText = span.textContent || '';
                  const spanTextLower = spanText.toLowerCase();

                  // Find all occurrences of search term within this span
                  let startPos = 0;
                  let matchPos = spanTextLower.indexOf(searchLower, startPos);

                  while (matchPos !== -1) {
                    // Each match gets its own result entry with unique position info
                    results.push({
                      pageNum,
                      element: span,
                      text: spanText,
                      index: spanIndex,
                      matchPosition: matchPos // Track position within the span
                    });
                    pageMatches++;

                    // Look for next occurrence in this span
                    startPos = matchPos + 1;
                    matchPos = spanTextLower.indexOf(searchLower, startPos);
                  }
                });

                if (pageMatches > 0) {
                  console.log(`   📄 Page ${pageNum}: ${pageMatches} match(es)`);
                }
              }
            } else {
              // Fallback: search all text content in the page
              const allText = pageContainer.innerText || pageContainer.textContent || '';
              if (allText.toLowerCase().includes(searchLower)) {
                console.log(`   📄 Page ${pageNum}: Found in page text (no text layer)`);
                results.push({ pageNum, element: pageContainer, text: allText, index: 0 });
              }
            }
          }
        }

        console.log(`✅ Total: ${results.length} match(es) found across ${numPages} page(s)`);
        setSearchResults(results);
        setCurrentSearchIndex(results.length > 0 ? 0 : -1);

        if (results.length > 0) {
          highlightSearchResults(results, 0, searchTerm);
        }
      } else if (retryCount < 3) {
        // Text layers not ready, retry after a delay
        console.log(`⏳ Text layers not ready, retrying in ${500 * (retryCount + 1)}ms (attempt ${retryCount + 1}/3)...`);
        setTimeout(() => attemptSearch(retryCount + 1), 500 * (retryCount + 1));
      } else {
        console.log(`⚠️  Search completed with limited results - some text layers may not have loaded`);
      }
    };

    // Start search with initial delay
    setTimeout(() => attemptSearch(0), 300);
  };

  const clearHighlights = () => {
    // Remove all highlight marks
    const highlights = containerRef.current?.querySelectorAll('.pdf-search-highlight-mark');
    highlights?.forEach(mark => {
      const parent = mark.parentNode;
      const textNode = document.createTextNode(mark.textContent);
      parent.replaceChild(textNode, mark);
      // Normalize to merge adjacent text nodes
      parent.normalize();
    });
  };

  const highlightSearchResults = (results, currentIndex, term) => {
    clearHighlights();

    if (results.length === 0) return;

    console.log(`🎯 Highlighting ${results.length} result(s), focusing on result ${currentIndex + 1}`);

    const effectiveTerm = typeof term === 'string' && term.length > 0 ? term : searchTerm;

    // Group results by span to avoid processing the same span multiple times
    const spanMap = new Map();
    results.forEach((result) => {
      if (result.element && result.element.textContent) {
        if (!spanMap.has(result.element)) {
          spanMap.set(result.element, []);
        }
        spanMap.get(result.element).push(result);
      }
    });

    // Highlight each unique span once using TreeWalker approach
    const allHighlightedElements = [];
    spanMap.forEach((_, span) => {
      // Escape special regex characters for exact matching
      const escapedTerm = (effectiveTerm || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`(${escapedTerm})`, 'gi');

      // Use TreeWalker to find text nodes within this span
      const walker = document.createTreeWalker(
        span,
        NodeFilter.SHOW_TEXT,
        null,
        false
      );

      const nodesToReplace = [];
      let node;

      while ((node = walker.nextNode())) {
        if (node.nodeValue && regex.test(node.nodeValue)) {
          nodesToReplace.push(node);
        }
      }

      // Replace text nodes with highlighted fragments
      nodesToReplace.forEach((textNode) => {
        const wrapper = document.createElement('span');
        wrapper.innerHTML = textNode.nodeValue.replace(
          regex,
          '<mark class="pdf-search-highlight-mark">$1</mark>'
        );

        // Replace the text node with wrapper's children using a fragment
        const parent = textNode.parentNode;
        const fragment = document.createDocumentFragment();
        while (wrapper.firstChild) {
          fragment.appendChild(wrapper.firstChild);
        }
        parent.replaceChild(fragment, textNode);
      });

      // Collect marks from this span
      const marks = span.querySelectorAll('.pdf-search-highlight-mark');
      marks.forEach(mark => allHighlightedElements.push(mark));
    });

    // Highlight the current match
    if (allHighlightedElements[currentIndex]) {
      // Remove active class from all
      allHighlightedElements.forEach(el => el.classList.remove('pdf-search-highlight-current'));

      // Add active class to current
      allHighlightedElements[currentIndex].classList.add('pdf-search-highlight-current');

      const result = results[currentIndex];
      console.log(`📍 Scrolling to page ${result.pageNum}, match ${currentIndex + 1}`);

      // Scroll to page first
      const pageElement = pageRefs.current[result.pageNum];
      if (pageElement) {
        pageElement.scrollIntoView({ behavior: 'smooth', block: 'center' });

        // Then scroll to the specific highlight
        setTimeout(() => {
          if (allHighlightedElements[currentIndex]) {
            allHighlightedElements[currentIndex].scrollIntoView({
              behavior: 'smooth',
              block: 'center',
              inline: 'nearest'
            });
            setCurrentPage(result.pageNum);
          }
        }, 200);
      }
    }
  };

  const handleNextSearch = () => {
    if (searchResults.length === 0) return;

    const nextIndex = currentSearchIndex < searchResults.length - 1 ? currentSearchIndex + 1 : 0;
    setCurrentSearchIndex(nextIndex);
    highlightSearchResults(searchResults, nextIndex, searchTerm);
  };

  const handlePreviousSearch = () => {
    if (searchResults.length === 0) return;

    const prevIndex = currentSearchIndex > 0 ? currentSearchIndex - 1 : searchResults.length - 1;
    setCurrentSearchIndex(prevIndex);
    highlightSearchResults(searchResults, prevIndex, searchTerm);
  };

  // Highlight specific chunk texts on specific pages
  const highlightChunks = async (chunks) => {
    if (!chunks || chunks.length === 0) return;

    // Wait for text layers to be ready (reuse existing check)
    const ensureReady = () => {
      let readyCount = 0;
      for (let pageNum = 1; pageNum <= (numPages || 1); pageNum++) {
        const pageContainer = pageRefs.current[pageNum];
        if (pageContainer) {
          const textLayer = pageContainer.querySelector('.react-pdf__Page__textContent');
          if (textLayer && textLayer.querySelectorAll('span').length > 0) {
            readyCount++;
          }
        }
      }
      return readyCount;
    };

    const waitForTextLayers = (retry = 0) => new Promise((resolve) => {
      const ready = ensureReady();
      if (ready > 0 || retry >= 4) return resolve(true);
      setTimeout(() => resolve(waitForTextLayers(retry + 1)), 300 * (retry + 1));
    });

    await waitForTextLayers();

    const results = [];

    // Helper: normalize whitespace and lower-case
    const normalize = (s = '') => s.replace(/\s+/g, ' ').trim().toLowerCase();

    // For each chunk, search only within its page
    chunks.forEach((chunk) => {
      const pageNum = Number(chunk.pageNumber) || 1;
      const pageContainer = pageRefs.current[pageNum];
      if (!pageContainer) return;

      const textLayer = pageContainer.querySelector('.react-pdf__Page__textContent');
      const rawChunk = (chunk.chunkText || '').replace(/\n+/g, ' ').trim();
      if (!rawChunk) return;

      // Build candidate search phrases: prefer a medium-length substring to improve match robustness
      const normalizedChunk = normalize(rawChunk);
      let candidates = [];
      const MAX_LEN = 120;
      if (normalizedChunk.length <= MAX_LEN) {
        candidates.push(normalizedChunk);
      } else {
        // Try sliding windows of sentences or fixed-length substrings
        const sentences = rawChunk.split(/[\.\?\!]\s+/).map(s => normalize(s)).filter(Boolean);
        // Add longer sentence candidates first
        sentences.sort((a,b) => b.length - a.length).forEach(s => {
          if (s.length > 20) candidates.push(s.slice(0, MAX_LEN));
        });
        // Also add fixed substrings from the start
        candidates.push(normalizedChunk.slice(0, MAX_LEN));
      }

      // De-duplicate candidates
      candidates = Array.from(new Set(candidates)).filter(Boolean);

      const tryFindInSpans = (searchLower) => {
        let found = false;
        if (textLayer) {
          const textSpans = textLayer.querySelectorAll('span');
          textSpans.forEach((span, spanIndex) => {
            const spanText = span.textContent || '';
            const spanTextLower = normalize(spanText);
            let startPos = 0;
            let matchPos = spanTextLower.indexOf(searchLower, startPos);
            while (matchPos !== -1) {
              results.push({ pageNum, element: span, text: spanText, index: spanIndex, matchPosition: matchPos });
              found = true;
              startPos = matchPos + 1;
              matchPos = spanTextLower.indexOf(searchLower, startPos);
            }
          });
        }
        return found;
      };

      const tryFindInPage = (searchLower) => {
        const allText = pageContainer.innerText || pageContainer.textContent || '';
        if (normalize(allText).includes(searchLower)) {
          results.push({ pageNum, element: pageContainer, text: allText, index: 0 });
          return true;
        }
        return false;
      };

      // Try each candidate until we find a match
      let matched = false;
      for (const cand of candidates) {
        if (!cand) continue;
        if (tryFindInSpans(cand)) { matched = true; break; }
      }
      if (!matched) {
        if (candidates.length > 0) {
          tryFindInPage(candidates[0]);
        }
      }
    });

    if (results.length > 0) {
      // remove duplicates
      const unique = [];
      const seen = new Set();
      results.forEach(r => {
        const id = `${r.pageNum}-${r.index}-${r.text}`;
        if (!seen.has(id)) { seen.add(id); unique.push(r); }
      });
      highlightSearchResults(unique, 0, chunks[0].chunkText || '');
    }
  };

  return (
    <>
      <div ref={containerRef} className="h-full relative">
      <Document
          file={`/pdfs/${fileName}`}
          onLoadSuccess={onDocumentLoadSuccess}
          onLoadError={onDocumentLoadError}
          options={pdfOptions}
        >
          {numPages && (
            <div
              className="rpv-core__inner-pages rpv-core__inner-pages--vertical"
              style={{
                height: '100%',
                position: 'relative',
                '--scale-factor': scale
              }}
            >
              <div style={{ position: 'relative', height: `${numPages * 650}px`, width: '100%' }}>
                {Array.from({ length: numPages }, (_, index) => index + 1).map((page) => {
                  const yOffset = (page - 1) * 650;
                  const isHighlighted = highlightedPages.includes(page);
                  return (
                    <div
                      key={page}
                      className="rpv-core__inner-page-container"
                      style={{ position: 'relative' }}
                    >
                      <div
                        ref={(el) => (pageRefs.current[page] = el)}
                        className="rpv-core__inner-page"
                        role="region"
                        aria-label={`Page ${page}`}
                        style={{
                          height: '625px',
                          width: '100%',
                          left: '0px',
                          position: 'absolute',
                          top: '0px',
                          transform: `translateY(${yOffset}px)`,
                          backgroundColor: 'var(--color-elevation-2, #f5f5f5)',
                          display: 'flex',
                          justifyContent: 'center',
                          alignItems: 'flex-start',
                          paddingTop: '12px'
                        }}
                      >
                        <div
                          className="rpv-core__page-layer rpv-core__page-layer--single"
                          style={{
                            boxShadow: isHighlighted
                              ? '0 0 0 4px rgba(255, 193, 7, 0.8), 0 4px 12px rgba(255, 193, 7, 0.4)'
                              : '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
                            position: 'relative',
                            transition: 'box-shadow 0.3s ease'
                          }}
                        >
                          {isHighlighted && (
                            <div
                              style={{
                                position: 'absolute',
                                top: 0,
                                left: 0,
                                right: 0,
                                bottom: 0,
                                backgroundColor: 'rgba(255, 235, 59, 0.15)',
                                pointerEvents: 'none',
                                zIndex: 1,
                                animation: 'pulse-highlight 2s ease-in-out infinite'
                              }}
                            />
                          )}
                          <Page
                            pageNumber={page}
                            scale={scale}
                            renderTextLayer={true}
                            renderAnnotationLayer={true}
                            onLoadSuccess={onPageLoadSuccess}
                            className="rpv-core__canvas-layer"
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </Document>
      </div>

      {/* Floating Toolbar */}
      {numPages && (
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
              <span className="font-medium">{numPages}</span>
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
                if (e.key === 'Enter') {
                  e.preventDefault();
                  if (searchResults.length > 0) {
                    handleNextSearch();
                  }
                }
              }}
              placeholder="Search in document..."
              className="w-64 px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-primary-500"
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
              onClick={handlePreviousSearch}
              disabled={searchResults.length === 0}
              className="size-6 rounded inline-flex items-center justify-center hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              title="Previous result"
            >
              <ChevronUp className="w-4 h-4 text-gray-600" />
            </button>
            <button
              onClick={handleNextSearch}
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
  </>
  );
});

export default PDFViewer;