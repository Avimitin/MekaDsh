# Codebase review

Reviewed on October 2, 2026 against the local DeepSeek Harness and mekaweb checkouts.

**Initial assessment: 76/100. After fixes: 92/100.** These are engineering judgments
based on the checks below, not an accessibility certification or proof of complete
functional parity.

| Area | Initial | After fixes | Maximum |
| --- | ---: | ---: | ---: |
| Code quality and maintainability | 21 | 23 | 25 |
| UI consistency and responsive behavior | 18 | 23 | 25 |
| Accessibility | 14 | 23 | 25 |
| Functional confidence and verification | 23 | 23 | 25 |
| Total | 76 | 92 | 100 |

## Findings addressed

- **High: mobile conversation unusable.** The fixed 280px sidebar left roughly
  110px for the conversation at a 390px viewport. Navigation now opens in a modal
  drawer; the conversation uses the full viewport width. Session details become
  a dialog on narrow screens. Desktop layout preferences remain separate.
- **High: incomplete dialog isolation and focus management.** Background content
  remained interactive; hidden controls could enter the focus cycle. Dialogs now
  isolate background content, handle nested dialogs and owned portals, skip hidden
  controls, restore focus, and restore body scrolling. Media dialogs share this
  lifecycle. Dialog descriptions are associated with their content.
- **High: insufficient text contrast.** Small muted text measured 3.7:1 against
  white, sidebar text 3.54:1, and the connected badge 2.08:1. Text now uses stronger
  existing tokens or theme-derived colors. Syntax highlighting, error messages,
  and status text received the same treatment.
- **Medium: invalid control semantics.** Appearance preferences declared tabs
  controlling nonexistent panels. They now expose radio groups with arrow-key
  navigation. The sidebar resize separator now has a label, value, bounds, and
  keyboard controls.
- **Medium: disconnected session navigation.** The mobile sessions callback was a
  no-op. It now opens navigation and closes appropriately after navigation.
- **Medium: docked composer ignored reading width.** The composer now follows
  the transcript width, anchor, and offset, with the reference capsule clearance.
- **Medium: inconsistent theme and motion behavior.** JSON and Mermaid palettes,
  duplicate shadows, an undefined background token, and missing reduced-motion
  behavior were corrected. The copied base design token sheets remain unchanged.
- **Medium: avoidable startup loading.** Pages now load on demand. The app imports
  its toast directly and loads primitive tokens explicitly. The main JavaScript
  bundle fell from approximately 1,578 KB to 573 KB minified (439 KB to 178 KB gzip).
  Large rendering chunks still produce Vite's size warning.
- **Medium: gaps in presentation regression coverage.** Added 79 upstream tests
  for history grouping, queued-message association, image validation, diagram
  source restrictions, and table sizing. The existing 279 tests remain intact.

## Verification

- `npm run typecheck`: passed.
- `npm run build`: passed, with the remaining chunk-size warning noted above.
- `npm test`: 358 tests in 20 files passed.
- `nix build`: passed after the final changes.
- Chromium with axe-core WCAG 2 A/AA and WCAG 2.1 AA checks: no reported violations
  on the welcome page, six management/conversation routes in light and dark themes,
  connection/resource/schedule dialogs, the mobile conversation shell, and a saved
  conversation with code, a table, a task list, math, and a Mermaid diagram.
- Keyboard checks passed for mobile navigation, sidebar resizing, narrow-screen
  details, nested dialogs, portaled menus, image previews, forward/reverse Tab,
  Escape, background isolation, and focus restoration.
- Browser fixtures reported no uncaught page errors.
- No behavior or API changes were made to `src/api`, `src/session`,
  `src/connections`, or `src/notifications` during this review.

## Remaining limits

Browser checks used mocked API responses in Chromium. A live meka server, actual
provider turns, production credentials, Safari/Firefox, and manual screen-reader
use were not exercised. Automated accessibility scans cover the tested states,
not every possible session or tool output. Visual comparison used local dsh source
styles and rendered mekadsh screenshots; pixel-for-pixel parity with a running dsh
instance was not established. Browser regression scripts were temporary review
tooling; the committed unit suite does not yet replace a browser CI suite.


## Harness workspace port, October 2, 2026

The earlier score evaluates engineering quality, not completeness or fidelity to
Harness. This iteration adds frontend behavior without changing meka's API or the
ported functionality core:

- Resizable, expandable Files / Activity / Session panel with mobile dialogs.
- Recorded file operations, edit-snippet diffs, source, Markdown and static HTML
  previews, copy/download, and conversation summary links.
- Searchable execution records with type/error filters and actual saved timestamps.
- Inline skill/profile/permission suggestions and textual session references.
- Directory-filtered session navigation and child-agent inspection.

Verification: typecheck, production build, Nix build, and all 397 tests in 23 files pass.
Chromium checks cover desktop (1440px), mobile (390px), and narrow (320px) layouts,
expanded panels, file/operation selection, previews, filtering, and directory
selection. No page overflow, uncaught page errors, or axe WCAG A/AA findings were
reported in the tested settled states. Focused checks also cover dark activity,
touch suggestion selection, IME, read-only/running sessions, explicit profile
PATCH behavior, and child-session pagination. HTML preview probes found no script
execution, navigation, or external requests; Markdown images render as links.

File records cover successful tool operations available in loaded history. They
are not a live filesystem or a complete per-turn Git diff. Activity uses saved
message timestamps, not an execution timing trace. The current API does not expose
remote file browsing/downloads, interactive terminals, preview proxies, account
administration, or Harness's plugin runtime. Physical iPhone Safari and manual
screen-reader checks remain unperformed. Existing large rendering-chunk warnings
remain in Vite builds.
