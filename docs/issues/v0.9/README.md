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

## After running

- Issue numbers are assigned by GitHub at creation time.
- Parent / child links can be refined after creation if needed.
- The created URLs are printed by the script.
