# Dashboard Design Knowledge Base

## Design Philosophy Foundations

### Information Seeking Mantra (Shneiderman's Mantra)

Dashboard information architecture follows **Overview → Zoom → Filter → Details-on-demand**:

| Level | Meaning | Dashboard Mapping |
|-------|---------|------------------|
| Overview | Global overview | KPI metric cards + trend Sparklines |
| Zoom | Focus and magnify | Click card to enter chart details |
| Filter | Conditional filtering | Time range selector, dimension filters |
| Details-on-demand | On-demand details | Hover Tooltip, click to show detail table |

### Data-Ink Ratio

> Edward Tufte: Maximize "data ink," minimize decorative elements.

- **Do**: Every pixel conveys data information, charts have no excess gridlines/background colors
- **Don't**: 3D pie charts, gradient-filled bar charts, purely decorative icons

### Cognitive Load Control

- **Miller's Law**: Core metrics on one screen limited to 5-9
- **Gestalt Proximity**: Related metrics grouped together, using cards or dividers for visual boundaries
- **Gestalt Similarity**: Same data types use consistent visual encoding

---

## Layout Patterns

### F-Pattern Layout (Monitoring/Ops Dashboard)

```
┌─ Sidebar Nav ──┬─ Top Toolbar (time range + refresh rate) ──────┐
│                │                                                 │
│  Nav items     │  ┌─ Metric ─┐ ┌─ Metric ─┐ ┌─ Metric ─┐     │
│                │  └──────────┘ └──────────┘ └──────────┘     │
│                │                                                 │
│                │  ┌─ Main Chart Area ────────────────────────┐  │
│                │  │         Line chart / Area chart           │  │
│                │  └──────────────────────────────────────────┘  │
│                │                                                 │
│                │  ┌─ Table / Log List ───────────────────────┐  │
│                │  └──────────────────────────────────────────┘  │
└────────────────┴────────────────────────────────────────────────┘
```

Suitable for: Grafana, Datadog style
Key: Sidebar fixed width w-60~w-64, content area flex-1

### Z-Pattern Layout (Business Overview Dashboard)

```
┌─ Dashboard Title ────────────────── Time Filter ────┐
│                                                      │
│  ┌─ KPI ─┐  ┌─ KPI ─┐  ┌─ KPI ─┐  ┌─ KPI ─┐      │
│  └───────┘  └───────┘  └───────┘  └───────┘      │
│                                                      │
│  ┌─ Trend Chart (Main Chart) ─────────────────────┐  │
│  └────────────────────────────────────────────────┘  │
│                                                      │
│  ┌─ Distribution Chart ──┐  ┌─ Leaderboard ───────┐  │
│  └────────────────────────┘  └─────────────────────┘  │
└──────────────────────────────────────────────────────┘
```

Suitable for: Stripe Dashboard, Shopify Admin style

### Bento Grid Layout (Modular Dashboard)

Suitable for: Notion Analytics, Apple style
Key: `grid` + `col-span` / `row-span` for uneven module composition

---

## Core Component Design Patterns

### KPI Card

```tsx
<Card>
  <CardHeader className="flex flex-row items-center justify-between pb-2">
    <CardTitle className="text-sm font-medium text-muted-foreground">
      Total Revenue
    </CardTitle>
    <DollarSign className="h-4 w-4 text-muted-foreground" />
  </CardHeader>
  <CardContent>
    <div className="text-2xl font-bold">$45,231.89</div>
    <p className="text-xs text-muted-foreground">
      <span className="text-emerald-500">+20.1%</span> vs last month
    </p>
  </CardContent>
</Card>
```

Design points:
- Label: `text-sm font-medium text-muted-foreground`
- Large number: `text-2xl font-bold` (core focus)
- Trend: Up `text-emerald-500`, Down `text-rose-500`
- Layout: `grid grid-cols-2 md:grid-cols-4 gap-4`

### Sparkline

Height h-8~h-10, no axes no labels, only the line itself.

### Chart Container Standard Structure

```tsx
<Card>
  <CardHeader className="flex flex-row items-center justify-between">
    <div>
      <CardTitle>Revenue Trend</CardTitle>
      <CardDescription>Past 6 months</CardDescription>
    </div>
    <Select defaultValue="6m">...</Select>
  </CardHeader>
  <CardContent>{/* Recharts / Nivo chart */}</CardContent>
</Card>
```

### Data Table

Numeric columns right-aligned `text-right`, text columns left-aligned.

---

## Data Visualization Selection

| Data Relationship | Recommended Chart | Avoid |
|-------------------|------------------|-------|
| Trends/Time series | Line chart, Area chart | Pie chart |
| Comparison/Ranking | Horizontal bar chart | Pie chart (> 5 categories) |
| Proportion/Composition | Donut chart (≤ 5 categories), Stacked bar | 3D pie chart |
| Distribution | Heatmap, Histogram | Line chart |
| Progress/Target | Progress bar, Gauge | Pie chart |

### Chart Design Standards

- **Color**: Primary `hsl(var(--primary))`, series colors same hue different lightness
- **Gridlines**: Dashed `stroke-dasharray`, color `hsl(var(--border))`
- **Tooltip**: Shadcn Card style `rounded-lg border bg-background p-2 shadow-md`
- **Animation**: Entry 300-500ms ease-out, no looping animations

---

## Dashboard Aesthetic Benchmarks

| Product | Learning Focus |
|---------|---------------|
| **Stripe Dashboard** | KPI card design, typographic hierarchy |
| **Linear** | Dark theme, transition animations |
| **Vercel Dashboard** | Status color semantics, real-time data |
| **Shopify Admin** | E-commerce metric display, filter system |
| **Datadog / Grafana** | Monitoring dashboards, draggable layouts |

---

## Dark/Light Theme Key Points

### Dark Theme (Monitoring Dashboards)

- Background not pure black, `hsl(var(--background))`
- Cards slightly lighter than background `hsl(var(--card))`
- Chart colors with increased saturation for readability

### Light Theme (Daily Office Use)

- White cards + subtle border, not relying on shadows
- Chart colors with slightly reduced saturation

---

## Responsive Strategy

| Breakpoint | KPI Card Columns | Chart Layout | Table Handling |
|------------|-----------------|--------------|----------------|
| `lg:` (≥1024px) | 4 columns | Main chart 2/3 + sidebar 1/3 | Full display |
| `md:` (≥768px) | 2 columns | Single column stacked | Hide secondary columns |
| `sm:` (< 768px) | 1 column | Single column stacked | Horizontal scroll or card-ify |

---

## Anti-Pattern Checklist

| Anti-Pattern | Correct Approach |
|--------------|-----------------|
| Christmas tree dashboard (overuse of color) | Unified palette, same data same chart type |
| Metric overload (> 10) | Core 4-6, collapse or paginate the rest |
| 3D charts | Always 2D |
| Pie chart abuse (> 5 categories) | Use horizontal bar chart or donut |
| Real-time refresh flickering | Number animation transitions, partial updates |
| No time context | Label "vs last week", "past 30 days" |
| Excessive precision | Round appropriately, K/M abbreviations |
