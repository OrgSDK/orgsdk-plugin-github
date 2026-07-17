/**
 * Plugin shape / contract tests.
 *
 * Imports the real entry through Bun's module system (no daemon, no DB) and
 * exercises the factory with a no-op PluginContext — mirrors the monorepo's
 * tests/plugins approach. These are the implementation-equivalence tests: they
 * pin the exact thirty-seven function names/count, the `github` token
 * credential provider on every function, the readonly/write split with the
 * destructive-operation subset, the token auth provider, and the absence of
 * config/endpoints (token-only plugin).
 *
 * Behavioral parity with monorepo `packages/plugins/src/github` v1.0.1:
 *  - actions: listWorkflowRuns, getWorkflowRun, triggerWorkflow,
 *    rerunWorkflowFailedJobs, rerunWorkflow, cancelWorkflowRun,
 *    listWorkflowJobs, getWorkflowJobLogs, listWorkflowRunArtifacts,
 *    downloadWorkflowArtifact (ten)
 *  - branches: listBranches, getBranch, createBranch (three)
 *  - content: getFileContent, createOrUpdateFile, listDirectoryContents (three)
 *  - issues: listIssues, getIssue, createIssue, updateIssue, addIssueComment,
 *    listIssueComments, addIssueLabels (seven)
 *  - prs: listPullRequests, getPullRequest, createPullRequest, addPrComment,
 *    listPrComments, mergePullRequest, requestPrReview (seven)
 *  - releases: listReleases, getRelease, createRelease (three)
 *  - repo: listRepos, getRepo, searchRepos, getRepoContributors (four)
 *  - requiredCredentials: ["github"] on every function (token-only plugin)
 *  - token authProvider (provider key `github`, displayName "GitHub")
 *  - no config (no Zod schema), no httpEndpoints
 */
import { describe, expect, it } from "bun:test";
import type {
	AuthProvider,
	PluginContext,
	PluginModule,
} from "@orgsdk/plugins";

const EXPECTED_FUNCTIONS = [
	// actions (10)
	"listWorkflowRuns",
	"getWorkflowRun",
	"triggerWorkflow",
	"rerunWorkflowFailedJobs",
	"rerunWorkflow",
	"cancelWorkflowRun",
	"listWorkflowJobs",
	"getWorkflowJobLogs",
	"listWorkflowRunArtifacts",
	"downloadWorkflowArtifact",
	// branches (3)
	"listBranches",
	"getBranch",
	"createBranch",
	// content (3)
	"getFileContent",
	"createOrUpdateFile",
	"listDirectoryContents",
	// issues (7)
	"listIssues",
	"getIssue",
	"createIssue",
	"updateIssue",
	"addIssueComment",
	"listIssueComments",
	"addIssueLabels",
	// prs (7)
	"listPullRequests",
	"getPullRequest",
	"createPullRequest",
	"addPrComment",
	"listPrComments",
	"mergePullRequest",
	"requestPrReview",
	// releases (3)
	"listReleases",
	"getRelease",
	"createRelease",
	// repo (4)
	"listRepos",
	"getRepo",
	"searchRepos",
	"getRepoContributors",
] as const;

// Functions tagged readonly in the monorepo source (metadata.readonly === true
// AND tags include "readonly"). The remaining 15 are write/mutating.
const READONLY_FUNCTIONS = [
	"listWorkflowRuns",
	"getWorkflowRun",
	"listWorkflowJobs",
	"getWorkflowJobLogs",
	"listWorkflowRunArtifacts",
	"downloadWorkflowArtifact",
	"listBranches",
	"getBranch",
	"getFileContent",
	"listDirectoryContents",
	"listIssues",
	"getIssue",
	"listIssueComments",
	"listPullRequests",
	"getPullRequest",
	"listPrComments",
	"listReleases",
	"getRelease",
	"listRepos",
	"getRepo",
	"searchRepos",
	"getRepoContributors",
] as const;

// Functions tagged discovery (metadata.discovery === true AND tags include
// "discovery"). All are readonly list/search operations.
const DISCOVERY_FUNCTIONS = [
	"listWorkflowRuns",
	"listBranches",
	"listDirectoryContents",
	"listIssues",
	"listPullRequests",
	"listReleases",
	"listRepos",
	"getRepo",
	"searchRepos",
	"getRepoContributors",
] as const;

// The write/mutating subset — destructive or state-changing GitHub operations.
// Documented as a frozen observation: the source carries NO "destructive" tag;
// these are the write functions whose effects are hard to reverse.
const DESTRUCTIVE_WRITES = [
	"cancelWorkflowRun", // cancels an in-progress CI run
	"mergePullRequest", // merges a PR — irreversible
	"createOrUpdateFile", // can overwrite existing file content
	"updateIssue", // can close/reopen issues (state mutation)
	"rerunWorkflow", // mutates CI run state
	"rerunWorkflowFailedJobs", // mutates CI run state
] as const;

const noopCtx: PluginContext = {
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

async function loadPlugin(ctx: PluginContext = noopCtx): Promise<PluginModule> {
	const mod = await import("../plugin/index");
	const factory = mod.default as (ctx: PluginContext) => PluginModule;
	return factory(ctx);
}

describe("plugin shape", () => {
	it("factory returns a module with safeFunctions", async () => {
		const mod = await loadPlugin();
		expect(Array.isArray(mod.safeFunctions)).toBe(true);
		expect(mod.safeFunctions?.length).toBeGreaterThan(0);
	});

	it("exposes exactly the thirty-seven expected safe functions (no more, no less)", async () => {
		const mod = await loadPlugin();
		const names = (mod.safeFunctions ?? []).map((f) => f.name).sort();
		expect(names).toEqual([...EXPECTED_FUNCTIONS].sort());
		expect((mod.safeFunctions ?? []).length).toBe(37);
	});

	it('every function declares requiredCredentials: ["github"]', async () => {
		const mod = await loadPlugin();
		const fns = mod.safeFunctions ?? [];
		for (const fn of fns) {
			expect(fn.requiredCredentials).toEqual(["github"]);
		}
	});

	it("every function is categorized under github", async () => {
		const mod = await loadPlugin();
		for (const fn of mod.safeFunctions ?? []) {
			expect(fn.metadata?.category).toBe("github");
		}
	});

	it("every function is tagged auth (all require the github credential)", async () => {
		const mod = await loadPlugin();
		for (const fn of mod.safeFunctions ?? []) {
			expect(fn.metadata?.tags).toContain("auth");
		}
	});

	it("every function name is unique within the plugin", async () => {
		const mod = await loadPlugin();
		const names = (mod.safeFunctions ?? []).map((f) => f.name);
		expect(new Set(names).size).toBe(names.length);
	});

	it("exactly the twenty-two readonly functions carry readonly flag + tag", async () => {
		const mod = await loadPlugin();
		const fns = mod.safeFunctions ?? [];
		const readonlyFns = fns.filter((f) => f.metadata?.readonly === true);
		expect(readonlyFns.length).toBe(READONLY_FUNCTIONS.length);
		const names = new Set(readonlyFns.map((f) => f.name));
		for (const expected of READONLY_FUNCTIONS) {
			expect(names.has(expected)).toBe(true);
		}
		for (const fn of readonlyFns) {
			expect(fn.metadata?.tags).toContain("readonly");
		}
	});

	it("the fifteen write functions do NOT carry readonly (mutating)", async () => {
		const mod = await loadPlugin();
		const fns = mod.safeFunctions ?? [];
		const writeFns = fns.filter((f) => f.metadata?.readonly !== true);
		expect(writeFns.length).toBe(15);
		// The write set is the complement of the readonly set.
		const readonlySet = new Set<string>(READONLY_FUNCTIONS);
		for (const fn of writeFns) {
			expect(readonlySet.has(fn.name)).toBe(false);
		}
		// Sanity: readonly ∪ write === all 37.
		expect(writeFns.length + READONLY_FUNCTIONS.length).toBe(37);
	});

	it("exactly the ten discovery functions carry discovery flag + tag", async () => {
		const mod = await loadPlugin();
		const byName = new Map((mod.safeFunctions ?? []).map((f) => [f.name, f]));
		for (const name of DISCOVERY_FUNCTIONS) {
			const fn = byName.get(name);
			expect(fn?.metadata?.discovery).toBe(true);
			expect(fn?.metadata?.tags).toContain("discovery");
		}
		// Every discovery function must also be readonly (no write is discovery).
		for (const name of DISCOVERY_FUNCTIONS) {
			expect(
				READONLY_FUNCTIONS.includes(
					name as (typeof READONLY_FUNCTIONS)[number],
				),
			).toBe(true);
		}
		// No non-discovery-listed function carries the discovery flag.
		const discoveryFlagged = (mod.safeFunctions ?? []).filter(
			(f) => f.metadata?.discovery === true,
		);
		expect(discoveryFlagged.length).toBe(DISCOVERY_FUNCTIONS.length);
	});

	it("the destructive write subset is documented and unchanged", async () => {
		// Frozen observation: these write operations have irreversible or
		// hard-to-reverse effects. The source carries no "destructive" tag —
		// this assertion documents the subset so a future metadata addition is
		// deliberate, not accidental drift.
		const mod = await loadPlugin();
		const byName = new Map((mod.safeFunctions ?? []).map((f) => [f.name, f]));
		const readonlySet = new Set<string>(READONLY_FUNCTIONS);
		for (const name of DESTRUCTIVE_WRITES) {
			const fn = byName.get(name);
			expect(fn).toBeDefined();
			// A destructive write must NOT be tagged readonly.
			expect(readonlySet.has(name)).toBe(false);
		}
		expect(DESTRUCTIVE_WRITES.length).toBe(6);
	});

	it("has a token authProvider with displayName GitHub", async () => {
		const mod = await loadPlugin();
		const auth = mod.authProvider as AuthProvider | undefined;
		expect(auth).toBeDefined();
		expect(auth?.type).toBe("token");
		expect(auth?.authMeta?.displayName).toBe("GitHub");
	});

	it("authProvider.storeToken writes the github credential with secret_token", async () => {
		let captured: Record<string, unknown> | undefined;
		const ctx: PluginContext = {
			...noopCtx,
			stores: {
				...noopCtx.stores,
				credential: {
					...noopCtx.stores.credential,
					async setSecrets(provider, name, secrets) {
						captured = { provider, name, secrets };
					},
				},
			},
		};
		const mod = await loadPlugin(ctx);
		const auth = mod.authProvider as AuthProvider & {
			storeToken(name: string, token: string): Promise<void>;
		};
		expect(typeof auth.storeToken).toBe("function");
		await auth.storeToken("default", "ghp_test_token");
		expect(captured?.provider).toBe("github");
		expect(captured?.name).toBe("default");
		const secrets = (captured?.secrets ?? {}) as Record<string, string>;
		expect(secrets.secret_token).toBe("ghp_test_token");
	});

	it("authProvider.authSetup rejects a missing token", async () => {
		const mod = await loadPlugin();
		const auth = mod.authProvider as AuthProvider & {
			authSetup(
				options: Record<string, string>,
			): Promise<{ success: boolean; error?: string }>;
		};
		const result = await auth.authSetup({ name: "default" });
		expect(result.success).toBe(false);
		expect(result.error).toMatch(/token/i);
	});

	it("authProvider.handleCallback reports no callback flow (token-only)", async () => {
		const mod = await loadPlugin();
		const auth = mod.authProvider as AuthProvider & {
			handleCallback(
				req: Request,
			): Promise<{ success: boolean; credentialName: string; error?: string }>;
		};
		const out = await auth.handleCallback(new Request("https://x.test/cb"));
		expect(out.success).toBe(false);
		expect(out.error).toMatch(/no callback/i);
	});

	it("has no config (no Zod schema, no tenant_config)", async () => {
		const mod = await loadPlugin();
		expect(mod.config).toBeUndefined();
	});

	it("has no httpEndpoints (token-only plugin, no callback flow)", async () => {
		const mod = await loadPlugin();
		expect(mod.httpEndpoints ?? []).toEqual([]);
	});
});
