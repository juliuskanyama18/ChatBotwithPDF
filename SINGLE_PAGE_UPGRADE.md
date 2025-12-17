# Single-Page Application Upgrade

## Overview
Your ChatPDF application has been transformed into a modern single-page application inspired by chatpdf.com. All functionality is now unified into one seamless experience.

## Key Features Implemented

### 1. **Unified Single-Page Interface** (`/app`)
- No more separate workspace and chat pages
- Everything accessible from one view
- Cleaner URL structure using query parameters (`/app?doc=123`)

### 2. **Collapsible Document Sidebar**
- Quick access to all your documents
- Smooth toggle animation
- Desktop: Collapsible with chevron buttons
- Mobile: Slide-out drawer with backdrop overlay
- Shows document names and page counts
- Hover-to-delete functionality

### 3. **Drag & Drop Upload**
- Beautiful upload zone when no document is selected
- Drag files directly onto the page
- Visual feedback during drag operations
- Supports PDF, DOCX, and PPTX files

### 4. **Split-View Layout**
- Document viewer on the left (50%)
- Chat interface on the right (50%)
- Fully responsive on all screen sizes
- Smooth transitions between states

### 5. **Enhanced Mobile Experience**
- Responsive sidebar with backdrop
- Mobile-optimized header
- Touch-friendly UI elements
- Proper z-index management

### 6. **Quick Document Switching**
- Click any document in sidebar to switch instantly
- No page navigation required
- Conversation history preserved per document

## File Changes

### New Files Created
- `client/src/pages/UnifiedChat.jsx` - Main single-page application component

### Modified Files
- `client/src/App.jsx` - Updated routing to use `/app` route
- `client/src/pages/Login.jsx` - Updated redirect to `/app`
- `client/src/pages/Register.jsx` - Updated redirect to `/app`

### Legacy Routes
Old routes automatically redirect to the new unified app:
- `/workspace` → `/app`
- `/chat/:documentId` → `/app`

## How It Works

### URL Structure
```
/app              - Shows upload zone (no document selected)
/app?doc=abc123   - Shows document and chat for document ID abc123
```

### Component Structure
```
UnifiedChat
├── Header (fixed)
│   ├── Logo
│   ├── Document info
│   └── User menu
├── Main Content (flex)
│   ├── Sidebar (collapsible)
│   │   ├── New Document button
│   │   └── Document list
│   └── Content Area
│       ├── Upload Zone (no doc selected)
│       └── Split View (doc selected)
│           ├── Document Viewer (left)
│           └── Chat Interface (right)
```

## Usage

### For Users
1. **Login/Register** - Redirects to `/app`
2. **Upload Documents**:
   - Click "New Document" button in sidebar
   - Or drag & drop onto upload zone
3. **Switch Documents** - Click any document in the sidebar
4. **Chat** - Type questions in the chat input
5. **Navigate Pages** - Click page citations to jump to specific pages
6. **Delete Documents** - Hover over document and click trash icon

### For Developers
The main component exports all necessary functionality:
- Document management (load, upload, delete)
- Conversation handling (load, send messages)
- UI state management (sidebar, modals)
- Responsive behavior

## Responsive Breakpoints
- **Mobile** (< 1024px): Sidebar becomes overlay
- **Desktop** (≥ 1024px): Sidebar is inline and collapsible

## Benefits

1. **Better UX**: Everything in one place, no navigation needed
2. **Faster**: No page reloads when switching documents
3. **Modern**: Matches popular apps like chatpdf.com
4. **Cleaner URLs**: Uses query parameters instead of route params
5. **Mobile-Friendly**: Proper mobile sidebar implementation

## Testing

To test the new interface:
```bash
cd client
npm run dev
```

Then:
1. Login or register
2. Upload a document
3. Try the drag & drop feature
4. Test sidebar collapse/expand
5. Switch between multiple documents
6. Test on mobile (use browser dev tools)

## Backwards Compatibility

Old links will automatically redirect:
- Old workspace link → New app
- Old chat links → New app (without doc selection)

Users can bookmark `/app?doc=ID` for direct access to specific documents.
