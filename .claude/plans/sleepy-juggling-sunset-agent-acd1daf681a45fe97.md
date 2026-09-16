# Code Review Plan: Precision @ Medium Effort

This plan implements a high-precision code review process to identify maintainer-worthy findings.

## Phase 0: Gather the Diff
- [ ] Identify the review scope using `git diff main...HEAD`.
- [ ] Include uncommitted changes using `git diff HEAD`.
- [ ] Read the resulting diff to establish the context for all subsequent phases.

## Phase 1: Find Candidates (8 Angles)
I will execute 8 independent finder angles, each aiming for up to 6 candidates.

1.  **Angle A (Line-by-Line Scan)**: Examine every hunk and its enclosing function for logic errors (off-by-ones, null derefs, missing awaits, etc.).
2.  **Angle B (Removed-Behavior Auditor)**: Trace deleted/replaced lines to ensure the enforced invariants are re-established in the new code.
3.  **Angle C (Cross-File Tracer)**: Analyze callers and callees of changed functions to ensure no breaking changes in preconditions, return shapes, or exceptions.
4.  **Reuse**: Search for existing helpers or utilities in the codebase that the new code re-implements.
5.  **Simplification**: Identify unnecessary complexity, redundant state, or deep nesting that can be simplified.
6.  **Efficiency**: Detect wasted computation, redundant I/O, sequential-instead-of-parallel operations, or closure-based memory leaks.
7.  **Altitude**: Verify that fixes address root causes rather than applying fragile symptom-level bandaids.
8.  **Conventions**: Check for violations of rules defined in `~/.claude/CLAUDE.md`, repo-root `CLAUDE.md`, and ancestor directory `CLAUDE.md` files.

## Phase 2: Verify
- [ ] Dedup candidates pointing to the same mechanism.
- [ ] Run a 1-vote verification for each remaining candidate:
    - **CONFIRMED**: Specific trigger + wrong output/crash.
    - **PLAUSIBLE**: Mechanism real, trigger uncertain.
    - **REFUTED**: Factually wrong or guarded elsewhere.
- [ ] Filter for CONFIRMED and PLAUSIBLE only.

## Final Output
- [ ] Rank surviving findings by severity.
- [ ] Produce a JSON array of the top 8 findings with `file`, `line`, `summary`, and `failure_scenario`.
