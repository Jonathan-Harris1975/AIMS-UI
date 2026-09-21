# AIMS-UI UX/UI audit and redesign report

## Stage 1 audit

Baseline was recorded before implementation. `npm run build` was required first because `check:bundle-budget` expects `dist/`; the direct budget command otherwise fails with `ENOENT`. The clean baseline then passed `npm run validate`.

| Page | Issue | User impact | Proposed fix | Effort | Priority |
|---|---|---|---|---|---|
| Global | 98 declarations used 9–12px text, with 9px and 10px used for operational metadata. | Dense information became unnecessarily difficult to scan. | Use a five-step scale with 12px as the minimum UI size. | M | P1 |
| Global | Radius values ranged across roughly 5–18px plus pill/circle values despite three radius tokens. | Components looked related but not systematic. | Consolidate to 8/12/16px tokens; reserve circles for dots/avatars. | S | P1 |
| Global | Console CSS contained 15 literal hex colours plus many literal rgba values outside the token file. | Theme changes were risky and status/accent meaning drifted. | Move colour decisions into tokens and use semantic status colours only for status. | M | P1 |
| Global | Five gradients and 32 box-shadow declarations added visual noise. | Surfaces competed for attention in an oversight console. | Use flat tonal surfaces and borders; keep one overlay shadow token. | M | P1 |
| Shell | Standalone sidebar and embedded navigation used parallel patterns with different density and hierarchy. | Operators had to relearn location cues between HIVE and standalone use. | Give both modes the same active-state, spacing, icon and inbox hierarchy language. | M | P1 |
| Navigation | Inbox expansion and select controls used a text glyph chevron. | The glyph was visually inconsistent with the SVG icon system. | Replace with SVG chevrons while preserving semantics. | S | P2 |
| Sidebar | Footer stacked three card-like blocks and exposed the raw API base URL. | Low-value infrastructure detail competed with navigation and identity. | Reduce to a quiet HIVE link, connection indicator and operator identity; hide infrastructure detail. | S | P1 |
| Dashboard | Metrics and channel mix had similar visual weight to overdue/review work. | Automated throughput could distract from exceptions requiring intervention. | Lead with “Needs attention”; keep four compact metrics and quiet automation context. | M | P1 |
| Inbox / DMs / Comments | Status, channel, priority and overdue controls were permanently expanded alongside quick filters. | Filter chrome dominated the queue before any work was read. | Keep quick views visible and place advanced filters behind one native disclosure. | M | P1 |
| Queue | Desktop table carried nine columns, while mobile cards exposed a different hierarchy. | Scanning cost increased and the most actionable fields were diluted. | Preserve the table/card contract but reduce decorative channel styling and emphasise conversation, priority, status and age. | M | P1 |
| Workspace | Thread, AI, contact, assignment, provider actions and destructive actions competed in one header/context stack. | High-risk actions sat too close to routine handling controls. | Make the thread focal, keep the composer sticky, use a quieter context rail, and move destructive actions into an overflow disclosure. | M | P1 |
| Approvals | Approval cards were visually similar to general content cards. | Decision work did not read as an exception queue. | Use a sparse decision-first row with risk, rationale and one route into verified context. | S | P1 |
| Contacts | Contact management expanded inline above the list. | Editing displaced the browsing context. | Present the existing editor as a desktop slide-over while retaining the mobile flow. | S | P2 |
| Workflows / Quarantine | Card treatment made operational lists feel heavier than their content warranted. | Repeated containers reduced scan speed. | Use simple bordered rows and keep row-level actions explicit. | S | P2 |
| Analytics | Small metric cards and decorative bars split attention. | Key figures were less legible than they should be. | Use four larger figures and a single restrained relative-volume view. | S | P2 |
| Settings | Eight similarly weighted cards mixed identity, health, provider controls and low-frequency technical information. | High-frequency channel status was hard to distinguish from reference detail. | Flatten card styling, group related status, and visually demote low-frequency reference content. | M | P2 |
| Notifications / boot / error | Overlays and transient states used a separate elevation/radius vocabulary. | System states felt disconnected from the console. | Apply the same surface, border, radius, type and focus rules; keep retry prominent on error. | S | P2 |
| CogniPal widget | The widget used gradients, multiple shadows and its own broad radius/elevation vocabulary. | The public widget felt more decorative than the operator product. | Duplicate a compact Shadow DOM token set deliberately and align spacing, radii, flat surfaces and motion. | M | P2 |
| Responsive / accessibility | Existing coarse-pointer, reduced-motion and queue-card rules were correct but layered beneath several later overrides. | Future edits could accidentally regress touch and motion behaviour. | Consolidate responsive rules and keep explicit 44px coarse-pointer targets and reduced-motion overrides. | M | P1 |

### Audit colour inventory

The pre-redesign console stylesheet contained these non-token hex colours: `#061126`, `#08192d`, `#0a192d`, `#10354a`, `#12243d`, `#15465d`, `#1686c0`, `#1d4c72`, `#2a8c68`, `#4169ba`, `#6c58bd`, `#c44a83`, `#c83a48`, `#dff9ff`, `#fff`, plus 36 distinct literal `rgba(...)` forms. The redesigned console stylesheet contains no literal colour values; all colour decisions now resolve through `packages/theme/tokens.css`.

## Implementation summary

- **Design system:** five type steps, 4px spacing scale, three radii, base/raised/overlay surfaces, three text levels, one accent, semantic status colours, one overlay shadow and 150/180ms motion tokens.
- **Shell and navigation:** quieter sidebar, consistent active states, SVG chevrons, reduced footer noise, aligned embedded navigation and retained mobile drawer.
- **Dashboard:** exception-oriented copy and “Needs attention” hierarchy; automated activity remains visible but subordinate.
- **Inbox, DMs and comments:** one shared queue language, segmented quick views, advanced filters behind a native disclosure, desktop table and mobile cards retained.
- **Conversation workspace:** thread remains primary, composer is sticky, context is visually quieter, notes are distinct, handling remains a single segmented control, and destructive actions move to an overflow disclosure without changing confirmation behaviour.
- **Approvals:** simplified decision rows keep risk and rationale adjacent to the context action. Direct approve/reject was not added because the list derives candidates from queue state rather than verified approval records.
- **Contacts:** existing editor becomes a desktop slide-over without changing contact APIs or edit/delete behaviour.
- **Workflows and quarantine:** flatter row treatment and clearer action hierarchy.
- **Analytics:** larger figures and one restrained channel-volume visual.
- **Settings:** lower visual weight, clearer status grouping and consistent control styling.
- **Notifications, boot and error:** unified surfaces, typography, focus treatment and overlay elevation; retry remains the primary error action.
- **CogniPal:** flat header/body treatment, reduced elevation, consistent 8/12/16px radii, 44px controls, quieter bubbles and preserved wake/typing/status semantics.

## Verification

### Bundle budget

| Measurement | Before | After | Change |
|---|---:|---:|---:|
| Total bytes | 303,505 | 296,252 | -7,253 |
| JavaScript gzip | 39,033 | 39,212 | +179 |
| CSS gzip | 12,055 | 9,451 | -2,604 |
| Largest asset | 95,014 | 95,761 | +747 |

The final build remains below the JavaScript warning threshold and all hard limits.

### Contrast

WCAG contrast was computed from the final opaque text and surface tokens. All normal-text pairs tested exceed 4.5:1. The weakest tested pair is faint text on the overlay surface at **6.65:1**. Primary accent text uses `--aims-accent-ink` on `--aims-accent` at **9.49:1**. No token-pair failures were found.

### Responsive and input checks

Static responsive rules cover the requested 375px, 768px, 1280px and 1920px widths: mobile queue cards activate at 640px, the drawer/context transition occurs at 900px, two-column metric adaptation occurs at 1100px, and the default layout covers 1280/1920px. Standalone and embedded navigation retain separate containers but now share the same design language and active-state system. Coarse-pointer rules enforce 44px targets; reduced-motion disables meaningful animation and transition duration.

A live keyboard walkthrough of every data-backed view could not be completed from the repository alone because the console requires a valid AIMS bootstrap/session and no test data may be invented under the source constraints. Keyboard semantics were therefore verified statically against the existing button, link, table-row `tabindex`, listbox, dialog, skip-link and focus-visible contracts, all of which remain in place. The boot and error states remain operable without data.

### Validation

`npm run validate` passes after the design-system stage and after the widget stage. The final validation also passes all 61 tests, lint, source checks, secret scan, dependency audit, build and bundle-budget checks.

## Tests modified

None. The redesign preserves every assertion in `tests/ui-overhaul.test.mjs`, including the required token values, responsive queue rules, coarse-pointer and reduced-motion media queries, skip link, `100dvh`, named main content, search label, notification dialog semantics, current-page state, busy state, autonomous-reply provenance, widget live-region roles and the 44×44 send control.

## Deliberately not implemented

- **Desktop master-detail inbox at ≥1280px:** not added because it would duplicate the workspace in the list route, increase JavaScript/bundle cost and complicate the existing hash-routing model.
- **Direct approve/reject actions in the approvals list:** not added because that view derives approval candidates from queue risk/escalation fields rather than verified approval objects. Adding decision controls there would risk changing data semantics.
- **New removable active-filter chips:** not added because they require new state/control behaviour beyond the presentation-only constraint. The quick-view state and existing clear-filter behaviour remain intact.
- **New charts or chart interactions:** not added because the repository has no chart dependency and the current relative bars communicate the available channel-volume data with less code.
- **New settings features or provider controls:** not added because they would exceed the UI-only scope.
- **Worker changes:** none made.
