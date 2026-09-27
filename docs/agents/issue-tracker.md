# Issue tracker: local Markdown

Specs and tickets live under `.scratch/<feature>/` in this repository. The GitHub remote stores the code; the local files are the work tracker.

## Find and update work

- Read `.scratch/<feature>/spec.md` for the feature specification when it exists.
- Read one ticket at `.scratch/<feature>/issues/NN-<slug>.md` for its scope, `Blocked by` dependencies, and `Status`.
- A ticket is available when its blockers have `Status: done` (or `**Status:** done`) and its own status is `ready-for-agent`.
- Change the ticket's status in that file as work progresses. Keep its acceptance checklist current.
- When reviewing code, use the referenced ticket as the Spec source. If none is referenced, inspect the changed feature directory under `.scratch/`.

## Publish a new spec or ticket

Create `.scratch/<feature>/spec.md` and one file per ticket under `.scratch/<feature>/issues/`, numbered from `01`. Put `Blocked by` and `Status` near the top. Record dependencies as ticket numbers, and keep tickets self-contained enough to implement from their files.

## Wayfinder

For a large decision effort, keep the map at `.scratch/<effort>/map.md` and decision tickets at `.scratch/<effort>/issues/NN-<slug>.md`. A ticket records `Type`, `Blocked by`, and `Status` (`claimed` or `resolved`). Resolve blockers first and link each resolved decision from the map.
