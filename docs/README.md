# ChatBotwithPDF Documentation

Welcome to the ChatBotwithPDF documentation. This directory contains all project documentation organized by category.

## 📂 Documentation Structure

### [setup/](setup/)
Installation, configuration, and getting started guides:
- [QUICKSTART.md](setup/QUICKSTART.md) - Quick start guide for running the project
- [LIBREOFFICE_SETUP.md](setup/LIBREOFFICE_SETUP.md) - LibreOffice installation for PPTX conversion
- [MICROSERVICES_SETUP.md](setup/MICROSERVICES_SETUP.md) - Python microservice setup
- [MONGODB_VECTOR_SEARCH_SETUP.md](setup/MONGODB_VECTOR_SEARCH_SETUP.md) - MongoDB Atlas vector search configuration
- [TESTING_GUIDE.md](setup/TESTING_GUIDE.md) - Testing procedures

### [features/](features/)
Feature documentation and implementation details:
- [RAG_IMPLEMENTATION.md](features/RAG_IMPLEMENTATION.md) - RAG system architecture
- [RAG_IMPROVEMENTS.md](features/RAG_IMPROVEMENTS.md) - Recent RAG enhancements
- [RAG_QUICK_START.md](features/RAG_QUICK_START.md) - RAG quick start guide
- [RAG_PIPELINE_DIAGRAM.md](features/RAG_PIPELINE_DIAGRAM.md) - Visual RAG pipeline diagrams
- [MULTI_DOCUMENT_SUPPORT.md](features/MULTI_DOCUMENT_SUPPORT.md) - Multi-document support details
- [REACT_COMPONENTS_COMPLETE.md](features/REACT_COMPONENTS_COMPLETE.md) - React component documentation
- [README_REACT_FRONTEND.md](features/README_REACT_FRONTEND.md) - React frontend overview

### [improvements/](improvements/)
Performance optimizations and bug fixes:
- [PERFORMANCE_OPTIMIZATION.md](improvements/PERFORMANCE_OPTIMIZATION.md) - Performance improvements
- [CRITICAL_FIX_9_SECOND_DB_QUERY.md](improvements/CRITICAL_FIX_9_SECOND_DB_QUERY.md) - Database query optimization
- [RECENT_UPDATES.md](improvements/RECENT_UPDATES.md) - Recent updates and changes
- [VECTOR_SEARCH_ACTIVATED.md](improvements/VECTOR_SEARCH_ACTIVATED.md) - Vector search activation guide

### [archive/](archive/)
Historical documentation and deprecated guides:
- [PROJECT_STATUS.md](archive/PROJECT_STATUS.md) - Historical project status
- [IMPLEMENTATION_AUDIT.md](archive/IMPLEMENTATION_AUDIT.md) - Implementation audit report
- [ALL_FILES_CREATED.md](archive/ALL_FILES_CREATED.md) - Complete file listing
- [README_UPGRADE.md](archive/README_UPGRADE.md) - Upgrade guide (deprecated)
- [REACT_QUICK_START.md](archive/REACT_QUICK_START.md) - React quick start (superseded)
- [REACT_SETUP_GUIDE.md](archive/REACT_SETUP_GUIDE.md) - React setup (superseded)
- [PROJECT_RESTRUCTURING_PLAN.md](archive/PROJECT_RESTRUCTURING_PLAN.md) - Project restructuring documentation

## 🚀 Quick Links

- **New to the project?** Start with [setup/QUICKSTART.md](setup/QUICKSTART.md)
- **Want to understand RAG?** Read [features/RAG_PIPELINE_DIAGRAM.md](features/RAG_PIPELINE_DIAGRAM.md)
- **Setting up Python service?** See [setup/MICROSERVICES_SETUP.md](setup/MICROSERVICES_SETUP.md)
- **MongoDB setup?** Check [setup/MONGODB_VECTOR_SEARCH_SETUP.md](setup/MONGODB_VECTOR_SEARCH_SETUP.md)
- **Performance issues?** Review [improvements/PERFORMANCE_OPTIMIZATION.md](improvements/PERFORMANCE_OPTIMIZATION.md)

## 📝 Contributing to Documentation

When adding new documentation:
1. Place setup guides in `setup/`
2. Place feature docs in `features/`
3. Place optimization docs in `improvements/`
4. Archive old docs in `archive/`
5. Update this README with links to new docs

## 🎓 Graduation Project Info

This is a graduation project (ISE492) focused on building an AI-powered document chatbot with RAG capabilities.

### Key Technologies
- **Backend**: Node.js + Express
- **Frontend**: React + Vite + Tailwind CSS
- **Python Service**: FastAPI (document processing)
- **Database**: MongoDB Atlas (with Vector Search)
- **AI**: OpenAI GPT-3.5-turbo / GPT-4
- **Embeddings**: OpenAI text-embedding-3-small
- **Document Processing**: pdfplumber, python-docx, python-pptx, Tesseract OCR

### Project Structure
```
ChatBotwithPDF/
├── backend/           # Node.js backend (models, routes, controllers)
├── client/            # React frontend
├── python_service/    # FastAPI microservice
├── admin/            # Admin panel (planned)
└── docs/             # This documentation
```
