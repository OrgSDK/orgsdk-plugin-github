import type { SafeFunction } from "@orgsdk/plugins";
import { createGitHubClient } from "./auth";

export const moduleName = "github-branches";
export const moduleDescription =
	"List, create, and manage GitHub repository branches";

type GithubBranch = {
	name: string;
	sha: string;
	protected: boolean;
};

export const safeFunctions: SafeFunction[] = [
	{
		name: "listBranches",
		requiredCredentials: ["github"],
		handler: async (
			credentials: Record<string, unknown>,
			{
				owner,
				repo,
				maxResults,
			}: { owner: string; repo: string; maxResults?: number },
		): Promise<GithubBranch[]> => {
			const octokit = createGitHubClient(credentials);
			const perPage = Math.min(maxResults ?? 30, 100);
			const { data } = await octokit.repos.listBranches({
				owner,
				repo,
				per_page: perPage,
			});
			return data.map((b) => ({
				name: b.name,
				sha: b.commit.sha,
				protected: b.protected,
			}));
		},
		description: "List branches for a GitHub repository.",
		returnType:
			"Promise<Array<{ name: string; sha: string; protected: boolean }>>",
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
	{
		name: "getBranch",
		requiredCredentials: ["github"],
		handler: async (
			credentials: Record<string, unknown>,
			{ owner, repo, branch }: { owner: string; repo: string; branch: string },
		): Promise<
			GithubBranch & { commitMessage: string; commitAuthor: string | null }
		> => {
			const octokit = createGitHubClient(credentials);
			const { data } = await octokit.repos.getBranch({ owner, repo, branch });
			return {
				name: data.name,
				sha: data.commit.sha,
				protected: data.protected,
				commitMessage: data.commit.commit.message,
				commitAuthor: data.commit.commit.author?.name ?? null,
			};
		},
		description:
			"Get details of a specific branch including latest commit info.",
		returnType:
			"Promise<{ name: string; sha: string; protected: boolean; commitMessage: string; commitAuthor: string | null }>",
		parameters: [
			{ name: "owner", type: "string" },
			{ name: "repo", type: "string" },
			{ name: "branch", type: "string" },
		],
		metadata: {
			category: "github",
			tags: ["readonly", "auth"],
			readonly: true,
			version: "1.0.0",
		},
	},
	{
		name: "createBranch",
		requiredCredentials: ["github"],
		handler: async (
			credentials: Record<string, unknown>,
			{
				owner,
				repo,
				branchName,
				fromRef,
			}: {
				owner: string;
				repo: string;
				branchName: string;
				fromRef?: string;
			},
		): Promise<{ ref: string; sha: string }> => {
			const octokit = createGitHubClient(credentials);

			// Resolve the source SHA
			let sha: string;
			if (fromRef) {
				const { data } = await octokit.git.getRef({
					owner,
					repo,
					ref: fromRef.startsWith("heads/") ? fromRef : `heads/${fromRef}`,
				});
				sha = data.object.sha;
			} else {
				// Default to the repo's default branch
				const { data: repoData } = await octokit.repos.get({ owner, repo });
				const { data } = await octokit.git.getRef({
					owner,
					repo,
					ref: `heads/${repoData.default_branch}`,
				});
				sha = data.object.sha;
			}

			const { data } = await octokit.git.createRef({
				owner,
				repo,
				ref: `refs/heads/${branchName}`,
				sha,
			});
			return { ref: data.ref, sha: data.object.sha };
		},
		description:
			"Create a new branch. fromRef defaults to the repo's default branch. Example: createBranch('owner', 'repo', 'feature/new', 'main').",
		returnType: "Promise<{ ref: string; sha: string }>",
		parameters: [
			{ name: "owner", type: "string" },
			{ name: "repo", type: "string" },
			{ name: "branchName", type: "string" },
			{ name: "fromRef", type: "string", optional: true },
		],
		metadata: {
			category: "github",
			tags: ["auth", "io"],
			version: "1.0.0",
		},
	},
];
