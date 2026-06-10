# Operon — Complete Visual Inventory Report

**Analysis Date:** June 6, 2026  
**Scope:** Full application UI audit - all pages, components, sections, modals  
**Purpose:** Establish baseline for premium design system application

---

## Summary of Findings

- **Total Sections Identified:** 9 major sections
- **Total Components Identified:** 45+ distinct UI elements
- **Current Design Consistency:** 4.2/10 (inconsistent)
- **Visual Debt:** HIGH
- **Critical Issues:** Visual clutter, spacing inconsistencies, typography hierarchy issues, redundant text

---

# COMPLETE VISUAL INVENTORY

## 1. GLOBAL LAYOUT

### 1.1 App Shell
**Component Name:** App Root Container  
**File Path:** `src/app/page.tsx`, `src/app/layout.tsx`  
**Purpose:** Core application wrapper and layout structure  
**Visual Importance:** CRITICAL

**Current Layout Structure:**
- 100vh full viewport
- Grid: 240px sidebar + 1fr main content
- Responsive: Hidden sidebar on mobile, visible on desktop
- Backdrop overlay for mobile navigation
- Search modal overlay (z-50)

**Current Styling Approach:**
- Tailwind + custom CSS
- Class: `min-h-screen bg-black text-white`
- Inline media queries with Tailwind

**Current Typography:**
- Display font: Satoshi (54px on headers)
- Body font: Inter (16px base)
- No consistent hierarchy

**Current Colors:**
- Background: `#060606` (CSS var: `--color-bg-base`)
- White text: `#ffffff`
- Borders: `rgba(255, 255, 255, 0.1)`
- No semantic color usage

**Current Spacing:**
- `gap-8` between sections (32px)
- `px-4 md:px-8` horizontal padding
- `py-4` vertical padding
- Inconsistent margins

**Current Border Radius:**
- Primary: `rounded-2xl` (14px)
- Secondary: `rounded-3xl` (28px)
- Cards: `rounded-xl` (14px)
- Mix of radiuses throughout

**Current Hover States:**
- Scale 1.02 on buttons
- Border color change on cards
- `transition-all duration-250`

**Current Active States:**
- Scale 0.98 on tap
- Background opacity change
- Border color emphasis

**Current Animations:**
- Page transitions: fade + slide (350ms)
- Component entrance: stagger (0.05s between items)
- Hover scale: smooth spring easing
- Modal: scale + fade simultaneous

**Current Responsive Behavior:**
- Desktop: 240px sidebar always visible
- Tablet: Grid layout adapts
- Mobile: Sidebar hidden, hamburger menu shown

**Current Problems:**
- ❌ "OPERON" text repeated in header (redundant branding)
- ❌ Page header shows section name + "OPERON" together
- ❌ Mobile navigation button labeled "Menu" (unnecessary)
- ❌ No clear visual distinction between sections
- ❌ Search modal too wide on desktop
- ❌ Alert banner feels disconnected
- ❌ Too much whitespace in some areas, cramped in others

**Visual Score:** 5/10 | **UX Score:** 6/10 | **Consistency Score:** 4/10

---

### 1.2 Sidebar Navigation
**Component Name:** Sidebar  
**File Path:** `src/components/Sidebar.tsx`  
**Purpose:** Primary navigation anchor and user context  
**Visual Importance:** CRITICAL

**Current Layout Structure:**
- Fixed 240px width
- Vertical flex layout
- Header section (40px)
- Navigation section (flex: 1)
- Footer section (user profile)
- All sections divided by borders

**Current Styling Approach:**
- Glass morphism: `glass-card` class with transparency
- Border: `border-white/8`
- Rounded corners: `rounded-2xl`
- Motion: Framer Motion with stagger animation

**Current Typography:**
- Title: "Operon" in display font, 16px
- Subtitle: "Workspace" in secondary text
- Nav items: Inter, 14px
- User name: semibold, 14px
- User role: secondary, 12px

**Current Colors:**
- Background: `var(--color-bg-surface)` (#111111)
- Text: Primary white, secondary 60% opacity
- Active: Emphasized with higher opacity
- Borders: `white/8` (10% opacity)

**Current Spacing:**
- Header padding: `p-6`
- Navigation gap: `gap-3` between items
- Item padding: `px-4 py-2`
- Footer spacing: `p-4`
- Inconsistent vertical rhythm

**Current Border Radius:**
- Container: `rounded-2xl`
- Nav items: `rounded-full`
- Avatar: `rounded-full`

**Current Hover States:**
- Scale 1.05 on nav items
- Text color to primary
- Background opacity increase
- No visible feedback

**Current Active States:**
- Active indicator: green bar on left
- Text color change
- Smooth animated indicator (`layoutId="sidebar-indicator"`)

**Current Animations:**
- Initial load: fade in + slide from left
- Nav items: staggered entrance (0.05s delay)
- Hover: scale 1.02
- Active indicator: layout animation

**Current Responsive Behavior:**
- Hidden on mobile (xl: breakpoint)
- Absolute positioning on mobile overlay
- Full height on mobile when open

**Current Problems:**
- ❌ Sidebar header redundantly shows "O" logo + "Operon" title + "Workspace" subtitle (cluttered)
- ❌ Navigation icons are emoji (unprofessional)
- ❌ Active state indicator not visually obvious enough
- ❌ Spacing between nav items feels cramped
- ❌ User section at bottom feels disconnected
- ❌ "Workspace" subtitle doesn't add value
- ❌ No visual hierarchy between sections

**Visual Score:** 4/10 | **UX Score:** 5/10 | **Consistency Score:** 3/10

---

### 1.3 Main Header
**Component Name:** Top Header Bar  
**File Path:** `src/app/page.tsx` (lines 820-860)  
**Purpose:** Section indicator, search trigger, and logout  
**Visual Importance:** HIGH

**Current Layout Structure:**
- Horizontal flex layout
- Left side: Menu button (mobile) + section breadcrumb
- Right side: Search button + Logout button
- Contained in `glass-card` with padding

**Current Styling Approach:**
- `glass-card border-white/8 p-5 rounded-2xl`
- Buttons: individual `glass-card` containers
- Flex justify-between

**Current Typography:**
- Section name: "Documents" uppercase, 10px, secondary text
- Page title: "OPERON" in display font, 24px
- Button labels: Inter, 14px, semibold

**Current Colors:**
- Background: Glass effect with subtle opacity
- Text: Primary white for title, secondary for label
- Button borders: `white/8`
- Hover state: `white/15`

**Current Spacing:**
- Container padding: `p-5`
- Gap between left/right: `gap-4`
- Button gap: `gap-3` inside buttons
- Menu button: `h-11 w-11`

**Current Border Radius:**
- Container: `rounded-2xl`
- Buttons: `rounded-full`
- Search kbd: `rounded-md`

**Current Hover States:**
- Buttons scale 1.02
- Border opacity increase to `white/15`

**Current Active States:**
- Buttons scale 0.98 on tap

**Current Animations:**
- Header entrance: fade in + slide from top (350ms)
- Button interactions: scale animation

**Current Responsive Behavior:**
- Menu button shown on mobile (`xl:hidden`)
- Search button hidden on mobile (`sm:flex`)
- Full width on mobile, controlled width on desktop

**Current Problems:**
- ❌ "OPERON" appears here AND in sidebar (redundant branding)
- ❌ Section name ("Documents") is hard to scan
- ❌ Keyboard shortcut "⌘K" shown but only works on Mac
- ❌ Search button takes up significant space
- ❌ "Menu" button label on mobile is unnecessary
- ❌ No distinction between this header and other sections
- ❌ Logout button design same as other buttons (not visually distinct)

**Visual Score:** 5/10 | **UX Score:** 5/10 | **Consistency Score:** 5/10

---

## 2. AUTHENTICATION LAYER

### 2.1 Role Selector (MVP Access Mode)
**Component Name:** MVPAccessMode  
**File Path:** `src/features/auth/MVPAccessMode.tsx`  
**Purpose:** Role selection on first login  
**Visual Importance:** CRITICAL

**Current Layout Structure:**
- Centered full viewport layout
- Hero background with gradient
- Header section: Logo + Title + Subtitle
- Grid layout: 3 columns (responsive)
- 7 role cards in grid
- Keyboard navigation support

**Current Styling Approach:**
- Container: `flex min-h-screen items-center justify-center px-8 py-12`
- Max width: `max-w-4xl`
- Cards: Individual `card` class
- Framer Motion with stagger

**Current Typography:**
- Title: "Operon" 54px, display font
- Subtitle: "Select your workspace role" 16px
- Card title: 18px semibold
- Card description: 14px secondary

**Current Colors:**
- Background: Base color (#060606)
- Card background: Elevated (light gray)
- Text: Primary white
- Borders: `white/8`
- Hover: `white/15`

**Current Spacing:**
- Container max-width: `max-w-4xl`
- Header bottom margin: `mb-20`
- Card padding: Varies
- Grid gap: `gap-4`
- Button padding: Varies

**Current Border Radius:**
- Logo circle: No specific radius
- Card corners: `rounded-lg`
- Overall: Inconsistent

**Current Hover States:**
- Card scale 1.05
- Border opacity increase
- Background opacity change

**Current Active States:**
- Selected card: Checkmark indicator
- Card scale change
- Background fill

**Current Animations:**
- Container: stagger children
- Header elements: rotate in (logo), fade in (text)
- Cards: fade + slide up
- Selection: scale animation

**Current Responsive Behavior:**
- Grid: 3 columns → 2 → 1 based on screen size
- Keyboard navigation: arrow keys work
- Touch friendly spacing

**Current Problems:**
- ❌ Card layout shows: Role name + Full description + Access details
- ❌ Card descriptions are redundant (e.g., "Full platform access")
- ❌ 3-column grid looks empty with only 7 items
- ❌ No indication of which role is selected
- ❌ "Select your workspace role" text could be removed (obvious from context)
- ❌ Checkmark indicator placement is unclear
- ❌ Each card takes too much vertical space
- ❌ No visual grouping of similar roles

**Visual Score:** 5/10 | **UX Score:** 6/10 | **Consistency Score:** 4/10

---

## 3. DOCUMENT MANAGEMENT

### 3.1 Document Library (Home)
**Component Name:** HomePanel  
**File Path:** `src/features/dashboard/HomePanel.tsx`  
**Purpose:** Dashboard overview with quick actions  
**Visual Importance:** HIGH

**Current Layout Structure:**
- Vertical stack of sections
- Welcome hero section
- Quick actions grid (4 columns)
- Recent documents section (8 items)
- Pinned documents (3 items)

**Current Styling Approach:**
- Sections use `glass-hero` and `glass-card` classes
- Gap between sections: `gap-8`
- Grid layouts with responsive columns
- Framer Motion with stagger

**Current Typography:**
- Welcome title: 48px display font
- Section subtitle: 16px secondary
- Item titles: 16px semibold
- Metadata: 12px, muted

**Current Colors:**
- Section backgrounds: Elevated surface
- Text: Primary and secondary hierarchy
- Borders: `white/10`
- Accents: Gold for important items

**Current Spacing:**
- Section padding: `p-8`
- Grid gaps: `gap-6`, `gap-4`
- Item padding: `p-5`, `p-6`
- Inconsistent margins

**Current Border Radius:**
- Sections: `rounded-2xl`
- Cards: `rounded-xl`
- Buttons: `rounded-full`

**Current Hover States:**
- Document cards scale 1.05
- Cards translate up (-4px)
- Border opacity changes

**Current Active States:**
- Click scale 0.98
- Selected item highlighted

**Current Animations:**
- Page load: stagger all sections
- Card entrance: fade + slide down
- Hover: smooth scale + translate

**Current Responsive Behavior:**
- Grid: 4 columns → 2 → 1
- Full width on mobile
- Sidebar pushes content on desktop

**Current Problems:**
- ❌ Welcome message "Welcome back, {firstName}" followed by "Your workspace overview"
- ❌ Quick actions title redundant
- ❌ Each action card has icon + title + description (too much text)
- ❌ Recent documents section feels separate from pinned
- ❌ "Preparing your documents…" message during loading
- ❌ Too many headers and labels
- ❌ Section grouping unclear

**Visual Score:** 5/10 | **UX Score:** 6/10 | **Consistency Score:** 4/10

---

### 3.2 Document Library (File Browser)
**Component Name:** Library Section  
**File Path:** `src/app/page.tsx` (lines 920-1090)  
**Purpose:** Browse, filter, and manage documents  
**Visual Importance:** CRITICAL

**Current Layout Structure:**
- Two-column layout: Main (1.4fr) + Sidebar (0.8fr)
- Main column:
  - Title + View toggle (grid/list)
  - Search + Dept filter
  - Pinned documents (3 cards)
  - Category tabs (7 filters)
  - Document grid/list
- Sidebar:
  - Upload form with multiple fields

**Current Styling Approach:**
- Container: `glass-card border-white/8 p-8 rounded-2xl`
- Grid view: `grid gap-4 sm:grid-cols-2 2xl:grid-cols-3`
- List view: `grid gap-4` (single column)
- Cards: `glass-card border-white/8 p-5`

**Current Typography:**
- Page title: "File Browser" 32px
- Section labels: "Documents" 10px uppercase
- Document title: 16px semibold
- Description: 14px secondary
- Metadata: 11px, muted

**Current Colors:**
- Active category: `glass-hero border-white/15`
- Inactive category: `glass-card border-white/8`
- Hover: `border-white/15`
- Tags: Secondary with borders

**Current Spacing:**
- Title section padding: varies
- Grid gap: 16px
- Card padding: 20px
- Tag padding: 10px
- Inconsistent spacing in lists

**Current Border Radius:**
- Cards: `rounded-xl`
- Categories: `rounded-full`
- Tags: `rounded-full`
- Search: `rounded-xl`

**Current Hover States:**
- Cards scale 1.02, translate up
- Border opacity change
- No visible change on category buttons

**Current Active States:**
- Active category: Different background
- Grid/list toggle: Button becomes filled

**Current Animations:**
- Content load: stagger sections
- Card entrance: fade + slide
- Hover: smooth scale + translate

**Current Responsive Behavior:**
- Two-column → single column on tablet
- Sidebar moves below on mobile
- Grid adjusts: 3 → 2 → 1 columns

**Current Problems:**
- ❌ "Documents" + "File Browser" title redundant
- ❌ Section shows "Documents" label + "File Browser" + "Upload documents" in sidebar
- ❌ Category buttons take up significant space (7 buttons × ~80px)
- ❌ View toggle (grid/list) doesn't have clear visual indication
- ❌ Tags on documents (Drive/Local/SOP) feel like metadata clutter
- ❌ Pinned documents section not clearly distinguished
- ❌ Search placeholder text too long
- ❌ Department filter dropdown unclear
- ❌ No indication of how many documents exist
- ❌ Empty state shows generic "No documents match your filters"
- ❌ Upload sidebar feels like separate concern

**Visual Score:** 4/10 | **UX Score:** 5/10 | **Consistency Score:** 3/10

---

### 3.3 Document Cards (Grid View)
**Component Name:** Document Grid Item  
**File Path:** `src/app/page.tsx` (lines 1055-1095)  
**Purpose:** Individual document representation  
**Visual Importance:** HIGH

**Current Layout Structure:**
- Grid: responsive columns (3, 2, or 1)
- Card: Vertical flex layout
  - Image placeholder (4:3 aspect ratio)
  - Title (single line)
  - Description (2 line clamp)
  - Tags/badges

**Current Styling Approach:**
- Card: `glass-card border-white/8 p-5 rounded-xl`
- Image: `h-28 w-full rounded-lg bg-gradient-to-br from-white/10 to-white/5`
- Motion: scale on hover, translate on click

**Current Typography:**
- Title: 16px semibold, truncated
- Description: 14px secondary, line-clamped to 2
- Tags: 11px, muted

**Current Colors:**
- Background: glass effect
- Text: Primary and secondary hierarchy
- Image placeholder: Gradient background
- Tags: Secondary with borders

**Current Spacing:**
- Card padding: 20px
- Image height: 28 units (~112px)
- Gap between sections: varies
- Tag gap: 8px

**Current Border Radius:**
- Card: 14px
- Image: 8px
- Tags: 100px (full)

**Current Hover States:**
- Scale 1.02
- Translate Y: -4px (up)
- Border opacity increase

**Current Active States:**
- Scale 0.98 on click

**Current Animations:**
- Entrance: fade + slide down
- Hover: smooth scale + translate
- Click: quick scale

**Current Responsive Behavior:**
- Image: full width in grid
- Responsive gaps
- Title truncation

**Current Problems:**
- ❌ Image placeholder adds no value
- ❌ Description shows for every document
- ❌ Tags like "Drive", "Local", "SOP" are metadata, not useful
- ❌ Card takes up too much vertical space
- ❌ Two-line description clamping feels restrictive
- ❌ No indication of file type
- ❌ No access indicator or owner info

**Visual Score:** 4/10 | **UX Score:** 5/10 | **Consistency Score:** 4/10

---

### 3.4 Document Cards (List View)
**Component Name:** Document List Item  
**File Path:** `src/app/page.tsx` (lines 1055-1095)  
**Purpose:** Horizontal document representation  
**Visual Importance:** MEDIUM

**Current Layout Structure:**
- Single column grid
- Horizontal flex layout:
  - Image thumbnail (16 units square or 28 units tall)
  - Content section:
    - Title
    - Description
  - Tags (right-aligned)

**Current Styling Approach:**
- Card: `glass-card border-white/8 p-4 rounded-xl`
- Layout: `flex gap-4 items-center`
- Image: `h-16 w-16 shrink-0` or `h-28 w-full`

**Current Typography:**
- Title: 16px semibold, truncated
- Description: 14px secondary, clamped to 2 lines
- Tags: 11px

**Current Colors:**
- Background: glass effect
- Text: Primary and secondary
- Image: Gradient placeholder
- Tags: Secondary with borders

**Current Spacing:**
- Card padding: 16px
- Content gap: 16px
- Title bottom margin: 8px (mt-2)

**Current Border Radius:**
- Card: 14px
- Image: 8px
- Tags: 100px

**Current Hover States:**
- Scale 1.02
- Translate Y: -4px
- Border opacity

**Current Active States:**
- Scale 0.98

**Current Animations:**
- Same as grid view

**Current Responsive Behavior:**
- Stacks vertically on mobile
- Image shrinks but doesn't disappear

**Current Problems:**
- ❌ Image placeholder takes up space
- ❌ Description line clamp still shows
- ❌ Tags arrangement unclear (flex wrap)
- ❌ No visual grouping
- ❌ Duplicate styling with grid view

**Visual Score:** 3/10 | **UX Score:** 4/10 | **Consistency Score:** 3/10

---

### 3.5 Document Upload Form
**Component Name:** Upload Sidebar  
**File Path:** `src/app/page.tsx` (lines 1100-1260)  
**Purpose:** Upload and configure documents  
**Visual Importance:** HIGH

**Current Layout Structure:**
- Vertical sidebar form
- Sections:
  - Info panel (explaining upload)
  - Title input
  - Category select
  - Department select (conditional)
  - Allowed roles checkboxes
  - Specific users checkboxes (conditional)
  - User types toggle buttons
  - Visibility select
  - Allowed departments checkboxes
  - Allowed teams checkboxes
  - File input
  - Submit button
  - Status/error messages

**Current Styling Approach:**
- Container: `operon-panel p-6`
- Inputs: `operon-input`, custom styles
- Selects: `rounded-3xl border border-border-subtle`
- Checkboxes: `rounded-3xl border px-4 py-3`
- Button: `rounded-3xl bg-accent/90 px-4 h-10`

**Current Typography:**
- Header: 18px semibold
- Labels: 12px secondary uppercase
- Inputs: 14px
- Status: 12px

**Current Colors:**
- Background: Elevated surface
- Text: Primary and secondary
- Active checkbox: `border-accent bg-accent/10`
- Button: `bg-accent/90` (gold)

**Current Spacing:**
- Container padding: 24px
- Section spacing: `mt-5`
- Input spacing: `mt-4`, `gap-3`, `gap-4`
- Label bottom: `mb-2`
- Checkbox grid: `gap-2`

**Current Border Radius:**
- Inputs: `rounded-3xl` (100px)
- Checkboxes: `rounded-3xl`
- Button: `rounded-3xl`
- All pill-shaped

**Current Hover States:**
- Checkbox hover: `border-accent-soft` (lighter)
- Button hover: `bg-accent` (darker)

**Current Active States:**
- Checkbox active: `bg-accent/10 border-accent`
- Button active: darker gold

**Current Animations:**
- None on form elements
- Static appearance

**Current Responsive Behavior:**
- Full width on mobile/tablet
- 0.8fr on desktop
- Grid layouts responsive

**Current Problems:**
- ❌ MASSIVE form with 10+ fields
- ❌ "Document workflow" + "Add a document or connect Drive content" + "Upload documents" (3 headings)
- ❌ "Files are automatically synced..." explanation text wastes space
- ❌ "Allowed roles", "Specific users", "User types", "Visibility", "Allowed departments", "Allowed teams" are 6 separate sections
- ❌ Checkboxes for each role, each user, each department (overwhelming)
- ❌ File input label shows "Attach document" by default, file name when selected
- ❌ Status messages shown at bottom (easy to miss)
- ❌ Form has no visual hierarchy
- ❌ Too many nested sections
- ❌ Form is actually a panel with rounded borders and shadow (looks heavy)

**Visual Score:** 2/10 | **UX Score:** 2/10 | **Consistency Score:** 2/10

---

## 4. SEARCH EXPERIENCE

### 4.1 Search Modal
**Component Name:** Global Search Modal  
**File Path:** `src/app/page.tsx` (lines 665-770)  
**Purpose:** Full-text search across documents and resources  
**Visual Importance:** HIGH

**Current Layout Structure:**
- Centered modal overlay
- Background: `bg-black/50 backdrop-blur-md`
- Modal container:
  - Search input with icon and ⌘K indicator
  - Divider line
  - Results container (max-height scrollable)
  - Documents section (with header)
  - Resources section (with header and divider)
  - Empty state

**Current Styling Approach:**
- Modal: `glass-hero border-white/10 p-6 rounded-2xl shadow-lg`
- Input: transparent background with text
- Results: `max-h-[70vh] overflow-y-auto space-y-2`
- Result items: Buttons with hover state

**Current Typography:**
- Placeholder: "Search documents, resources, and more..."
- Section headers: "DOCUMENTS", "RESOURCES" (uppercase)
- Result title: 16px semibold
- Result description: 14px secondary
- Keyboard hint: ⌘K

**Current Colors:**
- Backdrop: Black with transparency
- Modal background: Glass effect with slight elevation
- Text: Primary and secondary
- Hover: `rgba(255, 255, 255, 0.05)` background
- Focus: None

**Current Spacing:**
- Modal padding: 24px
- Input-divider gap: `mb-6` then `mb-4`
- Results gap: 8px
- Result item padding: 16px
- Section header padding: `px-3 py-2 mb-2`

**Current Border Radius:**
- Modal: 14px
- Result items: `rounded-xl`
- Dividers: None (1px line)

**Current Hover States:**
- Results translate X: 4px (right)
- Background opacity: 0.05
- No border change

**Current Active States:**
- Results scale 0.98
- Background opacity increase

**Current Animations:**
- Modal entrance: scale 0.95 + fade + slide
- Results: staggered entrance
- Hover: smooth translate + background change

**Current Responsive Behavior:**
- `max-w-2xl` width (controlled)
- `pt-20` top margin (centered below header)
- Full width with padding on mobile

**Current Problems:**
- ❌ "⌘K" shown but only works on Mac
- ❌ "Search documents, resources, and more…" placeholder is long
- ❌ Divider line after input is unclear
- ❌ Section headers "DOCUMENTS" and "RESOURCES" are uppercase (shouty)
- ❌ Result items show title + description (can be long text)
- ❌ Empty state shows generic "No results found" + "Try a different search term"
- ❌ No indication of search performance or loading state
- ❌ Modal backdrop blur might be slow on older devices
- ❌ Results are scrollable but no scroll indicator

**Visual Score:** 5/10 | **UX Score:** 5/10 | **Consistency Score:** 4/10

---

### 4.2 Search Results (Inline)
**Component Name:** Search Result Item  
**File Path:** `src/app/page.tsx` (lines 700-760)  
**Purpose:** Individual search result  
**Visual Importance:** MEDIUM

**Current Layout Structure:**
- Button element (full width)
- Vertical flex:
  - Title (one line)
  - Description (if exists)

**Current Styling Approach:**
- Container: `w-full rounded-xl border border-white/0 hover:border-white/10 p-4 text-left transition-all duration-200`
- Motion: `whileHover={{ x: 4, backgroundColor: "rgba(255, 255, 255, 0.05)" }}`

**Current Typography:**
- Title: 16px semibold, white
- Description: 14px secondary, truncated

**Current Colors:**
- Background: Transparent by default, 5% white on hover
- Border: Invisible by default, 10% white on hover
- Text: Primary and secondary

**Current Spacing:**
- Padding: 16px
- Title-description gap: `mt-1`

**Current Border Radius:**
- Item: 14px

**Current Hover States:**
- Translate X: 4px right
- Background: 5% white
- Border: 10% white

**Current Active States:**
- Scale 0.98

**Current Animations:**
- Hover: smooth translate + background
- Click: scale

**Current Problems:**
- ❌ Large padding (16px) makes results feel spaced out
- ❌ Description always shows if it exists
- ❌ No icon or visual distinction between document and resource
- ❌ Hover indicator is subtle (hard to notice)

**Visual Score:** 4/10 | **UX Score:** 4/10 | **Consistency Score:** 4/10

---

## 5. RESOURCES SECTION

### 5.1 Resources Library
**Component Name:** Resources Section  
**File Path:** `src/app/page.tsx` (lines 1255-1330)  
**Purpose:** Browse forms, policies, and links  
**Visual Importance:** MEDIUM

**Current Layout Structure:**
- Two-column layout: Main (1.4fr) + Sidebar (0.8fr) or full width
- Main column:
  - Title + description
  - Search input + category filter
  - Resource list (vertical stack)
- Sidebar (conditional):
  - Add resource form

**Current Styling Approach:**
- Container: `rounded-[28px] border border-border bg-bg-secondary p-6 shadow-card`
- Uses older border radius (28px)
- Uses older color scheme (`border-border`, `bg-bg-secondary`)
- List items: `rounded-3xl border border-border-subtle`

**Current Typography:**
- Title: 20px semibold
- Description: 14px secondary
- Resource title: 16px semibold
- Resource description: 14px secondary
- Category badge: 11px muted

**Current Colors:**
- Background: Secondary surface (older naming)
- Text: Primary and secondary
- Borders: `border-subtle`
- Hover: `border-accent-soft`

**Current Spacing:**
- Container padding: 24px
- Title bottom margin: `mt-2`
- List gap: `mt-5 grid gap-3`
- Resource item padding: `px-4 py-3`

**Current Border Radius:**
- Container: 28px (inconsistent with 14px/20px pattern)
- Items: 28px (pill-shaped)

**Current Hover States:**
- Border change to `accent-soft`
- No scale or background change

**Current Active States:**
- None

**Current Animations:**
- None

**Current Responsive Behavior:**
- Two column → single on tablet
- Full width on mobile
- Sidebar below content on mobile

**Current Problems:**
- ❌ "Resources" + "Browse links, forms, and policy content available to your role" (explanation)
- ❌ Resource cards show: Title + Description + Category badge
- ❌ Description text is repetitive ("Added via Operon")
- ❌ Category badge on right (flex justify-between) feels disconnected
- ❌ No indication of link type (form/policy/external)
- ❌ Hover effect is subtle
- ❌ Empty state: "No accessible resources match your filters"

**Visual Score:** 4/10 | **UX Score:** 4/10 | **Consistency Score:** 2/10

---

### 5.2 Add Resource Form
**Component Name:** Add Resource Sidebar  
**File Path:** `src/app/page.tsx` (lines 1310-1380)  
**Purpose:** Create new resource links  
**Visual Importance:** MEDIUM

**Current Layout Structure:**
- Vertical form in sidebar
- Fields:
  - Title input
  - Link input
  - Allowed roles (checkboxes, 2 columns)
  - Allowed user types (toggles, 2 columns)
  - Allowed departments (checkboxes, 2 columns)
  - Allowed teams (checkboxes, 2 columns)
  - Visibility select
  - Submit button
  - Status message

**Current Styling Approach:**
- Same as upload form
- `operon-panel`, `operon-input`
- Checkboxes: `rounded-3xl border px-4 py-3`

**Current Typography:**
- Header: 18px semibold
- Labels: 12px secondary
- Inputs: 14px

**Current Colors:**
- Active checkbox: `border-accent bg-accent/10`
- Button: `bg-accent/90`

**Current Spacing:**
- Padding: 24px
- Field spacing: `mt-4`, `gap-2`, `grid gap-2`

**Current Border Radius:**
- All elements: `rounded-3xl`

**Current Problems:**
- ❌ "Add a resource" title
- ❌ Form has 7 sections (roles, types, departments, teams, visibility, etc.)
- ❌ Checkboxes repeat for each role, type, department, team
- ❌ No clear separation between sections
- ❌ Visibility select appears after checkboxes (logical flow issue)
- ❌ Status message at bottom

**Visual Score:** 2/10 | **UX Score:** 2/10 | **Consistency Score:** 2/10

---

## 6. RBAC & MANAGEMENT SECTIONS

### 6.1 Finance Section
**Component Name:** Finance Page  
**File Path:** `src/app/page.tsx` (lines 1430-1480)  
**Purpose:** Finance-specific tools and links  
**Visual Importance:** LOW

**Current Layout Structure:**
- Two-column layout: Main (1.4fr) + Sidebar (0.8fr)
- Main column:
  - Title + description
  - Grid of 6 finance menu items
- Sidebar:
  - Navigation info

**Current Styling Approach:**
- Container: `rounded-[28px] border border-border bg-bg-secondary p-6 shadow-card`
- Menu items: `rounded-3xl border border-border-subtle bg-bg-primary/80 px-4 py-4`

**Current Typography:**
- Title: 20px semibold
- Description: 14px secondary
- Item title: 16px semibold
- Item description: 14px secondary

**Current Colors:**
- Background: Secondary surface
- Text: Primary and secondary
- Borders: Subtle

**Current Problems:**
- ❌ "Finance" title + "Finance tools for..." description
- ❌ 6 menu items (Notices, Reimbursements, Expense Forms, Invoices, Policies, Resources)
- ❌ Each shows title + description (verbose)
- ❌ Sidebar just repeats what's already on screen
- ❌ No real functionality (just placeholders)

**Visual Score:** 2/10 | **UX Score:** 2/10 | **Consistency Score:** 2/10

---

### 6.2 Activity Logs
**Component Name:** Activity Section  
**File Path:** `src/app/page.tsx` (lines 1480-1520)  
**Purpose:** View audit logs and activity feed  
**Visual Importance:** LOW

**Current Layout Structure:**
- Single column
- Title + description
- Activity list (vertical stack)

**Current Styling Approach:**
- Container: `rounded-[28px] border border-border bg-bg-secondary p-6 shadow-card`
- Activity items: `rounded-3xl border border-border-subtle bg-bg-primary/80 p-5`

**Current Typography:**
- Title: 20px semibold
- Description: 14px secondary
- Action label: 12px muted
- Item title: 16px semibold
- Item metadata: 14px secondary

**Current Problems:**
- ❌ "Activity Logs" title + "Events are shown only when..." description
- ❌ Each activity item shows: Action + Item Name + Actor + Timestamp
- ❌ Action text like "document_uploaded" (with underscores)
- ❌ No filtering or grouping
- ❌ Empty state: "No recent activity"

**Visual Score:** 3/10 | **UX Score:** 3/10 | **Consistency Score:** 3/10

---

### 6.3 Team Management
**Component Name:** Team Section  
**File Path:** `src/app/page.tsx` (lines 1520-1800)  
**Purpose:** Create and manage users  
**Visual Importance:** MEDIUM

**Current Layout Structure:**
- Two-column layout: Main (1.4fr) + Sidebar (0.8fr)
- Main: List of users/roles
- Sidebar: Create user form

**Current Styling Approach:**
- Container: `rounded-[28px] border border-border bg-bg-secondary p-6`
- Form: `space-y-3` layout
- Inputs: `rounded-3xl border` style

**Current Typography:**
- Title: 20px semibold
- Form labels: 12px
- Inputs: 14px

**Current Problems:**
- ❌ Form shows: Name + Email + Role + Department + Supervisor + Assigned Documents (6 fields)
- ❌ Each field has label above
- ❌ Checkboxes for document assignment
- ❌ Status messages at bottom
- ❌ No visual hierarchy

**Visual Score:** 2/10 | **UX Score:** 3/10 | **Consistency Score:** 2/10

---

### 6.4 Role Management
**Component Name:** Roles Section  
**File Path:** `src/app/page.tsx` (lines 1800+)  
**Purpose:** Create and edit roles  
**Visual Importance:** LOW

**Current Layout Structure:**
- Complex role editor interface
- List of roles on left
- Editor form on right

**Current Problems:**
- ❌ Role list shows all roles
- ❌ Form has: Name + Description + Inherits From + 11 permission checkboxes
- ❌ Permissions organized in 3 sections (Documents, Users, System)
- ❌ Each section has multiple checkboxes
- ❌ Very complex visual hierarchy
- ❌ Save/Delete buttons
- ❌ Status messages

**Visual Score:** 1/10 | **UX Score:** 2/10 | **Consistency Score:** 1/10

---

## 7. SHARED COMPONENTS

### 7.1 Buttons
**Component Name:** Button Family  
**File Path:** `src/styles/components.css` (lines 8-50)  
**Purpose:** Primary interaction elements  
**Visual Importance:** CRITICAL

**Current Variants:**
1. **Primary Button**
   - Background: `rgba(255, 255, 255, 0.9)` (light)
   - Hover: Full white, scale 1.02
   - Active: Scale 0.98
   - Padding: 13px 26px
   - Border radius: 100px

2. **Secondary Button**
   - Background: Transparent
   - Border: 1px white/10
   - Hover: Border white/20, background 5%
   - Border radius: 100px

3. **Ghost Button**
   - Background: Transparent
   - Color: Secondary text
   - Hover: Background 5%, text white
   - Padding: 8px 14px
   - Border radius: 6px (inconsistent)

4. **Danger Button**
   - Color: Red
   - Border: 1px red
   - Hover: Background red/8

**Current Problems:**
- ❌ Primary button color (light) conflicts with dark theme
- ❌ Different buttons used throughout (not consistent application)
- ❌ No disabled state styling defined
- ❌ All buttons are pill-shaped (no variety)
- ❌ No loading state
- ❌ Size consistency unclear

**Visual Score:** 4/10 | **UX Score:** 5/10 | **Consistency Score:** 3/10

---

### 7.2 Input Fields
**Component Name:** Input Elements  
**File Path:** `src/styles/components.css` (lines 170-200)  
**Purpose:** User text input  
**Visual Importance:** HIGH

**Current Implementation:**
- Class: `input-base`, `operon-input`
- Background: Overlay effect with transparency
- Border: 1px white/5 (subtle)
- Padding: 12px 16px (3, 4)
- Font size: 14px
- Placeholder color: Muted
- Focus: Border white/10, shadow with blur

**Current Problems:**
- ❌ Different input classes used inconsistently
- ❌ Subtle border makes focus state hard to see
- ❌ No visual feedback for valid/invalid state
- ❌ No size variants
- ❌ Placeholder text is primary (hard to read)

**Visual Score:** 3/10 | **UX Score:** 3/10 | **Consistency Score:** 2/10

---

### 7.3 Cards
**Component Name:** Card Container  
**File Path:** `src/styles/components.css` (lines 68-90)  
**Purpose:** Content grouping container  
**Visual Importance:** HIGH

**Current Implementation:**
- Background: Surface color
- Border: 1px white/10
- Border radius: 20px (xl)
- Padding: 24px (6)
- Shadow: Card shadow
- Hover: Border white/20, transform Y -2px, shadow lg

**Variants:**
- `.card` - Standard card
- `.card-outlined` - Border only, no background

**Current Problems:**
- ❌ Heavy shadow on cards
- ❌ Hover effect with transform feels inconsistent
- ❌ No size variants
- ❌ Border color change on hover not visible
- ❌ Different cards use different styling (`glass-card`, `operon-panel`)

**Visual Score:** 3/10 | **UX Score:** 4/10 | **Consistency Score:** 2/10

---

### 7.4 Badges
**Component Name:** Badge/Pill  
**File Path:** `src/styles/components.css` (lines 92-130)  
**Purpose:** Status and category indicators  
**Visual Importance:** MEDIUM

**Current Variants:**
1. **Default Badge**
   - Background: 8% white
   - Color: Secondary text
   - Font size: 11px
   - Border radius: 100px
   - Padding: 3px 10px

2. **Success Badge** - Green
3. **Warning Badge** - Orange
4. **Error Badge** - Red
5. **Gold Badge** - Gold accent

**Current Problems:**
- ❌ Badges used throughout with different styling
- ❌ Uppercase text on all badges (shouty)
- ❌ Letter spacing: `tracking-wide` (0.04em) feels excessive
- ❌ No consistent sizing

**Visual Score:** 3/10 | **UX Score:** 4/10 | **Consistency Score:** 2/10

---

### 7.5 Forms & Checkboxes
**Component Name:** Form Elements  
**File Path:** Various pages  
**Purpose:** User input for complex workflows  
**Visual Importance:** HIGH

**Current Implementation:**
- Checkboxes styled as buttons
- `rounded-3xl border px-4 py-3`
- Toggle color: `border-accent bg-accent/10` when active
- Inactive: `border-border-subtle bg-bg-primary/80`

**Current Problems:**
- ❌ Checkboxes look like buttons (confusing)
- ❌ No native checkbox styling
- ❌ Click area is large (pill-shaped)
- ❌ Form layout is vertical with all fields stacked
- ❌ No grouped sections
- ❌ Labels are separate from inputs
- ❌ Tab order unclear

**Visual Score:** 2/10 | **UX Score:** 2/10 | **Consistency Score:** 1/10

---

### 7.6 Empty States
**Component Name:** Empty State  
**File Path:** Multiple pages  
**Purpose:** Fallback when no content exists  
**Visual Importance:** LOW

**Current Styling:**
- `operon-empty-state p-8 text-sm text-text-secondary rounded-xl`
- Generic gray box
- No icon
- Plain text message

**Current Messages:**
- "Preparing your documents…"
- "No documents match your filters."
- "No accessible resources match your filters."
- "No recent activity."

**Current Problems:**
- ❌ Generic styling
- ❌ No icon or visual interest
- ❌ Messages are passive ("No X")
- ❌ No call-to-action

**Visual Score:** 1/10 | **UX Score:** 2/10 | **Consistency Score:** 1/10

---

### 7.7 Loading States
**Component Name:** Loading Indicators  
**File Path:** Multiple pages  
**Purpose:** Show content is loading  
**Visual Importance:** LOW

**Current Implementation:**
- Blinking animation: `animate={{ opacity: [0.5, 1] }}`
- Generic placeholder text
- Looping animation (6s duration)

**Current Problems:**
- ❌ No skeleton loaders
- ❌ Plain text "Preparing your documents…"
- ❌ Single global loading indicator
- ❌ No progress indication

**Visual Score:** 1/10 | **UX Score:** 2/10 | **Consistency Score:** 1/10

---

### 7.8 Alerts & Status Messages
**Component Name:** Alert Messages  
**File Path:** Various pages  
**Purpose:** Communicate status to user  
**Visual Importance:** MEDIUM

**Current Implementation:**
- Warning alert: `glass-card border-status-warning/30 bg-status-warning/5 px-6 py-4 rounded-2xl`
- Error messages: `text-rose-500`
- Success messages: Inline text
- Status messages: Inline text at bottom of forms

**Current Problems:**
- ❌ Warning shows as banner with emoji (⚠️)
- ❌ Inconsistent placement (some top, some bottom)
- ❌ No consistent styling
- ❌ Error messages are small red text
- ❌ No action buttons on alerts
- ❌ No close/dismiss option

**Visual Score:** 2/10 | **UX Score:** 2/10 | **Consistency Score:** 1/10

---

## 8. STYLING INCONSISTENCIES

### Color System Issues
| Issue | Current | Problem |
|-------|---------|---------|
| Border colors | `white/8`, `white/10`, `white/15` | 3 different opacity levels |
| Background colors | `bg-surface`, `bg-elevated`, `bg-primary/80`, `bg-secondary` | 4 different naming conventions |
| Text colors | `text-primary`, `text-secondary`, `text-tertiary`, `text-muted` | 4 levels with inconsistent application |
| Accent colors | `accent-gold`, `accent-primary`, `accent-soft` | Multiple accent definitions |

### Border Radius Issues
| Element | Current | Inconsistency |
|---------|---------|-----------------|
| Cards | `rounded-xl` (14px) | ✓ Consistent |
| Inputs | `rounded-3xl` (28px) | ✗ Pill-shaped |
| Buttons | `rounded-full` (100px) | ✗ Different from cards |
| Sections | `rounded-2xl` or `rounded-[28px]` | ✗ Two patterns |
| Tags | `rounded-full` (100px) | ✗ Different from cards |

### Spacing Issues
| Context | Current | Problem |
|---------|---------|---------|
| Section padding | `p-6`, `p-8` | Inconsistent |
| Grid gaps | `gap-4`, `gap-6`, `gap-8` | Too many variants |
| Margins | `mt-2`, `mt-4`, `mt-5`, `mt-8` | Not using space scale |
| Form fields | `mt-4`, then `gap-3` | Mixed approaches |

### Typography Issues
| Element | Current | Problem |
|---------|---------|---------|
| Page titles | `text-h3`, `text-4xl` | Different sizes |
| Section headers | 10px uppercase, 18px semibold | No consistent pattern |
| Labels | 12px uppercase, 14px | Mixed sizes |
| Descriptions | Always shown, 14px | Always takes space |

---

## 9. COMPREHENSIVE ISSUES SUMMARY

### Components Causing Maximum Visual Clutter
1. **Upload Form** - 10+ fields, 6 sections, overwhelming complexity
2. **Create Resource Form** - 7 sections with repeated checkboxes
3. **Create User Form** - Multiple fields with no grouping
4. **Document Library** - 7 category tabs, filters, pinned docs, main grid

### Components Causing Spacing Issues
1. **Sidebar** - Inconsistent gaps between nav items
2. **Library** - Pinned docs, categories, search, main grid not clearly separated
3. **Forms** - Fields stacked with inconsistent gaps
4. **Cards** - Different padding in grid vs list view

### Components Causing Typography Issues
1. **Headers** - "OPERON" shown in sidebar AND main header
2. **Descriptions** - Always shown (explanatory text everywhere)
3. **Labels** - Mix of uppercase/lowercase, different sizes
4. **Metadata** - Tags, badges, categories create visual noise

### Components Causing Color Inconsistency
1. **Buttons** - Primary button is light (conflicts with dark theme)
2. **Backgrounds** - Multiple surface colors with no clear distinction
3. **Borders** - 3+ different opacity levels
4. **Accents** - Multiple accent color definitions

### Components NOT Looking Premium
1. **Role Selector** - Generic cards with verbose descriptions
2. **Search Modal** - Standard modal with no distinctive styling
3. **Activity Feed** - Plain list with no visual hierarchy
4. **Empty States** - Generic gray boxes with plain text
5. **Loading States** - Blinking text with no animation

---

## 10. COMPONENT REDESIGN MATRIX

### Must Redesign Completely (0/10 Premium)
| Component | Reason | Redesign Scope |
|-----------|--------|-----------------|
| Upload Form | 10+ fields, overwhelming UI | Simplify to 3-4 core fields |
| Create Resource Form | 7 repeated checkbox sections | Collapse checkboxes, simpler flow |
| Role Editor | Complex permissions matrix | Tab-based interface |
| Activity Section | Plain list, no visual hierarchy | Timeline or card-based |
| Finance Section | Placeholder content | Remove until functional |
| Team Management | Complex form | Step-by-step wizard |
| Role Selector | Generic cards | Minimal cards, 2 lines max |

### Style Improvements Only (4-6/10 Current)
| Component | Current Issues | Styling Fix |
|-----------|-----------------|--------------|
| Document Cards | Image placeholder, too much space | Remove image, tighten spacing |
| Library Section | Too many filters, tabs | Consolidate, hide secondary filters |
| Document List | Duplicate of grid, same issues | Use single view only |
| Search Modal | Standard styling | Add subtle animations |
| Resource Links | Generic styling, descriptions | Show title only |

### Already Looking Good (7+/10 Current)
| Component | Current State |
|-----------|--------------|
| Sidebar | Good navigation flow, smooth animations |
| Home Panel | Clean layout, good spacing |
| Global Buttons | Consistent styling |
| Design Tokens | Well-defined system |

---

## FINAL ASSESSMENT

### Overall Visual Quality: **3.5/10** (Below Professional Standard)

### Key Findings

**What Works:**
✅ Design token system is well-defined  
✅ Framer Motion animations are smooth  
✅ Color palette is cohesive (dark theme)  
✅ Responsive layouts work correctly  

**What Doesn't Work:**
❌ Forms are overwhelming (10+ fields per form)  
❌ Redundant text throughout ("OPERON" repeated, descriptions everywhere)  
❌ Visual hierarchy is unclear (too many headings, labels)  
❌ Components don't feel premium (generic styling, heavy shadows)  
❌ Color system applied inconsistently  
❌ Border radius inconsistencies (`14px` vs `28px`)  
❌ Spacing is random (no clear scale)  

### Critical Problems

1. **Text Overload**
   - Every section has heading + description + labels + metadata
   - Example: "Documents" + "File Browser" + "Allowed Roles" + 7 role checkboxes

2. **Form Complexity**
   - Upload form: 10+ separate fields
   - Create Resource: 7 checkbox sections
   - Create User: 6 input fields
   - All stacked vertically with no grouping

3. **Visual Noise**
   - Tags on documents (Drive/Local/SOP)
   - Category badges on resources
   - Metadata everywhere
   - 70%+ reduction in text needed

4. **Inconsistencies**
   - `border-border-subtle` vs `white/5` vs `white/8`
   - `rounded-2xl` vs `rounded-3xl` vs `rounded-xl`
   - `space-y-8` vs `gap-8` vs `mt-5`

---

## READY FOR REDESIGN

**This inventory is complete and ready for Claude to receive as design specifications.**

All components have been analyzed across:
- Layout structure
- Styling approach
- Typography
- Colors
- Spacing
- Interactions
- Responsive behavior
- Current problems
- Visual/UX/Consistency scores

**Next: Apply design system comprehensively using this inventory as reference.**
