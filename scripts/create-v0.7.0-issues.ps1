param(
  [string]$Repo = "",
  [switch]$DryRun
)

$ErrorActionPreference = "Stop"

function Get-RepoSlug {
  param([string]$ExplicitRepo)

  if ($ExplicitRepo) {
    return $ExplicitRepo
  }

  $remote = git remote get-url origin
  if ($remote -match 'github\.com[:/](?<owner>[^/]+)/(?<repo>[^/\.]+)(?:\.git)?$') {
    return "$($Matches.owner)/$($Matches.repo)"
  }

  throw "Could not infer the GitHub repository slug. Pass -Repo owner/name."
}

function Get-FirstHeading {
  param([string]$Path)

  $content = Get-Content -Raw $Path
  if ($content -match '(?m)^#\s+(.+)$') {
    return $Matches[1].Trim()
  }

  throw "No H1 heading found in $Path"
}

function Get-BodyWithSubstitutions {
  param(
    [string]$Path,
    [int]$ParentIssueNumber,
    [string]$ChildIssueList
  )

  $body = Get-Content -Raw $Path
  $body = $body.Replace('{{PARENT_ISSUE_NUMBER}}', [string]$ParentIssueNumber)
  $body = $body.Replace('{{CHILD_ISSUE_LIST}}', $ChildIssueList)
  return $body
}

function Get-AvailableNames {
  param([string]$Endpoint)

  $raw = gh api $Endpoint --paginate --jq '.[].name'
  if (-not $raw) { return @() }
  return @($raw -split "`r?`n" | Where-Object { $_ })
}

function Get-AvailableMilestones {
  param([string]$Endpoint)

  $raw = gh api $Endpoint --paginate --jq '.[].title'
  if (-not $raw) { return @() }
  return @($raw -split "`r?`n" | Where-Object { $_ })
}

function Invoke-GhIssueCreate {
  param(
    [string]$Title,
    [string]$BodyPath,
    [string[]]$Labels,
    [string]$Milestone,
    [string]$RepoSlug
  )

  $args = @('issue', 'create', '--repo', $RepoSlug, '--title', $Title, '--body-file', $BodyPath)

  foreach ($label in $Labels) {
    $args += @('--label', $label)
  }

  if ($Milestone) {
    $args += @('--milestone', $Milestone)
  }

  $output = & gh @args
  if ($LASTEXITCODE -ne 0) {
    throw "gh issue create failed for '$Title'"
  }

  $url = ($output | Select-Object -Last 1).Trim()
  if (-not $url) {
    throw "gh issue create did not return a URL for '$Title'"
  }

  return $url
}

function Get-IssueNumberFromUrl {
  param([string]$Url)

  if ($Url -match '/issues/(?<number>\d+)$') {
    return [int]$Matches.number
  }

  throw "Could not parse issue number from $Url"
}

$repoSlug = Get-RepoSlug -ExplicitRepo $Repo
$docsRoot = Join-Path $PSScriptRoot '..\docs\issues\v0.7'

$issueSpecs = @(
  @{ File = '00-v0.7.0-hosted-tableau-mcp-migration-foundation.md'; Labels = @('documentation', 'architecture', 'tableau-mcp', 'tool-layer'); IsParent = $true },
  @{ File = '01-v0.7.0-planning-and-boundaries.md'; Labels = @('documentation', 'architecture', 'tableau-mcp', 'tool-layer') },
  @{ File = '02-audit-current-stdio-tableau-mcp-usage.md'; Labels = @('documentation', 'architecture', 'tableau-mcp', 'tool-layer') },
  @{ File = '03-audit-hosted-tableau-mcp-requirements-and-constraints.md'; Labels = @('documentation', 'architecture', 'tableau-mcp', 'tool-layer') },
  @{ File = '04-define-tableau-mcp-transport-abstraction.md'; Labels = @('architecture', 'tableau-mcp', 'tool-layer') },
  @{ File = '05-define-stdio-vs-hosted-transport-configuration-strategy.md'; Labels = @('architecture', 'tableau-mcp', 'tool-layer') },
  @{ File = '06-define-hosted-mcp-oauth-user-context-and-site-settings-boundary.md'; Labels = @('architecture', 'tableau-mcp') },
  @{ File = '07-define-read-only-tableau-metadata-tool-definitions.md'; Labels = @('architecture', 'tableau-mcp', 'tool-layer') },
  @{ File = '08-define-metadata-tool-input-output-schemas.md'; Labels = @('architecture', 'tableau-mcp', 'tool-layer') },
  @{ File = '09-define-metadata-tool-preconditions-and-governance-boundaries.md'; Labels = @('architecture', 'tableau-mcp', 'tool-layer') },
  @{ File = '10-register-metadata-tools-with-fake-no-network-handlers.md'; Labels = @('backend', 'tableau-mcp', 'tool-layer') },
  @{ File = '11-add-transport-aware-metadata-tool-execution-boundary.md'; Labels = @('backend', 'tableau-mcp', 'tool-layer') },
  @{ File = '12-add-metadata-output-normalization-and-trace-events.md'; Labels = @('backend', 'tableau-mcp', 'tool-layer') },
  @{ File = '13-document-migration-path-from-stdio-to-hosted-tableau-mcp.md'; Labels = @('documentation', 'architecture', 'tableau-mcp', 'tool-layer') },
  @{ File = '14-v0.7.0-wrap-up.md'; Labels = @('documentation', 'architecture', 'tableau-mcp', 'tool-layer') }
)

$availableLabels = @()
$availableMilestones = @()
$canFilterLabels = $false

try {
  $availableLabels = Get-AvailableNames -Endpoint "repos/$repoSlug/labels"
  $canFilterLabels = $true
} catch {
  Write-Warning "Could not query repository labels. Proceeding without label filtering."
}

try {
  $availableMilestones = Get-AvailableMilestones -Endpoint "repos/$repoSlug/milestones"
} catch {
  Write-Warning "Could not query repository milestones. Proceeding without milestone filtering."
}

$milestoneName = 'v0.7.0'
$milestoneAvailable = $availableMilestones -contains $milestoneName

$created = @()
$parentIssueNumber = $null
$parentIssueUrl = $null

foreach ($spec in $issueSpecs) {
  $filePath = Join-Path $docsRoot $spec.File
  $title = Get-FirstHeading -Path $filePath

  if ($spec.ContainsKey('IsParent') -and $spec.IsParent) {
    $body = Get-Content -Raw $filePath
  } else {
    $body = Get-BodyWithSubstitutions -Path $filePath -ParentIssueNumber $parentIssueNumber -ChildIssueList ''
  }

  $tempFile = [System.IO.Path]::GetTempFileName()
  Set-Content -Path $tempFile -Value $body -NoNewline

  $labels = @()
  if ($canFilterLabels) {
    $labels = @($spec.Labels | Where-Object { $availableLabels -contains $_ })
  }

  if ($DryRun) {
    Write-Host "[dry-run] Would create: $title"
    Write-Host "[dry-run] Labels: $($labels -join ', ')"
    if ($milestoneAvailable) {
      Write-Host "[dry-run] Milestone: $milestoneName"
    }
    Remove-Item $tempFile -Force
    continue
  }

  $createArgs = @{
    Title = $title
    BodyPath = $tempFile
    Labels = $labels
    Milestone = $(if ($milestoneAvailable) { $milestoneName } else { $null })
    RepoSlug = $repoSlug
  }

  $issueUrl = Invoke-GhIssueCreate @createArgs
  $issueNumber = Get-IssueNumberFromUrl -Url $issueUrl
  $created += [pscustomobject]@{
    Number = $issueNumber
    Title = $title
    Url = $issueUrl
    File = $spec.File
    IsParent = [bool]($spec.ContainsKey('IsParent') -and $spec.IsParent)
  }

  if ($created[-1].IsParent) {
    $parentIssueNumber = $issueNumber
    $parentIssueUrl = $issueUrl
  }

  Remove-Item $tempFile -Force
}

if (-not $DryRun) {
  $childLines = $created | Where-Object { -not $_.IsParent } | ForEach-Object {
    "- #$($_.Number) $($_.Title)"
  }

  $parentFile = Join-Path $docsRoot '00-v0.7.0-hosted-tableau-mcp-migration-foundation.md'
  $parentBody = Get-Content -Raw $parentFile
  $parentBody = $parentBody.Replace('{{CHILD_ISSUE_LIST}}', ($childLines -join "`n"))

  $parentTemp = [System.IO.Path]::GetTempFileName()
  Set-Content -Path $parentTemp -Value $parentBody -NoNewline

  & gh issue edit $parentIssueNumber --repo $repoSlug --body-file $parentTemp | Out-Null
  if ($LASTEXITCODE -ne 0) {
    throw "gh issue edit failed for parent issue"
  }

  Remove-Item $parentTemp -Force

  Write-Host "Created issues:"
  $created | ForEach-Object {
    Write-Host "- #$($_.Number) $($_.Title) ($($_.Url))"
  }
}
