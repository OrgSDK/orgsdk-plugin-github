import { describe, expect, it } from "bun:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const MANIFEST_PATH = resolve(import.meta.dir, "..", "plugin", ".plugin.json");

async function readManifest() {
	const raw = await readFile(MANIFEST_PATH, "utf-8");
	return JSON.parse(raw) as Record<string, unknown>;
}

describe("manifest", () => {
	it("has the expected slug (name)", async () => {
		const m = await readManifest();
		expect(m.name).toBe("github");
	});

	it("has the bumped version 1.0.2", async () => {
		const m = await readManifest();
		expect(m.version).toBe("1.0.2");
	});

	it("declares the canonical $schema", async () => {
		const m = await readManifest();
		expect(m.$schema).toBe("https://orgsdk.ai/schemas/plugin-manifest.v1.json");
	});

	it("has a non-empty description", async () => {
		const m = await readManifest();
		expect(typeof m.description).toBe("string");
		expect((m.description as string).length).toBeGreaterThan(0);
	});

	it("declares entry as index.ts", async () => {
		const m = await readManifest();
		expect(m.entry).toBe("index.ts");
	});

	it("declares token auth with the github provider key", async () => {
		const m = await readManifest();
		const auth = m.auth as Record<string, unknown>;
		expect(auth.type).toBe("token");
		expect(auth.provider).toBe("github");
		expect(auth.label).toBe("GitHub personal access token");
		expect(typeof auth.hint).toBe("string");
		expect(auth.hint as string).toContain("github.com/settings/tokens");
	});

	// Token-only plugins have no OAuth callback. The manifest must not declare a
	// callbackPath — token auth has no redirect flow.
	it("declares no callbackPath (token-only auth, no OAuth flow)", async () => {
		const m = await readManifest();
		const auth = m.auth as Record<string, unknown>;
		expect(auth.callbackPath).toBeUndefined();
	});

	it("declares marketplace metadata with the source-repo provenance link", async () => {
		const m = await readManifest();
		const mp = m.marketplace as Record<string, unknown>;
		expect(mp.displayName).toBe("GitHub");
		expect(mp.category).toBe("Developer");
		expect(Array.isArray(mp.tags)).toBe(true);
		expect(mp.tagline).toBeDefined();
		expect(Array.isArray(mp.useCases)).toBe(true);
		expect(typeof mp.permissionsSummary).toBe("string");
		const links = mp.links as Record<string, string>;
		expect(links.sourceRepo).toBe(
			"https://github.com/OrgSDK/orgsdk-plugin-github",
		);
		expect(links.homepage).toBe("https://github.com");
		expect(links.docs).toBe("https://docs.github.com/en/rest");
	});
});
