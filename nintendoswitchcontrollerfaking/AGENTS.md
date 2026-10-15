<!-- graft:start -->
## Graft — repo context graph

This repo is indexed in `graft/`: small linked markdown nodes that explain each
system and carry exact file:line spans, kept in sync with the code through git.

For ANY task here — understanding how something works, finding where code lives,
or scoping a change — get context from the graph before grepping or opening
source files. Re-ask freely (it's cheap) and reuse literal identifiers you
already have (symbol, error string, file name) as the query. New to this repo?
Run `graft map` first — a token-budgeted orientation (dir clusters, hubs,
hotspots), no LLM, no key.

- Run `graft ask "<your question>" --source` → ranked nodes with the relevant
  code spans inlined (each hit's ≤8-line crux by default; `--full` for whole
  definitions when the crux isn't enough). Match the tool to the task shape:
  for understanding or editing, the top node IS the answer — cite its
  `covers:` file:line spans and edit straight from `--source`. For
  exhaustive tasks ("every occurrence / every caller of this pattern"), ranked
  results are top-N, not complete — run `graft grep "<literal>"` instead
  (exhaustive over indexed files, grouped by enclosing symbol), falling back
  to raw `grep -rn` only for unindexed files.
- `graft skeleton <file>` → every definition's signature + span, ~10× cheaper
  than reading the file; use it to skim an API surface.
- `graft callers <symbol>` gives precomputed, exact edges — who calls this.
  Add `--direction out` for what it calls, or `--depth N` to walk
  transitively for the full blast radius. For structural questions, skip
  ranking and use this directly.
- Or browse: `graft/INDEX.md` lists every node; follow the links.
- Monorepos and folders of multiple repos rank fairly across sub-projects —
  hits carry `[scope/]` labels naming which one they're from. Narrow with
  `graft ask "<task>" --in <scope>/` once you know where you're working.

If a returned span is truncated ("+N more lines"), open the file at that exact
range before finalizing. Only open source files when a node genuinely lacks a
needed detail, and then at the exact file:line the node points to — never
re-read whole files.

After big code changes, refresh the graph with `graft build` (deterministic,
no API key, $0).
<!-- graft:end -->



## Core Development Principles

When modifying this codebase:

1. Understand the intended outcome before changing code.
2. Make the smallest possible change that solves the current problem.
3. Preserve the existing architecture unless a structural change is clearly necessary.
4. Do not refactor unrelated code.
5. Do not introduce abstractions for hypothetical future requirements.
6. Reuse existing functions, utilities, types, and patterns before creating new ones.
7. Prefer simple, obvious, maintainable code over clever or overly generic code.
8. Keep the scope narrow and aligned with the current request.
9. Do not rename files, classes, functions, methods, or variables unless required.
10. Do not add new configuration options unless the current task requires them.

## Anti-Slop Rules

Avoid common AI-generated code problems:

- unnecessary abstractions
- unnecessary wrapper classes
- unnecessary manager, factory, strategy, or service layers
- helper functions that are only used once without improving readability
- speculative extensibility
- duplicated logic
- copy-pasted code with minor variations
- excessive comments
- comments that merely restate the code
- unnecessary defensive checks
- unnecessary error handling for unrealistic cases
- dead code
- unrelated cleanup
- broad refactoring outside the requested scope
- deeply nested control flow
- overly compressed one-liners
- unnecessary file or module splitting

Prefer boring, direct, readable code.

## Code Clarity

- Prefer one meaningful operation per statement.
- Use intermediate variables when they improve readability, debugging, or intent.
- Keep functions focused on one clear responsibility.
- Prefer early returns over deeply nested conditions.
- Comments should explain why, not what.
- Avoid cleverness when straightforward code is sufficient.

## Existing Code First

Before writing new code:

1. Search the repository for similar existing behavior.
2. Check whether an existing helper, utility, abstraction, or pattern can be reused.
3. Follow the existing project style unless there is a strong reason not to.
4. Do not create a new abstraction until you verify that an equivalent one does not already exist.

## Change Boundary

Before implementation, determine:

- what must change
- what must not change
- the minimum files required
- the existing code that can be reused

If the task can be solved by changing one function, do not redesign surrounding architecture.

If more than 3 files need to change, explain why before making broad changes.

## Scope Control

Solve the current requirement only.

Do not add support for:
- future hypothetical use cases
- possible future integrations
- unrequested extensibility
- additional workflows that were not asked for

If the request is ambiguous, interpret it conservatively and avoid expanding scope.

## Diff Discipline

Keep the diff minimal.

After implementation, review only the changes you made and check for:

- unnecessary abstractions
- unnecessary helpers
- duplicated logic
- speculative flexibility
- excessive comments
- unnecessary defensive code
- unrelated refactoring
- dead code
- naming changes that were not required

Simplify the implementation where possible without changing behavior.

## Implementation Workflow

Before coding:

1. Restate the intended outcome briefly.
2. Identify the minimum files to change.
3. Identify existing code that should be reused.
4. State what will intentionally remain unchanged.

During coding:

1. Keep changes local.
2. Follow existing patterns.
3. Avoid introducing unnecessary layers.
4. Prefer direct implementation over generalized frameworks.

After coding:

1. Review the diff.
2. Remove AI slop.
3. Simplify anything that can be made more direct.
4. Confirm that unrelated behavior was not changed.
5. Confirm that the result still matches the original request.

## Review Standard

Review the final diff as if you were a senior engineer reviewing a pull request from a junior developer.

Ask:

- Is every changed line necessary?
- Is there a simpler implementation?
- Did this introduce an abstraction without a real need?
- Did this duplicate existing behavior?
- Did this modify anything unrelated?
- Would another engineer understand this quickly?
- Would I approve this diff as-is?

If not, simplify it before finishing.

## Guiding Rule

Solve the current problem with the least complexity necessary.

Do not optimize for hypothetical future requirements.
Optimize for clarity, correctness, minimal change, and maintainability.