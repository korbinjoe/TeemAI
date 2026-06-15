# Design Anti-Patterns & Quality Gates

> Distilled from thousands of AI-generated UI reviews.
> This file is a defense checklist, not an inspiration gallery.
> Your inspiration should come from the existing product, not from this file.

## 1. AI-Generated UI Red Flags

If your output has ANY of these, it will look AI-generated to a trained eye. Fix before delivery.

```
1. "Gradient background + white text + blurred light spots" — the universal AI trifecta
2. "All text centered" — real product UIs are almost always left-aligned
3. "Purple-blue gradient color scheme" — the default AI palette
4. "Perfect symmetry everywhere" — too uniform, too safe, no visual tension
5. "Meaningless geometric decorations" — floating circles, triangles, abstract blobs
6. "All buttons are pill-shaped" — rounded-full on every button
7. "Identical card shadows" — every card uses the same shadow-lg
8. "Fake data" — "John Doe", "Lorem ipsum", "$99.99"
9. "Uniform spacing" — every section exactly 64px, no variation
10. "Inter font for everything" — the personality-free default
```

### The Root Cause

AI models default to **additive** design — they add elements to fill space.
Good product design is **subtractive** — every element must earn its place.

When you feel the urge to add a gradient, shadow, decoration, or animation, ask:
**"What information does this communicate?"** If the answer is "it looks nice", remove it.

## 2. Common Over-Design Patterns

These aren't as blatant as the red flags above, but they accumulate into "AI taste":

| Pattern | Why it feels AI | Better approach |
|---------|----------------|-----------------|
| Multi-layer box-shadow on every card | Over-engineered depth | Use background shade difference or subtle border |
| Imported Display font for product UI | Looks like a landing page, not an app | Use the project's existing font stack |
| 5+ colors in one view | Visual noise, no hierarchy | 1 accent + neutrals from project tokens |
| Hover animations on non-interactive elements | Decoration, not function | Only animate interactive elements |
| Section background alternating (white/gray/white/dark) | Template-like rhythm | Consistent background, use spacing for separation |
| Oversized hero with huge heading | Landing page pattern in a product page | Match the information density of sibling pages |

## 3. Dark Mode Quality Gates

Dark mode isn't "invert colors." These are the most common failures:

```
Pitfall 1: Pure black background
  #000000 is too harsh — use #0A0A0A, #111111, or #18181B

Pitfall 2: Pure white text
  #FFFFFF is too bright — use #E5E5E5 or #EDEDED for body text

Pitfall 3: Shadows disappear
  Light-mode rgba(0,0,0,0.05) is invisible on dark backgrounds
  Dark mode needs higher opacity (0.2-0.4) or replace shadows with borders

Pitfall 4: Accent colors not adjusted
  #2563EB blue appears too dark on dark backgrounds
  Lighten accent colors 1-2 shade levels for dark mode

Pitfall 5: Only one shadow layer
  In dark mode, use background shade differences + subtle borders
  instead of shadows for card separation
```

### Dark-on-Dark Card Hierarchy

Differentiate cards through background shade, not borders or shadows:

```
Page base:     #1A1A1A
Card:          #252525  (difference ~11)
Card hover:    #2A2A2A
Nested:        #303030

Rules:
  - Difference < 8: invisible on low-contrast screens
  - Difference > 20: looks disconnected
  - Sweet spot: 10-15
```

## 4. Font Pairing Quick Reference

Only consult this when building a NEW page type that doesn't exist in the project yet.
For existing product pages, always use the project's font stack.

### Safe Choices (Google Fonts)
```
Space Grotesk (700) + Inter (400) — tech feel, Vercel-style
DM Serif Display + DM Sans — editorial + modern
Plus Jakarta Sans (800) + Inter (400) — bold headings + clean body
```

### Monospace (for code/data)
```
JetBrains Mono — best programming font, great ligatures
Geist Mono — modern, pairs with Geist Sans
```

## 5. Self-Assessment Question

Before delivering any design, answer this ONE question:

**"If I put my output next to 3 existing pages in this app, would a user
notice it was made by a different person?"**

If yes → you've deviated too far. Go back to step 1 and re-anchor.
If no → ship it.
