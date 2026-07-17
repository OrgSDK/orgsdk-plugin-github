import type {
	PluginContext,
	PluginFactory,
	PluginModule,
} from "@orgsdk/plugins";
import { safeFunctions as actionsFns } from "./actions-functions";
import { GitHubTokenProvider } from "./auth-provider";
import { safeFunctions as branchFns } from "./branch-functions";
import { safeFunctions as contentFns } from "./content-functions";
import { safeFunctions as issueFns } from "./issue-functions";
import { safeFunctions as prFns } from "./pr-functions";
import { safeFunctions as releaseFns } from "./release-functions";
import { safeFunctions as repoFns } from "./repo-functions";

const createPlugin: PluginFactory = (ctx: PluginContext): PluginModule => {
	const authProvider = new GitHubTokenProvider(ctx);
	return {
		safeFunctions: [
			...actionsFns,
			...branchFns,
			...contentFns,
			...issueFns,
			...prFns,
			...releaseFns,
			...repoFns,
		],
		authProvider,
		async onLoad() {
			const cred = await ctx.stores.credential.get("github", "default");
			if (!cred) {
				ctx.logger.warn(
					"[github] No github credential found. Add it in the dashboard (Credentials tab).",
				);
			}
		},
	};
};

export default createPlugin;
