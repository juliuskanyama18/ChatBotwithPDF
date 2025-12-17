import { useEffect, useRef, useState, useImperativeHandle, forwardRef } from 'react';
import { renderAsync } from 'docx-preview';
import { Loader, AlertCircle } from 'lucide-react';

const DocxViewer = forwardRef(function DocxViewer({ fileName }, ref) {
  const containerRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Expose scrollToPage function to parent
  useImperativeHandle(ref, () => ({
    scrollToPage: (page) => {
      if (containerRef.current) {
        // Find page breaks in the rendered DOCX
        const pageBreaks = containerRef.current.querySelectorAll('.docx-page-break, [data-page-break]');

        if (pageBreaks.length > 0 && page > 1 && page <= pageBreaks.length + 1) {
          // Scroll to the page break element
          const targetBreak = pageBreaks[page - 2]; // page 2 is at index 0
          if (targetBreak) {
            targetBreak.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
        } else {
          // If no page breaks or page 1, scroll to top
          containerRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }
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
      }

      setLoading(false);
    } catch (err) {
      console.error('Error rendering DOCX:', err);
      setError('Failed to render document. The file may be corrupted or in an unsupported format.');
      setLoading(false);
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
    <div className="h-full overflow-auto bg-gray-100">
      <div
        ref={containerRef}
        className="docx-viewer-container"
        style={{
          padding: '40px 20px',
          minHeight: '100%'
        }}
      />
    </div>
  );
});

export default DocxViewer;
