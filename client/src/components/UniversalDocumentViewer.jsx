import { useState, useEffect, forwardRef } from 'react';
import { Image as ImageIcon, AlertCircle, Loader } from 'lucide-react';
import PDFViewer from './PDFViewer';
import DocxViewer from './DocxViewer';
import PptxViewer from './PptxViewer';
import { documentsAPI } from '../services/api';

const UniversalDocumentViewer = forwardRef(function UniversalDocumentViewer({ documentId, fileName, originalName }, ref) {
  const [document, setDocument] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDocument();
  }, [documentId]);

  const fetchDocument = async () => {
    try {
      setLoading(true);
      const response = await documentsAPI.getById(documentId);
      setDocument(response.data.document);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching document:', error);
      setLoading(false);
    }
  };

  const getFileExtension = () => {
    return fileName.split('.').pop().toLowerCase();
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-900">
        <div className="text-center">
          <Loader className="w-12 h-12 text-primary-600 mx-auto mb-4 animate-spin" />
          <p className="text-gray-400">Loading document...</p>
        </div>
      </div>
    );
  }

  const renderViewer = () => {
    const ext = getFileExtension();

    // PDF files - use PDFViewer with ref
    if (ext === 'pdf') {
      return <PDFViewer ref={ref} documentId={documentId} fileName={fileName} />;
    }

    // DOCX files - use DocxViewer with original formatting
    if (ext === 'docx') {
      return <DocxViewer ref={ref} fileName={fileName} originalName={originalName} />;
    }

    // PPTX files - check if converted to PDF
    if (ext === 'pptx') {
      // If PPTX was converted to PDF, display the PDF (preserves formatting + allows text selection)
      if (document && document.convertedPdfPath) {
        const pdfFileName = fileName.replace('.pptx', '_converted.pdf');
        console.log('📄 Displaying converted PDF for PPTX:', pdfFileName);
        return <PDFViewer ref={ref} documentId={documentId} fileName={pdfFileName} />;
      }

      // Otherwise, display text content with download option
      return <PptxViewer ref={ref} fileName={fileName} originalName={originalName} documentId={documentId} />;
    }

    // Image files - show the actual image
    if (['jpg', 'jpeg', 'png', 'gif', 'bmp', 'tiff'].includes(ext)) {
      return (
        <div className="h-full flex flex-col bg-gray-900">
          <div className="bg-gray-800 px-4 py-3 border-b border-gray-700">
            <div className="flex items-center space-x-3">
              <ImageIcon className="w-6 h-6 text-green-400" />
              <div>
                <h3 className="text-white font-medium">{originalName || fileName}</h3>
                <p className="text-gray-400 text-sm">Image with OCR</p>
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-auto p-6 bg-gray-800">
            <div className="max-w-4xl mx-auto">
              <img
                src={`/pdfs/${fileName}`}
                alt={originalName || fileName}
                className="max-w-full h-auto rounded-lg shadow-2xl mx-auto bg-white"
                onError={(e) => {
                  e.target.style.display = 'none';
                  e.target.nextSibling.style.display = 'flex';
                }}
              />
              <div style={{ display: 'none' }} className="text-center text-white p-12">
                <ImageIcon className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                <p className="text-sm">Image preview not available</p>
              </div>
            </div>
          </div>

          <div className="bg-gray-800 px-4 py-2 border-t border-gray-700">
            <p className="text-gray-400 text-xs text-center">
              💬 Chat with this image using the panel on the right
            </p>
          </div>
        </div>
      );
    }

    // Unsupported file type
    return (
      <div className="h-full flex items-center justify-center bg-gray-100">
        <div className="text-center">
          <AlertCircle className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-gray-900 mb-2">
            Document Type: {ext.toUpperCase()}
          </h3>
          <p className="text-gray-600">
            Preview not available. Chat with the document using the panel on the right.
          </p>
        </div>
      </div>
    );
  };

  return renderViewer();
});

export default UniversalDocumentViewer;
