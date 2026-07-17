import type { SafeFunction } from "@orgsdk/plugins";
import { createGitHubClient } from "./auth";

export const moduleName = "github-repo";
export const moduleDescription =
	"List, search, and get details of GitHub repositories";

type GithubRepo = {
	id: number;
	name: string;
	fullName: string;
	description: string | null;
	private: boolean;
	defaultBranch: string;
	language: string | null;
	stargazersCount: number;
	forksCount: number;
	openIssuesCount: number;
	htmlUrl: string;
	createdAt: string | null;
	updatedAt: string | null;
};

type RawRepo = {
	id: number;
	name: string;
	full_name: string;
	description: string | null;
	private: boolean;
	default_branch?: string;
	language?: string | null;
	stargazers_count?: number;
	forks_count?: number;
	open_issues_count?: number;
	html_url: string;
	created_at?: string | null;
	updated_at?: string | null;
};

function toGithubRepo(repo: RawRepo): GithubRepo {
	return {
		id: repo.id,
		name: repo.name,
		fullName: repo.full_name,
		description: repo.description,
		private: repo.private,
		defaultBranch: repo.default_branch ?? "",
		language: repo.language ?? null,
		stargazersCount: repo.stargazers_count ?? 0,
		forksCount: repo.forks_count ?? 0,
		openIssuesCount: repo.open_issues_count ?? 0,
		htmlUrl: repo.html_url,
		createdAt: repo.created_at ?? null,
		updatedAt: repo.updated_at ?? null,
	};
}

export const safeFunctions: SafeFunction[] = [
	{
		name: "listRepos",
		requiredCredentials: ["github"],
		handler: async (
			credentials: Record<string, unknown>,
			{
				owner,
				type,
				sort,
				maxResults,
			}: {
				owner?: string;
				type?: string;
				sort?: string;
				maxResults?: number;
			},
		): Promise<GithubRepo[]> => {
			const octokit = createGitHubClient(credentials);
			const perPage = Math.min(maxResults ?? 30, 100);

			if (owner) {
				const { data } = await octokit.repos.listForUser({
					username: owner,
					type: (type as "owner" | "all" | "member") ?? "owner",
					sort:
						(sort as "created" | "updated" | "pushed" | "full_name") ??
						"updated",
					per_page: perPage,
				});
				return data.map(toGithubRepo);
			}

			// Authenticated user's repos
			const { data } = await octokit.repos.listForAuthenticatedUser({
				type:
					(type as "owner" | "all" | "public" | "private" | "member") ??
					"owner",
				sort:
					(sort as "created" | "updated" | "pushed" | "full_name") ?? "updated",
				per_page: perPage,
			});
			return data.map(toGithubRepo);
		},
		description:
			"List GitHub repositories for a user or the authenticated user. Returns simplified repo objects.",
		returnType:
			"Promise<Array<{ id: number; name: string; fullName: string; description: string | null; private: boolean; defaultBranch: string; language: string | null; stargazersCount: number; forksCount: number; openIssuesCount: number; htmlUrl: string; createdAt: string | null; updatedAt: string | null }>>",
		parameters: [
			{ name: "owner", type: "string", optional: true },
			{ name: "type", type: "string", optional: true },
			{ name: "sort", type: "string", optional: true },
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
		name: "getRepo",
		requiredCredentials: ["github"],
		handler: async (
			credentials: Record<string, unknown>,
			{ owner, repo }: { owner: string; repo: string },
		): Promise<GithubRepo> => {
			const octokit = createGitHubClient(credentials);
			const { data } = await octokit.repos.get({ owner, repo });
			return toGithubRepo(data);
		},
		description: "Get details of a specific GitHub repository.",
		returnType:
			"Promise<{ id: number; name: string; fullName: string; description: string | null; private: boolean; defaultBranch: string; language: string | null; stargazersCount: number; forksCount: number; openIssuesCount: number; htmlUrl: string; createdAt: string | null; updatedAt: string | null }>",
		parameters: [
			{ name: "owner", type: "string" },
			{ name: "repo", type: "string" },
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
		name: "searchRepos",
		requiredCredentials: ["github"],
		handler: async (
			credentials: Record<string, unknown>,
			{ query, maxResults }: { query: string; maxResults?: number },
		): Promise<GithubRepo[]> => {
			const octokit = createGitHubClient(credentials);
			const perPage = Math.min(maxResults ?? 30, 100);
			const { data } = await octokit.search.repos({
				q: query,
				per_page: perPage,
			});
			return data.items.map(toGithubRepo);
		},
		description:
			"Search GitHub repositories using GitHub search query syntax. Example: 'language:typescript stars:>100'.",
		returnType:
			"Promise<Array<{ id: number; name: string; fullName: string; description: string | null; private: boolean; defaultBranch: string; language: string | null; stargazersCount: number; forksCount: number; openIssuesCount: number; htmlUrl: string; createdAt: string | null; updatedAt: string | null }>>",
		parameters: [
			{ name: "query", type: "string" },
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
		name: "getRepoContributors",
		requiredCredentials: ["github"],
		handler: async (
			credentials: Record<string, unknown>,
			{
				owner,
				repo,
				maxResults,
			}: { owner: string; repo: string; maxResults?: number },
		): Promise<
			Array<{ login: string; contributions: number; htmlUrl: string }>
		> => {
			const octokit = createGitHubClient(credentials);
			const perPage = Math.min(maxResults ?? 30, 100);
			const { data } = await octokit.repos.listContributors({
				owner,
				repo,
				per_page: perPage,
			});
			return data.map((c) => ({
				login: c.login ?? "",
				contributions: c.contributions,
				htmlUrl: c.html_url ?? "",
			}));
		},
		description: "List contributors for a GitHub repository.",
		returnType:
			"Promise<Array<{ login: string; contributions: number; htmlUrl: string }>>",
		parameters: [
			{ name: "owner", type: "string" },
			{ name: "repo", type: "string" },
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
];
