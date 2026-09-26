# VibeRent Product and Development Documentation

This directory is the working source of truth for planning, building, and verifying VibeRent. The older root notes remain useful design inputs; these documents turn those inputs into implementation-ready requirements and living trackers.

## Document map

| File | Purpose | Update when |
| --- | --- | --- |
| [PRODUCT_SCOPE.md](./PRODUCT_SCOPE.md) | Product goals, users, roles, boundaries, terminology, and success measures | Product direction or scope changes |
| [FEATURES.md](./FEATURES.md) | Complete feature and subfeature catalog with priorities and acceptance criteria | A requirement is added, changed, or completed |
| [USER_FLOWS.md](./USER_FLOWS.md) | End-to-end operational flows, alternate paths, and recovery behavior | A workflow or status transition changes |
| [DOMAIN_RULES.md](./DOMAIN_RULES.md) | Business rules, calculations, permissions, and status machines | Business logic changes |
| [DATA_MODEL.md](./DATA_MODEL.md) | Conceptual entities, relationships, and audit expectations | Persistence or API design begins |
| [ROADMAP.md](./ROADMAP.md) | Delivery phases, dependencies, milestones, and release gates | Priorities or sequencing changes |
| [BACKLOG.md](./BACKLOG.md) | Actionable epics and tickets | Work is created, refined, started, or closed |
| [DEVELOPMENT_TRACKER.md](./DEVELOPMENT_TRACKER.md) | Current build status, active milestone, verification, and blockers | Every meaningful development session |
| [QA_CHECKLIST.md](./QA_CHECKLIST.md) | Functional, responsive, accessibility, and release checks | Features or quality standards change |
| [DECISIONS.md](./DECISIONS.md) | Accepted decisions and unresolved questions | A durable technical/product decision is made |

## Requirement identifiers

- `F-<module>-<number>`: feature or subfeature, for example `F-VEH-03`.
- `FL-<module>-<number>`: user flow, for example `FL-BKG-01`.
- `BR-<module>-<number>`: business rule, for example `BR-AVL-02`.
- `E-<number>`: epic in the backlog.
- `T-<number>`: implementation ticket.
- `D-<number>`: product or architecture decision.

Every ticket should link to at least one feature or flow. Every completed feature should have matching QA coverage.

## Status vocabulary

| Status | Meaning |
| --- | --- |
| Planned | Defined but not scheduled |
| Ready | Refined, dependencies resolved, and safe to start |
| In progress | Actively being implemented |
| In review | Implementation finished and undergoing QA/review |
| Done | Acceptance criteria and required verification passed |
| Blocked | Cannot proceed without a recorded dependency or decision |
| Deferred | Intentionally outside the current release |

## Source precedence

When requirements conflict, use this order:

1. Latest explicit user request
2. `AGENTS.md`
3. `docs/DECISIONS.md` accepted decisions
4. `ArchFocus.md`
5. `Design2.md`
6. `UI.md`
7. `Phases.md`
8. `Design.md`

## Tracking discipline

At the end of each development session:

1. Update the relevant ticket in `BACKLOG.md`.
2. Update the feature status in `DEVELOPMENT_TRACKER.md`.
3. Record commands actually run and their results.
4. Record new blockers or decisions.
5. Add a concise entry to the tracker activity log.

