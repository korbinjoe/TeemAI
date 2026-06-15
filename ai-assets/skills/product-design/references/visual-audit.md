# Visual Audit Framework

A systematic visual quality check on existing interfaces to ensure design system consistency and professional quality.

## Audit Dimensions and Rating Standards

Each dimension rated A-F:

| Rating | Meaning |
|--------|---------|
| **A** | Excellent — Achieves Stripe/Linear level of refinement |
| **B** | Good — Professional quality, only minor imperfections |
| **C** | Acceptable — Functional but lacks polish |
| **D** | Insufficient — Obvious inconsistencies that affect professionalism |
| **F** | Severe — Visual chaos, needs restructuring |

## Dimension 1: Spacing System

**Check 4/8px Grid Compliance**

A good spacing system lets the interface "breathe." Check that all spacing comes from a unified spacing scale.

```
Standard Scale (based on 4px):
0  2  4  6  8  12  16  20  24  32  40  48  64  80  96  128
```

**Checklist**:
- [ ] Component internal spacing (padding) follows spacing scale
- [ ] Component gap spacing (gap/margin) follows spacing scale
- [ ] Same-level elements have consistent spacing
- [ ] Section spacing > component spacing > element spacing (progressive hierarchy)
- [ ] Page margins are uniform
- [ ] List item spacing is even

**Common issues**:
- Non-standard spacing values used (e.g., 15px, 22px, 35px)
- Similar areas on same page use different spacing
- Inconsistent spacing between headings and content

## Dimension 2: Typography Hierarchy

**Check Type Scale Compliance**

Typography hierarchy establishes visual priority of information. A product should have 5-7 clear type levels.

```
Recommended Type Scale:
Display:   32-48px / Bold    — Page main title
H1:        24-32px / Semibold — Section title
H2:        20-24px / Semibold — Card/block title
H3:        16-18px / Medium   — Subtitle
Body:      14-16px / Regular  — Body text
Caption:   12-13px / Regular  — Helper text
Overline:  11-12px / Medium   — Labels/categories (uppercase)
```

**Checklist**:
- [ ] Font family count ≤ 2 (one display, one body)
- [ ] Font weight usage ≤ 4 variants
- [ ] Line-height: body 1.5-1.7, headings 1.2-1.4
- [ ] Hierarchy is clear — levels quickly distinguishable by size/weight
- [ ] Same-level text styles are globally consistent
- [ ] Minimum font size ≥ 12px

## Dimension 3: Color System

**Check Design Token Compliance**

Colors should come from a semantic Token system, not arbitrary hex values.

**Checklist**:
- [ ] Primary colors used consistently (primary/secondary/accent)
- [ ] Semantic colors correct (success=green, error=red, warning=yellow, info=blue)
- [ ] Gray scale ladder is clear (no fewer than 5 levels: 50/100/200.../900)
- [ ] No "outlier colors" — all colors traceable to the Token system
- [ ] Color semantics consistent in dark/light mode
- [ ] Text-to-background contrast ≥ 4.5:1

**Common issues**:
- Similar but not identical colors mixed (e.g., #333 and #2d2d2d coexisting)
- Too many gray levels, indistinguishable hierarchy
- Too many accent colors, diluting primary color recognition

## Dimension 4: Component Consistency

**Check Uniformity of Same-Type Elements**

Same type of component in different locations should maintain visual and behavioral consistency.

**Checklist**:
- [ ] Button — Same-level buttons look identical across pages (border-radius, height, font-size, padding)
- [ ] Input — Input height, border style, placeholder style unified
- [ ] Card — Card shadow, border-radius, internal padding consistent everywhere
- [ ] Table — Header style, row height, alignment unified
- [ ] Modal/Dialog — Width, spacing, button position unified
- [ ] Icon — Icon style (line/filled/duotone) globally consistent, sizes systematic (16/20/24px)
- [ ] Badge/Tag — Color semantics and border-radius globally unified

**Common issues**:
- Different height buttons on same page
- Dialog widths vary with content, no standard sizes
- Multiple icon libraries mixed

## Dimension 5: Responsive & Layout

**Check Cross-Device Experience**

Check layout adaptation at 3 key breakpoints:

| Breakpoint | Device | Layout Strategy |
|-----------|--------|-----------------|
| 375px | Mobile | Single column stacked, bottom nav, touch optimized |
| 768px | Tablet | Collapsible sidebar, adaptive content area |
| 1440px | Desktop | Multi-column layout, persistent sidebar, full width utilization |

**Checklist**:
- [ ] Layout fully functional at all three breakpoints
- [ ] No horizontal scrolling
- [ ] Text doesn't overflow containers
- [ ] Images correctly cropped/scaled
- [ ] Touch targets ≥ 44x44px (mobile)
- [ ] Key actions reachable at all breakpoints

## Dimension 6: Accessibility Compliance

See Dimension 3: Accessibility in `heuristic-evaluation.md` for details.

In visual audit, focus on:
- [ ] Color contrast meets standards
- [ ] Focus states visible
- [ ] Interactive elements have aria-label
- [ ] Information not conveyed by color alone

## Audit Report Template

```markdown
# Visual Audit Report — [Product/Page Name]

## Overview

| Dimension | Rating | Notes |
|-----------|--------|-------|
| Spacing System | B | Generally follows 8px grid, 2 card spacing inconsistencies |
| Typography Hierarchy | A | Clear hierarchy, globally unified |
| Color System | C | 3 outlier color values present, semantic colors used correctly |
| Component Consistency | B | Buttons and inputs unified, icon styles mixed |
| Responsive | D | Multiple overflows on mobile, tablet not adapted |
| Accessibility | C | Contrast mostly meets standards, focus states missing |

## Detailed Findings

### High Priority
1. [Specific issue + location + expected vs actual]

### Improvement Suggestions
1. [Specific suggestion + expected effect]
```
