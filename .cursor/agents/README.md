# Taylor worker system

Specialist agents for Webroom work. The orchestrator delegates; workers run in **waves** with explicit file ownership to avoid merge conflicts.

## Agents

| File | Invoke as | Runs |
|------|-----------|------|
| [taylor-orchestrator.md](./taylor-orchestrator.md) | `taylor-orchestrator` | Plans waves, assigns lanes, merges handoffs |
| [taylor-implementer.md](./taylor-implementer.md) | `taylor-implementer` | Schema, lib, API, UI — see file-creation checklists |
| [taylor-auditor.md](./taylor-auditor.md) | `taylor-auditor` | Security + completeness after implementation |
| [taylor-verifier.md](./taylor-verifier.md) | `taylor-verifier` | `npm test`, `npm run lint`, `npm run build` |
| [taylor-product-writer.md](./taylor-product-writer.md) | `taylor-product-writer` | README, PLAN, env docs |

## Quick wave diagram

```
schema → lib (parallel) → api (parallel) → ui (parallel) → docs → audit → verify → merge
```

## Copy-paste handoff (orchestrator → any worker)

```markdown
## Taylor handoff
- **Branch:** cursor/<name>-207e
- **Wave:** <1-7>
- **Lane:** <schema | lib | api | ui | docs | audit | verify>
- **Files you OWN:** ...
- **Files READ ONLY:** ...
- **Depends on:** ...
- **Produces:** ...
- **Definition of done:** ...
- **Permanent out of scope:** visitor analytics
```

## Active build scope (owner-directed)

Ship with full code: hosted uploads, DMs, feed, recommendations, federation, self-hosting, Spotify/YouTube embeds, plugin marketplace, AI page assist.

**Never ship:** visitor analytics.

## Hotspot files (one owner per wave)

`schema.sql` · `db.ts` · `pageDocumentTypes.ts` · `pageDocument.ts` · `moduleRegistry.tsx` · `globals.css`

## Worker tandem rules

1. **Schema lane finishes first** — others consume migration note + type note
2. **Lib workers** export functions before API/UI import them
3. **product-writer runs after** routes and env vars exist in code
4. **auditor before verifier** — verifier only proves tests/build, not security
5. **Every implementer** leaves: migration note, type note, test list, env note

See each agent file for full checklists.
