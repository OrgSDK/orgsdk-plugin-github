import type { SafeFunction } from "@orgsdk/plugins";
import { createGitHubClient } from "./auth";

export const moduleName = "github-pr";
export const moduleDescription =
	"List, create, review, and merge GitHub pull requests";

type GithubPullRequest = {
	id: number;
	number: number;
	title: string;
	body: string | null;
	state: string;
	draft: boolean;
	merged: boolean;
	head: { ref: string; sha: string };
	base: { ref: string; sha: string };
	user: string | null;
	labels: string[];
	assignees: string[];
	htmlUrl: string;
	commentsCount: number;
	reviewComments: number;
	additions: number;
	deletions: number;
	changedFiles: number;
	createdAt: string;
	updatedAt: string;
	mergedAt: string | null;
	closedAt: string | null;
};

type GithubComment = {
	id: number;
	body: string;
	user: string | null;
	htmlUrl: string;
	createdAt: string;
	updatedAt: string;
};

type RawLabel = string | { name?: string };
type RawPR = {
	id: number;
	number: number;
	title: string;
	body: string | null;
	state: string;
	draft?: boolean;
	merged?: boolean;
	head: { ref: string; sha: string };
	base: { ref: string; sha: string };
	user: { login: string } | null;
	labels: RawLabel[] | null;
	assignees?: Array<{ login: string }> | null;
	html_url: string;
	comments?: number;
	review_comments?: number;
	additions?: number;
	deletions?: number;
	changed_files?: number;
	created_at: string;
	updated_at: string;
	merged_at: string | null;
	closed_at: string | null;
};
type RawComment = {
	id: number;
	body?: string | null;
	user: { login: string } | null;
	html_url: string;
	created_at: string;
	updated_at: string;
};

function toGithubPR(pr: RawPR): GithubPullRequest {
	return {
		id: pr.id,
		number: pr.number,
		title: pr.title,
		body: pr.body,
		state: pr.state,
		draft: pr.draft ?? false,
		merged: pr.merged ?? false,
		head: { ref: pr.head.ref, sha: pr.head.sha },
		base: { ref: pr.base.ref, sha: pr.base.sha },
		user: pr.user?.login ?? null,
		labels: (pr.labels ?? []).map((l) =>
			typeof l === "string" ? l : (l.name ?? ""),
		),
		assignees: (pr.assignees ?? []).map((a) => a.login),
		htmlUrl: pr.html_url,
		commentsCount: pr.comments ?? 0,
		reviewComments: pr.review_comments ?? 0,
		additions: pr.additions ?? 0,
		deletions: pr.deletions ?? 0,
		changedFiles: pr.changed_files ?? 0,
		createdAt: pr.created_at,
		updatedAt: pr.updated_at,
		mergedAt: pr.merged_at,
		closedAt: pr.closed_at,
	};
}

function toGithubComment(comment: RawComment): GithubComment {
	return {
		id: comment.id,
		body: comment.body ?? "",
		user: comment.user?.login ?? null,
		htmlUrl: comment.html_url,
		createdAt: comment.created_at,
		updatedAt: comment.updated_at,
	};
}

export const safeFunctions: SafeFunction[] = [
	{
		name: "listPullRequests",
		requiredCredentials: ["github"],
		handler: async (
			credentials: Record<string, unknown>,
			{
				owner,
				repo,
				state,
				head,
				base,
				maxResults,
			}: {
				owner: string;
				repo: string;
				state?: string;
				head?: string;
				base?: string;
				maxResults?: number;
			},
		): Promise<GithubPullRequest[]> => {
			const octokit = createGitHubClient(credentials);
			const perPage = Math.min(maxResults ?? 30, 100);
			const { data } = await octokit.pulls.list({
				owner,
				repo,
				state: (state as "open" | "closed" | "all") ?? "open",
				...(head ? { head } : {}),
				...(base ? { base } : {}),
				per_page: perPage,
			});
			return data.map(toGithubPR);
		},
		description:
			"List pull requests for a GitHub repository. State: 'open', 'closed', 'all'. head/base filter by branch name.",
		returnType:
			"Promise<Array<{ id: number; number: number; title: string; body: string | null; state: string; draft: boolean; merged: boolean; head: { ref: string; sha: string }; base: { ref: string; sha: string }; user: string | null; labels: string[]; htmlUrl: string; createdAt: string; updatedAt: string }>>",
		parameters: [
			{ name: "owner", type: "string" },
			{ name: "repo", type: "string" },
			{ name: "state", type: "string", optional: true },
			{ name: "head", type: "string", optional: true },
			{ name: "base", type: "string", optional: true },
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
		name: "getPullRequest",
		requiredCredentials: ["github"],
		handler: async (
			credentials: Record<string, unknown>,
			{
				owner,
				repo,
				pullNumber,
			}: { owner: string; repo: string; pullNumber: number },
		): Promise<GithubPullRequest> => {
			const octokit = createGitHubClient(credentials);
			const { data } = await octokit.pulls.get({
				owner,
				repo,
				pull_number: pullNumber,
			});
			return toGithubPR(data);
		},
		description:
			"Get a single pull request by number. Includes diff stats (additions, deletions, changedFiles).",
		returnType:
			"Promise<{ id: number; number: number; title: string; body: string | null; state: string; draft: boolean; merged: boolean; head: { ref: string; sha: string }; base: { ref: string; sha: string }; user: string | null; labels: string[]; htmlUrl: string; additions: number; deletions: number; changedFiles: number; createdAt: string; updatedAt: string; mergedAt: string | null }>",
		parameters: [
			{ name: "owner", type: "string" },
			{ name: "repo", type: "string" },
			{ name: "pullNumber", type: "number" },
		],
		metadata: {
			category: "github",
			tags: ["readonly", "auth"],
			readonly: true,
			version: "1.0.0",
		},
	},
	{
		name: "createPullRequest",
		requiredCredentials: ["github"],
		handler: async (
			credentials: Record<string, unknown>,
			{
				owner,
				repo,
				title,
				head,
				base,
				body,
				draft,
			}: {
				owner: string;
				repo: string;
				title: string;
				head: string;
				base: string;
				body?: string;
				draft?: boolean;
			},
		): Promise<GithubPullRequest> => {
			const octokit = createGitHubClient(credentials);
			const { data } = await octokit.pulls.create({
				owner,
				repo,
				title,
				head,
				base,
				body,
				draft: draft ?? false,
			});
			return toGithubPR(data);
		},
		description:
			"Create a new pull request. head = source branch, base = target branch (e.g. 'main').",
		returnType:
			"Promise<{ id: number; number: number; title: string; body: string | null; state: string; draft: boolean; head: { ref: string; sha: string }; base: { ref: string; sha: string }; htmlUrl: string; createdAt: string }>",
		parameters: [
			{ name: "owner", type: "string" },
			{ name: "repo", type: "string" },
			{ name: "title", type: "string" },
			{ name: "head", type: "string" },
			{ name: "base", type: "string" },
			{ name: "body", type: "string", optional: true },
			{ name: "draft", type: "boolean", optional: true },
		],
		metadata: {
			category: "github",
			tags: ["auth", "io"],
			version: "1.0.0",
		},
	},
	{
		name: "addPrComment",
		requiredCredentials: ["github"],
		handler: async (
			credentials: Record<string, unknown>,
			{
				owner,
				repo,
				pullNumber,
				body,
			}: {
				owner: string;
				repo: string;
				pullNumber: number;
				body: string;
			},
		): Promise<GithubComment> => {
			const octokit = createGitHubClient(credentials);
			// PR comments use the issues API
			const { data } = await octokit.issues.createComment({
				owner,
				repo,
				issue_number: pullNumber,
				body,
			});
			return toGithubComment(data);
		},
		description: "Add a comment to a pull request.",
		returnType:
			"Promise<{ id: number; body: string; user: string | null; htmlUrl: string; createdAt: string; updatedAt: string }>",
		parameters: [
			{ name: "owner", type: "string" },
			{ name: "repo", type: "string" },
			{ name: "pullNumber", type: "number" },
			{ name: "body", type: "string" },
		],
		metadata: {
			category: "github",
			tags: ["auth", "io"],
			version: "1.0.0",
		},
	},
	{
		name: "listPrComments",
		requiredCredentials: ["github"],
		handler: async (
			credentials: Record<string, unknown>,
			{
				owner,
				repo,
				pullNumber,
				maxResults,
			}: {
				owner: string;
				repo: string;
				pullNumber: number;
				maxResults?: number;
			},
		): Promise<GithubComment[]> => {
			const octokit = createGitHubClient(credentials);
			const perPage = Math.min(maxResults ?? 30, 100);
			// PR comments use the issues API
			const { data } = await octokit.issues.listComments({
				owner,
				repo,
				issue_number: pullNumber,
				per_page: perPage,
			});
			return data.map(toGithubComment);
		},
		description: "List comments on a pull request.",
		returnType:
			"Promise<Array<{ id: number; body: string; user: string | null; htmlUrl: string; createdAt: string; updatedAt: string }>>",
		parameters: [
			{ name: "owner", type: "string" },
			{ name: "repo", type: "string" },
			{ name: "pullNumber", type: "number" },
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
		name: "mergePullRequest",
		requiredCredentials: ["github"],
		handler: async (
			credentials: Record<string, unknown>,
			{
				owner,
				repo,
				pullNumber,
				mergeMethod,
				commitTitle,
			}: {
				owner: string;
				repo: string;
				pullNumber: number;
				mergeMethod?: string;
				commitTitle?: string;
			},
		): Promise<{ merged: boolean; message: string; sha: string }> => {
			const octokit = createGitHubClient(credentials);
			const { data } = await octokit.pulls.merge({
				owner,
				repo,
				pull_number: pullNumber,
				merge_method: (mergeMethod as "merge" | "squash" | "rebase") ?? "merge",
				...(commitTitle ? { commit_title: commitTitle } : {}),
			});
			return {
				merged: data.merged,
				message: data.message,
				sha: data.sha,
			};
		},
		description:
			"Merge a pull request. mergeMethod: 'merge', 'squash', or 'rebase'. Defaults to 'merge'.",
		returnType: "Promise<{ merged: boolean; message: string; sha: string }>",
		parameters: [
			{ name: "owner", type: "string" },
			{ name: "repo", type: "string" },
			{ name: "pullNumber", type: "number" },
			{ name: "mergeMethod", type: "string", optional: true },
			{ name: "commitTitle", type: "string", optional: true },
		],
		metadata: {
			category: "github",
			tags: ["auth", "io"],
			version: "1.0.0",
		},
	},
	{
		name: "requestPrReview",
		requiredCredentials: ["github"],
		handler: async (
			credentials: Record<string, unknown>,
			{
				owner,
				repo,
				pullNumber,
				reviewers,
			}: {
				owner: string;
				repo: string;
				pullNumber: number;
				reviewers: string[];
			},
		): Promise<{ requestedReviewers: string[] }> => {
			const octokit = createGitHubClient(credentials);
			const { data } = await octokit.pulls.requestReviewers({
				owner,
				repo,
				pull_number: pullNumber,
				reviewers,
			});
			return {
				requestedReviewers: (data.requested_reviewers ?? []).map(
					(r) => r.login,
				),
			};
		},
		description: "Request reviewers for a pull request.",
		returnType: "Promise<{ requestedReviewers: string[] }>",
		parameters: [
			{ name: "owner", type: "string" },
			{ name: "repo", type: "string" },
			{ name: "pullNumber", type: "number" },
			{ name: "reviewers", type: "string[]" },
		],
		metadata: {
			category: "github",
			tags: ["auth", "io"],
			version: "1.0.0",
		},
	},
];
