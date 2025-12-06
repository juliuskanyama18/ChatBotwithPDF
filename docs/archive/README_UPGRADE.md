# ChatBot with PDF - Graduation Project 2 Upgrade

## 🎉 What's New in Version 2.0

### Major Features Added
1. **MongoDB Database Integration** - All data is now persisted in MongoDB
2. **User Authentication System** - Complete user registration and login system with JWT
3. **Multi-PDF Workspace** - Upload and manage multiple PDF documents
4. **Persistent Chat History** - All conversations are saved to the database
5. **Document Management** - View, delete, and organize your PDFs

---

## 📋 Prerequisites

Before running this project, make sure you have:

1. **Node.js** (v14 or higher) - [Download here](https://nodejs.org/)
2. **MongoDB** - Either:
   - Local MongoDB installation ([Download here](https://www.mongodb.com/try/download/community))
   - OR MongoDB Atlas account (free cloud database) - [Sign up here](https://www.mongodb.com/cloud/atlas)

---

## 🚀 Setup Instructions

### Step 1: Install Dependencies

```bash
npm install
```

### Step 2: Configure Environment Variables

The `.env` file should already have most variables. Update these if needed:

```env
# OpenAI API Key (already configured)
OPENAI_API_KEY=your_existing_key

# MongoDB Configuration
# For local MongoDB (default):
MONGODB_URI=mongodb://localhost:27017/chatbot-pdf

# OR for MongoDB Atlas (cloud):
# MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/chatbot-pdf

# JWT Configuration (change for production)
JWT_SECRET=your_jwt_secret_key_change_this_in_production
JWT_EXPIRE=7d

# Session Secret (change for production)
SESSION_SECRET=your_secure_session_secret
```

### Step 3: Start MongoDB

**Option A: Local MongoDB**
```bash
# On Windows:
# MongoDB should start automatically as a service
# Or manually: "C:\Program Files\MongoDB\Server\6.0\bin\mongod.exe" --dbpath="C:\data\db"

# On Mac/Linux:
mongod
```

**Option B: MongoDB Atlas (Cloud)**
- Create a free cluster at [MongoDB Atlas](https://www.mongodb.com/cloud/atlas)
- Get your connection string
- Update `MONGODB_URI` in `.env` file

### Step 4: Run the Application

```bash
# Development mode with auto-reload
npm run dev

# OR production mode
node app.js
```

The application will run on **http://localhost:3600**

---

## 👤 User Guide

### First Time Setup

1. **Go to** http://localhost:3600
2. **Click** on "Create one" or navigate to `/register`
3. **Register** with:
   - Full Name
   - Email
   - Password (minimum 6 characters)
4. **Login** automatically after registration

### Using the Application

#### Upload PDFs
1. From the workspace, click **"Choose PDF to Upload"**
2. Select a PDF file
3. Wait for upload and language detection
4. PDF will appear in your documents list

#### Chat with PDFs
1. Click **"Open"** on any document
2. Ask questions about the PDF content
3. Conversations are automatically saved
4. AI responds based on document context

#### Manage Documents
- **View All**: See all your uploaded PDFs in the workspace
- **Open**: Start/continue chatting with a PDF
- **Delete**: Remove a PDF and all its conversations

---

## 🗂️ Database Structure

### Collections

1. **users** - User accounts
   - email, password (hashed), fullName, createdAt

2. **documents** - Uploaded PDFs
   - userId, originalName, fileName, filePath, language, pageCount, extractedText

3. **conversations** - Chat sessions
   - userId, documentId, title, createdAt, updatedAt

4. **messages** - Individual messages
   - conversationId, role (user/assistant), content, pageReference, createdAt

---

## 🔐 Security Features

- ✅ Passwords hashed with bcrypt
- ✅ JWT token-based authentication
- ✅ HTTP-only cookies
- ✅ User-specific data isolation
- ✅ Protected API routes

---

## 📁 Project Structure

```
ChatBotwithPDF/
├── app.js                  # Main server file
├── package.json           # Dependencies
├── .env                   # Environment variables
├── config/
│   └── database.js       # MongoDB connection
├── models/
│   ├── User.js          # User model
│   ├── Document.js      # PDF document model
│   ├── Conversation.js  # Chat conversation model
│   └── Message.js       # Chat message model
├── routes/
│   └── auth.js          # Authentication routes
├── middleware/
│   └── auth.js          # JWT authentication middleware
├── views/
│   ├── login.ejs        # Login page
│   ├── register.ejs     # Registration page
│   ├── workspace.ejs    # Document workspace
│   ├── index.ejs        # Landing page
│   └── convertPdf.ejs   # PDF viewer & chat
├── public/              # Static files (CSS, JS, images)
└── pdfs/               # Uploaded PDF storage
```

---

## 🛠️ API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login user
- `POST /api/auth/logout` - Logout user
- `GET /api/auth/me` - Get current user

### Documents
- `GET /api/documents` - Get all user documents
- `GET /api/documents/:id` - Get single document
- `POST /uploadPdf` - Upload new PDF (protected)
- `DELETE /api/documents/:id` - Delete document (protected)

### Conversations
- `GET /api/documents/:id/conversations` - Get document conversations
- `GET /api/conversations/:id/messages` - Get conversation messages
- `POST /generate-response` - Send message to AI (protected)

---

## 🧪 Testing the Application

1. **Register a new account**
2. **Upload 2-3 different PDFs**
3. **Open each PDF and ask questions**
4. **Verify conversations are saved**
5. **Logout and login again** - your data should persist
6. **Delete a document** - confirm it's removed

---

## 🎓 For Your Graduation Project Presentation

### What to Highlight

1. **Database Integration**
   - Show MongoDB Compass or Atlas dashboard
   - Explain the schema design

2. **Authentication System**
   - Demonstrate registration and login
   - Explain JWT token security

3. **Multi-PDF Management**
   - Show uploading multiple documents
   - Switch between different PDFs

4. **Persistent Storage**
   - Logout and login to show data persistence
   - Explain how conversations are stored

5. **Scalability**
   - Explain how this can handle multiple users
   - Discuss potential for deployment

---

## 🚀 Next Steps for Further Improvement

### Phase 2 Enhancements (Optional)
- [ ] RAG with Vector Embeddings (Pinecone/Chroma)
- [ ] React/Next.js modern UI
- [ ] PDF highlighting and citations
- [ ] Document summarization
- [ ] Flashcard generation
- [ ] Admin analytics dashboard
- [ ] Deployment to Render/Vercel

---

## 🐛 Troubleshooting

### MongoDB Connection Error
**Error:** `MongooseServerSelectionError`

**Solution:**
- Make sure MongoDB is running: `mongod`
- Check `MONGODB_URI` in `.env` is correct
- For Atlas, check your IP whitelist and credentials

### Authentication Not Working
**Error:** Token invalid or expired

**Solution:**
- Clear browser cookies
- Check `JWT_SECRET` is set in `.env`
- Try registering a new account

### PDF Upload Fails
**Error:** File upload error

**Solution:**
- Check `pdfs/` folder exists and has write permissions
- Verify file is a valid PDF
- Check file size (multer limits)

---

## 📞 Support

For issues or questions:
1. Check MongoDB is running
2. Verify `.env` configuration
3. Check console for error messages
4. Review database collections in MongoDB Compass

---

## 🎉 Congratulations!

You've successfully upgraded your ChatBot with PDF to include:
- ✅ Database storage
- ✅ User authentication
- ✅ Multi-PDF support
- ✅ Persistent conversations

This is a solid foundation for your Graduation Project 2!
