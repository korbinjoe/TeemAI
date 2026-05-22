# Interaction Design and Micro-Animation Guide

## Interaction Design Trends on Dribbble

The designs that get the most likes on Dribbble aren't usually the best-looking static ones —
they're the ones with **interactions that make you want to touch them**. Good interaction makes users feel the interface is "alive."

## Micro-interactions

### Buttons

**Basic**: Something changes on hover, letting users know "this is clickable"
```css
/* Don't: nothing changes */
.btn { background: #000; color: #fff; }

/* Don't: just change opacity (lazy) */
.btn:hover { opacity: 0.8; }

/* Do: meaningful feedback */
.btn {
  background: #000;
  color: #fff;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}
.btn:hover {
  background: #1a1a1a;
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(0,0,0,0.15);
}
.btn:active {
  transform: translateY(0);
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}
```

**Advanced**: Loading state after button click
```
[Submit] → [Loading...⟳] → [✓ Done!] → restore
```
Don't use alerts or redirects — complete the entire state change on the button itself.

### Input Fields

```css
/* Good focus state */
.input {
  border: 1.5px solid #e5e5e5;
  transition: border-color 0.15s, box-shadow 0.15s;
}
.input:focus {
  border-color: #000;
  box-shadow: 0 0 0 3px rgba(0,0,0,0.08);
  outline: none;
}

/* Better: animated placeholder */
.input::placeholder {
  transition: opacity 0.15s, transform 0.15s;
}
.input:focus::placeholder {
  opacity: 0.5;
  transform: translateX(4px);
}
```

### Cards and List Items

```css
/* List item hover with left color bar */
.list-item {
  position: relative;
  padding-left: 16px;
  transition: background 0.15s;
}
.list-item::before {
  content: '';
  position: absolute;
  left: 0;
  top: 50%;
  width: 3px;
  height: 0;
  background: var(--accent);
  border-radius: 2px;
  transition: height 0.2s, top 0.2s;
}
.list-item:hover {
  background: rgba(0,0,0,0.02);
}
.list-item:hover::before {
  height: 60%;
  top: 20%;
}
```

## Transitions

### Page Transitions

**Don't**: Direct switch (flash of white)
**Don't**: Fancy 3D flips
**Do**: Natural slide-in/fade-in

```css
/* Page enter */
@keyframes pageEnter {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.page {
  animation: pageEnter 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}
```

### Modals / Dialogs

```css
/* Background overlay */
.overlay {
  animation: fadeIn 0.2s ease-out;
}

/* Modal body */
.modal {
  animation: scaleIn 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes scaleIn {
  from {
    opacity: 0;
    transform: scale(0.95);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}
```

Note that `cubic-bezier(0.16, 1, 0.3, 1)` — this is a "spring" easing
with a slight overshoot effect, more lively than `ease-out`.

### Stagger Animation for List Items

```css
.list-item {
  opacity: 0;
  animation: slideUp 0.3s ease-out forwards;
}

.list-item:nth-child(1) { animation-delay: 0ms; }
.list-item:nth-child(2) { animation-delay: 50ms; }
.list-item:nth-child(3) { animation-delay: 100ms; }
/* ... */

@keyframes slideUp {
  from {
    opacity: 0;
    transform: translateY(12px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
```

A 50ms delay between each item creates a waterfall-like entrance effect.
Almost every Dashboard design on Dribbble uses this technique.

## Feedback Design

### Loading States

```
Skeleton Screen > Spinner > Blank wait
```

Skeleton is currently the most popular loading state treatment on Dribbble:
```css
.skeleton {
  background: linear-gradient(
    90deg,
    #f0f0f0 25%,
    #e0e0e0 50%,
    #f0f0f0 75%
  );
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
  border-radius: 4px;
}

@keyframes shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
```

### Success / Error Feedback

```
Toast notification: Slides in from top-right, auto-dismisses after 3 seconds
Inline hint: Appears right next to the action location
Color change: Input border turns green/red
```

Don't use `alert()`. Never.

### Empty State

Empty states are the most easily overlooked yet best showcase of design taste:
```
┌─────────────────────────┐
│                         │
│  [Carefully designed    │
│   illustration]         │
│                         │
│   No projects yet       │
│   Create your first one │
│                         │
│     [Create Project →]  │
│                         │
└─────────────────────────┘
```

## Animation Duration Reference

| Scenario | Duration | Easing |
|----------|----------|--------|
| Hover color change | 150ms | ease |
| Button press | 100ms | ease-out |
| Modal appear | 200-300ms | cubic-bezier(0.16,1,0.3,1) |
| Modal disappear | 150-200ms | ease-in |
| Page transition | 300ms | cubic-bezier(0.4,0,0.2,1) |
| List stagger | 50ms per item | ease-out |
| Toast enter | 300ms | cubic-bezier(0.4,0,0.2,1) |
| Toast exit | 200ms | ease-in |
| Skeleton shimmer | 1500ms | linear (loop) |
| Sidebar expand | 250ms | cubic-bezier(0.4,0,0.2,1) |
| Tooltip appear | 150ms | ease-out |
| Collapse/expand | 200-300ms | ease-in-out |

## Component State Design Matrix

Fireart and Tubik on Dribbble always show components with full states.
One of the biggest problems with AI-generated designs is only having the default state —
a button with only a "normal state" isn't a design, it's a sketch.

### Complete State Checklist

Every interactive component should cover the following states (select as needed):

```
┌─────────────┬─────────────────────────────────────────────┐
│ State       │ Visual Expression                            │
├─────────────┼─────────────────────────────────────────────┤
│ Default     │ Baseline style, first thing user sees        │
│ Hover       │ Color change + subtle shift/shadow increase  │
│ Active      │ Press feel (shrink scale(0.98) or reduce shadow) │
│ Focus       │ Keyboard focus ring (2px ring + offset)      │
│ Disabled    │ Reduce opacity (opacity: 0.5) + cursor: not-allowed │
│ Loading     │ Content replaced by spinner or skeleton, maintain size │
│ Error       │ Red border/background + error icon + error message │
│ Success     │ Green confirmation + checkmark animation     │
│ Empty       │ Illustration/icon + guide text + CTA button  │
│ Skeleton    │ Gray blocks + shimmer animation, match actual content shape │
│ Selected    │ Highlighted border/background + checkmark (multi-select) │
│ Readonly    │ Remove interaction cues (no hover change), stay readable │
└─────────────┴─────────────────────────────────────────────┘
```

### Minimum State Set Per Component

Not every component needs all 12 states. Here's the **must-cover** list for each:

```
Button:
  Must: default, hover, active, focus, disabled, loading
  Optional: success (submit buttons)

Input:
  Must: default, focus, error, disabled
  Optional: readonly, success (validation passed)

Card:
  Must: default, hover (if clickable)
  Optional: selected, skeleton, empty

List Item:
  Must: default, hover, selected
  Optional: active (dragging), empty (list is empty)

Table Row:
  Must: default, hover, selected
  Optional: expanded (show details), loading

Dialog:
  Must: enter animation, exit animation, overlay
  Optional: loading (content loading)

Toast / Notification:
  Must: success, error, warning, info
  Each needs: enter animation, auto-exit, manual close

Dropdown:
  Must: closed, open, item-hover, item-selected
  Optional: item-disabled, search/filter
```

### Visual Continuity of State Transitions

Transitions between states should be smooth, not abrupt:

```css
/* Complete button state styles */
.btn {
  padding: 10px 20px;
  border-radius: 8px;
  font-weight: 500;
  transition: all 0.15s ease;
  position: relative;
}

/* Default → Hover: darken background + slight lift */
.btn:hover:not(:disabled) {
  background: var(--accent-hover);
  transform: translateY(-1px);
  box-shadow: 0 4px 12px var(--accent-subtle);
}

/* Hover → Active: drop back + shrink */
.btn:active:not(:disabled) {
  transform: translateY(0) scale(0.98);
  box-shadow: none;
}

/* Focus: visible indicator for keyboard users */
.btn:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

/* Disabled: reduce presence */
.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  pointer-events: none;
}

/* Loading: spinner replaces text, maintain button size */
.btn[data-loading] {
  color: transparent;
  pointer-events: none;
}
.btn[data-loading]::after {
  content: '';
  position: absolute;
  inset: 0;
  margin: auto;
  width: 16px;
  height: 16px;
  border: 2px solid currentColor;
  border-right-color: transparent;
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
}
```

## Key Principles

1. **Fast in, slow out** — Elements appear quickly with spring, disappear quietly and gracefully
2. **Near large, far small** — Entry animation distance is short (8-12px), exit distance even shorter or just fade
3. **One thing at a time** — No more than 2 things animating simultaneously, otherwise it's overwhelming
4. **Dismissible** — Respect `prefers-reduced-motion`, give users the choice
5. **Purposeful** — Every animation should answer "What does this animation help the user understand?"
6. **Full state coverage** — Every interactive component covers at least its minimum state set

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```
