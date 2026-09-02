# PAGER source installation report

Completed on 2026-09-02 UTC: **26 new global registrations** are installed and verified: 24 GitHub skills, the public-apis reference, and the Open Design bridge. Skills become available on the next Codex turn.

Work was confined to global skills/reference directories and the project files listed below. No PAGER app code, shared ledger, package files, installed Open Design application files, or other workers' files were edited or committed. No subagents were used.

## Retained deliverables

- `docs/sources.lock.json`: source URLs, observed refs, full commits, licenses, original/installed paths, hashes, namespace changes, helper evidence, and local bridge metadata.
- `docs/sources-report.md`: this inventory, verification results, and update procedure.
- `docs/sources-verification.json`: installation integrity and completeness results.
- `docs/sources-extra-verification.json`: independent API-row coverage, collision refusal, archive path protection, and idempotent-install evidence.
- `scripts/setup-sources.py`: pinned preparation, installation, verification, API reindexing, and read-only update discovery. Uses the Python standard library; requires Python 3.11+ and `rg`.
- `scripts/setup-sources.ps1`: PowerShell entry point; defaults to verification.

## Global storage and source fidelity

Active registration root: `C:/Users/elaza/.codex/skills`.

Complete source/reference root: `C:/Users/elaza/.codex/references/pager-sources`.

The six complete snapshots contain **1,713 files / 47,231,513 bytes**. Storage is organized as follows:

| Location under the reference root | Contents |
| --- | --- |
| `repositories/<owner>--<repo>/<full-commit>/snapshot/` | Complete, unmodified repository files, including licenses, scripts, references, assets, fonts, and notices |
| Same revision directory | `source.zip`, `source.json`, `commit.json`, `git-tree.json`, and `files.sha256.json` |
| `installer-staging/` | Original copies installed through the official helper, outside the global discovery tree |
| Adjacent `*.helper.json` files | Exact helper arguments, exit codes, output, and helper hash |
| `installed-manifests/` | Per-registration SHA-256 file inventories |
| `indexes/` | Generated public-apis and Open Design indexes |
| `preparation.json` and baseline manifests | Pre-install registration inventory and original-file evidence |

Every snapshot file was checked against its blob hash in the pinned Git tree. Each installed GitHub skill additionally contains `_pager_source/SKILL.upstream.md`, the original entrypoint, and `_pager_source/source.json`, its provenance and explicit adaptations. Repository-level license/notice/README context is also retained there. Complete ancestor and sibling resources remain in the original snapshot.

No upstream runtime dependencies or services were installed or started. Snapshot and installed-tree digests are retained in the lockfile.

## Pinned repositories

Branch names describe where commits were observed. Installations use full immutable commits, not moving branch refs.

| Repository | Observed ref | Pinned commit | Files |
| --- | --- | --- | ---: |
| [anthropics/skills](https://github.com/anthropics/skills) | `main` | [`53048666b05b4799081517d00e09e0a2dd688678`](https://github.com/anthropics/skills/commit/53048666b05b4799081517d00e09e0a2dd688678) | 419 |
| [anthropics/claude-code](https://github.com/anthropics/claude-code) | `main` | [`aef74afe01f65b602258d6102b0da9730ac6f0aa`](https://github.com/anthropics/claude-code/commit/aef74afe01f65b602258d6102b0da9730ac6f0aa) | 229 |
| [blader/humanizer](https://github.com/blader/humanizer) | `main` | [`e2e92e7b4b8229253ed5c8e81dc65463fdeddda5`](https://github.com/blader/humanizer/commit/e2e92e7b4b8229253ed5c8e81dc65463fdeddda5) | 9 |
| [Vladimir-Human/humanizer-ru](https://github.com/Vladimir-Human/humanizer-ru) | `main` | [`df918c383731c6063b064fd18cb243c05f4c1a9d`](https://github.com/Vladimir-Human/humanizer-ru/commit/df918c383731c6063b064fd18cb243c05f4c1a9d) | 747 |
| [Nutlope/hallmark](https://github.com/Nutlope/hallmark) | `main` | [`13ac0ec7e148655948100b6396439e481361d690`](https://github.com/Nutlope/hallmark/commit/13ac0ec7e148655948100b6396439e481361d690) | 286 |
| [public-apis/public-apis](https://github.com/public-apis/public-apis) | `master` | [`9d0426870ee7edc9ffedf21cc5b2e87604819549`](https://github.com/public-apis/public-apis/commit/9d0426870ee7edc9ffedf21cc5b2e87604819549) | 23 |

Each full snapshot path is `C:/Users/elaza/.codex/references/pager-sources/repositories/<owner>--<repo>/<commit>/snapshot`. Exact URLs, paths, commit dates, license evidence, and hashes are also recorded individually in the lockfile.

## Installation inventory

Each registration lives at `C:/Users/elaza/.codex/skills/<registration>/`. Its directory name and top-level YAML `name` agree. Original names and exact upstream entrypoint URLs remain in the lockfile.

The first 20 entries below come from `anthropics/skills`. Paths are relative to that repository.

| Registration | Source directory | License evidence |
| --- | --- | --- |
| `academy-guide` | `skills/academy-guide` | Apache-2.0 |
| `algorithmic-art` | `skills/algorithmic-art` | Apache-2.0 |
| `brand-guidelines` | `skills/brand-guidelines` | Apache-2.0 |
| `canvas-design` | `skills/canvas-design` | Apache-2.0 and OFL-1.1 font notices |
| `claude-api` | `skills/claude-api` | Apache-2.0 |
| `discernment-nudge` | `skills/discernment-nudge` | Apache-2.0 |
| `doc-coauthoring` | `skills/doc-coauthoring` | No separately specified license; repository context retained |
| `docx` | `skills/docx` | LicenseRef-Anthropic-Proprietary |
| `anthropic-frontend-design` | `skills/frontend-design` | Apache-2.0 |
| `internal-comms` | `skills/internal-comms` | Apache-2.0 |
| `mcp-builder` | `skills/mcp-builder` | Apache-2.0 |
| `anthropic-pdf` | `skills/pdf` | LicenseRef-Anthropic-Proprietary |
| `pptx` | `skills/pptx` | LicenseRef-Anthropic-Proprietary |
| `anthropic-skill-creator` | `skills/skill-creator` | Apache-2.0 |
| `slack-gif-creator` | `skills/slack-gif-creator` | Apache-2.0 |
| `theme-factory` | `skills/theme-factory` | Apache-2.0 |
| `web-artifacts-builder` | `skills/web-artifacts-builder` | Apache-2.0 |
| `webapp-testing` | `skills/webapp-testing` | Apache-2.0 |
| `xlsx` | `skills/xlsx` | LicenseRef-Anthropic-Proprietary |
| `template-skill` | `template` | No separately specified license; repository context retained |

All `SKILL.md` files in the pinned Anthropic tree are covered: 19 functional skills and the template. The template remains the starter skeleton supplied upstream.

| Registration | Source | License evidence |
| --- | --- | --- |
| `frontend-design` | `anthropics/claude-code`, `plugins/frontend-design/skills/frontend-design` | Repository `LICENSE.md`; LicenseRef-Anthropic-Proprietary |
| `humanizer` | `blader/humanizer`, repository root | MIT |
| `humanizer-ru` | `Vladimir-Human/humanizer-ru`, repository root | MIT |
| `hallmark` | `Nutlope/hallmark`, `skills/hallmark` | MIT |
| `public-apis` | Local index adapter to pinned `public-apis/public-apis` | MIT source |
| `open-design` | Local adapter to the exact installed application path | Installed-resource notices; no blanket application license inferred |

Canonical `frontend-design` is from the requested Claude Code plugin. Its observed plugin version is 1.1.0, with plugin metadata retained in the complete snapshot. The separate Anthropic skills implementation is registered as `anthropic-frontend-design`.

## Collision handling

Existing system and plugin catalogs were inspected before activation. These conflicts were resolved without changing their existing owners:

| Original name | Resolution | Reason |
| --- | --- | --- |
| Anthropic skills `frontend-design` | `anthropic-frontend-design` | Canonical name reserved for the specified Claude Code plugin |
| Anthropic `pdf` | `anthropic-pdf` | Existing installed PDF plugin |
| Anthropic `skill-creator` | `anthropic-skill-creator` | Existing system skill |

These are the only YAML-name adaptations. Only the frontmatter `name` value changed; bodies and originals are preserved and verified. Exact conflicting file paths are recorded in the lockfile.

Humanizer-ru also contains a second distribution at `dsh/skills/humanizer-ru/SKILL.md`. In the active copy, that nested file is named `SKILL.upstream.md` to avoid a duplicate recursive registration. Its bytes are unchanged. The complete reference snapshot retains the original path and filename. This explicit adaptation is recorded in the registry.

## Licenses and referenced materials

Licenses are recorded per source and skill. Apache-2.0 files, all 27 canvas-font OFL notices, and Anthropic third-party notices are retained. The four document skills carry custom Anthropic source-available terms. The canonical Claude Code plugin is governed by its repository license. These are not labeled Apache or MIT.

`doc-coauthoring` and `template-skill` provide no separate license file at the observed revision; the registry states that explicitly and preserves repository context. Humanizer, Humanizer-ru, Hallmark, and public-apis have MIT license files. The installed Open Design skills README declares Apache-2.0 with per-resource exceptions; its statement is preserved without assigning a remote Git commit to the local application.

All repository-bundled scripts, schemas, templates, fonts, examples, references, and notices were preserved. External websites linked by skills have not been mirrored. Runtime prerequisites have not been installed, and upstream workflows have not all been executed. Source-language instructions are unchanged; both English Humanizer and Russian Humanizer-ru are available, and the two local adapters support requests in Russian and English.

## public-apis local reference

Complete original source:

`C:/Users/elaza/.codex/references/pager-sources/repositories/public-apis--public-apis/9d0426870ee7edc9ffedf21cc5b2e87604819549/snapshot`

Searchable JSON:

`C:/Users/elaza/.codex/references/pager-sources/indexes/public-apis/9d0426870ee7edc9ffedf21cc5b2e87604819549/index.json`

The sibling `INDEX.md` provides a category summary. Coverage is **1,737 catalog entries in 51 categories**, independently checked against every qualifying source table row. Each entry retains its original README line, provider URL, description, authentication, HTTPS, and CORS values.

The separate promotional three-column table remains in the original README and is not included in the five-column API catalog index. Empty surplus columns are ignored. The extra nonempty column at README line 1152 is retained as `upstream_extra_columns`. Whitespace from the original URLs at lines 669, 739, and 2048 is retained as `upstream_url_raw`, while the usable URL is trimmed.

Upstream `.gitattributes` excludes `README.md` and `.github` materials from GitHub archives. All 11 omitted files were fetched from the same pinned raw revision and checked against the Git tree. Individual URLs and hashes are recorded under `archive_omissions_recovered`.

This is an offline discovery reference. A listing does not establish a live integration or certify current availability, prices, or authentication behavior.

Example lookup:

```powershell
$sourceLock = Get-Content -LiteralPath 'C:/Users/elaza/Documents/PAGER/docs/sources.lock.json' -Raw | ConvertFrom-Json
$apiReference = $sourceLock.registrations | Where-Object registered_name -EQ 'public-apis'
$apiIndex = Get-Content -LiteralPath $apiReference.index_path -Raw | ConvertFrom-Json
$apiIndex.entries | Where-Object { $_.name -match 'calendar|email' } | Select-Object name,category,url,auth,source_line
```

## Open Design bridge

Exact target from SPEC:

`C:/Users/elaza/AppData/Local/Programs/Open Design/resources/open-design`

Observed packaged version: **0.19.2**. The bridge indexes **162 local skills** at:

`C:/Users/elaza/.codex/references/pager-sources/indexes/open-design/ac489b2e35e7df2b/skills-index.json`

The target, package metadata, and all **6,866 resource files** were checked unchanged. The complete resource manifest digest is:

`ac489b2e35e7df2b5568e952006e0ce553c5505a1a62bbc8449c2289997f38af`

The bridge registers one `open-design` skill pointing to the existing application. It creates no junction, does not duplicate the application's internal skills into the global catalog, and does not launch, update, modify, or configure Open Design. Relative references are resolved against each original bundled skill directory. Generated work belongs in an authorized task workspace.

No live MCP/API connection or runtime exercise is claimed. Some bundled entries are upstream-reference stubs; the bridge reports missing local resources rather than changing application files.

## Verification completed

Integrity verification passed at `2026-09-02T18:02:56.058962+00:00`. Detailed evidence and subsequent checks are retained in the two verification JSON files.

- All six complete source snapshots and archives match pinned manifests; source files were originally verified against pinned Git blobs.
- All installed source files, licenses, and bundled materials are retained; only explicit registry adaptations differ.
- Every Anthropic `SKILL.md`, including the template, is installed, and the canonical frontend skill comes from the required plugin.
- All 26 new registration names are unique across inspected global/plugin catalogs. The 217 existing `SKILL.md` files and all original global skill materials remain unchanged.
- The public API index regenerates exactly, with independent enumeration confirming all 1,737 catalog rows appear once.
- The Open Design path, package, and 6,866 resource files remain unchanged.
- The actual installer helper refused an existing destination without changing its files.
- The actual helper rejected an archive traversal entry before writing outside its extraction directory.
- Re-running pinned `install` left both the lockfile and every global skill file unchanged.
- Python syntax and the PowerShell entry point were exercised successfully.

This is source-setup verification. App access/payment/inventory tests and the production build belong to the separate app implementation work and were not run or claimed by this scoped task. No payment, email, booking, or Supabase integration status was changed. Verification was sufficient; no further broad optional audits were performed.

## Reuse and update instructions

Use the retained PowerShell wrapper. Its default is read-only verification. It selects the working bundled Python executable because this machine's bare `python` resolves to a Windows Store alias. Supply `-PythonPath` if that runtime location changes.

```powershell
& 'C:/Users/elaza/Documents/PAGER/scripts/setup-sources.ps1' -Command verify
& 'C:/Users/elaza/Documents/PAGER/scripts/setup-sources.ps1' -Command check-updates
& 'C:/Users/elaza/Documents/PAGER/scripts/setup-sources.ps1' -Command install
```

| Command | Behavior |
| --- | --- |
| `verify` | Local, read-only validation against the retained registry and manifests |
| `check-updates` | Reads recorded branch heads and reports differing commits; changes no registrations or registry |
| `install` | Initial installation from the pinned revisions; when the lockfile exists, only verifies and never overwrites |
| `prepare` | Retains complete pinned snapshots and baselines without activating registrations |
| `reindex-public-apis` | Rebuilds generated API index/bridge metadata, hashes, and verification evidence from the same pinned README after checking for drift |

Paths are intentionally specific to this user's installation. An existing or drifted skill is never silently replaced. Reindexing does not fetch newer API listings.

For a real upstream version update:

1. Run `check-updates`, select a full observed 40-character SHA, and inspect upstream changes, licensing, and added/removed skills. Do not use a moving branch name for installation.
2. Stage the candidate through the official helper outside active discovery in a fresh revision-specific directory. Keep existing registrations and snapshots intact. For example, replace the placeholder below with the reviewed SHA:

```powershell
$sourcePython = 'C:/Users/elaza/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe'
$sourceInstaller = 'C:/Users/elaza/.codex/skills/.system/skill-installer/scripts/install-skill-from-github.py'
$sourceRevision = '<reviewed-40-character-commit>'
if ($sourceRevision -notmatch '^[0-9a-f]{40}$') { throw 'A full reviewed commit SHA is required.' }
$sourceCandidate = Join-Path 'C:/Users/elaza/.codex/references/pager-sources/update-candidates' $sourceRevision
if (Test-Path -LiteralPath $sourceCandidate) { throw 'Inspect the existing candidate directory before continuing.' }
& $sourcePython -B $sourceInstaller --repo anthropics/claude-code --ref $sourceRevision --path plugins/frontend-design/skills/frontend-design --dest $sourceCandidate --name frontend-design
if ($LASTEXITCODE -ne 0) { throw 'Candidate installation failed.' }
```

3. Preserve the new complete repository snapshot and ancestor licenses/notices alongside the helper-staged skill. The setup script's `source_snapshot(repo, observed_branch, full_sha)` function implements pinned retrieval, export-ignore recovery, and Git-blob checks. Humanizer and Humanizer-ru use helper paths `--path . --name humanizer` and `--path . --name humanizer-ru`; Hallmark uses `--path skills/hallmark`. Enumerate all Anthropic `SKILL.md` paths again, including its template.
4. Candidates remain outside discovery until reviewed. If parallel activation is needed, choose a fresh revision-suffixed directory and matching YAML `name`, preserve the original entrypoint, and record the adaptation. This setup script never overwrites a canonical registration. Canonical replacement is a separate explicit maintenance operation with collision inspection and retained prior bytes.
5. Update the registry only to describe the version actually activated: full commit, URLs/refs, licenses, original/installed paths, helper invocation, transformations, and manifests. Retain the preceding registry/manifests in the global reference directory as revision history. Merely editing a lockfile SHA does not install an update.
6. Verify the resulting installation and refresh this report. If Open Design itself was updated, inspect that installed update before refreshing the local version/index/baseline, preserving the exact SPEC target. Do not use the bridge to overwrite application resources.

Interrupted installations stop on collisions or differing existing bytes. Inspect the retained installation plan and helper evidence. Do not recursively delete skill/reference roots to force a retry. Reuse matching retained material or stage a fresh revision-specific candidate, preserving other workers' files.

The pinned source registry and setup scripts are retained. No commit was created.
