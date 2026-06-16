---
name: design-taste-frontend
description: >
  Frontend design quality guard for building or redesigning user-facing
  interfaces. Use when creating pages, dashboards, tools, workflows, or visual
  components that need polished product judgment rather than generic layout.
allowed-tools: Read, Write, Edit, Glob, Grep, Bash
---

# design-taste-frontend

Use this skill whenever an agent is asked to design, implement, or review a
frontend experience.

## Operating stance

- Start from the user's real workflow, not a decorative page template.
- Preserve the existing product's design system unless the task is explicitly a
  redesign.
- Prefer dense, calm, scannable interfaces for operational tools.
- Build the actual usable surface first; do not make a marketing landing page
  unless the user asked for one.
- Make every control and state that the target user would naturally expect.

## Visual standards

- Use clear hierarchy, restrained spacing, and stable responsive constraints.
- Avoid nested cards, one-note palettes, generic gradient backgrounds, floating
  decorative blobs, and oversized hero typography inside compact panels.
- Use icons for common toolbar actions when the project already has an icon
  library.
- Keep cards at modest radius unless the local design system says otherwise.
- Ensure text fits in buttons, cards, tables, sidebars, and mobile layouts.
- Do not let hover states, counters, labels, loading text, or dynamic content
  resize fixed-format UI such as boards, grids, and toolbars.

## Interaction standards

- Use tabs for alternate views, segmented controls for mode switching, toggles
  for binary settings, menus for option sets, and sliders or inputs for numeric
  values.
- Add loading, empty, disabled, error, and success states for user-facing flows.
- Keep common workflows ergonomic for repeated use: minimize mode switching,
  preserve context, and make navigation predictable.
- For complex canvases or editors, toolbars should be icon-first with tooltips
  for unfamiliar actions.

## Verification

Before finishing frontend work:

- Run the relevant typecheck or build.
- Inspect the UI in browser screenshots when a dev server can run.
- Check at least one desktop and one mobile width for clipping, overlap, and
  unusable controls.
- Scan CSS color usage; revise if the page reads as a single dominant hue unless
  that is an explicit brand constraint.

