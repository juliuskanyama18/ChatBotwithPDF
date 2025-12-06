import { useState, useMemo } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut, AlertCircle } from 'lucide-react';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

// Configure PDF.js worker - Use local worker from public folder
pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.js';

export default function PDFViewer({ documentId, fileName }) {
  const [numPages, setNumPages] = useState(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [scale, setScale] = useState(1.2);
  const [loadError, setLoadError] = useState(null);

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

  const pdfUrl = `/pdfs/${fileName}`;

  return (
    <div className="h-full flex flex-col bg-gray-900">
      {/* Controls */}
      <div className="bg-gray-800 px-4 py-3 flex items-center justify-between border-b border-gray-700">
        <div className="flex items-center space-x-2">
          <button
            onClick={() => setPageNumber(Math.max(1, pageNumber - 1))}
            disabled={pageNumber <= 1}
            className="p-2 hover:bg-gray-700 rounded disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            title="Previous page"
          >
            <ChevronLeft className="w-5 h-5 text-white" />
          </button>
          <span className="text-white text-sm font-medium min-w-[100px] text-center">
            Page {pageNumber} of {numPages || '?'}
          </span>
          <button
            onClick={() => setPageNumber(Math.min(numPages || 1, pageNumber + 1))}
            disabled={pageNumber >= (numPages || 1)}
            className="p-2 hover:bg-gray-700 rounded disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            title="Next page"
          >
            <ChevronRight className="w-5 h-5 text-white" />
          </button>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={() => setScale(Math.max(0.5, scale - 0.1))}
            disabled={scale <= 0.5}
            className="p-2 hover:bg-gray-700 rounded disabled:opacity-50 transition-colors"
            title="Zoom out"
          >
            <ZoomOut className="w-5 h-5 text-white" />
          </button>
          <span className="text-white text-sm font-medium min-w-[60px] text-center">
            {Math.round(scale * 100)}%
          </span>
          <button
            onClick={() => setScale(Math.min(2.5, scale + 0.1))}
            disabled={scale >= 2.5}
            className="p-2 hover:bg-gray-700 rounded disabled:opacity-50 transition-colors"
            title="Zoom in"
          >
            <ZoomIn className="w-5 h-5 text-white" />
          </button>
        </div>
      </div>

      {/* PDF Document */}
      <div className="flex-1 overflow-auto p-6 flex items-start justify-center bg-gray-800">
        <div className="bg-white shadow-2xl">
          <Document
            file={pdfUrl}
            onLoadSuccess={onDocumentLoadSuccess}
            onLoadError={onDocumentLoadError}
            loading={
              <div className="flex flex-col items-center justify-center p-20 bg-white">
                <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-primary-600 mb-4"></div>
                <p className="text-gray-700 font-medium">Loading PDF...</p>
                <p className="text-gray-500 text-sm mt-2">{fileName}</p>
              </div>
            }
            error={
              <div className="flex flex-col items-center justify-center p-20 bg-white">
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
            <Page
              pageNumber={pageNumber}
              scale={scale}
              renderTextLayer={true}
              renderAnnotationLayer={true}
              className="shadow-lg"
            />
          </Document>
        </div>
      </div>

      {/* Instructions */}
      <div className="bg-gray-800 px-4 py-2 border-t border-gray-700">
        <p className="text-gray-400 text-xs text-center">
          💡 You can select and copy text directly from the PDF
        </p>
      </div>
    </div>
  );
}