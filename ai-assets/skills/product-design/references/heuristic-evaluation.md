# Design Review Framework

A comprehensive framework combining Nielsen's heuristic principles, Gestalt psychology, and WCAG accessibility standards into 7 review dimensions. During review, scan each dimension and tag each issue with a severity level.

## Dimension 1: Usability (Nielsen's Heuristics)

Based on Jakob Nielsen's 10 heuristic principles, focusing on functional experience quality.

| # | Principle | Checkpoints |
|---|-----------|-------------|
| 1 | Visibility of system status | Does the user always know "where I am, what the system is doing, what's next"? Are Loading/progress/success/failure states clear? |
| 2 | Match between system and real world | Is the language close to users' mental model? Are icons intuitive? Is information order natural? |
| 3 | User control and freedom | Is undo/back supported? Can mistakes be recovered? Are there "emergency exits"? |
| 4 | Consistency and standards | Do same operations always produce same results? Are platform conventions followed? Is terminology unified? |
| 5 | Error prevention | Are users warned before making mistakes? Do dangerous operations have confirmation steps? Are inputs reasonably constrained? |
| 6 | Recognition rather than recall | Are options/actions visible or easily discoverable? Is user memory burden reduced? |
| 7 | Flexibility and efficiency | Does it support both novices and experts? Are there shortcuts/batch operations? Is personalization supported? |
| 8 | Aesthetic and minimalist design | Does every element have a reason to exist? Is information overload avoided? Is visual noise minimized? |
| 9 | Help users recognize and recover from errors | Do error messages explain the problem in plain language? Do they give specific fix suggestions? |
| 10 | Help and documentation | Do complex features have contextual help? Does it only appear when needed? |

## Dimension 2: Visual Perception (Gestalt Principles)

Based on Gestalt psychology, checking whether visual element organization matches human perception patterns.

- **Proximity**: Are related elements spatially close? Do unrelated elements have sufficient spacing?
- **Similarity**: Are functionally identical elements visually consistent (color, shape, size)?
- **Continuity**: Is the user's gaze guided along a logical path?
- **Closure**: Are visual groupings clear? Could fewer borders/dividers be used?
- **Figure-ground**: Are foreground and background layers distinct? Is primary vs secondary content immediately clear?
- **Common fate**: Are elements that operate together visually grouped?

## Dimension 3: Accessibility (WCAG 2.1 AA)

Minimum standard is WCAG 2.1 AA level, focusing on these core checks:

### Perceivable
- [ ] Text color contrast ≥ 4.5:1 (body text), ≥ 3:1 (large text)
- [ ] Non-text element contrast ≥ 3:1 (icons, borders, inputs)
- [ ] Images have alt text, decorative images marked `aria-hidden`
- [ ] Information not conveyed by color alone (colorblind friendly)
- [ ] Text scalable to 200% without information loss

### Operable
- [ ] All interactive elements keyboard reachable (Tab order logical)
- [ ] Focus state visible and clear
- [ ] Clickable areas ≥ 44x44px
- [ ] No keyboard traps
- [ ] Escape closes modals

### Understandable
- [ ] Form fields have visible labels
- [ ] Error messages associated with corresponding fields
- [ ] Page language correctly set

### Robust
- [ ] Semantic HTML (buttons not simulated with divs, lists use ul/ol)
- [ ] ARIA attributes correctly used (role, aria-label, aria-expanded, etc.)

## Dimension 4: Interaction Quality

- **Feedback immediacy**: Is there visual feedback within 100ms of an action?
- **Animation purposefulness**: Do animations serve a purpose (guide attention/express relationships/confirm actions)? Duration 150-300ms?
- **State completeness**: Are all five states designed — Loading / Error / Empty / Success / Partial?
- **Reversibility**: Do destructive operations have secondary confirmation or undo?
- **Fault tolerance**: Does the system degrade gracefully on input errors?

## Dimension 5: Information Architecture

- **Navigation clarity**: Can users find their target within 3 seconds? Navigation depth ≤ 3 levels?
- **Content priority**: Is the most important information seen first?
- **Naming consistency**: Is the same concept called the same name in different locations?
- **Search/Filter**: When content exceeds 20 items, is search or filtering provided?

## Dimension 6: Responsive Design

- **Breakpoint behavior**: Is layout reasonable at 375px / 768px / 1440px?
- **Touch adaptation**: Are mobile tap targets large enough? Are gestures supported?
- **Content truncation**: How is long text handled on small screens?
- **Horizontal scroll**: Is horizontal scrolling avoided?

## Dimension 7: Content and Copy

- **Conciseness**: Can the copy be shorter without losing information?
- **Actionability**: Are button labels verb phrases? Do they clearly state the action outcome?
- **Tone consistency**: Is it unified globally (formal/friendly/technical)?
- **Error copy**: Does it avoid technical jargon? Does it tell users "what to do"?

## Severity Level Definitions

| Level | Definition | Action |
|-------|-----------|--------|
| **Blocker** | Prevents users from completing core tasks, or serious accessibility/security issues | Must fix before release |
| **High** | Significantly impacts user experience, but has workaround | Should fix in current iteration |
| **Medium** | Experience suboptimal but acceptable, users won't leave | Improve in next iteration |
| **Nit** | Detail polish, only affects refined feel | Handle when bandwidth allows |
