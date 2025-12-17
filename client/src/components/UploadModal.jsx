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
    if (droppedFile && isValidFileType(droppedFile)) {
      setFile(droppedFile);
    } else {
      toast.error('Unsupported file type. Please upload PDF, DOCX, PPTX, or Image files.');
    }
  };

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile && isValidFileType(selectedFile)) {
      setFile(selectedFile);
    } else {
      toast.error('Unsupported file type. Please upload PDF, DOCX, PPTX, or Image files.');
    }
  };

  const handleUpload = async () => {
    if (!file) return;

    setUploading(true);
    const formData = new FormData();
    formData.append('pdfFile', file); // Keep field name for backward compatibility

    try {
      const response = await documentsAPI.upload(formData);

      // Use backend message or create a generic one
      const message = response.data.message || 'Document uploaded successfully!';
      toast.success(message);

      // Pass the document object to parent component
      if (response.data.document) {
        onSuccess(response.data.document);
      }

      onClose();
    } catch (error) {
      console.error('Upload error:', error);
      toast.error(error.response?.data?.error || 'Failed to upload document');
    } finally {
      setUploading(false);
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
            <h2 className="text-2xl font-bold text-gray-900">Upload Document</h2>
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
                  {getFileIcon(file)}
                  <span className="text-gray-900 font-medium">{file.name}</span>
                </div>
                <p className="text-sm text-gray-600">
                  {(file.size / (1024 * 1024)).toFixed(2)} MB
                </p>
                <button
                  onClick={() => setFile(null)}
                  className="text-red-600 hover:text-red-700 text-sm font-medium"
                >
                  Remove
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <Upload className="w-12 h-12 text-gray-400 mx-auto" />
                <div>
                  <p className="text-gray-900 font-medium mb-1">
                    Drop your document here, or
                  </p>
                  <label className="text-primary-600 hover:text-primary-700 cursor-pointer font-medium">
                    browse files
                    <input
                      type="file"
                      accept=".pdf,.docx,.pptx,.jpg,.jpeg,.png,.gif,.bmp,.tiff"
                      onChange={handleFileChange}
                      className="hidden"
                    />
                  </label>
                </div>
                <div className="text-sm text-gray-600 space-y-1">
                  <p className="font-medium">Supported formats:</p>
                  <p>PDF, DOCX, PPTX, Images (JPG, PNG, GIF, BMP, TIFF)</p>
                  <p className="text-xs mt-2">Maximum file size: 10MB</p>
                  <p className="text-xs text-primary-600">📷 Images will be processed with OCR</p>
                </div>
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
                  <span>Processing...</span>
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