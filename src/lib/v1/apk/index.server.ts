/**
 * ZIP-to-APK Builder (server side). Isolated module: it reads the active
 * project's Workspace Files through the existing store, zips them, pushes
 * them to the user's private GitHub build repo and runs the Android build
 * workflow there. No project files are modified.
 */
import { zipSync } from "fflate";
import { workspaceFor } from "@/lib/v1/files/index.server";
import {
  ANDROID_CONFIG_PATH,
  generateAndroidFiles,
  parseAndroidConfig,
  validateAndroidConfig,
  type AndroidConfig,
} from "./config";
import {
  ApkBuildError,
  commitFiles,
  downloadApk,
  ensureBuildRepo,
  ensureTemplate,
  getRunStatus,
  startBuild,
} from "./github.server";

export { ApkBuildError };

/** Zips the active project's workspace files, preserving paths and contents. */
export async function buildProjectZip(projectId: string): Promise<Uint8Array> {
  const store = workspaceFor(projectId);
  const files = await store.list();
  if (!files.length) {
    throw new ApkBuildError("This project has no files to build into an APK.", "build_failed");
  }
  const entries: Record<string, Uint8Array> = {};
  for (const file of files) {
    if (file.path.startsWith(".v1/")) continue; // builder settings, not app content
    const content = await store.read(file.path);
    if (content) entries[file.path] = new TextEncoder().encode(content.content);
  }
  if (!Object.keys(entries).length) {
    throw new ApkBuildError("This project has no readable files.", "build_failed");
  }
  const hasEntry = Object.keys(entries).some(
    (p) => /(^|\/)index\.html$/i.test(p) || /AndroidManifest\.xml$/i.test(p),
  );
  if (!hasEntry) {
    throw new ApkBuildError(
      "This project needs an index.html (web app) or an AndroidManifest.xml (Android project) to build an APK.",
      "build_failed",
    );
  }
  return zipSync(entries, { level: 6 });
}

export async function loadAndroidConfig(projectId: string): Promise<AndroidConfig> {
  const file = await workspaceFor(projectId).read(ANDROID_CONFIG_PATH);
  return parseAndroidConfig(file?.content);
}

export async function saveAndroidConfig(projectId: string, config: AndroidConfig): Promise<AndroidConfig> {
  const problems = validateAndroidConfig(config);
  if (problems.length) throw new ApkBuildError(problems.join(" "), "build_failed");
  await workspaceFor(projectId).write(ANDROID_CONFIG_PATH, JSON.stringify(config));
  return config;
}

/** Starts an APK build for the given project. Returns the workflow run id. */
export async function startApkBuild(projectId: string): Promise<{ runId: number }> {
  const config = await loadAndroidConfig(projectId);
  const problems = validateAndroidConfig(config);
  if (problems.length) {
    throw new ApkBuildError(`Fix the Android settings first: ${problems.join(" ")}`, "build_failed");
  }
  const zip = await buildProjectZip(projectId);
  const { owner, repo } = await ensureBuildRepo();
  await ensureTemplate(owner, repo);
  const runId = await startBuild(owner, repo, zip, generateAndroidFiles(config));
  return { runId };
}

export async function getApkBuildStatus(runId: number) {
  const { owner, repo } = await ensureBuildRepo();
  return getRunStatus(owner, repo, runId);
}

/** Returns the APK bytes; only valid after a successful run. */
export async function getApkDownload(runId: number): Promise<Uint8Array> {
  const { owner, repo } = await ensureBuildRepo();
  const status = await getRunStatus(owner, repo, runId);
  if (status.status !== "completed" || status.conclusion !== "success") {
    throw new ApkBuildError("The APK is only available after a successful build.", "build_failed");
  }
  return downloadApk(owner, repo, runId);
}

// Re-exported for tests/typing convenience.
export { commitFiles };
