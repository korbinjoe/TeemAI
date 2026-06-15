# Shadcn/ui + TailwindCSS + Lucide Design System Specification

## Tech Stack

| Technology | Description |
|-----------|-------------|
| UI Component Library | Shadcn/ui (based on Radix UI accessibility primitives) |
| Icons | Lucide React (clean, consistent, open source) |
| Styling | TailwindCSS + CSS Variables (HSL color system) |
| Utility Function | `cn()` for merging classnames (clsx + tailwind-merge) |
| Frontend Framework | React + TypeScript |

## Shadcn/ui Component Mapping

| Design Element | Shadcn Component | Common Variants / Props |
|---------------|-----------------|------------------------|
| Primary button | `<Button>` | variant="default" / size="lg" |
| Secondary button | `<Button variant="outline">` | "outline" / "ghost" / "link" / "secondary" |
| Danger button | `<Button variant="destructive">` | Delete, dangerous actions |
| Input | `<Input>` | placeholder, disabled, type |
| Textarea | `<Textarea>` | placeholder, rows |
| Select | `<Select>` | `<SelectTrigger>` + `<SelectContent>` + `<SelectItem>` |
| Checkbox | `<Checkbox>` | checked, onCheckedChange |
| Switch | `<Switch>` | checked, onCheckedChange |
| Dialog | `<Dialog>` | `<DialogTrigger>` + `<DialogContent>` + `<DialogHeader>` |
| Sheet | `<Sheet>` | side="right" / "left" / "top" / "bottom" |
| Dropdown Menu | `<DropdownMenu>` | `<DropdownMenuTrigger>` + `<DropdownMenuContent>` |
| Command Palette | `<Command>` | Search, command selection scenarios |
| Tabs | `<Tabs>` | `<TabsList>` + `<TabsTrigger>` + `<TabsContent>` |
| Table | `<Table>` | `<TableHeader>` + `<TableBody>` + `<TableRow>` + `<TableCell>` |
| Card | `<Card>` | `<CardHeader>` + `<CardTitle>` + `<CardContent>` + `<CardFooter>` |
| Alert | `<Alert>` | variant="default" / "destructive" |
| Avatar | `<Avatar>` | `<AvatarImage>` + `<AvatarFallback>` |
| Badge | `<Badge>` | variant="default" / "secondary" / "outline" / "destructive" |
| Skeleton | `<Skeleton>` | Loading placeholder |
| Toast | `<Toaster>` + `toast()` | sonner integration |
| Separator | `<Separator>` | orientation="horizontal" / "vertical" |
| Scroll Area | `<ScrollArea>` | Custom scrollbar styling |

## Lucide Icon Usage Standards

| Scenario | Recommended Icon | Size |
|----------|-----------------|------|
| Add | `<Plus>` / `<PlusCircle>` | 16/20 |
| Edit | `<Pencil>` / `<Settings>` | 16/20 |
| Delete | `<Trash2>` / `<X>` | 16/20 |
| Search | `<Search>` | 16/20 |
| User | `<User>` / `<Users>` | 16/20 |
| Loading | `<Loader2 className="animate-spin">` | 16/20 |

## TailwindCSS Spacing Mapping

| Semantic | Tailwind Class | Pixel Value | Use Case |
|----------|---------------|-------------|----------|
| Tight | `gap-1` | 4px | Icon and text |
| Related | `gap-2` | 8px | Related elements |
| Within component | `p-4` / `gap-4` | 16px | Component internals |
| Between sections | `gap-6` | 24px | Card spacing |
| Large sections | `gap-8` | 32px | Page regions |

## Color System (Shadcn HSL CSS Variables)

```css
--background / --foreground       /* Page */
--card / --card-foreground         /* Card */
--primary / --primary-foreground   /* CTA */
--secondary / --secondary-foreground
--muted / --muted-foreground       /* Subdued */
--accent / --accent-foreground     /* Hover highlight */
--destructive                      /* Danger */
--border / --input / --ring        /* Borders/focus */
--radius                           /* Global border-radius */
```

## Typography Standards

- H1: `text-2xl font-bold` → H2: `text-xl font-semibold` → H3: `text-lg font-medium`
- Body: `text-sm` (14px) / Helper: `text-xs` (12px)
- Subdued text: `text-muted-foreground`

## State Design (Must Consider)

- **Loading state**: `<Skeleton>` or `<Loader2 className="animate-spin">`
- **Empty state**: Centered description + action guidance button
- **Error state**: `<Alert variant="destructive">` or `toast.error()`
- **Disabled state**: `opacity-50 pointer-events-none` or `disabled` prop

## Accessibility

- Custom interactive elements must have `aria-label`
- Color contrast meets WCAG 2.1 AA (4.5:1)
- Keyboard reachability: `tabIndex`, `focus-visible:ring-2 ring-ring`
