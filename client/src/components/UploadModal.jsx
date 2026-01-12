import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Upload, File, CheckCircle, FileText, Image as ImageIcon } from 'lucide-react';
import { documentsAPI } from '../services/api';
import toast from 'react-hot-toast';

// Supported file types
const SUPPORTED_TYPES = {
  'application/pdf': { ext: '.pdf', icon: 'pdf', color: 'text-red-600' },
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': { ext: '.docx', icon: 'docx', color: 'text-blue-600' },
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': { ext: '.pptx', icon: 'pptx', color: 'text-orange-600' },
  'image/jpeg': { ext: '.jpg', icon: 'image', color: 'text-green-600' },
  'image/png': { ext: '.png', icon: 'image', color: 'text-green-600' },
  'image/gif': { ext: '.gif', icon: 'image', color: 'text-green-600' },
  'image/bmp': { ext: '.bmp', icon: 'image', color: 'text-green-600' },
  'image/tiff': { ext: '.tiff', icon: 'image', color: 'text-green-600' },
};

const isValidFileType = (file) => {
  return Object.keys(SUPPORTED_TYPES).includes(file.type) ||
         file.name.toLowerCase().endsWith('.docx') ||
         file.name.toLowerCase().endsWith('.pptx');
};

const getFileIcon = (file) => {
  const typeInfo = SUPPORTED_TYPES[file.type];
  if (typeInfo?.icon === 'image') {
    return <ImageIcon className="w-5 h-5 text-green-600" />;
  }
  return <FileText className="w-5 h-5 text-blue-600" />;
};

export default function UploadModal({ onClose, onSuccess }) {
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [progress, setProgress] = useState({ status: 'idle', progress: 0 });

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) {
      // Accept PDF, DOCX, PPTX (including older .doc/.ppt fallbacks)
      const allowedMimeTypes = [
        'application/pdf',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
        'application/vnd.openxmlformats-officedocument.presentationml.presentation', // .pptx
        'application/msword',     // .doc
        'application/vnd.ms-powerpoint' // .ppt
      ];
      const allowedExtensions = ['.pdf', '.docx', '.pptx', '.doc', '.ppt'];

      const fileExt = (droppedFile.name.match(/\.[^/.]+$/) || [''])[0].toLowerCase();
      if (allowedMimeTypes.includes(droppedFile.type) || allowedExtensions.includes(fileExt)) {
        setFile(droppedFile);
      } else {
        toast.error('Please upload a PDF, DOCX, or PPTX file');
      }
    }
  };

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      const allowedMimeTypes = [
        'application/pdf',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'application/msword',
        'application/vnd.ms-powerpoint'
      ];
      const allowedExtensions = ['.pdf', '.docx', '.pptx', '.doc', '.ppt'];
      const fileExt = (selectedFile.name.match(/\.[^/.]+$/) || [''])[0].toLowerCase();

      if (allowedMimeTypes.includes(selectedFile.type) || allowedExtensions.includes(fileExt)) {
        setFile(selectedFile);
      } else {
        toast.error('Please upload a PDF, DOCX, or PPTX file');
      }
    }
  };

  const handleUpload = async () => {
    if (!file) return;

    setUploading(true);
    setProgress({ status: 'uploading', progress: 5 }); // initial

    const formData = new FormData();
    formData.append('pdfFile', file);

    try {
      const response = await documentsAPI.upload(formData);
      // Upload succeeded, response contains document info
      const documentId = response.data.documentId || response.data.document?._id;

      // Poll progress endpoint until ready or error
      if (documentId) {
        setProgress({ status: 'processing', progress: 10 });

        const poll = setInterval(async () => {
          try {
            const pResp = await documentsAPI.getProgress(documentId);
            const prog = pResp.data.progress || { status: 'processing', progress: 0 };
            setProgress(prog);

            if (prog.status === 'ready' || prog.progress >= 100) {
              clearInterval(poll);
              setUploading(false);
              // Notify parent with the newly created document (if available)
              onSuccess(response.data.document || { _id: documentId, fileName: response.data.fileName });
              onClose();
            } else if (prog.status === 'error') {
              clearInterval(poll);
              setUploading(false);
              toast.error('Embedding generation failed. Check server logs.');
            }
          } catch (err) {
            console.error('Progress poll error:', err);
            // keep polling; you may implement retry/backoff if desired
          }
        }, 1000);
      } else {
        // No document id returned — fallback: treat as immediate success
        setUploading(false);
        onSuccess(response.data);
        onClose();
      }
    } catch (error) {
      console.error('Upload error:', error);
      toast.error(error.response?.data?.error || 'Failed to upload PDF');
      setUploading(false);
      setProgress({ status: 'error', progress: 0 });
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="bg-white rounded-xl shadow-xl max-w-md w-full p-6"
        >
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-gray-900">Upload PDF</h2>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Upload Area */}
          <div
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
              dragActive
                ? 'border-primary-600 bg-primary-50'
                : 'border-gray-300 hover:border-primary-400'
            }`}
          >
            {file ? (
              <div className="space-y-4">
                <CheckCircle className="w-12 h-12 text-green-600 mx-auto" />
                <div className="flex items-center justify-center space-x-2">
                  <File className="w-5 h-5 text-gray-600" />
                  <span className="text-gray-900 font-medium">{file.name}</span>
                </div>
                <p className="text-sm text-gray-600">
                  {(file.size / (1024 * 1024)).toFixed(2)} MB
                </p>

                {/* --- CHANGED: Indeterminate sliding loading bar (no percentage) --- */}
                {uploading && (
                  <div className="w-full">
                    <div className="h-3 bg-gray-200 rounded-full overflow-hidden relative">
                      {/* Sliding gradient bar */}
                      <div className="loading-bar-slider absolute inset-0" />
                    </div>
                    <p className="text-xs text-gray-600 mt-2">
                      Processing document — this may take a minute. You will be notified when it's ready.
                    </p>
                  </div>
                )}
                {/* --- end change --- */}

                {!uploading && (
                  <button
                    onClick={() => setFile(null)}
                    className="text-red-600 hover:text-red-700 text-sm font-medium"
                  >
                    Remove
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                <Upload className="w-12 h-12 text-gray-400 mx-auto" />
                <div>
                  <p className="text-gray-900 font-medium mb-1">
                    Drop your PDF here, or
                  </p>
                  <label className="text-primary-600 hover:text-primary-700 cursor-pointer font-medium">
                    browse files
                    <input
                      type="file"
                      accept=".pdf,application/pdf,.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation,.doc,application/msword,.ppt,application/vnd.ms-powerpoint"
                      onChange={handleFileChange}
                      className="hidden"
                    />
                  </label>
                </div>
                <p className="text-sm text-gray-600">
                  Maximum file size: 10MB
                </p>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end space-x-3 mt-6">
            <button
              onClick={onClose}
              className="btn-secondary"
              disabled={uploading}
            >
              Cancel
            </button>
            <button
              onClick={handleUpload}
              disabled={!file || uploading}
              className="btn-primary flex items-center space-x-2"
            >
              {uploading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  <span>Uploading...</span>
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4" />
                  <span>Upload</span>
                </>
              )}
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}