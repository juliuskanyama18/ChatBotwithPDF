# Clickable Page Citations Implementation (Like ChatPDF)

## Overview
Implemented clickable page number citations in chatbot responses, matching the behavior of www.chatpdf.com. Users can now click on page numbers to jump directly to that page in the PDF viewer.

## Features Implemented

### ✅ 1. Natural Page Citations
- Page numbers appear inline within sentences
- Format: `[Page X]` or `[Slide X]` for PPTX files
- Citations appear at the END of sentences (like ChatPDF)
- Support for multiple pages: `[Page 5, 6, 7]`

### ✅ 2. Clickable Page Badges
- Styled exactly like ChatPDF with arrow icon
- Hover effect for better UX
- Accessible (keyboard navigation support)
- Shows tooltip on hover

### ✅ 3. Auto-Scroll to Page
- Click page number → PDF jumps to that page
- Smooth transition with toast notification
- Works for both PDF and converted PPTX files

## Files Modified/Created

### Backend
**File**: `backend/controllers/chatController.js`
- Updated GPT system instructions to use `[Page X]` format
- Enforced citations at end of sentences
- Added examples for proper formatting

**Changes**:
```javascript
`4. ALWAYS cite the ${citationType.toLowerCase()} number(s) using the format [${citationType} X] at the END of sentences
   Example: "The program duration is 4 years [Page 4]."
   Example: "Students must complete 240 ECTS credits [Page 5]."
5. If multiple pages are relevant for ONE fact, list them: [Page 5, 6, 7]
6. Place citations at the END of sentences, not in the middle`
```

### Frontend Components

#### 1. **PageCitation.jsx** (NEW)
**Purpose**: Renders clickable page number badges

**Features**:
- Arrow icon (matching ChatPDF)
- Hover effects
- Keyboard accessible
- Click handler to scroll to page

**Styling**:
```jsx
className="inline-flex items-center rounded-full cursor-pointer
  text-gray-600 bg-gray-200 ps-1 pe-1.5 h-4 text-xs font-medium
  select-none hover:bg-gray-300 transition-colors ml-0.5"
```

#### 2. **Message.jsx** (MODIFIED)
**Changes**:
- Added `onPageClick` prop
- Parses message content to extract `[Page X]` or `[Slide X]` patterns
- Replaces citations with `PageCitation` components
- Handles multiple citations: `[Page 5, 6, 7]` → 3 separate badges

**Parsing Logic**:
```javascript
const citationPattern = /\[(Page|Slide)\s+(\d+(?:\s*,\s*\d+)*)\]/gi;
```

Matches:
- `[Page 5]`
- `[Slide 10]`
- `[Page 5, 6, 7]`
- Case-insensitive

#### 3. **PDFViewer.jsx** (MODIFIED)
**Changes**:
- Converted to `forwardRef` to expose `scrollToPage` method
- Added `useImperativeHandle` to allow parent control
- Updated instructions text

**Exposed Method**:
```javascript
useImperativeHandle(ref, () => ({
  scrollToPage: (page) => {
    if (page >= 1 && page <= numPages) {
      setPageNumber(page);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }
}));
```

#### 4. **UniversalDocumentViewer.jsx** (MODIFIED)
**Changes**:
- Converted to `forwardRef`
- Forwards ref to `PDFViewer` for PDF/PPTX files
- Passes ref for both native PDFs and converted PPTX files

#### 5. **ChatInterface.jsx** (MODIFIED)
**Changes**:
- Added `documentViewerRef` using `useRef()`
- Created `handlePageClick` function
- Passes ref to `UniversalDocumentViewer`
- Passes `onPageClick` to all `Message` components

**Page Click Handler**:
```javascript
const handlePageClick = (pageNumber) => {
  if (documentViewerRef.current?.scrollToPage) {
    documentViewerRef.current.scrollToPage(pageNumber);
    toast.success(`Jumped to page ${pageNumber}`);
  }
};
```

## How It Works

### Flow Diagram:
```
User asks question
    ↓
Backend (GPT) generates response with [Page X] citations
    ↓
Frontend receives "The program is 4 years [Page 4]."
    ↓
Message.jsx parses text and finds [Page 4]
    ↓
Replaces [Page 4] with <PageCitation pageNumber={4} onClick={handlePageClick} />
    ↓
User clicks page badge
    ↓
handlePageClick(4) called in ChatInterface
    ↓
documentViewerRef.current.scrollToPage(4)
    ↓
PDFViewer setPageNumber(4) + smooth scroll
    ↓
PDF jumps to page 4 ✅
```

## Example Responses

### Before:
```
The official length of the programme is 4 years.

📄 Page 4
```

### After:
```
The official length of the programme is 4 years [Page 4].
   (with clickable badge)
```

### Multiple Citations:
```
Students must complete foundational courses in mathematics,
programming, and systems engineering [Page 12, 14, 15].
   (3 clickable badges)
```

## Styling Match with ChatPDF

### ChatPDF Badge:
```html
<span class="inline-flex items-center reference-bubble rounded-full
  cursor-pointer text-text-secondary bg-surface-secondary
  ps-1 pe-1.5 h-4 text-xs font-medium">
  <svg>arrow-up-right</svg>4
</span>
```

### Our Implementation:
```jsx
<span className="inline-flex items-center rounded-full cursor-pointer
  text-gray-600 bg-gray-200 ps-1 pe-1.5 h-4 text-xs font-medium
  hover:bg-gray-300 transition-colors">
  <ArrowUpRight className="size-3" />
  {pageNumber}
</span>
```

**Visual Match**: ✅ Near-identical styling

## User Experience Improvements

### 1. Natural Reading Flow
- Citations at end of sentences
- Non-intrusive design
- Clear visual indication

### 2. Quick Navigation
- One click to jump to source
- No manual page searching
- Toast confirmation for feedback

### 3. Accessibility
- Keyboard navigation (Tab + Enter)
- Hover tooltips
- Screen reader friendly

### 4. Multi-Page Support
- Multiple page references parsed correctly
- Each page gets its own clickable badge
- Clean comma separation

## Testing Checklist

- [x] Single page citation: `[Page 5]`
- [x] Multiple pages: `[Page 5, 6, 7]`
- [x] Slide references: `[Slide 10]`
- [x] Mixed case: `[page 5]` (case-insensitive)
- [x] Click handler triggers page scroll
- [x] Toast notification appears
- [x] Hover effect works
- [x] Keyboard navigation (Tab/Enter)
- [x] Works with PDF files
- [x] Works with converted PPTX files

## Edge Cases Handled

### 1. Invalid Page Numbers
```javascript
if (page >= 1 && page <= (numPages || 1)) {
  // Only scroll if valid
}
```

### 2. Non-PDF Documents
- Only PDFs/PPTX expose `scrollToPage`
- Other formats silently ignore clicks
- No errors thrown

### 3. Old Messages (Before Update)
- Fallback to old `pageReference` display
- Gradual migration as new messages arrive

### 4. Turkish/Multiple Languages
- Citation pattern is language-agnostic
- Works with "Page" or "Slide" keywords only

## Performance Considerations

- ✅ **Regex parsing**: Efficient, runs only once per message
- ✅ **Ref forwarding**: No extra renders
- ✅ **Smooth scrolling**: Native browser behavior
- ✅ **Memoization**: Components don't re-render unnecessarily

## Future Enhancements

### 1. Text Highlighting
- Highlight the exact sentence on the page
- Use TextLayer API from react-pdf
- Scroll to specific text, not just page top

### 2. Citation Context Preview
- Hover over badge → show preview of that page section
- Small popup with text snippet
- Similar to footnote preview

### 3. Citation Analytics
- Track which pages users click most
- Identify popular sections
- Improve retrieval ranking

### 4. Multiple Page Navigation
- Click `[Page 5, 6, 7]` → open page range view
- Side-by-side page comparison
- Tabbed navigation between cited pages

## Summary

✅ **Complete Implementation** of ChatPDF-style clickable page citations
✅ **Backend + Frontend** fully integrated
✅ **Production Ready** with error handling and accessibility
✅ **User Experience** matches industry standard (ChatPDF)

**Impact**:
- Users can verify sources instantly
- Improved trust in AI responses
- Better document navigation
- Professional, polished interface
