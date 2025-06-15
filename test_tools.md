# PDFX-XBlock Annotation Tools Testing Guide

## Overview

This guide provides comprehensive testing procedures for the PDFX-XBlock annotation system with enhanced periodic saving. The system now includes:

- **Enhanced Periodic Saving**: Faster saves when tools are active (2s vs 5s)
- **Tool Activity Detection**: Automatic detection of tool usage
- **Improved Data Persistence**: Better handling of user/block/page isolation
- **Deletion Support**: Proper handling of annotation deletions

## Quick Test Checklist

### 1. Basic Tool Activation Testing

**Test Procedure:**
1. Open a PDF in the PDFX-XBlock
2. Click the tools button (🔧) in the main toolbar
3. Verify secondary toolbar appears on the left
4. Test each tool button:
   - **Highlight Tool** (highlighter icon)
   - **Scribble Tool** (pencil icon)
   - **Text Tool** (font icon)
   - **Stamp Tool** (camera icon)

**Expected Results:**
- Each tool button should become active (blue background)
- Parameter toolbar should appear for each tool
- Console should show: `[AnnotationStorage] Tool activated - switching to enhanced periodic saving`

### 2. Enhanced Periodic Saving Testing

**Test Procedure:**
1. Activate any annotation tool
2. Create several annotations quickly
3. Monitor browser console for save messages
4. Wait 30 seconds without tool activity
5. Check console for activity detection

**Expected Console Output:**
```
[AnnotationStorage] Tool activated - switching to enhanced periodic saving
[AnnotationStorage] Auto-save started with 2000ms interval (tool active: true)
[AnnotationStorage] Auto-save triggered (ACTIVE): 3 saves, 0 deletions
[AnnotationStorage] Saving data to server for user: student123, block: block-v1:...
[AnnotationStorage] Successfully saved annotations for highlight
[AnnotationStorage] Tool inactive for 30000ms - switching to normal saving
[AnnotationStorage] Auto-save started with 5000ms interval (tool active: false)
```

### 3. Annotation Persistence Testing

**Test Procedure:**
1. Create annotations with different tools:
   - Highlight some text
   - Draw with scribble tool
   - Add text annotation
   - Place stamp image
2. Navigate to different pages
3. Refresh the browser
4. Verify all annotations are restored

**Expected Results:**
- All annotations should persist across page changes
- All annotations should be restored after browser refresh
- Annotations should be isolated by user, block, and page

### 4. User Isolation Testing

**Test Procedure:**
1. Create annotations as User A
2. Switch to User B account (or use incognito mode)
3. Open the same PDF
4. Verify User A's annotations are not visible
5. Create annotations as User B
6. Switch back to User A
7. Verify only User A's annotations are visible

**Expected Results:**
- Complete isolation between users
- No cross-contamination of annotation data

### 5. Tool-Specific Testing

#### Highlight Tool
1. Click highlight tool button
2. Select text on PDF
3. Choose different colors from parameter toolbar
4. Verify highlights appear immediately
5. Check console for save messages

#### Scribble Tool
1. Click scribble tool button
2. Draw on PDF with mouse/touch
3. Adjust color and thickness in parameter toolbar
4. Verify strokes appear in real-time
5. Check console for save messages

#### Text Tool
1. Click text tool button
2. Click on PDF to place text
3. Type text in editor
4. Adjust color and font size
5. Click save or press Enter
6. Verify text annotation appears

#### Stamp Tool
1. Click stamp tool button
2. Click "Add Image" in parameter toolbar
3. Select image file
4. Click on PDF to place stamp
5. Verify stamp appears and can be resized

### 6. Clear All Testing

**Test Procedure:**
1. Create multiple annotations of different types
2. Click "Clear All" button
3. Confirm deletion in dialog
4. Verify all annotations are removed
5. Check console for deletion messages

**Expected Console Output:**
```
[AnnotationStorage] Cleared 5 annotations for user: student123
[AnnotationStorage] Auto-save triggered (ACTIVE): 0 saves, 5 deletions
[AnnotationStorage] Successfully saved annotations for
```

## Advanced Testing

### 7. Network Error Handling

**Test Procedure:**
1. Open browser developer tools
2. Go to Network tab
3. Set network to "Offline"
4. Create annotations
5. Restore network connection
6. Verify annotations are saved when connection returns

### 8. Concurrent User Testing

**Test Procedure:**
1. Open same PDF in multiple browser tabs/windows
2. Use different user accounts
3. Create annotations simultaneously
4. Verify no data conflicts or overwrites

### 9. Page Navigation Testing

**Test Procedure:**
1. Create annotations on page 1
2. Navigate to page 2
3. Create different annotations
4. Navigate back to page 1
5. Verify page 1 annotations are still there
6. Check console for force save before page change

**Expected Console Output:**
```
[ToolManager] Force saving 2 pending annotations before page change
[AnnotationStorage] Force save requested
[ToolManager] Page changed from 1 to 2
```

### 10. Performance Testing

**Test Procedure:**
1. Create 50+ annotations rapidly
2. Monitor console for save batching
3. Navigate between pages
4. Verify responsive performance

## Troubleshooting

### Common Issues

**1. Tools not activating:**
- Check console for JavaScript errors
- Verify PDF is fully loaded
- Ensure `allow_annotation` is enabled

**2. Annotations not saving:**
- Check network tab for failed requests
- Verify handler URL is correct
- Check server logs for backend errors

**3. Annotations not loading:**
- Check user context in console logs
- Verify block ID consistency
- Check XBlock field data

**4. Periodic saving not working:**
- Verify tool activation messages in console
- Check auto-save timer messages
- Ensure storage manager is initialized

### Console Debugging Commands

```javascript
// Check storage manager status
window.pdfxViewer_[BLOCK_ID].storageManager.getCacheStatistics()

// Force save pending annotations
window.pdfxViewer_[BLOCK_ID].storageManager.forceSave()

// Check tool manager status
window.pdfxViewer_[BLOCK_ID].toolManager.getActiveTool()

// Get all annotations
window.pdfxViewer_[BLOCK_ID].storageManager.getAllAnnotations()
```

## Expected File Structure

```
pdfx/
├── static/js/src/
│   ├── storage/
│   │   └── AnnotationStorage.js (Enhanced with periodic saving)
│   ├── tools/
│   │   ├── ToolManager.js (Enhanced with tool activity tracking)
│   │   ├── highlight/HighlightTool.js
│   │   ├── scribble/ScribbleTool.js
│   │   ├── text/TextTool.js
│   │   └── stamp/StampTool.js
│   └── ...
├── pdfx.py (Enhanced save_annotations handler)
└── static/html/pdfx.html (Secondary toolbar structure)
```

## Success Criteria

✅ **Tool Activation**: All 4 tools activate properly with UI feedback
✅ **Enhanced Periodic Saving**: 2-second saves when tools active, 5-second when idle
✅ **Activity Detection**: Automatic detection of tool inactivity after 30 seconds
✅ **Annotation Persistence**: All annotations save and restore correctly
✅ **User Isolation**: Complete separation of user data
✅ **Block Isolation**: No interference between multiple PDF blocks
✅ **Page Isolation**: Annotations properly organized by page
✅ **Deletion Support**: Clear all and individual deletions work
✅ **Error Handling**: Graceful handling of network and validation errors
✅ **Performance**: Responsive UI with efficient batching

## Production Readiness

The enhanced annotation system is now production-ready with:

- **Robust Periodic Saving**: Intelligent save intervals based on tool activity
- **Comprehensive Error Handling**: Network failures, validation errors, retry mechanisms
- **Data Integrity**: User/block/page isolation with proper validation
- **Performance Optimization**: Efficient batching and caching
- **Detailed Logging**: Comprehensive console output for debugging

The system automatically handles all annotation persistence without user intervention while providing enhanced responsiveness when annotation tools are actively being used.