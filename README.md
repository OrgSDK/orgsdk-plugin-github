# @orgsdk/plugin-github

Official OrgSDK plugin for GitHub repository operations — issues, pull requests,
branches, releases, file contents, and Actions workflow runs. Thirty-seven safe
functions exposing the Octokit REST surface to agent workflows. Token-only: a
GitHub personal access token (provider key `github`) is required before any
function is callable.

[![CI](https://github.com/OrgSDK/orgsdk-plugin-github/actions/workflows/ci.yml/badge.svg)](https://github.com/OrgSDK/orgsdk-plugin-github/actions/workflows/ci.yml)

## Repository layout

```
orgsdk-plugin-github/
├── .github/workflows/
│   ├── ci.yml                 # calls the shared reusable CI workflow (OrgSDK/plugins)
│   └── publish-catalog.yml    # calls the shared reusable publish workflow (opt-in; manual dry-run)
├── plugin/                    # the publishable plugin folder
│   ├── .plugin.json           # manifest (slug, version, token auth, marketplace)
│   ├── index.ts               # entry — factory (ctx) => PluginModule
│   ├── auth-provider.ts       # GitHubTokenProvider (token auth, storeToken → secret_token)
│   ├── auth.ts                # Octokit client construction + module-level cache
│   ├── actions-functions.ts   # listWorkflowRuns / getWorkflowRun / triggerWorkflow / rerun* / cancel / listJobs / jobLogs / artifacts / download
│   ├── branch-functions.ts    # listBranches / getBranch / createBranch
│   ├── content-functions.ts   # getFileContent / createOrUpdateFile / listDirectoryContents
│   ├── issue-functions.ts     # listIssues / getIssue / createIssue / updateIssue / addComment / listComments / addLabels
│   ├── pr-functions.ts        # listPullRequests / getPullRequest / createPullRequest / addComment / listComments / merge / requestReviewers
│   ├── release-functions.ts   # listReleases / getRelease / createRelease
│   ├── repo-functions.ts      # listRepos / getRepo / searchRepos / getRepoContributors
│   └── docs/overview.md       # plugin-local docs
├── tests/                     # bun:test — manifest, purity, shape, packaging, octokit-bundle smoke
├── docs/                      # contract migration, release/promotion contract
├── package.json
├── tsconfig.json
├── biome.json
└── README.md
```

The `plugin/` folder is the canonical source for the `github` plugin; it is
published to the OrgSDK catalog on merge to `main` when opted in via the
`ORGSDK_ENABLE_CATALOG_PUBLISH` repo variable (see [docs/release.md](docs/release.md)).

## Local development

Requires [Bun](https://bun.sh) ≥ 1.3.x.

```bash
# Install (frozen lockfile in CI; dev: generates one)
bun install

# Lint + format check
bun run check

# Typecheck (no emit)
bun run typecheck

# Run tests
bun run test

# Validate manifest + source purity (orgsdk-plugin validate)
bun run validate

# Stage distributable artifact into dist/ (orgsdk-plugin package)
bun run package

# Full build pipeline (typecheck → validate → package)
bun run build
```

The `validate`, `package`, `version-guard`, and `publish` npm scripts delegate to
the [`orgsdk-plugin`](https://www.npmjs.com/package/@orgsdk/plugins) CLI shipped
by the `@orgsdk/plugins` dev dependency. There are no local management scripts.

## Functions

Thirty-seven functions across seven modules. Twenty-two are readonly (read-only
GitHub GETs), fifteen are write (mutating). Ten readonly functions are tagged
`discovery` (safe to use in exploration workflows).

| Module | Readonly | Write |
|---|---|---|
| Actions (10) | listWorkflowRuns, getWorkflowRun, listWorkflowJobs, getWorkflowJobLogs, listWorkflowRunArtifacts, downloadWorkflowArtifact | triggerWorkflow, rerunWorkflow, rerunWorkflowFailedJobs, cancelWorkflowRun |
| Branches (3) | listBranches, getBranch | createBranch |
| Content (3) | getFileContent, listDirectoryContents | createOrUpdateFile |
| Issues (7) | listIssues, getIssue, listIssueComments | createIssue, updateIssue, addIssueComment, addIssueLabels |
| PRs (7) | listPullRequests, getPullRequest, listPrComments | createPullRequest, addPrComment, mergePullRequest, requestPrReview |
| Releases (3) | listReleases, getRelease | createRelease |
| Repo (4) | listRepos, getRepo, searchRepos, getRepoContributors | — |

Every function declares `requiredCredentials: ["github"]` — none are callable
until a credential is connected.

### Destructive operations

The source carries no `destructive` tag, but these write functions have
irreversible or hard-to-reverse effects (documented, not refactored in this
extraction):

- **`cancelWorkflowRun`** — cancels an in-progress CI run.
- **`mergePullRequest`** — merges a pull request (irreversible).
- **`createOrUpdateFile`** — can overwrite existing file content.
- **`updateIssue`** — can close/reopen issues (state mutation).
- **`rerunWorkflow` / `rerunWorkflowFailedJobs`** — mutate CI run state.

## Credentials

This plugin needs a **GitHub personal access token** (the `github` credential
provider). Every function declares `requiredCredentials: ["github"]`, so none of
its functions are callable until a credential is connected.

| Provider | Type | How to get it |
|---|---|---|
| `github` | token | Create a classic token at `github.com/settings/tokens`. Grant the **`repo`** scope (add **`workflow`** if you touch Actions files or trigger/rerun workflows). |

Connect it inline from the plugin row (the "set credentials" affordance wires to
the standard token credential flow), or via the CLI:

```bash
orgsdk credential set github default ghp_your_token_here
```

## Manifest & version rules

- The manifest lives at `plugin/.plugin.json`.
- `version` is the **source of truth** for the catalog — bump it on every
  publishable content change (the CI version guard enforces this).
- `package.json` → `version` is kept in sync with the manifest (enforced by the
  version guard).
- Versions are **write-once** in the catalog: re-publishing the same
  `(slug, version)` with identical content is idempotent; differing content is
  rejected (HTTP 409). Treat every publish as forward-only.
- See [docs/release.md](docs/release.md) for the automatic publish model and
  required repository settings.

## CI/CD

CI and catalog publishing delegate to centrally maintained **reusable
workflows** in [OrgSDK/plugins](https://github.com/OrgSDK/plugins), pinned to an
immutable commit. The caller workflows (`.github/workflows/`) only wire up
triggers, the opt-in gate, artifact names, and secrets — no plugin mechanics
are duplicated. See the
[reusable-workflows docs](https://github.com/OrgSDK/plugins/blob/main/docs/reusable-workflows.md)
for the full contract.

## Runtime dependency: @octokit/rest

`auth.ts` imports `{ Octokit }` from
[`@octokit/rest`](https://www.npmjs.com/package/@octokit/rest) (`^22.0.1`, the
source-declared supported range) at runtime. At publish time, the platform's
`resolvePluginDeps` bundles the plugin entry plus `@octokit/rest` (and its full
transitive closure: `@octokit/core`, `plugin-paginate-rest`,
`plugin-request-log`, `plugin-rest-endpoint-methods`, `auth-token`, `graphql`,
`request`, `request-error`, `types`, `before-after-hook`,
`universal-user-agent`) into a single `__bundle.js` ESM file via `Bun.build`.
The daemon imports that bundle directly — there is **no runtime node_modules
resolution** in the tenant container.

See [docs/contract-migration.md](docs/contract-migration.md) for the full
dependency-closure analysis.

## Security constraints

- Token auth only — no OAuth flow, no httpEndpoints, no auth callback. The token
  is stored as `secret_token` in the credential store and injected per-call as
  the leading `credentials` argument; it is never logged.
- Source purity is enforced: no imports from private `@orgsdk/*` packages, no
  cross-plugin imports, no runtime value imports from the authoring SDK. The
  `validate` script and `tests/purity.test.ts` guard this.
- Publish credentials (`ORGSDK_PUBLISH_TOKEN`) live as a GitHub secret
  (repository-level or `catalog-publish` environment); they are never committed
  to the repo. See [docs/release.md](docs/release.md).

> **Pre-existing security/resource concerns (frozen, not refactored in this
> extraction).** Every handler issues an authenticated Octokit request with no
> per-call allow/deny list, rate-limit guard, or response-size cap. The scope of
> what an agent can do is bounded only by the connected token's scopes.
> `mergePullRequest` is irreversible and `createOrUpdateFile` can overwrite
> content. These behaviors are frozen verbatim per the migration discipline
> (learning #6 — never combine a behavioral/security refactor with an
> extraction). See
> [docs/contract-migration.md](docs/contract-migration.md#known-pre-existing-issues-recorded-not-fixed-in-this-release).

## Authoring contract & runtime dependency

The plugin authoring types come from the public
[`@orgsdk/plugins`](https://www.npmjs.com/package/@orgsdk/plugins) npm package,
imported type-only (`import type { … } from "@orgsdk/plugins"`). The SDK is a
dev-only dependency. The runtime artifact carries **one** runtime dependency —
`@octokit/rest` (`^22.0.1`).

See [docs/contract-migration.md](docs/contract-migration.md).

## Source attribution

Extracted from the OrgSDK monorepo at:

- **Source path:** `packages/plugins/src/github/`
- **Last monorepo commit touching the source:** `bd41214`
- **Monorepo HEAD at extraction:** `e3b79f558638e07019d94950203e7db22c2794e6`

No plugin behavior changed in this extraction — only the type-only import
specifiers (`orgsdk/plugins` → `@orgsdk/plugins`), the manifest `$schema`,
`entry`, `version`, and `marketplace.links.sourceRepo` were added.

## License

Proprietary — All rights reserved. This source is the confidential property
of OrgSDK. No part of this repository may be reproduced, distributed, or
transmitted in any form without the prior written permission of OrgSDK.
Unauthorized use, modification, or redistribution is strictly prohibited.
