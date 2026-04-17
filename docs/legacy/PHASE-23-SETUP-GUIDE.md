# Phase 23 Setup Guide

## 🚀 Quick Test Guide

### **No Database Changes Required!**
All changes are frontend-only. Just test the features.

---

## 🧪 Test Plan

### **Test 1: Autocomplete Bug Fix** ✅
**What to test:** Suggestions now appear properly

1. Open app → Home tab
2. Tap ActionDock → Opens Trip Planner
3. Tap "Where to?" field
4. Start typing: "San Francisco"
5. **✅ Expected:** Suggestions appear IN FRONT of everything
6. Select a suggestion
7. **✅ Expected:** List disappears, destination is set

**Before Phase 23:** ❌ List hidden behind other UI  
**After Phase 23:** ✅ List always on top (Z-index 9998-10000)

---

### **Test 2: Persistent Route UI** ✅
**What to test:** Inputs stay visible and editable

#### **Part A: Destination Persistence**
1. Set destination (e.g., "Office")
2. **✅ Expected:** Input field stays visible (doesn't collapse)
3. Tap destination field again
4. **✅ Expected:** Can type new address
5. Tap X button on right side
6. **✅ Expected:** Destination clears

#### **Part B: Waypoint Flow**
1. Tap "+ Add Stop" button
2. **✅ Expected:** Yellow "Via" input appears
3. **✅ Expected:** Timeline connector adds yellow dot
4. Enter location (e.g., "School")
5. **✅ Expected:** Yellow marker on map
6. Tap X button on Via field
7. **✅ Expected:** Waypoint removed, connector shortens

---

### **Test 3: Dark Mode** 🌙
**What to test:** Map adapts to system theme

#### **iOS:**
1. Settings → Display & Brightness → **Dark**
2. Open Clyzio app
3. Look at map
4. **✅ Expected:** Dark roads, dark water, dark labels
5. Switch back to Light mode
6. **✅ Expected:** Normal (light) map

#### **Android:**
1. Settings → Display → **Dark theme**
2. Open Clyzio app
3. **✅ Expected:** Dark map style
4. Toggle back to Light
5. **✅ Expected:** Light map

---

## 📋 Acceptance Criteria

```
[ ] Autocomplete suggestions visible above all UI
[ ] Can type in destination after setting it
[ ] Clear button (X) works on destination
[ ] "+ Add Stop" shows Via input
[ ] Via input has yellow theme
[ ] Yellow dot in timeline connector
[ ] Yellow marker appears on map
[ ] Via can be removed with X button
[ ] Dark mode: Map turns dark when system theme is dark
[ ] Dark mode: Map returns to light when system theme is light
```

---

## 🎨 **UI Comparison**

### **Autocomplete (Before → After)**
```
BEFORE:
┌─────────────────────┐
│ To: [San F...]      │ ← Typing
└─────────────────────┘
     [Hidden list] ❌    ← Behind other UI

AFTER:
┌─────────────────────┐
│ To: [San F...]      │
├─────────────────────┤
│ San Francisco, CA   │ ← Visible!
│ San Francisco Intl  │
│ San Francisco Zoo   │
└─────────────────────┘
```

### **Persistent Inputs (Before → After)**
```
BEFORE:
1. Set destination
2. Input field disappears ❌
3. Can't change it

AFTER:
1. Set destination
2. Input stays visible ✅
3. Tap to edit ✅
4. X button to clear ✅
```

### **Dark Map (Before → After)**
```
BEFORE:
🌙 Dark environment
   Bright white map ❌ (blindingly bright)

AFTER:
🌙 Dark environment
   Dark map ✅ (easy on eyes)
   - Dark roads: #2c2c2c
   - Dark water: #000000
   - Dark labels: #757575
```

---

## 🐛 **Troubleshooting**

### **Issue: Suggestions still not showing**
**Possible Causes:**
1. Keyboard covering them
2. ScrollView scrolled down

**Fix:**
1. Tap input → keyboard appears
2. Scroll to top of modal
3. Type address
4. Suggestions should appear

---

### **Issue: Dark mode not working**
**Check:**
1. **System theme:** Settings → Display → Dark mode ON
2. **App restart:** Close app completely, reopen
3. **iOS/Android version:** Dark mode requires iOS 13+ / Android 10+

**Verify dark mode is active:**
```typescript
console.log(useColorScheme()); // Should log 'dark'
```

---

### **Issue: Can't edit destination after setting**
**This is now FIXED in Phase 23**
- Inputs are now persistent
- Just tap the field to change it
- No need to close/reopen modal

---

## 💡 **Pro Tips**

### **Tip 1: Quick Destination Change**
Instead of clearing + retyping:
1. Tap destination field
2. Type new address
3. Select from suggestions
4. Old destination auto-replaced ✅

### **Tip 2: Remove Waypoint Quickly**
Don't need to open it:
1. See Via field
2. Tap X button → removed instantly

### **Tip 3: Test Dark Mode Easily**
**iOS:** Control Center → Brightness → Long-press → Toggle Appearance  
**Android:** Quick Settings → Dark mode toggle

---

## 🔍 **What to Look For**

### **Good Signs (Working):**
- ✅ Suggestions appear immediately when typing
- ✅ Suggestions in front of everything
- ✅ Can tap destination field after it's filled
- ✅ X button appears when field has value
- ✅ Map is dark when system theme is dark
- ✅ Timeline connector has 3 dots when waypoint added

### **Bad Signs (Broken):**
- ❌ Suggestions hidden/not visible
- ❌ Can't edit destination after selecting
- ❌ X button doesn't appear
- ❌ Map stays bright in dark mode
- ❌ Waypoint doesn't show yellow dot

---

## 📱 **Device Compatibility**

### **Minimum Requirements:**
- **iOS:** 13.0+ (for Dark Mode API)
- **Android:** 10.0+ (API 29) (for Dark Mode)

### **Tested On:**
- ✅ iOS 16.0+ (Simulator + Real device)
- ✅ Android 12+ (Emulator)

### **Known Issues:**
- **iOS 12 and below:** Dark mode won't work (API not available)
- **Android 9 and below:** Dark mode won't work

---

## 🎉 **Phase 23 Complete!**

All features are ready to test. No setup required. Just open the app and try the new features! 🚗💨🌱🌙

