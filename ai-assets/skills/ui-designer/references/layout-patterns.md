# Page Layout Patterns and Composition Techniques

## Layout Principles Learned from Dribbble

Landing pages and Dashboards with 10,000+ likes on Dribbble share a common layout rule:
**Break the grid, but maintain order.** Perfect alignment looks rigid (AI feel), complete randomness looks amateur.
The best layout is 90% grid compliance + 10% intentional breaking.

## Hero Section (Above the Fold)

The hero determines the user's first impression. Most popular hero patterns on Dribbble:

### Pattern 1: Split Hero (Text Left, Image Right)
```
┌─────────────────────────────────────┐
│  [Large heading]       [Product     │
│  [Subheading]           screenshot  │
│  [CTA button]           or 3D       │
│                         render]     │
└─────────────────────────────────────┘
```
- Text area takes 45-55%, image area takes 45-55% (don't do exact 50/50, too rigid)
- Heading should be large, 60-80px or even larger
- Leave enough space between CTA and heading (at least 32px)
- Right image can bleed to container edge

### Pattern 2: Centered Hero (Text Center + Product Image Below)
```
┌─────────────────────────────────────┐
│          [Small tag/badge]          │
│       [Oversized centered heading]  │
│         [One-line subheading]       │
│         [CTA] [CTA]                │
│                                     │
│    ┌─────────────────────────┐      │
│    │     [Product screenshot] │      │
│    │      floating with shadow│      │
└────┴─────────────────────────┴──────┘
```
- Heading can be very large (72-120px)
- Product screenshot with perspective transform for tilt effect
- Multiple layers of shadow below screenshot for floating feel
- Background can be gradient or have subtle texture

### Pattern 3: Immersive Hero (Full-screen)
```
┌─────────────────────────────────────┐
│                                     │
│     [Background video/3D/motion]    │
│        [Overlaid text]              │
│        [CTA]                        │
│                                     │
└─────────────────────────────────────┘
```
- Need sufficient contrast between background and foreground text (add dark overlay)
- Enhance text readability with `text-shadow` or semi-transparent backing

## Content Area Layouts

### Feature Grid (Feature Showcase)
Most common variants on Dribbble:

**Bento Grid** — Cards of varying sizes:
```
┌──────────┬────┐
│  Large   │Sm  │
│  card    │card│
│  (2x2)   │    │
├────┬─────┤    │
│ Sm │ Med  ├────┤
│card│ (2x1)│ Sm │
└────┴─────┴────┘
```
This is the dominant layout of 2024-2025. Apple uses it extensively in keynotes.
Key: Gaps between cards should be consistent (12-16px), but card sizes should vary.

**Alternating Layout** — Left-right alternating feature intros:
```
[Text]  [Image]
[Image] [Text]
[Text]  [Image]
```
Classic but effective. Make images slightly wider than text area to avoid perfect symmetry.

### Data Display (Stats / Metrics)
```
┌───────┬───────┬───────┬───────┐
│ 10M+  │ 99.9% │ 150+  │ 4.9★  │
│ Users │Uptime │Country│Rating │
└───────┴───────┴───────┴───────┘
```
- Numbers should be large (36-48px), units and descriptions small (14px)
- Can add animation (numbers rolling from 0 to target value)
- 3-4 metrics is ideal, more than 4 consider splitting into rows

### Pricing Table
```
┌─────┐ ┌─────────┐ ┌─────┐
│Free │ │  Pro    │ │ Ent │
│     │ │Recommend↑│ │     │
│     │ │ Taller   │ │     │
│     │ │ + border │ │     │
└─────┘ └─────────┘ └─────┘
```
- Highlight recommended plan (border, background color, label, larger size)
- Don't exceed 3 plans
- Use checkmarks for feature comparison, not tables

## Card Design

Cards are the most frequent design element on Dribbble. Good cards vs bad cards:

```css
/* Bad: typical AI style */
.card {
  border-radius: 12px;
  box-shadow: 0 4px 6px rgba(0,0,0,0.1);
  padding: 24px;
}

/* Good: layered depth */
.card {
  border-radius: 16px;
  /* Multi-layer shadows create realistic depth */
  box-shadow:
    0 0 0 1px rgba(0,0,0,0.03),
    0 2px 4px rgba(0,0,0,0.05),
    0 12px 24px rgba(0,0,0,0.05);
  padding: 28px 24px;  /* top/bottom slightly more than left/right */
}

/* Better: alive on hover */
.card {
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}
.card:hover {
  transform: translateY(-2px);
  box-shadow:
    0 0 0 1px rgba(0,0,0,0.03),
    0 4px 8px rgba(0,0,0,0.08),
    0 24px 48px rgba(0,0,0,0.08);
}
```

## Responsive Breakpoint Strategy

```
Mobile:   < 640px  — Single column, stacked layout
Tablet:   640-1024px — Two columns, reduced spacing
Desktop:  1024-1440px — Full layout
Wide:     > 1440px — max-width constrained, centered

/* Recommended container max-widths */
Body content: max-w-2xl (672px) — most comfortable for reading
Product pages: max-w-6xl (1152px)
Full-width layout: max-w-7xl (1280px) or max-w-screen-xl
```

### Mobile Adaptation Strategy (Not shrinking — redesigning)

Professional work on Dribbble doesn't make the mobile version a compressed desktop,
but rather an independent design reorganized for one-handed operation and small-screen reading.

**Layout Folding Rules**
```
Desktop side-by-side → Mobile stacked vertically
  Split Hero: text left, image right → image top, text bottom (image first, grabs attention)
  Feature alternating: image left, text right → uniform image top, text bottom (no more alternating)
  Three-column grid: 3 col → 1 col (not 2 col then 1 col)
  Bento Grid: varying cards → full-width single-column cards
  Pricing: horizontal → vertical tab switching (not vertical stacking)
```

**Navigation Transformation**
```
Desktop horizontal navbar → Mobile hamburger menu or bottom Tab Bar
  Top header: Keep Logo + hamburger icon, hide the rest
  Sidebar: Becomes bottom drawer or full-screen overlay
  Tab switching: More than 4 → horizontal scroll, don't compress by wrapping
  Breadcrumbs: Hide middle levels, keep only "← Back"
```

**Font Scaling (Not proportional shrinking)**
```css
/* Use clamp() for fluid typography, avoid hard breakpoint jumps */
h1 { font-size: clamp(2.25rem, 5vw + 1rem, 4.5rem); }  /* 36-72px */
h2 { font-size: clamp(1.75rem, 3vw + 0.5rem, 3rem); }  /* 28-48px */
p  { font-size: clamp(0.938rem, 1vw + 0.5rem, 1.125rem); } /* 15-18px */

/* Line-height should be tighter on small screens (screen space is precious) */
h1 { line-height: 1.1; }  /* Desktop can be 1.2 */
p  { line-height: 1.5; }  /* Desktop can be 1.6-1.7 */
```

**Spacing Compression**
```
Desktop Section spacing 80-120px → Mobile 48-64px
Desktop container padding 32px → Mobile 16-20px
Desktop card padding 28px → Mobile 16-20px
Desktop element spacing 24px → Mobile 16px
```

**Touch Friendly**
```
Minimum tap target: 44x44px (Apple HIG) / 48x48px (Material Design)
Button height: At least 44px, recommended 48px
Input height: At least 48px
List item height: At least 48px
Bottom safe area: padding-bottom: env(safe-area-inset-bottom)
```

**Mobile-Specific Design Considerations**
```
1. Thumb hot zone: Place primary actions in bottom half of screen (reachable by one-handed thumb)
2. Bottom action bar: Fixed CTA at bottom ("Get Started" / "Buy Now")
3. Pull to refresh: Reserve top area for pull-down refresh
4. Swipe gestures: Cards swipeable left/right, list items swipeable to delete
5. Keyboard occlusion: Page auto-scrolls on input focus, not hidden by keyboard
6. Landscape handling: At minimum don't crash, core features usable
```

## Key Dimension Reference

From statistics of popular works on Dribbble:
```
Hero heading:     56-96px (mobile 36-48px)
Section heading:  36-48px (mobile 28-36px)
Body text:        16-18px (mobile 15-16px)
Captions/notes:   13-14px
Button text:      14-16px
Button height:    40-48px (large buttons 52-56px)
Card border-radius: 12-20px
Section spacing:  80-120px (mobile 48-64px)
Container padding: 24-32px (mobile 16-20px)
```
