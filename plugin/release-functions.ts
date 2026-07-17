import type { SafeFunction } from "@orgsdk/plugins";
import { createGitHubClient } from "./auth";

export const moduleName = "github-releases";
export const moduleDescription =
	"List, create, and manage GitHub releases and tags";

type GithubRelease = {
	id: number;
	tagName: string;
	name: string | null;
	body: string | null;
	draft: boolean;
	prerelease: boolean;
	htmlUrl: string;
	targetCommitish: string;
	author: string | null;
	createdAt: string;
	publishedAt: string | null;
	assets: Array<{ name: string; size: number; downloadUrl: string }>;
};

type RawAsset = { name: string; size: number; browser_download_url: string };
type RawRelease = {
	id: number;
	tag_name: string;
	name: string | null;
	body?: string | null;
	draft: boolean;
	prerelease: boolean;
	html_url: string;
	target_commitish: string;
	author: { login: string } | null;
	created_at: string;
	published_at: string | null;
	assets: RawAsset[];
};

function toGithubRelease(release: RawRelease): GithubRelease {
	return {
		id: release.id,
		tagName: release.tag_name,
		name: release.name,
		body: release.body ?? null,
		draft: release.draft,
		prerelease: release.prerelease,
		htmlUrl: release.html_url,
		targetCommitish: release.target_commitish,
		author: release.author?.login ?? null,
		createdAt: release.created_at,
		publishedAt: release.published_at,
		assets: (release.assets ?? []).map((a) => ({
			name: a.name,
			size: a.size,
			downloadUrl: a.browser_download_url,
		})),
	};
}

export const safeFunctions: SafeFunction[] = [
	{
		name: "listReleases",
		requiredCredentials: ["github"],
		handler: async (
			credentials: Record<string, unknown>,
			{
				owner,
				repo,
				maxResults,
			}: { owner: string; repo: string; maxResults?: number },
		): Promise<GithubRelease[]> => {
			const octokit = createGitHubClient(credentials);
			const perPage = Math.min(maxResults ?? 30, 100);
			const { data } = await octokit.repos.listReleases({
				owner,
				repo,
				per_page: perPage,
			});
			return data.map(toGithubRelease);
		},
		description:
			"List releases for a GitHub repository, ordered by creation date (newest first).",
		returnType:
			"Promise<Array<{ id: number; tagName: string; name: string | null; body: string | null; draft: boolean; prerelease: boolean; htmlUrl: string; createdAt: string; publishedAt: string | null; assets: Array<{ name: string; size: number; downloadUrl: string }> }>>",
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
		name: "getRelease",
		requiredCredentials: ["github"],
		handler: async (
			credentials: Record<string, unknown>,
			{
				owner,
				repo,
				releaseId,
			}: { owner: string; repo: string; releaseId: number },
		): Promise<GithubRelease> => {
			const octokit = createGitHubClient(credentials);
			const { data } = await octokit.repos.getRelease({
				owner,
				repo,
				release_id: releaseId,
			});
			return toGithubRelease(data);
		},
		description: "Get a specific release by ID.",
		returnType:
			"Promise<{ id: number; tagName: string; name: string | null; body: string | null; draft: boolean; prerelease: boolean; htmlUrl: string; createdAt: string; publishedAt: string | null; assets: Array<{ name: string; size: number; downloadUrl: string }> }>",
		parameters: [
			{ name: "owner", type: "string" },
			{ name: "repo", type: "string" },
			{ name: "releaseId", type: "number" },
		],
		metadata: {
			category: "github",
			tags: ["readonly", "auth"],
			readonly: true,
			version: "1.0.0",
		},
	},
	{
		name: "createRelease",
		requiredCredentials: ["github"],
		handler: async (
			credentials: Record<string, unknown>,
			{
				owner,
				repo,
				tagName,
				name,
				body,
				draft,
				prerelease,
				targetCommitish,
			}: {
				owner: string;
				repo: string;
				tagName: string;
				name?: string;
				body?: string;
				draft?: boolean;
				prerelease?: boolean;
				targetCommitish?: string;
			},
		): Promise<GithubRelease> => {
			const octokit = createGitHubClient(credentials);
			const { data } = await octokit.repos.createRelease({
				owner,
				repo,
				tag_name: tagName,
				...(name !== undefined ? { name } : {}),
				...(body !== undefined ? { body } : {}),
				...(draft !== undefined ? { draft } : {}),
				...(prerelease !== undefined ? { prerelease } : {}),
				...(targetCommitish ? { target_commitish: targetCommitish } : {}),
			});
			return toGithubRelease(data);
		},
		description:
			"Create a new GitHub release. tagName is required. targetCommitish defaults to the default branch.",
		returnType:
			"Promise<{ id: number; tagName: string; name: string | null; body: string | null; draft: boolean; prerelease: boolean; htmlUrl: string; createdAt: string; publishedAt: string | null }>",
		parameters: [
			{ name: "owner", type: "string" },
			{ name: "repo", type: "string" },
			{ name: "tagName", type: "string" },
			{ name: "name", type: "string", optional: true },
			{ name: "body", type: "string", optional: true },
			{ name: "draft", type: "boolean", optional: true },
			{ name: "prerelease", type: "boolean", optional: true },
			{ name: "targetCommitish", type: "string", optional: true },
		],
		metadata: {
			category: "github",
			tags: ["auth", "io"],
			version: "1.0.0",
		},
	},
];
