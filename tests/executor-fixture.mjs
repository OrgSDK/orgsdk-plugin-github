import assert from "node:assert/strict";

const user = { login: "fixture" };
const issue = {
	id: 1,
	number: 1,
	title: "Synthetic issue",
	state: "open",
	labels: [],
	assignees: [],
	user,
};
const comment = { id: 1, body: "Synthetic comment", user };
const pull = {
	...issue,
	head: { ref: "feature", sha: "abc" },
	base: { ref: "main", sha: "abc" },
};
const repository = {
	id: 1,
	name: "repo",
	full_name: "owner/repo",
	private: true,
};
const release = {
	id: 1,
	tag_name: "v1",
	name: "Synthetic release",
	draft: true,
	prerelease: false,
	assets: [],
};
const run = {
	id: 1,
	name: "CI",
	status: "completed",
	conclusion: "success",
	head_sha: "abc",
};
const branch = {
	name: "main",
	commit: {
		sha: "abc",
		commit: { message: "Fixture", author: { name: "Fixture" } },
	},
	protected: true,
};
const file = {
	type: "file",
	name: "file",
	path: "file",
	sha: "abc",
	size: 7,
	content: Buffer.from("Example").toString("base64"),
};

export default async function createFixture() {
	return {
		provider: "github",
		secret: { secret_token: "synthetic-github" },
		async fetch(request) {
			const url = new URL(request.url);
			assert.equal(url.origin, "https://api.github.com");
			assert.equal(
				request.headers.get("authorization"),
				"token synthetic-github",
			);
			const path = decodeURIComponent(url.pathname).replace(
				"/repos/owner/repo",
				"",
			);
			let data;
			if (path === "/actions/runs") data = { workflow_runs: [run] };
			else if (path === "/actions/runs/1") data = run;
			else if (path === "/actions/runs/1/jobs")
				data = { jobs: [{ id: 1, name: "Fixture", steps: [] }] };
			else if (path === "/actions/runs/1/artifacts")
				data = { artifacts: [{ id: 1, name: "Fixture", size_in_bytes: 2 }] };
			else if (path === "/actions/jobs/1/logs")
				return new Response("Fixture logs", {
					headers: { "content-type": "text/plain" },
				});
			else if (path === "/actions/artifacts/1/zip") {
				const response = new Response(new Uint8Array([1, 2]));
				Object.defineProperty(response, "url", { value: request.url });
				return response;
			} else if (path.startsWith("/actions/") && request.method === "POST")
				return new Response(null, { status: 204 });
			else if (path === "/branches") data = [branch];
			else if (path === "/branches/main") data = branch;
			else if (path === "/git/ref/heads/main")
				data = { object: { sha: "abc" } };
			else if (path === "/git/refs")
				data = { ref: "refs/heads/feature", object: { sha: "abc" } };
			else if (path === "/contents/file")
				data = request.method === "PUT" ? { content: file } : file;
			else if (path === "/contents/dir") data = [file];
			else if (path === "/issues")
				data = request.method === "POST" ? issue : [issue];
			else if (path === "/issues/1") data = issue;
			else if (path === "/issues/1/comments")
				data = request.method === "POST" ? comment : [comment];
			else if (path === "/issues/1/labels") data = [{ name: "bug" }];
			else if (path === "/pulls")
				data = request.method === "POST" ? pull : [pull];
			else if (path === "/pulls/1") data = pull;
			else if (path === "/pulls/1/merge")
				data = { merged: true, message: "Synthetic merge", sha: "abc" };
			else if (path === "/pulls/1/requested_reviewers")
				data = { requested_reviewers: [{ login: "reviewer" }] };
			else if (path === "/releases")
				data = request.method === "POST" ? release : [release];
			else if (path === "/releases/1") data = release;
			else if (path === "/user/repos") data = [repository];
			else if (path === "/search/repositories") data = { items: [repository] };
			else if (path === "/contributors")
				data = [{ login: "fixture", contributions: 1, type: "User" }];
			else if (path === "") data = repository;
			else assert.fail(`${request.method} ${url.pathname}`);
			return Response.json(data);
		},
		async run(call) {
			const base = { owner: "owner", repo: "repo" };
			const cases = [
				["listWorkflowRuns", {}, (value) => value[0].id === 1],
				["getWorkflowRun", { runId: 1 }, (value) => value.id === 1],
				[
					"triggerWorkflow",
					{ actionId: "ci.yml", ref: "main" },
					(value) => value.triggered,
				],
				["rerunWorkflowFailedJobs", { runId: 1 }, (value) => value.rerunned],
				["rerunWorkflow", { runId: 1 }, (value) => value.rerunned],
				["cancelWorkflowRun", { runId: 1 }, (value) => value.cancelled],
				["listWorkflowJobs", { runId: 1 }, (value) => value[0].id === 1],
				[
					"getWorkflowJobLogs",
					{ jobId: 1 },
					(value) => value.logs === "Fixture logs",
				],
				[
					"listWorkflowRunArtifacts",
					{ runId: 1 },
					(value) => value[0].id === 1,
				],
				[
					"downloadWorkflowArtifact",
					{ artifactId: 1 },
					(value) => value.downloadUrl.includes("artifacts/1/zip"),
				],
				["listBranches", {}, (value) => value[0].name === "main"],
				["getBranch", { branch: "main" }, (value) => value.sha === "abc"],
				[
					"createBranch",
					{ branchName: "feature", fromRef: "main" },
					(value) => value.ref === "refs/heads/feature",
				],
				[
					"getFileContent",
					{ path: "file" },
					(value) => value.content === "Example",
				],
				[
					"createOrUpdateFile",
					{ path: "file", content: "Example", message: "Fixture" },
					(value) => value.path === "file",
				],
				[
					"listDirectoryContents",
					{ path: "dir" },
					(value) => value[0].name === "file",
				],
				["listIssues", {}, (value) => value[0].id === 1],
				["getIssue", { issueNumber: 1 }, (value) => value.id === 1],
				[
					"createIssue",
					{ title: "Synthetic issue" },
					(value) => value.id === 1,
				],
				[
					"updateIssue",
					{ issueNumber: 1, title: "Synthetic issue" },
					(value) => value.id === 1,
				],
				[
					"addIssueComment",
					{ issueNumber: 1, body: "Synthetic comment" },
					(value) => value.id === 1,
				],
				["listIssueComments", { issueNumber: 1 }, (value) => value[0].id === 1],
				[
					"addIssueLabels",
					{ issueNumber: 1, labels: ["bug"] },
					(value) => value[0] === "bug",
				],
				["listPullRequests", {}, (value) => value[0].id === 1],
				["getPullRequest", { pullNumber: 1 }, (value) => value.id === 1],
				[
					"createPullRequest",
					{ title: "Fixture", head: "feature", base: "main" },
					(value) => value.id === 1,
				],
				[
					"addPrComment",
					{ pullNumber: 1, body: "Fixture" },
					(value) => value.id === 1,
				],
				["listPrComments", { pullNumber: 1 }, (value) => value[0].id === 1],
				["mergePullRequest", { pullNumber: 1 }, (value) => value.merged],
				[
					"requestPrReview",
					{ pullNumber: 1, reviewers: ["reviewer"] },
					(value) => value.requestedReviewers[0] === "reviewer",
				],
				["listReleases", {}, (value) => value[0].id === 1],
				["getRelease", { releaseId: 1 }, (value) => value.id === 1],
				[
					"createRelease",
					{ tagName: "v1", draft: true },
					(value) => value.id === 1,
				],
				["listRepos", { owner: undefined }, (value) => value[0].id === 1],
				["getRepo", {}, (value) => value.id === 1],
				["searchRepos", { query: "Example" }, (value) => value[0].id === 1],
				["getRepoContributors", {}, (value) => value[0].login === "fixture"],
			];
			for (const [name, args, verify] of cases)
				assert(
					verify(await call(name, { ...base, ...args })),
					`${name} returned an unexpected value`,
				);
		},
	};
}
