# Secret Scanning

This repository uses Gitleaks as the primary local secret scanner.

## What Is Checked

- staged changes in `npm run quality:precommit`
- repository state in `npm run quality:prepush`
- forbidden local secret file paths such as `.env`, private key files, and credential JSON files

## How To Install Gitleaks

Use one of the official Gitleaks installation paths:

- Windows: `winget install Gitleaks.Gitleaks`
- macOS: `brew install gitleaks`
- Go-based install: `go install github.com/gitleaks/gitleaks/v8@latest`
- Official release binary: download the matching binary from the Gitleaks releases page

If Gitleaks is installed outside `PATH`, set `GITLEAKS_BIN` to the full binary path before running the quality gates.

## Review Rules

- Do not bypass Gitleaks failures with `--no-verify`.
- Do not add allowlist entries for a false positive without human review.
- Keep allowlists minimal and narrowly scoped.
- Do not add real-looking secrets to test data, docs, or fixtures.

## Validation

- `npm run quality:precommit`
- `npm run quality:prepush`
- `npm run test:e2e`
