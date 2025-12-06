import { useState, useEffect } from 'react';
import { FileText, Download, Loader, AlertCircle } from 'lucide-react';
import { documentsAPI } from '../services/api';

export default function PptxViewer({ fileName, originalName, documentId }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [slideInfo, setSlideInfo] = useState(null);

  useEffect(() => {
    fetchSlideInfo();
  }, [documentId]);

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
    <div className="h-full bg-gradient-to-br from-orange-50 to-red-50 overflow-auto">
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
                <pre className="whitespace-pre-wrap font-sans text-sm text-gray-700 leading-relaxed">
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
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}