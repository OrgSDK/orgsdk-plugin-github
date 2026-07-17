# Contract migration — completed

## Status: consuming `@orgsdk/plugins` from npm

This plugin imports its authoring types from the public
[`@orgsdk/plugins`](https://www.npmjs.com/package/@orgsdk/plugins) npm package.
The migration from the monorepo workspace specifier is complete.

## What changed (from the monorepo source)

1. **Import specifiers updated** — `from "orgsdk/plugins"` →
   `from "@orgsdk/plugins"`. All imports are **type-only**
   (`import type { … }`), erased at compile time.
2. **devDependency** is the published npm package, pinned to an exact version
   (`@orgsdk/plugins@0.2.1`) for reproducibility.
3. **Purity guards** — type-only imports from `@orgsdk/plugins` are
   allowed; value imports and all other `@orgsdk/*` packages are blocked
   (enforced by `tests/purity.test.ts` and `orgsdk-plugin validate`).
4. **Artifact runtime dependency — `@octokit/rest`.** `auth.ts` imports
   `{ Octokit }` from `@octokit/rest` at runtime and constructs the client with
   the token + optional baseUrl. It is declared as a runtime `dependencies`
   entry in `package.json`, so the generated artifact `package.json` carries
   `"dependencies": { "@octokit/rest": "^22.0.1" }` and the platform's
   `resolvePluginDeps` bundles the full closure into `__bundle.js` at publish
   time (the daemon imports the bundle directly — no runtime node_modules
   resolution). The authoring SDK (`@orgsdk/plugins`) is **not** a runtime
   dependency (type-only imports are erased at compile time).
5. **Manifest `$schema`** — `plugin/.plugin.json` declares
   `$schema: https://orgsdk.ai/schemas/plugin-manifest.v1.json` for editor
   completion and schema validation.
6. **Manifest `entry`** — declared as `index.ts` (explicit, not defaulted).
7. **Provenance** — `marketplace.links.sourceRepo` points at this repository
   (canonical key supported by `plugin-manifest.v1`). The upstream Octokit
   library is documented in the README; the `homepage` (github.com) and `docs`
   (docs.github.com/en/rest) user-facing links are preserved verbatim.
8. **No local management scripts** — `validate`, `package`, `version-guard`,
   and `publish` are npm scripts that delegate to the `orgsdk-plugin` CLI
   shipped by `@orgsdk/plugins`.
9. **Reusable CI/CD workflows** — `.github/workflows/ci.yml` and
   `publish-catalog.yml` call the centrally maintained reusable workflows in
   `OrgSDK/plugins` (pinned to an immutable commit) instead of duplicating
   CI/publish mechanics.

## What did NOT change (frozen behavior)

- All thirty-seven safe functions — names, parameters, return types, metadata,
  tags, the readonly/write split (twenty-two readonly, fifteen write), and the
  ten discovery flags.
- The token auth contract: `authProvider` with provider key `github`, token
  stored as `secret_token` under `setSecrets("github", name, …)`, displayName
  "GitHub", no OAuth callback flow (`handleCallback` reports no callback).
- The credential injection model: every function declares
  `requiredCredentials: ["github"]` and the Octokit client is constructed in
  `auth.ts` from `credentials.github.secret_token` (+ optional `baseUrl`).
- No `config` (no Zod schema), no `httpEndpoints`, no `tables`.
- The factory `PluginModule` entry shape (`default export` →
  `(ctx) => PluginModule`) — not a static `safeFunctions` export.
- The `@octokit/rest` usage in `auth.ts` — Octokit construction with token +
  optional baseUrl and a module-level client cache, byte-identical.
- `plugin/docs/overview.md` — verbatim.

## Complete dependency-closure determination

The `github` plugin's runtime dependency closure (required for server-side
bundling via `resolvePluginDeps`):

| Package | Role | Bundled? |
|---|---|---|
| `@octokit/rest@^22.0.1` | direct runtime import (`Octokit` in auth.ts) | yes — inlined into `__bundle.js` |
| `@octokit/core@^7.0.6` | transitive of rest | yes — inlined |
| `@octokit/plugin-paginate-rest@^14.0.0` | transitive of rest | yes — inlined |
| `@octokit/plugin-request-log@^6.0.0` | transitive of rest | yes — inlined |
| `@octokit/plugin-rest-endpoint-methods@^17.0.0` | transitive of rest | yes — inlined |
| `@octokit/auth-token`, `@octokit/graphql`, `@octokit/request`, `@octokit/request-error`, `@octokit/types`, `before-after-hook`, `universal-user-agent` | transitive of @octokit/core | yes — inlined |
| `zod` | present in the daemon image | external (resolved at runtime, not bundled) |
| `@orgsdk/plugins` | authoring SDK, type-only imports | erased (not in runtime closure) |

`@octokit/rest@^22.0.1` resolves to `22.0.1` — the source-declared supported
range. There is no root/latest drift; the artifact pins the source range
(`^22.0.1`), not a newer major.

`Bun.build` (target: `bun`, format: `esm`, `external: ["zod"]`) produces a
deterministic single-file bundle. The daemon imports it directly — no
`node_modules`, no native binary. Verified by `tests/octokit-bundle.test.ts`.

### Server-process assumptions

- **Publish time:** `resolvePluginDeps` needs network access to resolve
  `@octokit/rest` from npm into a temp staging dir, then `Bun.build`. No native
  compilation step (Octokit is pure JS).
- **Daemon runtime:** the standard daemon container image suffices. No system
  packages, no native addons. Octokit makes outbound HTTPS to api.github.com at
  call time (gated by the connected token's scopes).

> **Stop condition satisfied.** The user asked to "stop if bundle/load fails."
> The full `@octokit/rest` closure bundles cleanly into a single ESM file,
> loads, and the factory materializes all thirty-seven safe functions with the
> token auth provider present — all with no network calls. The gate passes; no
> issue is hidden.

## Known pre-existing issues (recorded, not fixed in this release)

These predate the extraction and are frozen byte-for-byte per the migration
discipline (skill learning #6 — never combine a behavioral refactor with an
extraction):

### Security / resource concerns (frozen)

- **Arbitrary outbound GitHub API calls.** Every handler issues an authenticated
  Octokit request to api.github.com (or the configured `baseUrl`). The scope of
  what an agent can do is bounded only by the connected token's scopes. There is
  no per-call allow/deny list, no rate-limit guard, and no response-size cap.
- **`createOrUpdateFile` can overwrite content.** Without a `sha` argument it
  creates; with the wrong `sha` it can clobber. This is the GitHub API's own
  behavior, surfaced verbatim.
- **`mergePullRequest` is irreversible.** Once merged, the branch history is
  fixed. No confirmation gate exists at the plugin layer.
- **Module-level client cache in `auth.ts`.** `clientCache` is a process-global
  keyed by `(token, baseUrl)`. It is not scoped per-tenant or per-agent. In the
  daemon's shared-process model this is acceptable because credentials are
  resolved per-call, but it means a stale cache could persist across a token
  rotation within the same process lifetime.

### Code-quality concerns (frozen)

- **Pre-existing `as` casts** in several handlers (e.g. `status as "open" |
  "closed"`, `mergeMethod as "merge" | "squash" | "rebase"`). These narrow
  Octokit's union-typed parameters from the plugin's looser `string` parameter
  declarations. They were not introduced by the migration and are frozen.
- **Biome lint warnings in frozen source.** `auth.ts` triggers
  `lint/complexity/useLiteralKeys` (`creds["github"]` → `creds.github`) and
  `issue-functions.ts` triggers `lint/complexity/useOptionalChain` (three
  `x && x.trim()` patterns). These are pre-existing and biome labels them
  "Unsafe fix" (cannot auto-apply without behavioral risk). They are warnings
  (non-blocking, exit 0); left frozen per migration discipline.
- **No `guides/` directory.** The plugin ships only `docs/overview.md`
  (human-facing). Agent-facing guides can be added later without touching this
  doc.

### Type-only corrections (necessary for tsc, zero runtime change)

The monorepo **never typechecks plugin source** — `scripts/typecheck.ts`
deliberately excludes `packages/plugins` from its per-package tsc loop. As a
result, the github plugin's local `Raw*` type aliases (structural subsets of
Octokit response shapes used only as `.map(toGithubX)` callback parameter
types) drifted from the published `@octokit/rest` SDK types over time.
Specifically, Octokit marks many response fields as **optional** (`field?: T`)
while the local types declared them **required** (`field: T`), causing `.map()`
callback contravariance failures under strict `tsc --noEmit`.

The corrections are exclusively **type annotations** — widening local types to
accept what Octokit actually returns — plus `?? defaultValue` coalescing in
mappers that previously relied on the (incorrect) guarantee that a field was
always present. No handler logic, parameter lists, return types, or runtime
paths changed. The fields corrected:

| File | Field(s) | Correction |
|---|---|---|
| actions-functions.ts | `RawWorkflowRun.name`, `.run_attempt`, `.run_started_at`; `RawWorkflowJob.html_url`, `.steps`; `RawStep.started_at`, `.completed_at` | required → optional; mapper `?? default` added |
| content-functions.ts | directory-entry `html_url` | mapper `?? ""` |
| issue-functions.ts | `RawIssue.body`, `.assignees`; `RawComment.body` | required → optional; mapper `?? null` |
| pr-functions.ts | `RawPR.draft`, `.merged`, `.comments`, `.review_comments`, `.additions`, `.deletions`, `.changed_files`, `.assignees`; `RawComment.body` | required → optional (mappers already used `??`) |
| release-functions.ts | `RawRelease.body` | required → optional; mapper `?? null` |
| repo-functions.ts | `RawRepo.default_branch`, `.language`, `.stargazers_count`, `.forks_count`, `.open_issues_count`, `.created_at`, `.updated_at`; `listForUser`/`listForAuthenticatedUser` `type` cast targets | required → optional; mapper `?? default`; cast target narrowed to match SDK union |

## Why `@orgsdk/plugins`?

The package provides the stable, minimal, structural TypeScript contract
between plugin authors and the OrgSDK daemon — with no private daemon,
platform, storage, or database internals. See
[OrgSDK/plugins](https://github.com/OrgSDK/plugins) for the full API surface.

## Type-only contract

All imports from `@orgsdk/plugins` are `import type { … }` — erased at compile
time. The runtime plugin artifact carries **only** `@octokit/rest` as a
dependency. This means:

- Minimal runtime weight (one framework dependency: @octokit/rest, whose full
  closure is bundled at publish time).
- Plugin source typechecks against the same contract the daemon enforces.

## Upgrading the contract version

The dependency is pinned exactly (`0.2.1`). When a new contract version is
released, update the version in `package.json`, regenerate the lockfile with
`bun install`, and confirm tests still pass. Prefer deliberate, reviewed
upgrades over floating ranges while the contract is still pre-1.0.
