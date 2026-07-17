# Changelog

All notable releases of `@orgsdk/plugin-github` are documented here.

The catalog treats versions as **write-once**: a given `(slug, version)` may be
re-published only with identical artifact content; differing content is
rejected with HTTP 409. Every entry below is therefore forward-only.

## [1.0.2] — standalone repository extraction

A forward-only patch release that migrates the `github` plugin from the OrgSDK
monorepo (`packages/plugins/src/github/`) into this standalone repository. **No
plugin source behavior changed** — the thirty-seven safe functions, the token
auth contract (provider key `github`, `secret_token`), the factory entry shape,
and the `@octokit/rest` runtime dependency are byte-identical to the monorepo
`1.0.1`.

### Why 1.0.2 (not 1.0.1)

The repository/package/schema additions alter the immutable publishable content
of the staged artifact:

- manifest `$schema` (`https://orgsdk.ai/schemas/plugin-manifest.v1.json`)
- manifest `entry` (`index.ts`)
- `marketplace.links.sourceRepo` provenance link
- type-only import specifiers (`orgsdk/plugins` → `@orgsdk/plugins`)
- the generated artifact `package.json` carrying the `@octokit/rest` runtime
  dependency

Because catalog versions are write-once, the existing `1.0.1` artifact cannot be
re-published with this changed content — it would differ and be rejected with
HTTP 409. Rather than mutate the published history of `1.0.1`, the new artifact
lands as a fresh `1.0.2` entry.

### Changed

- Bump `plugin/.plugin.json` version `1.0.1` → `1.0.2` (catalog source of
  truth).
- Bump `package.json` version `1.0.1` → `1.0.2` (kept in sync; enforced by the
  CI version guard).
- Add manifest `$schema`, `entry`, and `marketplace.links.sourceRepo`.
- Update type-only import specifiers `orgsdk/plugins` → `@orgsdk/plugins`.
- **Type-only corrections** to local `Raw*` aliases so the source typechecks
  under strict `tsc --noEmit` against the published `@octokit/rest` SDK types
  (the monorepo never typechecks plugin source — `scripts/typecheck.ts`
  excludes `packages/plugins`). Octokit marks many response fields optional
  where the local types declared them required; corrections widen those fields
  to optional and add `?? defaultValue` coalescing in the corresponding mappers.
  **Zero runtime behavior change.** See
  [docs/contract-migration.md](docs/contract-migration.md#type-only-corrections-necessary-for-tsc-zero-runtime-change).

### Frozen (unchanged from monorepo 1.0.1)

- All thirty-seven safe functions — names, parameters, return types, metadata,
  tags, readonly/write split, and discovery flags.
- The token auth contract: `authProvider` with provider key `github`, token
  stored as `secret_token`, displayName "GitHub", no callback flow.
- No `config` (no Zod schema), no `httpEndpoints`, no `tables`.
- The factory `PluginModule` entry shape (`default export` →
  `(ctx) => PluginModule`).
- The `@octokit/rest` runtime dependency (`^22.0.1`) and its usage in `auth.ts`
  (Octokit client construction with token + optional baseUrl).
- `plugin/docs/overview.md` — verbatim.

### Dependency-closure determination

`@octokit/rest@^22.0.1` (resolves to 22.0.1 — the source-declared supported
range; no root/latest drift, pinned to the source range not upgraded). Its
direct dependencies are all transitive and inlined by `Bun.build`:

- `@octokit/core@^7.0.6` → `@octokit/auth-token`, `@octokit/graphql`,
  `@octokit/request`, `@octokit/request-error`, `@octokit/types`,
  `before-after-hook`, `universal-user-agent`
- `@octokit/plugin-paginate-rest@^14.0.0`
- `@octokit/plugin-request-log@^6.0.0`
- `@octokit/plugin-rest-endpoint-methods@^17.0.0`

No optional peers, no native binaries. The platform's `resolvePluginDeps`
bundles the full closure (minus `zod`, which is external and present in the
daemon image) into a single `__bundle.js`. `tests/octokit-bundle.test.ts`
verifies this end to end: the bundle loads, the factory materializes all
thirty-seven safe functions, and the token auth provider is present — all
without a network call.

### Server-process assumptions

- **Publish time:** `resolvePluginDeps` runs `bun install` + `Bun.build` in a
  temp staging dir. Requires network access to resolve `@octokit/rest` from npm.
  Produces a deterministic `__bundle.js` (Octokit is pure JS).
- **Daemon runtime:** imports `__bundle.js` directly. No `node_modules`, no
  native binary. Works in the standard daemon container image.
