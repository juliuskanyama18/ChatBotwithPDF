# Testing Guide - ChatBot with PDF v2.0

## ✅ What Was Fixed

1. **Landing Page** - Updated to show Login/Register buttons instead of upload form
2. **Authentication Flow** - All protected routes now require login
3. **MongoDB Integration** - Fixed connection issue with deprecated options
4. **PDF Upload** - Now saves to MongoDB with user association
5. **Chat System** - Conversations saved to database
6. **Document Management** - Multi-PDF workspace with full CRUD operations

---

## 🧪 Step-by-Step Testing

### 1. Start the Server

```bash
npm run dev
```

**Expected Output:**
```
[nodemon] starting `node app.js`
MongoDB Connected: cluster2.6asml4p.mongodb.net
Server is running on port 3600
```

---

### 2. Test Landing Page

1. **Open browser:** http://localhost:3600
2. **You should see:**
   - Beautiful gradient background
   - "Chat with a PDF" heading
   - "Login" and "Sign Up" buttons in navbar
   - Feature cards at the bottom
   - NO upload form (that's only for logged-in users)

---

### 3. Test Registration

1. **Click "Sign Up"** or go to http://localhost:3600/register
2. **Fill in the form:**
   - Full Name: `Test User`
   - Email: `test@example.com`
   - Password: `test123`
   - Confirm Password: `test123`
3. **Click "Create Account"**
4. **Expected:** You're automatically redirected to the workspace

---

### 4. Test Workspace (After Registration)

**You should see:**
- Navbar with your name and "Logout" button
- "My Documents" heading
- Upload section with "Choose PDF to Upload" button
- Message: "No documents yet - Upload your first PDF to get started"

---

### 5. Test PDF Upload

1. **Click "Choose PDF to Upload"**
2. **Select any PDF file**
3. **Expected:**
   - Success alert
   - PDF appears in your documents list
   - Shows: filename, page count, language, upload date
   - Two buttons: "Open" and "Delete"

**Upload 2-3 different PDFs to test multi-document support**

---

### 6. Test Chat with PDF

1. **Click "Open"** on any document
2. **Expected:**
   - PDF viewer on the left
   - Chat interface on the right
3. **Ask a question** about the PDF content
4. **Expected:**
   - AI responds based on PDF context
   - Response includes page reference if available

**Ask 3-4 questions to test conversation history**

---

### 7. Test Logout and Login

1. **Click "Logout"** in navbar
2. **Expected:** Redirected to landing page
3. **Click "Login"**
4. **Enter credentials:**
   - Email: `test@example.com`
   - Password: `test123`
5. **Click "Sign In"**
6. **Expected:**
   - Redirected to workspace
   - All your PDFs are still there!
   - All conversations are preserved

---

### 8. Test Document Deletion

1. **In workspace, click "Delete"** on any PDF
2. **Confirm deletion**
3. **Expected:**
   - Document removed from list
   - Success message
   - File deleted from server

---

### 9. Test MongoDB Data

**Open MongoDB Atlas Dashboard:**

1. Go to https://cloud.mongodb.com
2. Click "Browse Collections"
3. **You should see 4 collections:**
   - `users` - Your registered user
   - `documents` - Your uploaded PDFs
   - `conversations` - Your chat sessions
   - `messages` - Individual chat messages

**Verify data is being saved:**
- Check `users` collection has your email
- Check `documents` collection has your PDFs
- Check `messages` collection has your chat history

---

## 🎯 Success Criteria

✅ Landing page shows Login/Register (NOT upload form)
✅ User can register successfully
✅ User can login successfully
✅ User redirected to workspace after auth
✅ User can upload multiple PDFs
✅ PDFs are saved to MongoDB
✅ User can open and chat with PDFs
✅ Conversations are saved to MongoDB
✅ User can logout and login - data persists
✅ User can delete PDFs
✅ MongoDB collections are being populated

---

## 🐛 Common Issues

### Issue: Can't see landing page changes
**Solution:** Hard refresh browser: `Ctrl + F5` (Windows) or `Cmd + Shift + R` (Mac)

### Issue: 401 Unauthorized when uploading
**Solution:** Make sure you're logged in. Go to `/login` if you see this error.

### Issue: MongoDB connection error
**Solution:**
- Check internet connection (you're using MongoDB Atlas)
- Verify `MONGO_URI` in `.env` is correct
- Check MongoDB Atlas IP whitelist (allow all: `0.0.0.0/0`)

### Issue: JWT token errors
**Solution:**
- Clear browser cookies
- Logout and login again
- Check `JWT_SECRET` is set in `.env`

---

## 📊 Expected Database Structure

After testing, your MongoDB should have:

```
chatbot-pdf/
├── users (1 document)
│   ├── email: "test@example.com"
│   ├── fullName: "Test User"
│   └── password: (hashed)
│
├── documents (2-3 documents)
│   ├── originalName: "example.pdf"
│   ├── fileName: "example-123456.pdf"
│   ├── userId: (reference to user)
│   ├── language: "en"
│   └── pageCount: 10
│
├── conversations (1 per PDF)
│   ├── userId: (reference)
│   ├── documentId: (reference)
│   └── title: "What is..."
│
└── messages (multiple)
    ├── conversationId: (reference)
    ├── role: "user" or "assistant"
    └── content: "question/answer text"
```

---

## 🎉 Next Steps

If all tests pass, you're ready to:

1. ✅ Present to your advisor
2. ✅ Demo to examiners
3. ✅ Deploy to production (optional)
4. ✅ Add more advanced features (Phase 2)

---

## 📞 Need Help?

If you encounter any issues:

1. Check the console for error messages
2. Check MongoDB Atlas connection
3. Clear browser cookies and cache
4. Restart the server
5. Check `.env` configuration

---

**Congratulations! Your ChatBot with PDF is now a full-stack application with authentication and database persistence!** 🎉
