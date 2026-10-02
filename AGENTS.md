# AGENTS.md

mekadsh is a static web frontend for the [meka](https://github.com/k4yt3x/meka) agent
daemon. Its user experience replicates the DeepSeek Harness (dsh) web client; its
functionality matches [mekaweb](https://github.com/k4yt3x/mekaweb). It talks to meka's
HTTP + SSE API (`/v1/...`, bearer auth) from the browser and builds to a static `dist/`.

## Layout

- `src/api/`, `src/session/`, `src/connections/`, `src/notifications/` — the
  functionality core, ported from mekaweb (AGPL-3.0). **Do not change their behavior or
  public APIs**; the UI is built against them. `src/api/schema.d.ts` is generated from
  meka's OpenAPI capture.
- `src/styles/` — dsh design tokens (`design-platform.css`, `base.css`, `focus.css`,
  `scrollbar.css`, `shiki.css`, `corner-shape.css`, `fonts/`), copied verbatim from dsh
  (MIT). `globals.css` imports them and holds app-wide base rules. **Style with the
  `--dsw-*` tokens; never hardcode colors.**
- `src/ui/` — all presentation. `ui/primitives/` replicates dsh `ui-primitives`;
  feature areas under `ui/` (layout, sidebar, chat, composer, pages).
- `src/lib/` — tiny shared helpers (`cn`).

## UI conventions

- React 19 + TypeScript strict (`noUncheckedIndexedAccess`,
  `exactOptionalPropertyTypes`, `verbatimModuleSyntax` — use `import type`).
- **CSS Modules** (`Component.module.css` next to `Component.tsx`), like dsh. No
  Tailwind. Class names are camelCase locals. Compose with `cn()` from `src/lib/cn.ts`.
- Design tokens only: colors `var(--dsw-alias-*)` / `var(--dsw-specific-*)`, radii
  `var(--dsw-radius-*)`, motion `var(--ds-transition-*)` on `var(--ds-ease-in-out)`,
  fonts `var(--dsw-font-family)` / `var(--ds-font-family-code)`. Dark theme is automatic
  via `body[data-ds-dark-theme]` token overrides; **never write a dark-mode media query
  in component CSS**.
- Icons: `src/ui/icons/index.tsx` (dsh's set, MIT) — `Icon<Name><Outline|Fill><Regular|Medium>`,
  `size` prop, `currentColor`. No other icon library.
- Copy is hardcoded American English, sentence case. No em dashes.
- Visual reference: the dsh monorepo checkout at `/tmp/dsh` (read-only). Match its
  look and micro-interactions exactly; adapt its `.module.css` files where possible.
  Functional reference: mekaweb checkout at `/tmp/mekaweb` (read-only).
- dsh components sometimes route copy through locale hooks and state through Cordis
  slots/stores: strip all of that. Plain props + callbacks, hardcoded English strings.

## Core API surface for UI code

From `src/connections/context.tsx`:

- `useRuntime()` → `ConnectionRuntime` (has `storage`, `notifications`).
- `useConnection()` → `{ connection?, api?, controller?, info?, busy, error?,
  connectionIssue? }`. `info` is meka's `/v1/info` (version, scopes, vision...).
- `useSettings()` → persisted `Settings` (theme, conversationFontSize,
  conversationMaxWidth/Anchor/Offset, showTurnContext, notification prefs, layout).
  Mutate through `runtime.storage` methods.
- `useResource<T>(path, query?, enabled?, refetchInterval?)` → TanStack Query result
  for GET endpoints.
- `useCan(scope)` → token scope check (`'sessions:w'`, `'memory:w'`, ...).

From `src/session/hooks.ts`: `useSessionStates()` → `SessionState[]` (one per open
session). Key `SessionState` fields: `session`, `feed` ('connecting' | 'connected' |
'reconnecting' | 'closed' | 'unavailable' | 'unloaded'), `running`, `compacting`,
`textStreaming`, `blocks` (live `LiveBlock[]`: text/thinking/tool/submission), `tools`
(`Record<id, LiveTool>` with state composing→executing→completed|error|ended, output,
activity, progress), `approvals` (`Approval[]`), `notices`, `submissions`, `saved`
(persisted `MessagesResponse`), `lastTurn`.

`SessionController` methods the UI drives: `select(id)`, `open`, `refresh(id)`,
`earlier(id)` (back-pagination), `submitInitialMessage`, `submitMessage(id, text,
ComposerOptions)`, `cancel(id)`, `respond(approval, 'allow'|'deny'|'allow_always'|
'deny_always')`, `withdrawInbox`, `retryInbox`, `deleteSession`, `patchSettings`,
`draft(id)`/`saveDraft(id, ComposerOptions)`, `reconnect(id)`.

## Build and verification

- `npm run typecheck`, `npm run build`, `npm test` must pass.
- `nix build` produces the static site at `result/` (flake `packages.default`).
- `nix develop` provides Node 24.
