# Design Heuristics Knowledge Base

## Aesthetic Benchmarks

The following products represent current best-in-class Web UI design:

- **Linear**: Minimalist, efficient, balanced information density, elegant in both dark/light mode
- **Vercel Dashboard**: Restrained, clear, generous whitespace, refined typography
- **Raycast**: Lightweight, fast, smooth interactions, polished components

Common characteristics:
1. **Restraint** — No excess decoration, every element has a clear purpose
2. **Breathing room** — Generous whitespace, content never crowded
3. **Clear hierarchy** — Primary and secondary elements distinguishable at a glance
4. **Consistency** — Same elements always look the same
5. **Refined details** — Spacing, border-radius, shadows all carefully tuned

---

## 10 Core Design Heuristics

> Refined from Nielsen's Heuristics + Material Design + Apple HIG, adapted for frontend development.

### 1. Visibility of System Status
Users should always know what the system is doing. Every action should have immediate feedback.
- **Do**: Show loading spinner after button click, show toast after form submission
- **Don't**: No feedback after button click, no progress indicator for background operations

### 2. Match Between System and Real World
Interface terminology, concepts, and layout should match users' everyday cognition.
- **Do**: Use "Save" not "Persist", use "Delete" not "Destroy Instance"
- **Don't**: Expose technical details to regular users

### 3. User Control and Freedom
Users often make mistakes — they need clear "emergency exits" to undo.
- **Do**: Confirmation dialog for delete, form reset capability, undoable actions
- **Don't**: One-click delete with no recovery, closing dialog loses filled content

### 4. Consistency and Standards
Within the same system, same concepts use same expression methods.
- **Do**: All delete buttons use destructive variant, all forms left-aligned
- **Don't**: Page A delete is an icon button, Page B delete is a text link

### 5. Error Prevention
Good design prevents errors at the source.
- **Do**: Disable unavailable buttons, restrict input format, Select instead of free-form input
- **Don't**: Allow wrong input then pop error messages

### 6. Recognition Rather Than Recall
Make options, actions, and information visible to reduce memory burden.
- **Do**: Dropdown selection instead of manual input, breadcrumb navigation, recent history

### 7. Flexibility and Efficiency
Provide simple paths for novices and shortcuts for experts.
- **Do**: Keyboard shortcuts (Cmd+K command palette), batch operations, front-load common actions

### 8. Aesthetic and Minimalist Design
Interfaces should not contain irrelevant information. Every extra element competes for attention with key info.
- **Do**: Only show information relevant to current context, progressively disclose details

### 9. Help Users Recognize and Recover from Errors
Error messages should use plain language, precisely describe the problem, and suggest solutions.
- **Do**: "Invalid email format, please enter like name@example.com"
- **Don't**: "Error: invalid input"

### 10. Help and Documentation
The best design needs no manual, but concise help should be available when needed.
- **Do**: Input placeholder examples, Tooltip supplementary info, empty state guidance

---

## Best Practices for Common Page Types

### List Page (List / Table View)

```
┌─ Page Title ───────────────────── [+ New Button] ─┐
│                                                    │
│  Search box        [Filters]     [Sort]            │
│                                                    │
│  ┌───────────────────────────────────────────────┐ │
│  │ List item / Table row                          │ │
│  │ ───────────────────────────────────────────── │ │
│  │ List item / Table row                          │ │
│  └───────────────────────────────────────────────┘ │
│              ← 1 2 3 ... →                         │
└────────────────────────────────────────────────────┘
```

- Title + primary action button same row, right-aligned
- Search/filters above list, gap-4~6
- List items separated by border-b (saves space)
- Empty state: Centered icon + copy + CTA

### Detail Page (Detail View)

```
┌─ ← Back     Page Title     [Edit] [Delete] ───────┐
│                                                    │
│  ┌── Primary Info Area ──────────────────────────┐ │
│  │ Large title / Description / Tags               │ │
│  └────────────────────────────────────────────────┘ │
│                                                    │
│  ┌── Tabs ────────────────────────────────────────┐ │
│  │ [Overview] [Activity] [Settings]               │ │
│  │ Tab content area                               │ │
│  └────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────┘
```

- Use Tabs to organize different dimensions of information
- Action buttons ordered by danger level: safe on left, dangerous on right

### Form Page (Form View)

- Form max-width constrained (max-w-lg or max-w-xl), not full-width
- Labels above Inputs (not to the left), better for scan reading
- gap-4~6 between field groups
- Action buttons bottom right-aligned, primary button on right
- Error messages immediately below field, text-destructive

### Dashboard

> See `references/dashboard-design.md` for details

- Metric cards `grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4`
- Large numbers `text-2xl font-bold`, labels `text-sm font-medium text-muted-foreground`
- Trend semantic colors: Up `text-emerald-500`, Down `text-rose-500`
- Core metrics 4-6 (Miller's Law)

---

## Component Composition Patterns

### Search + Filter + List

```tsx
<div className="space-y-4">
  <div className="flex items-center gap-2">
    <Input placeholder="Search..." className="max-w-sm" />
    <Select><SelectTrigger className="w-[150px]">...</SelectTrigger></Select>
    <Button variant="outline" size="sm">Filter</Button>
    <div className="ml-auto"><Button>New</Button></div>
  </div>
  <div className="rounded-md border">...</div>
</div>
```

### Empty State

```tsx
<div className="flex flex-col items-center justify-center py-12 text-center">
  <Icon className="h-12 w-12 text-muted-foreground/50 mb-4" />
  <h3 className="text-lg font-medium">No data yet</h3>
  <p className="text-sm text-muted-foreground mt-1 mb-4">Guidance copy</p>
  <Button>Create first one</Button>
</div>
```

### Confirmation Dialog

```tsx
<AlertDialog>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>Are you sure you want to delete?</AlertDialogTitle>
      <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel>Cancel</AlertDialogCancel>
      <AlertDialogAction className="bg-destructive">Delete</AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

### Page Header

```tsx
<div className="flex items-center justify-between">
  <div>
    <h1 className="text-2xl font-bold tracking-tight">Page Title</h1>
    <p className="text-muted-foreground">Page description</p>
  </div>
  <div className="flex items-center gap-2">
    <Button variant="outline">Secondary Action</Button>
    <Button>Primary Action</Button>
  </div>
</div>
```

---

## Spacing Quick Reference

| Element Relationship | Recommended Spacing | Tailwind |
|---------------------|-------------------|----------|
| Icon and text | 6px | `gap-1.5` |
| Related elements | 8px | `gap-2` |
| Between form fields | 16px | `gap-4` / `space-y-4` |
| Between sections | 24px | `gap-6` / `space-y-6` |
| Between page regions | 32px | `gap-8` / `space-y-8` |
| Container padding | 16-24px | `p-4` ~ `p-6` |
| Page margins | 24-32px | `px-6` ~ `px-8` |

## Font Size Quick Reference

| Level | Size | Weight | Tailwind |
|-------|------|--------|----------|
| Page title H1 | 24px | Bold | `text-2xl font-bold tracking-tight` |
| Section title H2 | 20px | Semibold | `text-xl font-semibold` |
| Subtitle H3 | 18px | Medium | `text-lg font-medium` |
| Body text | 14px | Normal | `text-sm` |
| Helper text | 12px | Normal | `text-xs text-muted-foreground` |
| Large number metric | 24-30px | Bold | `text-2xl font-bold` ~ `text-3xl font-bold` |
