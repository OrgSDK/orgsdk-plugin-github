import type { SafeFunction } from "@orgsdk/plugins";
import { createGitHubClient } from "./auth";

export const moduleName = "github-content";
export const moduleDescription =
	"Read, create, update, and delete files in GitHub repositories";

type GithubFileContent = {
	name: string;
	path: string;
	sha: string;
	size: number;
	content: string;
	htmlUrl: string;
};

type GithubDirectoryEntry = {
	name: string;
	path: string;
	type: "file" | "dir" | "submodule" | "symlink";
	sha: string;
	size: number;
	htmlUrl: string;
};

type GithubFileWriteResult = {
	path: string;
	sha: string;
	htmlUrl: string;
};

export const safeFunctions: SafeFunction[] = [
	{
		name: "getFileContent",
		requiredCredentials: ["github"],
		handler: async (
			credentials: Record<string, unknown>,
			{
				owner,
				repo,
				path: filePath,
				ref,
			}: {
				owner: string;
				repo: string;
				path: string;
				ref?: string;
			},
		): Promise<GithubFileContent> => {
			const octokit = createGitHubClient(credentials);
			const { data } = await octokit.repos.getContent({
				owner,
				repo,
				path: filePath,
				...(ref ? { ref } : {}),
			});

			if (Array.isArray(data)) {
				throw new Error(
					`Path '${filePath}' is a directory, not a file. Use listDirectoryContents instead.`,
				);
			}

			if (data.type !== "file") {
				throw new Error(`Path '${filePath}' is a ${data.type}, not a file.`);
			}

			const fileData = data as {
				size: number;
				content?: string;
				html_url: string | null;
				name: string;
				path: string;
				sha: string;
			};
			if (fileData.size > 1_000_000) {
				throw new Error(
					`File '${filePath}' is ${fileData.size} bytes (>1MB). Use the Git Blob API for large files.`,
				);
			}

			// Decode base64 content
			const content = Buffer.from(fileData.content ?? "", "base64").toString(
				"utf-8",
			);

			return {
				name: fileData.name,
				path: fileData.path,
				sha: fileData.sha,
				size: fileData.size,
				content,
				htmlUrl: fileData.html_url ?? "",
			};
		},
		description:
			"Get the content of a file from a GitHub repository. Auto-decodes base64 to UTF-8. Errors on files >1MB. Use ref to specify a branch/tag/commit.",
		returnType:
			"Promise<{ name: string; path: string; sha: string; size: number; content: string; htmlUrl: string }>",
		parameters: [
			{ name: "owner", type: "string" },
			{ name: "repo", type: "string" },
			{ name: "path", type: "string" },
			{ name: "ref", type: "string", optional: true },
		],
		metadata: {
			category: "github",
			tags: ["readonly", "auth"],
			readonly: true,
			version: "1.0.0",
		},
	},
	{
		name: "createOrUpdateFile",
		requiredCredentials: ["github"],
		handler: async (
			credentials: Record<string, unknown>,
			{
				owner,
				repo,
				path: filePath,
				content,
				message,
				branch,
				sha,
			}: {
				owner: string;
				repo: string;
				path: string;
				content: string;
				message: string;
				branch?: string;
				sha?: string;
			},
		): Promise<GithubFileWriteResult> => {
			const octokit = createGitHubClient(credentials);
			const encodedContent = Buffer.from(content, "utf-8").toString("base64");

			const { data } = await octokit.repos.createOrUpdateFileContents({
				owner,
				repo,
				path: filePath,
				message,
				content: encodedContent,
				...(branch ? { branch } : {}),
				...(sha ? { sha } : {}),
			});

			return {
				path: data.content?.path ?? filePath,
				sha: data.content?.sha ?? "",
				htmlUrl: data.content?.html_url ?? "",
			};
		},
		description:
			"Create or update a file in a GitHub repository. Provide sha to update an existing file (get it from getFileContent). Content is auto-encoded to base64.",
		returnType: "Promise<{ path: string; sha: string; htmlUrl: string }>",
		parameters: [
			{ name: "owner", type: "string" },
			{ name: "repo", type: "string" },
			{ name: "path", type: "string" },
			{ name: "content", type: "string" },
			{ name: "message", type: "string" },
			{ name: "branch", type: "string", optional: true },
			{ name: "sha", type: "string", optional: true },
		],
		metadata: {
			category: "github",
			tags: ["auth", "io"],
			version: "1.0.0",
		},
	},
	{
		name: "listDirectoryContents",
		requiredCredentials: ["github"],
		handler: async (
			credentials: Record<string, unknown>,
			{
				owner,
				repo,
				path: dirPath,
				ref,
			}: {
				owner: string;
				repo: string;
				path?: string;
				ref?: string;
			},
		): Promise<GithubDirectoryEntry[]> => {
			const octokit = createGitHubClient(credentials);
			const { data } = await octokit.repos.getContent({
				owner,
				repo,
				path: dirPath ?? "",
				...(ref ? { ref } : {}),
			});

			if (!Array.isArray(data)) {
				throw new Error(
					`Path '${dirPath ?? "/"}' is a file, not a directory. Use getFileContent instead.`,
				);
			}

			return data.map((entry) => ({
				name: entry.name,
				path: entry.path,
				type: entry.type,
				sha: entry.sha,
				size: entry.size ?? 0,
				htmlUrl: entry.html_url ?? "",
			}));
		},
		description:
			"List contents of a directory in a GitHub repository. Defaults to root. Use ref to specify a branch/tag/commit.",
		returnType:
			"Promise<Array<{ name: string; path: string; type: 'file' | 'dir' | 'submodule' | 'symlink'; sha: string; size: number; htmlUrl: string }>>",
		parameters: [
			{ name: "owner", type: "string" },
			{ name: "repo", type: "string" },
			{ name: "path", type: "string", optional: true },
			{ name: "ref", type: "string", optional: true },
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
