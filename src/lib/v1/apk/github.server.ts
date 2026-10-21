/**
 * Server-side GitHub integration for the ZIP-to-APK Builder.
 * All calls go through the Lovable connector gateway; the GitHub token
 * (GITHUB_API_KEY) and LOVABLE_API_KEY never leave the server.
 */
import { APK_TEMPLATE_FILES } from "./template";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/github";
const BUILD_REPO = "v1-apk-builds";
const ZIP_PATH = "build-input/project.zip";
const WORKFLOW_FILE = "android-build.yml";

export class ApkBuildError extends Error {
  constructor(
    message: string,
    readonly code: "not_configured" | "github_error" | "build_failed",
  ) {
    super(message);
    this.name = "ApkBuildError";
  }
}

function gatewayHeaders(): Record<string, string> {
  const lovablKey = process.env["LOVABLE_API_KEY"];
  const githubKey = process.env["GITHUB_API_KEY"];
  if (!lovablKey || !githubKey) {
    throw new ApkBuildError(
      "APK builds are not connected yet. Connect GitHub in the project settings to enable APK builds.",
      "not_configured",
    );
  }
  return {
    Accept: "application/vnd.github+json",
    "Content-Type": "application/json",
    Authorization: `Bearer ${lovablKey}`,
    "X-Connection-Api-Key": githubKey,
  };
}

async function gh<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${GATEWAY_URL}${path}`, {
    ...init,
    headers: { ...gatewayHeaders(), ...(init?.headers as Record<string, string> | undefined) },
  });
  if (!res.ok) {
    const body = await res.text();
    console.error(`[apk] GitHub request failed [${res.status}] ${path}: ${body}`);
    throw new ApkBuildError(`GitHub request failed (${res.status}).`, "github_error");
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

async function ghAllow404<T>(path: string): Promise<T | null> {
  const res = await fetch(`${GATEWAY_URL}${path}`, { headers: gatewayHeaders() });
  if (res.status === 404) return null;
  if (!res.ok) {
    const body = await res.text();
    console.error(`[apk] GitHub request failed [${res.status}] ${path}: ${body}`);
    throw new ApkBuildError(`GitHub request failed (${res.status}).`, "github_error");
  }
  return (await res.json()) as T;
}

function toBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

type GhUser = { login: string };
type GhRef = { object: { sha: string } };

/** Ensures the private build repo exists; returns the owner login. */
export async function ensureBuildRepo(): Promise<{ owner: string; repo: string }> {
  const user = await gh<GhUser>("/user");
  const owner = user.login;
  const existing = await ghAllow404<{ full_name: string }>(`/repos/${owner}/${BUILD_REPO}`);
  if (!existing) {
    await gh(`/user/repos`, {
      method: "POST",
      body: JSON.stringify({
        name: BUILD_REPO,
        private: true,
        auto_init: true,
        description: "Automated APK builds for the V1 Builder (ZIP-to-APK).",
      }),
    });
  }
  return { owner, repo: BUILD_REPO };
}

/**
 * Commits files to the repo's main branch in a single commit using the
 * Git Data API (works for binary files larger than the Contents API limit).
 */
export async function commitFiles(
  owner: string,
  repo: string,
  files: Record<string, string | Uint8Array>,
  message: string,
): Promise<void> {
  const baseRef = await ghAllow404<GhRef>(`/repos/${owner}/${repo}/git/ref/heads/main`);

  const treeItems: { path: string; mode: string; type: string; sha: string }[] = [];
  for (const [path, content] of Object.entries(files)) {
    const base64 = typeof content === "string" ? toBase64(content) : bytesToBase64(content);
    const blob = await gh<{ sha: string }>(`/repos/${owner}/${repo}/git/blobs`, {
      method: "POST",
      body: JSON.stringify({ content: base64, encoding: "base64" }),
    });
    treeItems.push({ path, mode: "100644", type: "blob", sha: blob.sha });
  }

  const tree = await gh<{ sha: string }>(`/repos/${owner}/${repo}/git/trees`, {
    method: "POST",
    body: JSON.stringify({
      ...(baseRef ? { base_tree: baseRef.object.sha } : {}),
      tree: treeItems,
    }),
  });

  const commit = await gh<{ sha: string }>(`/repos/${owner}/${repo}/git/commits`, {
    method: "POST",
    body: JSON.stringify({
      message,
      tree: tree.sha,
      ...(baseRef ? { parents: [baseRef.object.sha] } : {}),
    }),
  });

  if (baseRef) {
    await gh(`/repos/${owner}/${repo}/git/refs/heads/main`, {
      method: "PATCH",
      body: JSON.stringify({ sha: commit.sha }),
    });
  } else {
    await gh(`/repos/${owner}/${repo}/git/refs`, {
      method: "POST",
      body: JSON.stringify({ ref: "refs/heads/main", sha: commit.sha }),
    });
  }
}

/** Pushes the wrapper template if the workflow file is missing. */
export async function ensureTemplate(owner: string, repo: string): Promise<void> {
  const workflow = await ghAllow404(
    `/repos/${owner}/${repo}/contents/.github/workflows/${WORKFLOW_FILE}`,
  );
  if (workflow) return;
  await commitFiles(owner, repo, { ...APK_TEMPLATE_FILES }, "Set up Android APK build workflow");
}

/** Uploads the project ZIP and starts the build workflow. Returns the run id. */
export async function startBuild(
  owner: string,
  repo: string,
  zipBytes: Uint8Array,
  androidFiles: Record<string, string | Uint8Array> = {},
): Promise<number> {
  await commitFiles(
    owner,
    repo,
    { ...androidFiles, [ZIP_PATH]: zipBytes },
    "Apply Android app settings and upload project ZIP for APK build",
  );

  const before = Date.now();
  await gh(`/repos/${owner}/${repo}/actions/workflows/${WORKFLOW_FILE}/dispatches`, {
    method: "POST",
    body: JSON.stringify({ ref: "main", inputs: { source_zip_path: ZIP_PATH } }),
  });

  // The dispatch is asynchronous; poll briefly for the new run to appear.
  for (let attempt = 0; attempt < 10; attempt++) {
    await new Promise((r) => setTimeout(r, 2000));
    const runs = await gh<{ workflow_runs: { id: number; created_at: string }[] }>(
      `/repos/${owner}/${repo}/actions/workflows/${WORKFLOW_FILE}/runs?per_page=5`,
    );
    const run = runs.workflow_runs.find((r) => new Date(r.created_at).getTime() >= before - 60_000);
    if (run) return run.id;
  }
  throw new ApkBuildError("The build was started but GitHub did not report a run.", "github_error");
}

export type ApkRunStatus = {
  status: "queued" | "in_progress" | "completed";
  conclusion: string | null;
};

export async function getRunStatus(owner: string, repo: string, runId: number): Promise<ApkRunStatus> {
  const run = await gh<{ status: string; conclusion: string | null }>(
    `/repos/${owner}/${repo}/actions/runs/${runId}`,
  );
  return {
    status: run.status === "completed" ? "completed" : run.status === "in_progress" ? "in_progress" : "queued",
    conclusion: run.conclusion,
  };
}

/** Downloads the built APK artifact. Only call after a successful run. */
export async function downloadApk(owner: string, repo: string, runId: number): Promise<Uint8Array> {
  const artifacts = await gh<{ artifacts: { id: number; name: string }[] }>(
    `/repos/${owner}/${repo}/actions/runs/${runId}/artifacts`,
  );
  const artifact = artifacts.artifacts.find((a) => a.name === "Universal-ZIP-to-APK") ?? artifacts.artifacts[0];
  if (!artifact) throw new ApkBuildError("The build finished but produced no APK artifact.", "build_failed");

  const res = await fetch(`${GATEWAY_URL}/repos/${owner}/${repo}/actions/artifacts/${artifact.id}/zip`, {
    headers: gatewayHeaders(),
    redirect: "follow",
  });
  if (!res.ok) {
    const body = await res.text();
    console.error(`[apk] artifact download failed [${res.status}]: ${body}`);
    throw new ApkBuildError("Could not download the built APK.", "github_error");
  }
  const zipBytes = new Uint8Array(await res.arrayBuffer());

  const { unzipSync } = await import("fflate");
  const entries = unzipSync(zipBytes);
  const apkEntry = Object.keys(entries).find((n) => n.endsWith(".apk"));
  if (!apkEntry) throw new ApkBuildError("The build artifact did not contain an APK file.", "build_failed");
  return entries[apkEntry]!;
}
