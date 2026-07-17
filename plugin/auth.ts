import { Octokit } from "@octokit/rest";

type GitHubCredentialBundle = {
	secret_token?: string;
	baseUrl?: string;
};

type ClientCache = {
	token: string;
	baseUrl: string | undefined;
	client: Octokit;
};

let clientCache: ClientCache | null = null;

function getGitHubBundle(
	creds: Record<string, unknown>,
): GitHubCredentialBundle {
	return (creds["github"] as GitHubCredentialBundle | undefined) ?? {};
}

export function createGitHubClient(
	credentials: Record<string, unknown>,
): Octokit {
	const bundle = getGitHubBundle(credentials);
	const { secret_token, baseUrl } = assertGitHubBundle(bundle);

	if (
		!clientCache ||
		clientCache.token !== secret_token ||
		clientCache.baseUrl !== baseUrl
	) {
		clientCache = {
			token: secret_token,
			baseUrl,
			client: new Octokit({
				auth: secret_token,
				...(baseUrl ? { baseUrl } : {}),
			}),
		};
	}

	return clientCache.client;
}

function assertGitHubBundle(
	bundle: GitHubCredentialBundle,
): Required<Pick<GitHubCredentialBundle, "secret_token">> &
	Pick<GitHubCredentialBundle, "baseUrl"> {
	if (!bundle.secret_token) {
		throw new Error(
			"Missing GitHub token. Add it in the dashboard (Credentials tab).",
		);
	}
	return { secret_token: bundle.secret_token, baseUrl: bundle.baseUrl };
}
