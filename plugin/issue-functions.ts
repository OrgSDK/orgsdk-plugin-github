import type { SafeFunction } from "@orgsdk/plugins";
import { createGitHubClient } from "./auth";

export const moduleName = "github-issues";
export const moduleDescription =
	"List, create, update, and search GitHub issues and comments";

type GithubIssue = {
	id: number;
	number: number;
	title: string;
	body: string | null;
	state: string;
	labels: string[];
	assignees: string[];
	user: string | null;
	htmlUrl: string;
	commentsCount: number;
	createdAt: string;
	updatedAt: string;
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
type RawIssue = {
	id: number;
	number: number;
	title: string;
	body?: string | null;
	state: string;
	labels: RawLabel[] | null;
	assignees?: Array<{ login: string }> | null;
	user: { login: string } | null;
	html_url: string;
	comments: number;
	created_at: string;
	updated_at: string;
	closed_at: string | null;
	pull_request?: unknown;
};
type RawComment = {
	id: number;
	body?: string | null;
	user: { login: string } | null;
	html_url: string;
	created_at: string;
	updated_at: string;
};

function toGithubIssue(issue: RawIssue): GithubIssue {
	return {
		id: issue.id,
		number: issue.number,
		title: issue.title,
		body: issue.body ?? null,
		state: issue.state,
		labels: (issue.labels ?? []).map((l) =>
			typeof l === "string" ? l : (l.name ?? ""),
		),
		assignees: (issue.assignees ?? []).map((a) => a.login),
		user: issue.user?.login ?? null,
		htmlUrl: issue.html_url,
		commentsCount: issue.comments ?? 0,
		createdAt: issue.created_at,
		updatedAt: issue.updated_at,
		closedAt: issue.closed_at,
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
		name: "listIssues",
		requiredCredentials: ["github"],
		handler: async (
			credentials: Record<string, unknown>,
			{
				owner,
				repo,
				state,
				labels,
				assignee,
				maxResults,
			}: {
				owner: string;
				repo: string;
				state?: string;
				labels?: string;
				assignee?: string;
				maxResults?: number;
			},
		): Promise<GithubIssue[]> => {
			const octokit = createGitHubClient(credentials);
			const perPage = Math.min(maxResults ?? 30, 100);
			const effectiveState = state && state.trim() ? state : "open";
			const { data } = await octokit.issues.listForRepo({
				owner,
				repo,
				state: effectiveState as "open" | "closed" | "all",
				labels: labels && labels.trim() ? labels : undefined,
				assignee: assignee && assignee.trim() ? assignee : undefined,
				per_page: perPage,
			});
			// Filter out pull requests (GitHub API returns PRs as issues)
			return data.filter((i) => !i.pull_request).map(toGithubIssue);
		},
		description:
			"List issues for a GitHub repository. Filters out pull requests. State: 'open', 'closed', 'all'. Labels: comma-separated string.",
		returnType:
			"Promise<Array<{ id: number; number: number; title: string; body: string | null; state: string; labels: string[]; assignees: string[]; user: string | null; htmlUrl: string; commentsCount: number; createdAt: string; updatedAt: string; closedAt: string | null }>>",
		parameters: [
			{ name: "owner", type: "string" },
			{ name: "repo", type: "string" },
			{ name: "state", type: "string", optional: true },
			{ name: "labels", type: "string", optional: true },
			{ name: "assignee", type: "string", optional: true },
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
		name: "getIssue",
		requiredCredentials: ["github"],
		handler: async (
			credentials: Record<string, unknown>,
			{
				owner,
				repo,
				issueNumber,
			}: { owner: string; repo: string; issueNumber: number },
		): Promise<GithubIssue> => {
			const octokit = createGitHubClient(credentials);
			const { data } = await octokit.issues.get({
				owner,
				repo,
				issue_number: issueNumber,
			});
			return toGithubIssue(data);
		},
		description: "Get a single GitHub issue by number.",
		returnType:
			"Promise<{ id: number; number: number; title: string; body: string | null; state: string; labels: string[]; assignees: string[]; user: string | null; htmlUrl: string; commentsCount: number; createdAt: string; updatedAt: string; closedAt: string | null }>",
		parameters: [
			{ name: "owner", type: "string" },
			{ name: "repo", type: "string" },
			{ name: "issueNumber", type: "number" },
		],
		metadata: {
			category: "github",
			tags: ["readonly", "auth"],
			readonly: true,
			version: "1.0.0",
		},
	},
	{
		name: "createIssue",
		requiredCredentials: ["github"],
		handler: async (
			credentials: Record<string, unknown>,
			{
				owner,
				repo,
				title,
				body,
				labels,
				assignees,
			}: {
				owner: string;
				repo: string;
				title: string;
				body?: string;
				labels?: string[];
				assignees?: string[];
			},
		): Promise<GithubIssue> => {
			const octokit = createGitHubClient(credentials);
			const { data } = await octokit.issues.create({
				owner,
				repo,
				title,
				body,
				labels,
				assignees,
			});
			return toGithubIssue(data);
		},
		description: "Create a new GitHub issue.",
		returnType:
			"Promise<{ id: number; number: number; title: string; body: string | null; state: string; labels: string[]; assignees: string[]; user: string | null; htmlUrl: string; commentsCount: number; createdAt: string; updatedAt: string; closedAt: string | null }>",
		parameters: [
			{ name: "owner", type: "string" },
			{ name: "repo", type: "string" },
			{ name: "title", type: "string" },
			{ name: "body", type: "string", optional: true },
			{ name: "labels", type: "string[]", optional: true },
			{ name: "assignees", type: "string[]", optional: true },
		],
		metadata: {
			category: "github",
			tags: ["auth", "io"],
			version: "1.0.0",
		},
	},
	{
		name: "updateIssue",
		requiredCredentials: ["github"],
		handler: async (
			credentials: Record<string, unknown>,
			{
				owner,
				repo,
				issueNumber,
				title,
				body,
				state,
				labels,
				assignees,
			}: {
				owner: string;
				repo: string;
				issueNumber: number;
				title?: string;
				body?: string;
				state?: string;
				labels?: string[];
				assignees?: string[];
			},
		): Promise<GithubIssue> => {
			const octokit = createGitHubClient(credentials);
			const { data } = await octokit.issues.update({
				owner,
				repo,
				issue_number: issueNumber,
				...(title !== undefined ? { title } : {}),
				...(body !== undefined ? { body } : {}),
				...(state !== undefined ? { state: state as "open" | "closed" } : {}),
				...(labels !== undefined ? { labels } : {}),
				...(assignees !== undefined ? { assignees } : {}),
			});
			return toGithubIssue(data);
		},
		description:
			"Update a GitHub issue. Only provided fields are changed. State: 'open' or 'closed'.",
		returnType:
			"Promise<{ id: number; number: number; title: string; body: string | null; state: string; labels: string[]; assignees: string[]; user: string | null; htmlUrl: string; commentsCount: number; createdAt: string; updatedAt: string; closedAt: string | null }>",
		parameters: [
			{ name: "owner", type: "string" },
			{ name: "repo", type: "string" },
			{ name: "issueNumber", type: "number" },
			{ name: "title", type: "string", optional: true },
			{ name: "body", type: "string", optional: true },
			{ name: "state", type: "string", optional: true },
			{ name: "labels", type: "string[]", optional: true },
			{ name: "assignees", type: "string[]", optional: true },
		],
		metadata: {
			category: "github",
			tags: ["auth", "io"],
			version: "1.0.0",
		},
	},
	{
		name: "addIssueComment",
		requiredCredentials: ["github"],
		handler: async (
			credentials: Record<string, unknown>,
			{
				owner,
				repo,
				issueNumber,
				body,
			}: {
				owner: string;
				repo: string;
				issueNumber: number;
				body: string;
			},
		): Promise<GithubComment> => {
			const octokit = createGitHubClient(credentials);
			const { data } = await octokit.issues.createComment({
				owner,
				repo,
				issue_number: issueNumber,
				body,
			});
			return toGithubComment(data);
		},
		description: "Add a comment to a GitHub issue.",
		returnType:
			"Promise<{ id: number; body: string; user: string | null; htmlUrl: string; createdAt: string; updatedAt: string }>",
		parameters: [
			{ name: "owner", type: "string" },
			{ name: "repo", type: "string" },
			{ name: "issueNumber", type: "number" },
			{ name: "body", type: "string" },
		],
		metadata: {
			category: "github",
			tags: ["auth", "io"],
			version: "1.0.0",
		},
	},
	{
		name: "listIssueComments",
		requiredCredentials: ["github"],
		handler: async (
			credentials: Record<string, unknown>,
			{
				owner,
				repo,
				issueNumber,
				maxResults,
			}: {
				owner: string;
				repo: string;
				issueNumber: number;
				maxResults?: number;
			},
		): Promise<GithubComment[]> => {
			const octokit = createGitHubClient(credentials);
			const perPage = Math.min(maxResults ?? 30, 100);
			const { data } = await octokit.issues.listComments({
				owner,
				repo,
				issue_number: issueNumber,
				per_page: perPage,
			});
			return data.map(toGithubComment);
		},
		description: "List comments on a GitHub issue.",
		returnType:
			"Promise<Array<{ id: number; body: string; user: string | null; htmlUrl: string; createdAt: string; updatedAt: string }>>",
		parameters: [
			{ name: "owner", type: "string" },
			{ name: "repo", type: "string" },
			{ name: "issueNumber", type: "number" },
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
		name: "addIssueLabels",
		requiredCredentials: ["github"],
		handler: async (
			credentials: Record<string, unknown>,
			{
				owner,
				repo,
				issueNumber,
				labels,
			}: {
				owner: string;
				repo: string;
				issueNumber: number;
				labels: string[];
			},
		): Promise<string[]> => {
			const octokit = createGitHubClient(credentials);
			const { data } = await octokit.issues.addLabels({
				owner,
				repo,
				issue_number: issueNumber,
				labels,
			});
			return data.map((l) => l.name);
		},
		description:
			"Add labels to a GitHub issue. Returns the full list of labels on the issue.",
		returnType: "Promise<string[]>",
		parameters: [
			{ name: "owner", type: "string" },
			{ name: "repo", type: "string" },
			{ name: "issueNumber", type: "number" },
			{ name: "labels", type: "string[]" },
		],
		metadata: {
			category: "github",
			tags: ["auth", "io"],
			version: "1.0.0",
		},
	},
];
