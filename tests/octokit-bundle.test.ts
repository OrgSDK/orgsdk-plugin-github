/**
 * Isolated materialize/load smoke — the dependency-bundling gate.
 *
 * This simulates the daemon-side bundling flow (packages/platform/src/plugins/
 * resolve-deps.ts) that runs at publish time:
 *
 *   stage source + declared deps → bun install → Bun.build → __bundle.js
 *
 * The daemon imports __bundle.js directly at runtime — there is no node_modules
 * resolution in the tenant container. So this test proves the FULL closure of
 * the `github` plugin (@octokit/rest + its transitive deps) bundles into a
 * single ESM file, loads, and materializes all thirty-seven safe functions.
 *
 * No network calls are made: the factory + onLoad are exercised, but the
 * safe-function handlers (which call Octokit) are never invoked. onLoad calls
 * the credential store (returns null → a warning is logged) and returns.
 *
 * If @octokit/rest ever fails to bundle or load here (e.g. a future version
 * hard-requires a native binary or dynamic import that Bun.build can't inline),
 * this test BLOCKS rather than hiding the issue, per the migration discipline.
 *
 * Modeled on tests/unpdf-bundle.test.ts in orgsdk-plugin-data.
 */
import { describe, expect, it } from "bun:test";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { $ } from "bun";

const ROOT = resolve(import.meta.dir, "..");
const PLUGIN_DIR = join(ROOT, "plugin");

/** All thirty-seven github safe-function names, sorted. */
const EXPECTED_FUNCTION_NAMES = [
	"addIssueComment",
	"addIssueLabels",
	"addPrComment",
	"cancelWorkflowRun",
	"createBranch",
	"createIssue",
	"createOrUpdateFile",
	"createPullRequest",
	"createRelease",
	"downloadWorkflowArtifact",
	"getBranch",
	"getFileContent",
	"getIssue",
	"getPullRequest",
	"getRelease",
	"getRepo",
	"getRepoContributors",
	"getWorkflowJobLogs",
	"getWorkflowRun",
	"listBranches",
	"listDirectoryContents",
	"listIssueComments",
	"listIssues",
	"listPrComments",
	"listPullRequests",
	"listReleases",
	"listRepos",
	"listWorkflowJobs",
	"listWorkflowRunArtifacts",
	"listWorkflowRuns",
	"mergePullRequest",
	"requestPrReview",
	"rerunWorkflow",
	"rerunWorkflowFailedJobs",
	"searchRepos",
	"triggerWorkflow",
	"updateIssue",
] as const;

// A no-op PluginContext sufficient to construct the factory + onLoad without a
// daemon or DB. No handler is invoked, so no credential resolution or network
// access occurs.
const noopCtx = {
	stores: {
		credential: {
			get: async () => null,
			list: async () => [],
			upsert: async () => {},
			delete: async () => {},
			getSecrets: async () => null,
			setSecrets: async () => {},
		},
		config: {
			list: async () => [],
			get: async () => null,
			set: async () => ({ key: "", value: {}, updatedAt: null }),
			delete: async () => {},
		},
	},
	publicBaseUrl: "http://localhost:3000",
	logger: {
		trace() {},
		debug() {},
		info() {},
		warn() {},
		error() {},
		fatal() {},
		child() {
			return this;
		},
	},
};

interface StagedBundle {
	bundlePath: string;
	stagingDir: string;
}

async function stagePluginBundle(): Promise<StagedBundle> {
	const stagingDir = await mkdtemp(join(tmpdir(), "orgsdk-github-smoke-"));
	// Copy plugin source (everything under plugin/ except manifest/package.json
	// — those are regenerated for the staging dir, mirroring resolvePluginDeps).
	const entries = await readdir(PLUGIN_DIR, { withFileTypes: true });
	for (const entry of entries) {
		if (entry.name === ".plugin.json") continue;
		const src = join(PLUGIN_DIR, entry.name);
		const dest = join(stagingDir, entry.name);
		if (entry.isDirectory()) {
			await $`cp -r ${src} ${dest}`.quiet();
		} else {
			await $`cp ${src} ${dest}`.quiet();
		}
	}
	// Declare ONLY @octokit/rest — this mirrors the published artifact
	// package.json exactly (the source-declared supported range).
	await writeFile(
		join(stagingDir, "package.json"),
		JSON.stringify(
			{ private: true, dependencies: { "@octokit/rest": "^22.0.1" } },
			null,
			2,
		),
	);
	// Resolve @octokit/rest (and its full transitive closure) into the staging
	// dir's own node_modules.
	await $`bun install`.cwd(stagingDir).quiet();
	// Bundle with the same config as resolvePluginDeps (target bun, esm,
	// zod external — zod is present in the daemon image).
	const result = await Bun.build({
		entrypoints: [join(stagingDir, "index.ts")],
		outdir: stagingDir,
		target: "bun",
		format: "esm",
		external: ["zod"],
	});
	if (!result.success || result.outputs.length === 0) {
		throw new Error(`Bun.build failed: ${result.logs.map(String).join("; ")}`);
	}
	return { bundlePath: result.outputs[0].path, stagingDir };
}

async function loadBundleFunctions(
	bundlePath: string,
): Promise<Array<{ name: string }>> {
	const mod = (await import(bundlePath)) as {
		default: (ctx: typeof noopCtx) => {
			safeFunctions: Array<{ name: string }>;
		};
	};
	const factory = mod.default;
	if (typeof factory !== "function") {
		throw new Error("bundle default export is not a factory function");
	}
	const pluginModule = factory(noopCtx);
	const fns = pluginModule.safeFunctions;
	if (!Array.isArray(fns)) {
		throw new Error("factory result has no safeFunctions array");
	}
	return fns;
}

describe("isolated materialize/load smoke (resolvePluginDeps simulation)", () => {
	let bundlePath: string;
	let stagingDir: string;

	it("bundles the full @octokit/rest dependency closure into a single ESM file", async () => {
		const out = await stagePluginBundle();
		bundlePath = out.bundlePath;
		stagingDir = out.stagingDir;
		const stat = await readFile(bundlePath, "utf-8");
		// @octokit/rest + its transitive closure (@octokit/core, request,
		// graphql, auth-token, plugin-paginate-rest, plugin-rest-endpoint-methods,
		// types, before-after-hook, universal-user-agent, …) is a large body of
		// code. Bun.build tree-shakes aggressively but the closure still exceeds
		// 100KB (typically ~200KB inlined).
		expect(stat.length).toBeGreaterThan(100_000);
		// No bare `from "@octokit/rest"` or `from "@octokit/…"` should remain —
		// the entire closure must be inlined, not left as an external import.
		expect(stat).not.toMatch(/^\s*import.*from\s+["']@octokit\/rest["']/m);
		expect(stat).not.toMatch(/^\s*import.*from\s+["']@octokit\/[^"']*["']/m);
	});

	it("the bundle loads and the factory exposes all thirty-seven safe functions", async () => {
		const fns = await loadBundleFunctions(bundlePath);
		expect(Array.isArray(fns)).toBe(true);
		expect(fns.length).toBe(37);
		expect(fns.map((f) => f.name).sort()).toEqual(
			[...EXPECTED_FUNCTION_NAMES].sort(),
		);
	});

	it("every bundled function requires the github credential (token-only)", async () => {
		const fns = (await loadBundleFunctions(bundlePath)) as Array<{
			name: string;
			requiredCredentials?: string[];
		}>;
		for (const fn of fns) {
			expect(fn.requiredCredentials).toEqual(["github"]);
		}
	});

	it("the factory's authProvider is the token provider (displayName GitHub)", async () => {
		const mod = (await import(bundlePath)) as {
			default: (ctx: typeof noopCtx) => {
				authProvider: { type: string; authMeta?: { displayName?: string } };
			};
		};
		const pluginModule = mod.default(noopCtx);
		expect(pluginModule.authProvider.type).toBe("token");
		expect(pluginModule.authProvider.authMeta?.displayName).toBe("GitHub");
	});

	it("re-bundling is byte-deterministic (same source → same output modulo path)", async () => {
		const first = await readFile(bundlePath, "utf-8");
		// Stage a second bundle from the same source.
		const second = await stagePluginBundle();
		const secondBytes = await readFile(second.bundlePath, "utf-8");
		await rm(second.stagingDir, { recursive: true, force: true });
		// Normalize the staging path (resolvePluginDeps does the same) then
		// compare — the only allowed difference is the embedded temp path. Bun
		// also mangles the entry-path basename into internal identifiers (dashes
		// → underscores), so normalize both forms.
		const norm = (s: string, dir: string) => {
			const base = dir.split("/").pop() ?? dir;
			return s
				.replaceAll(dir, "/plugin-bundle-root")
				.replaceAll(base, "plugin-bundle-root")
				.replaceAll(base.replaceAll("-", "_"), "plugin_bundle_root");
		};
		expect(norm(secondBytes, second.stagingDir)).toBe(
			norm(first, stagingDir).replaceAll(stagingDir, "/plugin-bundle-root"),
		);
	});

	// Cleanup after the whole describe block (bun:test runs these sequentially).
	it("cleans up the staging dir", async () => {
		await rm(stagingDir, { recursive: true, force: true });
		expect(stagingDir).toBeDefined();
	});
});
