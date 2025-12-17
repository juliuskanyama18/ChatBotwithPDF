import { useState, useMemo, useImperativeHandle, forwardRef, useRef, useEffect } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { ZoomIn, ZoomOut, AlertCircle, Minus, Plus, RotateCcw, Search, ChevronUp, ChevronDown, X } from 'lucide-react';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

// Configure PDF.js worker - Use local worker from public folder
pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.js';

const PDFViewer = forwardRef(function PDFViewer({ documentId, fileName }, ref) {
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
  const [pdfTextContent, setPdfTextContent] = useState({});
  const pageRefs = useRef({});
  const containerRef = useRef(null);
  const resizeTimeoutRef = useRef(null);
  const textLayersRef = useRef({});

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

  // Expose scrollToPage function to parent via ref
  useImperativeHandle(ref, () => ({
    scrollToPage: (page) => {
      if (page >= 1 && page <= (numPages || 1)) {
        const pageElement = pageRefs.current[page];
        if (pageElement) {
          pageElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
          setCurrentPage(page);
        }
      }
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

    if (value.trim()) {
      performSearch(value);
    } else {
      setSearchResults([]);
      setCurrentSearchIndex(0);
      clearHighlights();
    }
  };

  const performSearch = (term) => {
    if (!term.trim()) return;

    const results = [];
    const searchLower = term.toLowerCase();

    // Search through all text layers
    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
      const textLayer = containerRef.current?.querySelector(
        `[data-testid="core__text-layer-${pageNum - 1}"], .rpv-core__text-layer[data-page-number="${pageNum}"]`
      );

      if (textLayer) {
        const textSpans = textLayer.querySelectorAll('span[role="presentation"]');
        textSpans.forEach((span, index) => {
          const text = span.textContent || '';
          if (text.toLowerCase().includes(searchLower)) {
            results.push({ pageNum, element: span, text, index });
          }
        });
      }
    }

    setSearchResults(results);
    setCurrentSearchIndex(results.length > 0 ? 0 : -1);

    if (results.length > 0) {
      highlightSearchResults(results, 0);
    }
  };

  const clearHighlights = () => {
    // Remove all existing highlights
    const highlights = containerRef.current?.querySelectorAll('.pdf-search-highlight');
    highlights?.forEach(el => el.classList.remove('pdf-search-highlight', 'pdf-search-highlight-current'));
  };

  const highlightSearchResults = (results, currentIndex) => {
    clearHighlights();

    results.forEach((result, index) => {
      result.element.classList.add('pdf-search-highlight');
      if (index === currentIndex) {
        result.element.classList.add('pdf-search-highlight-current');
        // Scroll to the current result
        result.element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    });
  };

  const handleNextSearch = () => {
    if (searchResults.length === 0) return;

    const nextIndex = currentSearchIndex < searchResults.length - 1 ? currentSearchIndex + 1 : 0;
    setCurrentSearchIndex(nextIndex);
    highlightSearchResults(searchResults, nextIndex);
  };

  const handlePreviousSearch = () => {
    if (searchResults.length === 0) return;

    const prevIndex = currentSearchIndex > 0 ? currentSearchIndex - 1 : searchResults.length - 1;
    setCurrentSearchIndex(prevIndex);
    highlightSearchResults(searchResults, prevIndex);
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

  const pdfUrl = `/pdfs/${fileName}`;

  return (
    <div className="h-full relative bg-gray-800">
      {/* Search Highlight Styles */}
      <style>{`
        .pdf-search-highlight {
          background-color: rgba(255, 235, 59, 0.5) !important;
          border-radius: 2px;
        }
        .pdf-search-highlight-current {
          background-color: rgba(255, 152, 0, 0.7) !important;
          box-shadow: 0 0 0 2px rgba(255, 152, 0, 0.5);
        }
      `}</style>

      {/* PDF Document */}
      <div ref={containerRef} className="h-full overflow-auto" style={{ position: 'relative' }}>
        <Document
          file={pdfUrl}
          onLoadSuccess={onDocumentLoadSuccess}
          onLoadError={onDocumentLoadError}
          loading={
            <div className="flex flex-col items-center justify-center p-20 bg-white rounded-lg shadow-2xl">
              <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-primary-600 mb-4"></div>
              <p className="text-gray-700 font-medium">Loading PDF...</p>
              <p className="text-gray-500 text-sm mt-2">{fileName}</p>
            </div>
          }
          error={
            <div className="flex flex-col items-center justify-center p-20 bg-white rounded-lg shadow-2xl">
              <AlertCircle className="w-16 h-16 text-red-500 mb-4" />
              <p className="text-gray-900 font-semibold text-lg mb-2">Failed to load PDF</p>
              <p className="text-gray-600 text-sm mb-4">Error: {loadError || 'Unknown error'}</p>
              <div className="bg-gray-100 p-4 rounded-lg text-left">
                <p className="text-xs text-gray-700 font-mono mb-2">Debug Info:</p>
                <p className="text-xs text-gray-600 font-mono">URL: {pdfUrl}</p>
                <p className="text-xs text-gray-600 font-mono">File: {fileName}</p>
              </div>
              <button
                onClick={() => window.location.reload()}
                className="mt-4 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
              >
                Reload Page
              </button>
            </div>
          }
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
                            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)'
                          }}
                        >
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
                onKeyPress={handlePageInputKeyPress}
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
        <div className="absolute top-4 right-4 z-20 bg-white rounded-lg shadow-[0_4px_12px_rgba(0,0,0,0.20)] border border-gray-300 p-2 flex items-center gap-2">
          <Search className="w-4 h-4 text-gray-500" />
          <input
            type="text"
            value={searchTerm}
            onChange={handleSearchChange}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleNextSearch();
              }
            }}
            placeholder="Search in document..."
            className="w-64 px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-primary-500"
            autoFocus
          />
          <div className="flex items-center gap-1 text-sm text-gray-500 px-2 border-l border-gray-300">
            <span>{searchResults.length > 0 ? currentSearchIndex + 1 : 0}</span>
            <span>/</span>
            <span>{searchResults.length}</span>
          </div>
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
      )}
    </div>
  );
});

export default PDFViewer;