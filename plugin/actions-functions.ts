import type { SafeFunction } from "@orgsdk/plugins";
import { createGitHubClient } from "./auth";

export const moduleName = "github-actions";
export const moduleDescription =
	"List, trigger, rerun, cancel, and inspect GitHub Actions workflow runs, jobs, artifacts, and logs";

type GithubWorkflowRun = {
	id: number;
	name: string | null;
	status: string | null;
	conclusion: string | null;
	headBranch: string | null;
	headSha: string;
	event: string;
	htmlUrl: string;
	runNumber: number;
	runAttempt: number;
	createdAt: string;
	updatedAt: string;
	runStartedAt: string | null;
};

type RawWorkflowRun = {
	id: number;
	name?: string | null;
	status: string | null;
	conclusion: string | null;
	head_branch: string | null;
	head_sha: string;
	event: string;
	html_url: string;
	run_number: number;
	run_attempt?: number;
	created_at: string;
	updated_at: string;
	run_started_at?: string | null;
};
type RawStep = {
	name: string;
	status: string;
	conclusion: string | null;
	number: number;
	started_at?: string | null;
	completed_at?: string | null;
};
type RawWorkflowJob = {
	id: number;
	run_id: number;
	name: string;
	status: string;
	conclusion: string | null;
	started_at: string | null;
	completed_at: string | null;
	html_url: string | null;
	runner_name: string | null;
	steps?: RawStep[];
};
type RawWorkflowArtifact = {
	id: number;
	name: string;
	size_in_bytes: number;
	expired: boolean;
	expires_at: string | null;
	created_at: string | null;
	updated_at: string | null;
};

function toWorkflowRun(run: RawWorkflowRun): GithubWorkflowRun {
	return {
		id: run.id,
		name: run.name ?? null,
		status: run.status,
		conclusion: run.conclusion,
		headBranch: run.head_branch,
		headSha: run.head_sha,
		event: run.event,
		htmlUrl: run.html_url,
		runNumber: run.run_number,
		runAttempt: run.run_attempt ?? 1,
		createdAt: run.created_at,
		updatedAt: run.updated_at,
		runStartedAt: run.run_started_at ?? null,
	};
}

type GithubWorkflowJobStep = {
	name: string;
	status: string;
	conclusion: string | null;
	number: number;
	startedAt: string | null;
	completedAt: string | null;
};

type GithubWorkflowJob = {
	id: number;
	runId: number;
	name: string;
	status: string;
	conclusion: string | null;
	startedAt: string | null;
	completedAt: string | null;
	htmlUrl: string;
	runnerName: string | null;
	steps: GithubWorkflowJobStep[];
};

function toWorkflowJob(job: RawWorkflowJob): GithubWorkflowJob {
	return {
		id: job.id,
		runId: job.run_id,
		name: job.name,
		status: job.status,
		conclusion: job.conclusion ?? null,
		startedAt: job.started_at ?? null,
		completedAt: job.completed_at ?? null,
		htmlUrl: job.html_url ?? "",
		runnerName: job.runner_name ?? null,
		steps: (job.steps ?? []).map((s) => ({
			name: s.name,
			status: s.status,
			conclusion: s.conclusion ?? null,
			number: s.number,
			startedAt: s.started_at ?? null,
			completedAt: s.completed_at ?? null,
		})),
	};
}

type GithubWorkflowArtifact = {
	id: number;
	name: string;
	sizeInBytes: number;
	expired: boolean;
	expiresAt: string | null;
	createdAt: string | null;
	updatedAt: string | null;
};

function toWorkflowArtifact(a: RawWorkflowArtifact): GithubWorkflowArtifact {
	return {
		id: a.id,
		name: a.name,
		sizeInBytes: a.size_in_bytes,
		expired: a.expired,
		expiresAt: a.expires_at ?? null,
		createdAt: a.created_at ?? null,
		updatedAt: a.updated_at ?? null,
	};
}

const MAX_LOG_BYTES = 100 * 1024; // 100KB

export const safeFunctions: SafeFunction[] = [
	{
		name: "listWorkflowRuns",
		requiredCredentials: ["github"],
		handler: async (
			credentials: Record<string, unknown>,
			{
				owner,
				repo,
				actionId,
				branch,
				status,
				maxResults,
			}: {
				owner: string;
				repo: string;
				actionId?: string | number;
				branch?: string;
				status?: string;
				maxResults?: number;
			},
		): Promise<GithubWorkflowRun[]> => {
			const octokit = createGitHubClient(credentials);
			const perPage = Math.min(maxResults ?? 30, 100);

			if (actionId) {
				const { data } = await octokit.actions.listWorkflowRuns({
					owner,
					repo,
					workflow_id: actionId,
					...(branch ? { branch } : {}),
					...(status
						? {
								status: status as
									| "queued"
									| "in_progress"
									| "completed"
									| "action_required"
									| "cancelled"
									| "failure"
									| "neutral"
									| "skipped"
									| "stale"
									| "success"
									| "timed_out"
									| "waiting",
							}
						: {}),
					per_page: perPage,
				});
				return data.workflow_runs.map(toWorkflowRun);
			}

			const { data } = await octokit.actions.listWorkflowRunsForRepo({
				owner,
				repo,
				...(branch ? { branch } : {}),
				...(status
					? {
							status: status as
								| "queued"
								| "in_progress"
								| "completed"
								| "action_required"
								| "cancelled"
								| "failure"
								| "neutral"
								| "skipped"
								| "stale"
								| "success"
								| "timed_out"
								| "waiting",
						}
					: {}),
				per_page: perPage,
			});
			return data.workflow_runs.map(toWorkflowRun);
		},
		description:
			"List workflow runs for a repository. Optionally filter by actionId (filename or ID), branch, status ('queued', 'in_progress', 'completed').",
		returnType:
			"Promise<Array<{ id: number; name: string | null; status: string | null; conclusion: string | null; headBranch: string | null; headSha: string; event: string; htmlUrl: string; runNumber: number; createdAt: string; updatedAt: string }>>",
		parameters: [
			{ name: "owner", type: "string" },
			{ name: "repo", type: "string" },
			{ name: "actionId", type: "string | number", optional: true },
			{ name: "branch", type: "string", optional: true },
			{ name: "status", type: "string", optional: true },
			{ name: "maxResults", type: "number", optional: true },
		],
		metadata: {
			category: "github",
			tags: ["readonly", "auth", "discovery"],
			readonly: true,
			discovery: true,
			version: "1.0.0",
		},
	},
	{
		name: "getWorkflowRun",
		requiredCredentials: ["github"],
		handler: async (
			credentials: Record<string, unknown>,
			{ owner, repo, runId }: { owner: string; repo: string; runId: number },
		): Promise<GithubWorkflowRun> => {
			const octokit = createGitHubClient(credentials);
			const { data } = await octokit.actions.getWorkflowRun({
				owner,
				repo,
				run_id: runId,
			});
			return toWorkflowRun(data);
		},
		description: "Get details of a specific workflow run by ID.",
		returnType:
			"Promise<{ id: number; name: string | null; status: string | null; conclusion: string | null; headBranch: string | null; headSha: string; event: string; htmlUrl: string; runNumber: number; createdAt: string; updatedAt: string }>",
		parameters: [
			{ name: "owner", type: "string" },
			{ name: "repo", type: "string" },
			{ name: "runId", type: "number" },
		],
		metadata: {
			category: "github",
			tags: ["readonly", "auth"],
			readonly: true,
			version: "1.0.0",
		},
	},
	{
		name: "triggerWorkflow",
		requiredCredentials: ["github"],
		handler: async (
			credentials: Record<string, unknown>,
			{
				owner,
				repo,
				actionId,
				ref,
				inputs,
			}: {
				owner: string;
				repo: string;
				actionId: string | number;
				ref: string;
				inputs?: Record<string, string>;
			},
		): Promise<{ triggered: true }> => {
			const octokit = createGitHubClient(credentials);
			await octokit.actions.createWorkflowDispatch({
				owner,
				repo,
				workflow_id: actionId,
				ref,
				...(inputs ? { inputs } : {}),
			});
			// The API returns 204 No Content on success
			return { triggered: true };
		},
		description:
			"Trigger a workflow_dispatch event. actionId can be the workflow filename (e.g. 'ci.yml') or numeric ID. ref is the branch/tag to run on.",
		returnType: "Promise<{ triggered: true }>",
		parameters: [
			{ name: "owner", type: "string" },
			{ name: "repo", type: "string" },
			{ name: "actionId", type: "string | number" },
			{ name: "ref", type: "string" },
			{ name: "inputs", type: "Record<string, string>", optional: true },
		],
		metadata: {
			category: "github",
			tags: ["auth", "io"],
			version: "1.0.0",
		},
	},
	{
		name: "rerunWorkflowFailedJobs",
		requiredCredentials: ["github"],
		handler: async (
			credentials: Record<string, unknown>,
			{ owner, repo, runId }: { owner: string; repo: string; runId: number },
		): Promise<{ rerunned: true }> => {
			const octokit = createGitHubClient(credentials);
			await octokit.actions.reRunWorkflowFailedJobs({
				owner,
				repo,
				run_id: runId,
			});
			return { rerunned: true };
		},
		description:
			"Re-run only the failed jobs of a workflow run. Returns immediately — poll getWorkflowRun to track progress.",
		returnType: "Promise<{ rerunned: true }>",
		parameters: [
			{ name: "owner", type: "string" },
			{ name: "repo", type: "string" },
			{ name: "runId", type: "number" },
		],
		metadata: {
			category: "github",
			tags: ["auth", "io"],
			version: "1.0.0",
		},
	},
	{
		name: "rerunWorkflow",
		requiredCredentials: ["github"],
		handler: async (
			credentials: Record<string, unknown>,
			{ owner, repo, runId }: { owner: string; repo: string; runId: number },
		): Promise<{ rerunned: true }> => {
			const octokit = createGitHubClient(credentials);
			await octokit.actions.reRunWorkflow({
				owner,
				repo,
				run_id: runId,
			});
			return { rerunned: true };
		},
		description:
			"Re-run all jobs in a workflow run. Returns immediately — poll getWorkflowRun to track progress.",
		returnType: "Promise<{ rerunned: true }>",
		parameters: [
			{ name: "owner", type: "string" },
			{ name: "repo", type: "string" },
			{ name: "runId", type: "number" },
		],
		metadata: {
			category: "github",
			tags: ["auth", "io"],
			version: "1.0.0",
		},
	},
	{
		name: "cancelWorkflowRun",
		requiredCredentials: ["github"],
		handler: async (
			credentials: Record<string, unknown>,
			{ owner, repo, runId }: { owner: string; repo: string; runId: number },
		): Promise<{ cancelled: true }> => {
			const octokit = createGitHubClient(credentials);
			await octokit.actions.cancelWorkflowRun({
				owner,
				repo,
				run_id: runId,
			});
			return { cancelled: true };
		},
		description: "Cancel an in-progress workflow run.",
		returnType: "Promise<{ cancelled: true }>",
		parameters: [
			{ name: "owner", type: "string" },
			{ name: "repo", type: "string" },
			{ name: "runId", type: "number" },
		],
		metadata: {
			category: "github",
			tags: ["auth", "io"],
			version: "1.0.0",
		},
	},
	{
		name: "listWorkflowJobs",
		requiredCredentials: ["github"],
		handler: async (
			credentials: Record<string, unknown>,
			{
				owner,
				repo,
				runId,
				filter,
				maxResults,
			}: {
				owner: string;
				repo: string;
				runId: number;
				filter?: string;
				maxResults?: number;
			},
		): Promise<GithubWorkflowJob[]> => {
			const octokit = createGitHubClient(credentials);
			const perPage = Math.min(maxResults ?? 30, 100);
			const { data } = await octokit.actions.listJobsForWorkflowRun({
				owner,
				repo,
				run_id: runId,
				...(filter ? { filter: filter as "latest" | "all" } : {}),
				per_page: perPage,
			});
			return data.jobs.map(toWorkflowJob);
		},
		description:
			"List jobs for a workflow run. Includes step-level detail so you can see which step failed. filter can be 'latest' (default) or 'all' (includes previous attempts).",
		returnType:
			"Promise<Array<{ id: number; runId: number; name: string; status: string; conclusion: string | null; startedAt: string | null; completedAt: string | null; htmlUrl: string; runnerName: string | null; steps: Array<{ name: string; status: string; conclusion: string | null; number: number }> }>>",
		parameters: [
			{ name: "owner", type: "string" },
			{ name: "repo", type: "string" },
			{ name: "runId", type: "number" },
			{ name: "filter", type: "string", optional: true },
			{ name: "maxResults", type: "number", optional: true },
		],
		metadata: {
			category: "github",
			tags: ["readonly", "auth"],
			readonly: true,
			version: "1.0.0",
		},
	},
	{
		name: "getWorkflowJobLogs",
		requiredCredentials: ["github"],
		handler: async (
			credentials: Record<string, unknown>,
			{ owner, repo, jobId }: { owner: string; repo: string; jobId: number },
		): Promise<{ logs: string; truncated: boolean }> => {
			const octokit = createGitHubClient(credentials);
			const response = await octokit.actions.downloadJobLogsForWorkflowRun({
				owner,
				repo,
				job_id: jobId,
			});
			// Octokit follows the redirect and returns the log text
			let logs = String(response.data);
			let truncated = false;
			if (logs.length > MAX_LOG_BYTES) {
				logs =
					logs.slice(0, MAX_LOG_BYTES) +
					"\n\n[TRUNCATED — showing first 100KB of logs]";
				truncated = true;
			}
			return { logs, truncated };
		},
		description:
			"Download logs for a specific job. Output is capped at 100KB. Use listWorkflowJobs first to get the jobId.",
		returnType: "Promise<{ logs: string; truncated: boolean }>",
		parameters: [
			{ name: "owner", type: "string" },
			{ name: "repo", type: "string" },
			{ name: "jobId", type: "number" },
		],
		metadata: {
			category: "github",
			tags: ["readonly", "auth"],
			readonly: true,
			version: "1.0.0",
		},
	},
	{
		name: "listWorkflowRunArtifacts",
		requiredCredentials: ["github"],
		handler: async (
			credentials: Record<string, unknown>,
			{
				owner,
				repo,
				runId,
				maxResults,
			}: {
				owner: string;
				repo: string;
				runId: number;
				maxResults?: number;
			},
		): Promise<GithubWorkflowArtifact[]> => {
			const octokit = createGitHubClient(credentials);
			const perPage = Math.min(maxResults ?? 30, 100);
			const { data } = await octokit.actions.listWorkflowRunArtifacts({
				owner,
				repo,
				run_id: runId,
				per_page: perPage,
			});
			return data.artifacts.map(toWorkflowArtifact);
		},
		description: "List artifacts produced by a workflow run.",
		returnType:
			"Promise<Array<{ id: number; name: string; sizeInBytes: number; expired: boolean; expiresAt: string | null; createdAt: string | null; updatedAt: string | null }>>",
		parameters: [
			{ name: "owner", type: "string" },
			{ name: "repo", type: "string" },
			{ name: "runId", type: "number" },
			{ name: "maxResults", type: "number", optional: true },
		],
		metadata: {
			category: "github",
			tags: ["readonly", "auth"],
			readonly: true,
			version: "1.0.0",
		},
	},
	{
		name: "downloadWorkflowArtifact",
		requiredCredentials: ["github"],
		handler: async (
			credentials: Record<string, unknown>,
			{
				owner,
				repo,
				artifactId,
			}: { owner: string; repo: string; artifactId: number },
		): Promise<{ downloadUrl: string }> => {
			const octokit = createGitHubClient(credentials);
			const { url } = await octokit.actions.downloadArtifact({
				owner,
				repo,
				artifact_id: artifactId,
				archive_format: "zip",
				request: { redirect: "manual" },
			});
			return { downloadUrl: url };
		},
		description:
			"Get a temporary download URL for a workflow artifact (zip). The URL is short-lived. Use listWorkflowRunArtifacts first to get the artifactId.",
		returnType: "Promise<{ downloadUrl: string }>",
		parameters: [
			{ name: "owner", type: "string" },
			{ name: "repo", type: "string" },
			{ name: "artifactId", type: "number" },
		],
		metadata: {
			category: "github",
			tags: ["readonly", "auth"],
			readonly: true,
			version: "1.0.0",
		},
	},
];
