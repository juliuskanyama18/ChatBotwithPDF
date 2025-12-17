# Remove from Folder Feature

## Overview
Added "Remove from folder" functionality that allows users to move documents out of folders and back to the main chat list.

## ✨ Feature Implemented

### Dynamic Context Menu Options
The context menu now intelligently shows either "Move to folder" or "Remove from folder" based on the document's current location.

**Behavior:**
- **Document NOT in folder:** Shows "Move to folder" option with FolderPlus icon
- **Document IN folder:** Shows "Remove from folder" option with FolderMinus icon

## Implementation Details

### 1. New Helper Function

**`isDocumentInFolder(docId)`**
```javascript
const isDocumentInFolder = (docId) => {
  return folders.some(folder => folder.documents.includes(docId));
};
```

Checks if a document exists in any folder by searching through all folders' document arrays.

### 2. New Handler Function

**`handleRemoveFromFolder(docId)`**
```javascript
const handleRemoveFromFolder = async (docId) => {
  try {
    // Update backend - clear the folder field
    await documentsAPI.update(docId, { folder: null });

    // Remove document from all folders
    setFolders(folders.map(folder => ({
      ...folder,
      documents: folder.documents.filter(id => id !== docId)
    })));

    // Update local document
    setDocuments(documents.map(doc =>
      doc._id === docId ? { ...doc, folder: null } : doc
    ));

    toast.success('Document removed from folder');
    setActiveContextMenu(null);
  } catch (error) {
    console.error('Error removing from folder:', error);
    toast.error('Failed to remove from folder');
  }
};
```

**What it does:**
1. Clears the `folder` field in the backend database (sets to `null`)
2. Removes the document ID from the folder's documents array
3. Updates the local document state
4. Shows success/error notifications

### 3. Updated Imports

Added `FolderMinus` icon from lucide-react:
```javascript
import {
  // ... other imports
  FolderPlus,
  FolderMinus,  // NEW
  Folder,
  // ... other imports
} from 'lucide-react';
```

### 4. Updated Context Menu Component

**Location:** Line 666-688 in `client/src/pages/UnifiedChat.jsx`

```javascript
{isDocumentInFolder(docId) ? (
  <button
    onClick={() => {
      handleRemoveFromFolder(docId);
      onClose();
    }}
    className="w-full flex items-center space-x-2 px-4 py-2 hover:bg-gray-50 text-gray-700 text-sm"
  >
    <FolderMinus className="w-4 h-4" />
    <span>Remove from folder</span>
  </button>
) : (
  <button
    onClick={() => {
      handleMoveToFolder(docId);
      onClose();
    }}
    className="w-full flex items-center space-x-2 px-4 py-2 hover:bg-gray-50 text-gray-700 text-sm"
  >
    <FolderPlus className="w-4 h-4" />
    <span>Move to folder</span>
  </button>
)}
```

### 5. Updated Document Title Menu

**Location:** Line 847-869 in `client/src/pages/UnifiedChat.jsx`

The same conditional logic was applied to the document title menu (the three dots menu in the header when a document is selected).

## User Experience

### Before Removal
```
📁 Work Folder
  │ 💬 Report.pdf        ← Document is in folder
  │ 💬 Notes.docx

Today:
  (empty)
```

**Context Menu Options:**
- ✏️ Rename chat
- 📁 Remove from folder  ← Shows this option
- 🔗 Share chat
- 💾 Export chat
- 🔄 Reset chat
- 🗑️ Delete chat

### After Removal
```
📁 Work Folder
  │ 💬 Notes.docx

Today:
  💬 Report.pdf          ← Document moved back here
```

**Context Menu Options:**
- ✏️ Rename chat
- 📁 Move to folder     ← Shows this option now
- 🔗 Share chat
- 💾 Export chat
- 🔄 Reset chat
- 🗑️ Delete chat

## Technical Flow

### When User Clicks "Remove from folder"

1. **Frontend Action:**
   ```
   handleRemoveFromFolder(docId) called
   ↓
   API call: documentsAPI.update(docId, { folder: null })
   ↓
   Backend: Document.folder field set to null
   ↓
   Update local folders state (remove docId from folder.documents array)
   ↓
   Update local documents state (set doc.folder to null)
   ↓
   Show success toast
   ```

2. **Backend Processing:**
   ```
   PUT /api/documents/:id
   ↓
   updateDocument controller function
   ↓
   Find document by ID and userId
   ↓
   Set document.folder = null
   ↓
   Save document
   ↓
   Return updated document
   ```

3. **UI Update:**
   ```
   Document disappears from folder
   ↓
   organizeDocumentsByDate() re-runs
   ↓
   Document appears in Today/Yesterday/Older section
   ↓
   Context menu now shows "Move to folder" option
   ```

## Integration with Existing Features

### Works With:
- ✅ **Drag-and-drop:** Can still drag documents into folders
- ✅ **Move to folder modal:** Can still use the modal to move documents
- ✅ **Delete document:** Removed documents can still be deleted
- ✅ **Rename document:** Removed documents maintain their names
- ✅ **Folder persistence:** Folder structure persists after removal
- ✅ **Date organization:** Documents return to their correct date category

### Folder Count:
The folder no longer shows a document count, so removal doesn't affect any counter display.

## Files Modified

### `client/src/pages/UnifiedChat.jsx`

**Lines 3-24:** Added `FolderMinus` import

**Lines 399-401:** Added `isDocumentInFolder()` helper function

**Lines 414-436:** Added `handleRemoveFromFolder()` handler function

**Lines 666-688:** Updated sidebar context menu with conditional logic

**Lines 847-869:** Updated document title menu with conditional logic

## Backend Compatibility

The backend `updateDocument` function already supports setting `folder` to `null`:

```javascript
export async function updateDocument(req, res) {
  // ...
  if (folder !== undefined) {
    document.folder = folder;  // Can be null
  }
  // ...
}
```

No backend changes were required since `folder` is an optional field.

## Testing Checklist

- [x] Move document to folder
- [x] Verify "Remove from folder" appears in context menu
- [x] Click "Remove from folder"
- [x] Verify document appears in main chat list (Today/Yesterday/Older)
- [x] Verify document removed from folder
- [x] Verify context menu now shows "Move to folder" again
- [x] Test with document title menu (header)
- [x] Refresh page and verify changes persist
- [x] Move document back to folder (both ways work)
- [x] Test with multiple folders
- [x] Test removing document from one folder after moving it

## Edge Cases Handled

1. **Document in multiple folders:** Although the current implementation prevents this, the removal logic handles it by clearing all folder associations
2. **Document already removed:** The function gracefully handles documents not in any folder
3. **Deleted folders:** If a folder is deleted, documents remain unaffected in the database
4. **Backend sync:** All changes are synced to backend before updating UI

## Error Handling

```javascript
try {
  await documentsAPI.update(docId, { folder: null });
  // ... update local state
  toast.success('Document removed from folder');
} catch (error) {
  console.error('Error removing from folder:', error);
  toast.error('Failed to remove from folder');
}
```

- Network errors show user-friendly toast notifications
- Console logging for debugging
- Local state only updated after successful backend update
- Menu closes regardless of success/failure

## Performance Considerations

- **O(n) folder check:** Iterates through folders to check membership
- **O(n) folder update:** Maps through folders to remove document
- **Efficient rendering:** Only affected components re-render
- **Immediate feedback:** UI updates immediately after backend confirms

## Future Enhancements

Potential improvements:
1. Add confirmation dialog for removing from folder
2. Add "Move to different folder" option (skip going back to main list)
3. Add undo functionality
4. Add bulk operations (remove multiple documents at once)
5. Add keyboard shortcut
6. Add animation when document moves between sections

## Accessibility

- ✅ Keyboard accessible (can be activated via Enter/Space)
- ✅ Clear visual distinction between "Move to" and "Remove from"
- ✅ Different icons for clear understanding
- ✅ Toast notifications for screen readers
- ✅ Proper focus management

## Summary

The "Remove from folder" feature provides users with a complete folder management system:
- ✅ Move documents into folders (existing)
- ✅ Remove documents from folders (new)
- ✅ Documents return to their original date-based location
- ✅ Full backend persistence
- ✅ Intuitive UI with context-aware menu options
- ✅ Works from both sidebar and header menus

This completes the folder management lifecycle! 🎉
