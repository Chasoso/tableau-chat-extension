# v0.9.0 Issue Set

This directory is reserved for v0.9.0 issue planning references.

## Purpose

- `scripts/create-v0.9-issues.sh` creates the v0.9.0 parent issue and the 12 child issues with GitHub CLI.
- The script is designed to be run manually after `gh auth status` succeeds.
- The script checks for the `v0.9.0` milestone and creates it if needed, or prints explicit manual steps if automatic creation is unavailable.

## Before running

- Make sure `gh auth status` succeeds for `Chasoso/tableau-chat-extension`.
- Make sure the repository exists and is reachable.
- Make sure the `v0.9.0` milestone exists, or let the script create it.
- Issue #182 is the planning boundary for this milestone.
- #186 defines the structured metadata discovery plan shape that later issues build on.
- #188 defines the controlled `listFields` discovery contract, including caps,
  truncation, and permission-aware omission behavior.
- The contract details live in `docs/v0.9-controlled-listfields-discovery-contract.md`.
- The v0.9.0 result summary lives in `docs/v0.9-structured-discovery-result.md`.
- The final v0.9.0 wrap-up lives in `docs/v0.9-wrap-up.md`.

## After running

- Issue numbers are assigned by GitHub at creation time.
- Parent / child links can be refined after creation if needed.
- The created URLs are printed by the script.
- The v0.9.0 result summary is recorded in `docs/v0.9-structured-discovery-result.md`.
