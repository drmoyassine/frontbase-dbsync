# Manual Testing Guide - Phase 1 DnD Migration

## 🎯 Purpose
Since automated browser testing is blocked (CDP connection issue), this guide provides step-by-step instructions for manual testing of the @dnd-kit migration.

---

## ✅ Pre-Testing Checklist

1. **Ensure dev server is running:**
   ```bash
   npm run dev
   # Should show: ➜  Local:   http://localhost:5173/
   ```

2. **Clear browser cache:**
   - Press `Ctrl+Shift+Delete` (or `Cmd+Shift+Delete` on Mac)
   - Clear cached images and files
   - This ensures you're testing the new code

3. **Open Developer Console:**
   - Press `F12` or right-click → Inspect
   - Go to Console tab
   - Keep this open to watch for errors

---

## 📋 **TEST 1: Component Palette Drag**

### Steps:
1. Navigate to `http://localhost:5173/pages`
2. Click on any existing page (or create a new one)
3. Builder should load with three panels:
   - Left: Component Palette
   - Center: Canvas
   - Right: Properties

### What to Test:
- [ ] **Hover over components** in the palette
  - ✅ **Expected:** Cursor changes to `grab` pointer
  - ❌ **If fails:** Check console for import errors

- [ ] **Click and drag a "Button" component**
  - ✅ **Expected:** 
    - Component becomes semi-transparent (opacity: 0.5)
    - You see a floating overlay with "Button" text
    - Cursor changes to `grabbing`
  - ❌ **If fails:** DragOverlay not working, check console

- [ ] **Drag over the canvas**
  - ✅ **Expected:** Canvas shows drop indicator (border change)
  - ❌ **If fails:** useDroppable not configured correctly

- [ ] **Release on canvas**
  - ✅ **Expected:** 
    - Button component appears on canvas
    - Properties panel shows "Button" properties
    - Component is auto-selected (has outline)
  - ❌ **If fails:** handleDragEnd not firing, check console

### Screenshot Locations:
- `before_drag.png` - Component palette before dragging
- `during_drag.png` - Showing drag overlay
- `after_drop.png` - Component on canvas

---

## 📋 **TEST 2: Component Reordering**

### Steps:
1. Add 3 components to canvas (e.g., Button, Text, Heading)
2. Try to reorder them

### What to Test:
- [ ] **Click and drag an existing component**
  - ✅ **Expected:**
    - Component becomes semi-transparent
    - Smooth CSS transform animation (no jank)
    - Other components shift to make space
  - ❌ **If fails:** useSortable not working

- [ ] **Drop in new position**
  - ✅ **Expected:**
    - Component moves to new position
    - Order updates correctly
    - Smooth animation on drop
  - ❌ **If fails:** Check handleDragEnd in CustomBuilder

---

## 📋 **TEST 3: Keyboard Navigation** (ACCESSIBILITY)

### Steps:
1. Make sure focus is on the browser window
2. Use keyboard only (no mouse)

### What to Test:
- [ ] **Tab to component palette**
  - Press `Tab` until a component is focused
  - ✅ **Expected:** Component has focus outline

- [ ] **Activate drag with keyboard**
  - Press `Space` or `Enter` on focused component
  - ✅ **Expected:** Component "picks up" (keyboard drag mode)
  - ❌ **If fails:** KeyboardSensor not configured

- [ ] **Navigate with arrow keys**
  - Use arrow keys to move the dragged component
  - ✅ **Expected:** Component moves smoothly
  - ❌ **If fails:** sortableKeyboardCoordinates issue

- [ ] **Drop with keyboard**
  - Press `Space` or `Enter` again to drop
  - ✅ **Expected:** Component drops at new position
  - ❌ **If fails:** Keyboard drop not handled

---

## 📋 **TEST 4: Touch Support** (If on touch device)

### Steps:
1. Use a tablet or enable touch simulation:
   - Chrome DevTools → Toggle device toolbar
   - Select a tablet device

### What to Test:
- [ ] **Touch and hold component**
  - ✅ **Expected:** Drag initiates after 500ms
  - ❌ **If fails:** PointerSensor delay issue

- [ ] **Drag with touch**
  - ✅ **Expected:** Smooth tracking of finger
  - ❌ **If fails:** Touch events not captured

- [ ] **Release to drop**
  - ✅ **Expected:** Component drops at touch point
  - ❌ **If fails:** Touch drop not working

---

## 📋 **TEST 5: Container Components**

### Steps:
1. Add a "Container" component to canvas
2. Try to drop components inside it

### What to Test:
- [ ] **Drag component over container**
  - ✅ **Expected:** Container highlights (ring effect)
  - ❌ **If fails:** useDroppable on container not working

- [ ] **Drop inside container**
  - ✅ **Expected:**
    - Component becomes child of container
    - Indented in layers panel (if you check)
  - ❌ **If fails:** Container drop logic broken

---

## 📋 **TEST 6: Performance & Animations**

### What to Test:
- [ ] **Drag smoothness**
  - ✅ **Expected:** 60fps smooth dragging (no stuttering)
  - ❌ **If fails:** CSS transform not applied correctly

- [ ] **Drop animation**
  - ✅ **Expected:** Smooth settle animation when dropping
  - ❌ **If fails:** transition property missing

- [ ] **No layout thrashing**
  - Open Performance tab in DevTools
  - Start recording
  - Drag a component
  - Stop recording
  - ✅ **Expected:** Minimal layout/reflow events
  - ❌ **If fails:** Position-based dragging (old method)

---

## 📋 **TEST 7: Console Errors**

### What to Check:
- [ ] **No errors in console**
  - ✅ **Expected:** Clean console log (or only expected logs)
  - ❌ **If you see:**
    - `Cannot find module '@dnd-kit/*'` → Installation issue
    - `addComponent is not a function` → Store issue
    - `TypeError: drag is not a function` → Import issue
    - `Warning: Failed prop type` → TypeScript issue

### Common Errors & Fixes:
| Error | Fix |
|-------|-----|
| `@dnd-kit/core not found` | Run `npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities` |
| `Cannot read property 'type'` | Check `active.data.current?.type` has fallback |
| `moveComponent is not a function` | Verify it's imported from useBuilderStore |
| Drag not working | Check DndContext wraps entire builder |

---

## 📋 **TEST 8: Comparison with db-sync**

### Steps:
1. Open db-sync data preview page
2. Try column reordering there
3. Compare with builder drag

### What to Compare:
- [ ] **Visual feedback**
  - ✅ Both should have drag overlays
  - ✅ Both should use CSS transforms

- [ ] **Performance**
  - ✅ Both should be equally smooth
  - ❌ If builder is slower, there's an issue

- [ ] **Patterns**
  - ✅ Both should use `@dnd-kit`
  - ✅ Code structure should be similar

---

## 🚨 **Critical Issues to Watch For**

### 1. **No Drag Happening**
**Symptoms:** Click and drag does nothing
**Likely Cause:**
- DndContext not wrapping components
- useDraggable not configured
- listeners not spread on element

**How to Check:**
```javascript
// In browser console:
window.__DND_KIT__?.registry
// Should show registered draggable items
```

### 2. **Drop Not Working**
**Symptoms:** Can drag but cannot drop
**Likely Cause:**
- useDroppable not configured
- Drop zone ID mismatch
- handleDragEnd not implemented

**How to Check:**
- Look for `canvas-drop-zone` in React DevTools
- Check if over.id matches

### 3. **Performance Issues**
**Symptoms:** Dragging is laggy
**Likely Cause:**
- CSS transform not applied
- Using position instead of transform
- Re-renders during drag

**How to Check:**
- Open Performance tab
- Record during drag
- Look for layout thrashing

---

## ✅ **Success Criteria**

All tests pass if:
- [ ] ✅ Can drag components from palette to canvas
- [ ] ✅ Can reorder components on canvas
- [ ] ✅ Keyboard navigation works (Tab + Space)
- [ ] ✅ Touch drag works (on touch device)
- [ ] ✅ Drag overlay shows during drag
- [ ] ✅ Animations are smooth (60fps)
- [ ] ✅ No console errors
- [ ] ✅ Containers accept child components
- [ ] ✅ Performance matches db-sync

---

## 📸 **Screenshot Checklist**

Take these screenshots as proof of testing:
1. **Component palette** - showing all components
2. **Drag in progress** - showing drag overlay
3. **Component on canvas** - after successful drop
4. **Multiple components** - showing layout
5. **Console log** - showing no errors
6. **DevTools performance** - showing smooth dragging

---

## 📝 **Bug Report Template**

If you find issues, report using this format:

```markdown
### Bug: [Short Description]

**Test:** [Which test above]
**Expected:** [What should happen]
**Actual:** [What actually happened]

**Steps to Reproduce:**
1. [Step 1]
2. [Step 2]
3. [etc.]

**Console Error:**
```[paste error here]```

**Screenshot:**
[attach screenshot]

**Browser:** Chrome/Firefox/Safari [version]
**OS:** Windows/Mac/Linux
```

---

## 🎉 **After Testing**

Once all tests pass:
1. ✅ Mark Phase 1 as **VERIFIED**
2. ✅ Update `PHASE_1_COMPLETE_SUMMARY.md`
3. ✅ Ready to proceed to **Phase 2** (Visual Enhancements)

---

**Happy Testing! 🚀**
