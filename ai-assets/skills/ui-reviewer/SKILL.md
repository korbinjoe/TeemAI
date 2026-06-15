---
name: ui-reviewer
description: >
  UI visual review skill. Uses a 4-layer review framework (code static audit → visual defect scan → aesthetic evaluation → AI-generated code typical issues),
  combined with browser preview verification, to systematically diagnose UI and output specific actionable fix suggestions.
  Triggers when user says "review UI", "check the page", "any UI issues", "review the interface",
  "check the styling", "UI has a bug". Also applies to diagnosing visual issues found after screenshots.
  Covers code static audit, design heuristics, Shadcn design system standards, and Dashboard-specific design knowledge.
allowed-tools: Read,Edit,Bash,Grep,Glob
---

## Review Process Overview

```
Code implementation → Layer 0: Code static audit → Fix code issues
                   → Browser preview verification
                   → Layer 1: Visual defect scan
                   → Layer 2: Design aesthetic evaluation
                   → Layer 3: AI-generated code typical issues
                   → Iterative fixes
                   → Multi-viewport verification (required before delivery)
```

### Prerequisites

1. Complete Layer 0 code static audit (see below)
2. Use `mcp__playwright__browser_navigate` to open the page
3. Use `mcp__playwright__browser_snapshot` to get page snapshot
4. **Examine the page with a "find problems" mindset, not "go through the motions"**

### Knowledge Base Reference

When design judgment basis is needed during review, read the `references/` directory:
- `references/design-heuristics.md` — 10 core design heuristics + page layout best practices + component composition patterns + spacing/font-size quick reference
- `references/shadcn-design-system.md` — Shadcn component mapping + Lucide icon specs + HSL color variables + typography/states/a11y specs
- `references/dashboard-design.md` — Dashboard information architecture + layout patterns + data visualization selection + metric card design + anti-pattern checklist

---

## Layer 0: Code Static Audit

> Execute before browser preview. Scan newly created or modified `.tsx` / `.ts` files via Grep/Read to catch code-level issues early.

### 1. Tailwind Arbitrary Value Detection (Magic Numbers)

**Scan**: Grep for `\-\[\d+px\]` or `\-\[\d+rem\]`

```tsx
// Not allowed
className="w-[347px] h-[52px] mt-[13px] p-[7px]"
// Correct
className="w-80 h-14 mt-3 p-2"
```

**Exempt**: `max-w-[...]` for container width limits, `min-h-[...]` for touch targets, `grid-cols-[...]` for custom grids

### 2. Responsive Breakpoint Coverage

**Scan**: Grep for `grid-cols-[2-9]` or `flex.*gap`, check for `sm:` / `md:` / `lg:` prefixes

```tsx
// Not allowed
className="grid grid-cols-4 gap-4"
// Correct
className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
```

Check if `flex` horizontal layouts have `flex-wrap` or `flex-col`, if `hidden` / `block` have responsive versions

### 3. Accessibility

**Scan**: Grep for custom interactive elements (non-Shadcn native components), check for `aria-label` / `role`

- [ ] Icon buttons (icon-only, no text) have `aria-label`
- [ ] Custom clickable `<div>` has `role="button"` + `tabIndex={0}` + `onKeyDown`
- [ ] Form `<Input>` is associated with `<Label>` or has `aria-label`
- [ ] Images have meaningful `alt` text

Shadcn/ui components have built-in accessibility support — focus on checking **custom components**.

### 4. Hardcoded Color Detection

**Scan**: Grep for `text-(red|blue|green|yellow|orange|purple|pink|...)-\d`, `bg-(...)-\d`, `border-(...)-\d`

| Hardcoded | Semantic Replacement |
|-----------|---------------------|
| `text-red-500` | `text-destructive` |
| `bg-gray-100` | `bg-muted` |
| `text-gray-500` | `text-muted-foreground` |
| `border-gray-200` | `border-border` |
| `bg-white` | `bg-background` or `bg-card` |
| `text-black` | `text-foreground` |

**Exempt**: `text-emerald-500` / `text-rose-500` for Dashboard trend up/down indicators

### 5. Theme Compatibility

**Scan**: Grep for `bg-white` / `bg-black` / `text-white` / `text-black`

```tsx
// Not allowed
className="bg-white text-black"
// Correct
className="bg-background text-foreground"
```

### 6. State Coverage Check

Read file, check the following conditional branches:
- [ ] Data lists/tables have `loading` / `isLoading` → `<Skeleton>`
- [ ] Empty array check → empty state component
- [ ] API call `error` / `isError` → `<Alert>` or `toast.error()`
- [ ] Button submit `disabled` / `loading` state
- [ ] Form validation error display

### 7. Long Text Defense

- [ ] Titles/names: `truncate` or `line-clamp-1`
- [ ] Descriptions/summaries: `line-clamp-2` or `line-clamp-3`
- [ ] Table cells: `max-w-[...]` + `truncate`
- [ ] Tags/Badges: `max-w-[...]` + `truncate`

### 8. AI-Generated Code Detection

**Gradient decorations** (must fix): `bg-gradient-to|from-purple|from-indigo|from-violet|to-blue|to-cyan` → replace with `bg-primary` or `bg-card`

**Glowing shadows** (must fix): `shadow-.*-500|shadow-.*-400` → replace with `shadow-sm` / `shadow-md`

**Decorative animations** (should fix): `animate-bounce|animate-pulse(?!.*skeleton)|animate-float|animate-blob` → keep only loading and Skeleton

**Emoji as icons** (should fix): emoji in JSX → replace with Lucide icons

### 9. Hover Layout Shift Detection

**Scan**: Grep for `hidden group-hover:(flex|block|inline|inline-flex)`

```tsx
// Not allowed — display toggle causes layout shift, element goes from no-space to taking-space, pushing adjacent elements and causing jitter
className="hidden group-hover:flex ..."

// Correct — always occupies space, only changes opacity, zero layout shift
className="flex opacity-0 group-hover:opacity-100 transition-opacity ..."
```

**Rule**: For in-flow elements (non `absolute`/`fixed`), hover show/hide must use `opacity` toggle, `display` toggle is forbidden.
**Exempt**: `absolute` / `fixed` positioned elements are out of flow, `hidden group-hover:flex` doesn't affect surrounding layout — exempt.

**Only proceed to browser preview after static audit passes.**

---

## Layer 1: Visual Defect Scan (Design Bug Checklist)

> Hard issues — any item present requires a fix. Go through the page item by item.

### Text Issues
- [ ] Text truncated or overflowing container (long text, mixed CJK/Latin)
- [ ] Text overlapping or obscured
- [ ] Line height too tight causing multi-line sticking
- [ ] Text-to-background contrast ratio insufficient (minimum 4.5:1)

### Layout Issues
- [ ] Horizontal scrollbar (unless by design intent)
- [ ] Elements overflowing parent container
- [ ] flex/grid layout collapse (height=0, abnormal width)
- [ ] Elements unexpectedly overlapping
- [ ] Bottom content cut off (overflow-hidden collateral damage)
- [ ] Fixed position elements blocking body content

### Spacing Issues
- [ ] Inconsistent spacing between sibling elements
- [ ] Asymmetric container padding
- [ ] Elements too cramped (spacing < 8px)
- [ ] Excessive spacing causing visual disconnect

### Alignment Issues
- [ ] Same-row elements vertically centered
- [ ] Form labels aligned with inputs
- [ ] Icons aligned with text baseline (common 1-2px offset)

### Color Issues
- [ ] Semantic colors correct (success=green, warning=yellow/orange, error=red, info=blue)
- [ ] Too many colors causing visual noise (ideal: 1 primary + neutral grays + minimal accent)

### Component Consistency
- [ ] Same-type buttons have consistent size
- [ ] Border radius unified (CSS variable --radius)
- [ ] Border styles unified

### Interaction States
- [ ] Clickable elements have hover effect
- [ ] Focusable elements have focus-visible styles
- [ ] Disabled state has visual distinction
- [ ] Loading state has feedback (Skeleton / Spinner)
- [ ] Empty state has friendly guidance
- [ ] Hover-revealed action buttons don't cause layout shift (in-flow elements use `opacity-0 group-hover:opacity-100`, not `hidden group-hover:flex`)

### Images/Icons
- [ ] Images not stretched/distorted (object-cover / object-contain)
- [ ] Icon sizes unified (16px or 20px, don't mix)
- [ ] Icon-to-text spacing gap-1.5 ~ gap-2

---

## Layer 2: Aesthetic Evaluation

> Evaluate from overall page feel. Benchmarks: Linear, Vercel Dashboard, Raycast.
> Detailed design principles in `references/design-heuristics.md`.

### Evaluation Dimensions

| Dimension | Good Signs | Bad Signs | Typical Fix |
|-----------|-----------|-----------|-------------|
| **Whitespace & Breathing Room** | Content area has sufficient whitespace, clear separation between blocks | Elements densely packed, visual suffocation | Increase padding/gap, reduce info per line |
| **Visual Hierarchy** | Title→subtitle→body→auxiliary info clearly layered | All text similar size, can't distinguish primary vs secondary | Adjust font-size/weight, use text-muted-foreground |
| **Visual Rhythm** | Repeated elements have unified rhythm | Same-type elements have irregular size/spacing | Unify gap, unify card height |
| **Information Density** | Key info visible in one screen, not too dense or sparse | Info overload or large blank areas | Adjust layout columns, trim fields |
| **Color Restraint** | 1 primary + neutrals dominant | Colors > 4 varieties | Unify using Shadcn CSS variable colors |
| **Overall Consistency** | Same-type elements have completely unified style | Same-function buttons have different styles in different locations | Extract shared components or unify variants |

### Aesthetic Score (1-5)

Score each dimension, **must include specific reasoning and page location description**:

```
| Dimension | Score | Specific Issue Description |
|-----------|-------|--------------------------|
| Whitespace & Breathing Room | ?/5 | ... |
| Visual Hierarchy | ?/5 | ... |
| Visual Rhythm | ?/5 | ... |
| Information Density | ?/5 | ... |
| Color Restraint | ?/5 | ... |
| Overall Consistency | ?/5 | ... |
| **Total** | **?/30** | |
```

---

## Layer 3: AI-Generated Code Typical Issues

> Most common mistakes when AI writes UI code — must be specifically checked.

1. **Developer aesthetic trap** — All features crammed onto page? Lacking whitespace? → Subtract
2. **Over-decoration** — Unnecessary gradients/multi-layer shadows/flashy animations? → Return to Shadcn defaults
3. **State omission** — Only ideal state? Empty/loading/error states? → Add Skeleton/Empty/Alert
4. **Typography hierarchy chaos** — Random bold/colors/sizes? → Standard H1>H2>H3>body>caption
5. **Spacing system missing** — Magic number spacing? → Tailwind spacing system gap-1/2/3/4/6/8
6. **Mobile forgotten** — Multi-column layouts collapsing on narrow screens? Touch targets large enough? → Responsive classes sm:/md:/lg:
7. **Long text unhandled** — Long titles/descriptions/usernames? → truncate / line-clamp
8. **AI-style gradients/glow** (severe) — Purple-blue gradients? Colored glow shadows? → Remove, use semantic colors + default shadows
9. **AI-style decorative elements** (severe) — Floating blobs/particles/waves? Emoji as icons? → Remove decorations, use Lucide
10. **AI-style template layout** — Hero+three-column cards+CTA formula? Everything centered? → Design based on functional needs, left-align by default
11. **AI-style performance animations** — All elements fade-in? Exaggerated hover? → Keep only state feedback animations

---

## Review Output Format

```markdown
## UI Review Report (Round N)

### Code Static Audit
- [x] Tailwind arbitrary values: no violations
- [ ] Responsive breakpoints: `file.tsx:15` grid-cols-4 missing breakpoints → fixed
- ...

### Visual Defects (Must Fix)
1. [Defect description + location] → Fix suggestion (specific CSS class names)

### Aesthetic Issues (Suggested Optimization)
1. [Issue description + location] → Optimization suggestion

### Performing Well
1. [What's done well]

### Aesthetic Score
| Dimension | Score | Details |
|-----------|-------|---------|
| ... | ... | ... |
| **Total** | **?/30** | |

### AI-Generated Code Check
- [x] No developer aesthetic trap
- [ ] Over-decoration exists → specific description
- AI-style rating: None / Mild / Obvious
```

---

## Iteration Rules

- **Visual defects exist**: Must fix all then re-verify
- **Aesthetic score >= 24/30 with no defects**: Proceed to multi-viewport verification
- **Aesthetic score < 24/30**: Fix then re-verify
- **Maximum 3 iterations**, after round 3 deliver with unresolved items noted

## Multi-Viewport Verification (Required Before Delivery)

After aesthetic score passes, verify at different viewports:
- **Desktop (1280x800)**: Layout space utilization? Information density?
- **Mobile (375x812)**: Horizontal overflow? Touch targets? Content readable?
- **Cross-comparison**: Breakpoint transitions natural? Elements disappearing/overlapping? Font sizes readable?

---

## OpenSpec Collaboration

Final round review report written to the OpenSpec change's review.md:
- Path: `openspec/changes/<current change>/review.md` "UI Review" section
- Format: Use this Skill's standard output format (including aesthetic score table)
- Timing: After final round review completion (intermediate rounds stay in conversation)
