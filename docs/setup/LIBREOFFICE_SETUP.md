# LibreOffice Setup for PPTX to PDF Conversion

## 🎯 Why LibreOffice?

LibreOffice is required to convert PowerPoint presentations (PPTX) to PDF format, allowing users to view presentations with:
- ✅ Original formatting preserved
- ✅ Text selection enabled
- ✅ Searchable content
- ✅ No browser compatibility issues

---

## 📥 Installation Instructions

### Windows

1. **Download LibreOffice**:
   - Visit: https://www.libreoffice.org/download/download/
   - Click "Download" button (should auto-detect Windows)
   - Download the installer (approximately 300 MB)

2. **Install LibreOffice**:
   - Run the downloaded installer (.msi file)
   - Follow the installation wizard
   - Default installation path: `C:\Program Files\LibreOffice\`
   - Click "Install" and wait for completion

3. **Verify Installation**:
   ```cmd
   "C:\Program Files\LibreOffice\program\soffice.exe" --version
   ```

   Should output something like:
   ```
   LibreOffice 7.6.x.x
   ```

---

### Ubuntu/Debian Linux

1. **Install via Package Manager**:
   ```bash
   sudo apt update
   sudo apt install libreoffice
   ```

2. **Verify Installation**:
   ```bash
   soffice --version
   ```

---

### macOS

1. **Download LibreOffice**:
   - Visit: https://www.libreoffice.org/download/download/
   - Download the macOS version (.dmg file)

2. **Install LibreOffice**:
   - Open the downloaded .dmg file
   - Drag LibreOffice to Applications folder
   - Open LibreOffice once to verify installation

3. **Verify Installation**:
   ```bash
   /Applications/LibreOffice.app/Contents/MacOS/soffice --version
   ```

---

## 🧪 Testing the Conversion

### Test from Python Service

1. **Start Python Service**:
   ```bash
   cd python_service
   # Windows:
   start_python_service.bat
   # Linux/Mac:
   ./start_python_service.sh
   ```

2. **Test Conversion Endpoint**:
   ```bash
   # Using curl (if you have a test PPTX file)
   curl -X POST "http://localhost:8000/convert/pptx-to-pdf" \
     -H "Content-Type: multipart/form-data" \
     -F "file=@test.pptx" \
     -o output.pdf
   ```

3. **Check API Documentation**:
   - Open: http://localhost:8000/docs
   - Find the `/convert/pptx-to-pdf` endpoint
   - Click "Try it out"
   - Upload a PPTX file
   - Should return a PDF file

---

## 🔍 Troubleshooting

### Windows: "soffice.exe not found"

**Problem**: Python service can't find LibreOffice

**Solution**:
1. Verify LibreOffice is installed:
   ```cmd
   dir "C:\Program Files\LibreOffice\program\soffice.exe"
   ```

2. If installed in different location, update `python_service/document_service.py`:
   ```python
   libreoffice_paths = [
       r"C:\Your\Custom\Path\LibreOffice\program\soffice.exe",
       # ... other paths
   ]
   ```

---

### Linux/Mac: "soffice: command not found"

**Problem**: LibreOffice not in PATH

**Solution**:
1. Find soffice location:
   ```bash
   which soffice
   # or
   find / -name soffice 2>/dev/null
   ```

2. Add to PATH or create symlink:
   ```bash
   sudo ln -s /path/to/soffice /usr/local/bin/soffice
   ```

---

### Conversion Times Out

**Problem**: Large PPTX files timeout (>60 seconds)

**Solution**:
1. Increase timeout in `python_service/document_service.py`:
   ```python
   process = subprocess.run(
       cmd,
       capture_output=True,
       text=True,
       timeout=120  # Increase to 120 seconds
   )
   ```

2. Increase timeout in `utils/pythonServiceClient.js`:
   ```javascript
   timeout: 180000, // 3 minutes
   ```

---

### Conversion Produces Blank PDF

**Problem**: PDF is generated but has blank pages

**Possible Causes**:
1. Corrupted PPTX file
2. Unsupported PPTX features (complex animations, embedded objects)
3. LibreOffice version too old

**Solution**:
1. Try opening PPTX in PowerPoint/LibreOffice desktop app first
2. Update LibreOffice to latest version
3. Simplify the presentation (remove complex animations)

---

## 🚀 Production Deployment

### Docker Deployment

If deploying with Docker, add LibreOffice to your Dockerfile:

**For Python Service**:
```dockerfile
FROM python:3.9-slim

# Install LibreOffice
RUN apt-get update && apt-get install -y \
    libreoffice \
    && rm -rf /var/lib/apt/lists/*

# Rest of your Dockerfile...
```

### Cloud Hosting

**Railway/Render**:
- Add LibreOffice to build command:
  ```bash
  apt-get update && apt-get install -y libreoffice && pip install -r requirements.txt
  ```

**Note**: Some cloud platforms have size limits. LibreOffice adds ~200-300 MB.

---

## 📊 Performance Expectations

| PPTX Size | Slides | Conversion Time |
|-----------|--------|-----------------|
| 1 MB      | 5-10   | 2-5 seconds     |
| 5 MB      | 20-30  | 10-15 seconds   |
| 10 MB     | 50+    | 20-30 seconds   |

---

## ✅ Feature Status

Once LibreOffice is installed:

**PPTX Upload Flow**:
1. User uploads PPTX file
2. Python extracts text for RAG/chat
3. Python converts PPTX → PDF (preserves formatting)
4. Node.js saves both files
5. React displays PDF (with text selection)

**Without LibreOffice**:
1. User uploads PPTX file
2. Python extracts text for RAG/chat
3. Node.js saves PPTX
4. React displays extracted text + download button

**Both scenarios work!** LibreOffice just enhances the viewing experience.

---

## 🆘 Support

If you encounter issues:
1. Check Python service logs: `python_service/document_service.log`
2. Check Node.js console output
3. Verify LibreOffice installation: `soffice --version`
4. Test conversion manually:
   ```bash
   soffice --headless --convert-to pdf --outdir /tmp test.pptx
   ```

---

## 📝 Summary

- **Required For**: PPTX to PDF conversion (better viewing experience)
- **Optional**: System works without it (falls back to text display)
- **Installation Time**: 5-10 minutes
- **Disk Space**: ~300 MB
- **Platforms**: Windows, Linux, macOS
- **License**: Free and open source
