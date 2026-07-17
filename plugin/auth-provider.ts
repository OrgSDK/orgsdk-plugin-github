import type { AuthMeta, AuthProvider, PluginContext } from "@orgsdk/plugins";

export class GitHubTokenProvider implements AuthProvider {
	readonly type = "token" as const;
	readonly authMeta: AuthMeta = { displayName: "GitHub" };
	private readonly ctx: PluginContext;

	constructor(ctx: PluginContext) {
		this.ctx = ctx;
	}

	async initiate(
		credentialName: string,
	): Promise<{ authUrl: string; state: string }> {
		return {
			authUrl: `Add the GitHub credential '${credentialName}' in the dashboard (Credentials tab).`,
			state: "",
		};
	}

	async handleCallback(
		_req: Request,
	): Promise<{ success: boolean; credentialName: string; error?: string }> {
		return {
			success: false,
			credentialName: "",
			error: "GitHub token auth has no callback flow",
		};
	}

	async storeToken(credentialName: string, token: string): Promise<void> {
		await this.ctx.stores.credential.setSecrets(
			"github",
			credentialName,
			{ secret_token: token },
			{ label: `GitHub (${credentialName})`, valid: true },
		);
	}

	async authSetup(
		options: Record<string, string>,
	): Promise<{ success: boolean; message?: string; error?: string }> {
		const token = options.token ?? "";
		const name = options.name ?? "default";
		if (!token) return { success: false, error: "Missing --token" };
		await this.storeToken(name, token);
		return { success: true, message: `Saved credential 'github/${name}'.` };
	}
}
