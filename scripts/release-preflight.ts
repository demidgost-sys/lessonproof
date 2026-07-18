import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

interface Check {
  name: string;
  ok: boolean;
  detail: string;
}

interface SubmissionManifest {
  project?: string;
  track?: string;
  repositoryUrl?: string;
  publicCommitSha?: string;
  repositorySignedOutConfirmed?: boolean;
  liveUrl?: string;
  signedOutDesktopConfirmed?: boolean;
  signedOutMobileConfirmed?: boolean;
  videoUrl?: string;
  videoDurationSeconds?: number;
  youtubeSignedOutConfirmed?: boolean;
  youtubeAudioConfirmed?: boolean;
  feedbackSessionId?: string;
  verifiedModel?: string;
  responseIdPrefix?: string;
  eligibilityConfirmed?: boolean;
  devpostJoined?: boolean;
  availableThrough?: string;
  submittedAt?: string;
  devpostSubmissionUrl?: string;
  receiptPath?: string;
}

const root = process.cwd();
const requireSubmission = process.argv.includes("--submission");
const checks: Check[] = [];

function add(name: string, ok: boolean, detail: string): void {
  checks.push({ name, ok, detail });
}

function git(...args: string[]): string {
  return execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function packagedFiles(directory = ""): string[] {
  const ignoredDirectories = new Set([".git", ".playwright-cli", "dist", "node_modules"]);
  return readdirSync(resolve(root, directory), { withFileTypes: true }).flatMap((entry) => {
    const path = directory ? `${directory}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      return ignoredDirectories.has(entry.name) ? [] : packagedFiles(path);
    }
    return entry.isFile() ? [path] : [];
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasNonPublicHostname(hostname: string): boolean {
  const host = hostname
    .toLowerCase()
    .replace(/^\[|\]$/g, "")
    .replace(/\.$/, "");
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local")
  ) {
    return true;
  }

  if (
    host.includes(":") &&
    (host === "::" ||
      host === "::1" ||
      host.startsWith("::") ||
      host.startsWith("fc") ||
      host.startsWith("fd") ||
      /^fe[89ab]/.test(host) ||
      host.startsWith("ff") ||
      host.startsWith("2001:db8:"))
  ) return true;

  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!ipv4) return false;
  const octets = ipv4.slice(1).map(Number);
  if (octets.some((octet) => octet > 255)) return true;
  const [first, second] = octets;
  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 0 && [0, 2].includes(octets[2])) ||
    (first === 192 && second === 168) ||
    (first === 198 && second === 51 && octets[2] === 100) ||
    (first === 198 && (second === 18 || second === 19)) ||
    (first === 203 && second === 0 && octets[2] === 113) ||
    first >= 224
  );
}

function publicHttpsUrl(value: string | undefined): URL | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" &&
      url.hostname &&
      !url.username &&
      !url.password &&
      !hasNonPublicHostname(url.hostname)
      ? url
      : null;
  } catch {
    return null;
  }
}

function isIsoDate(value: string | undefined): boolean {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

let gitAvailable = false;
try {
  gitAvailable = git("rev-parse", "--is-inside-work-tree") === "true";
} catch {
  // Downloaded source archives intentionally have no Git metadata.
}
const trackedFiles = gitAvailable
  ? git("ls-files", "-z").split("\0").filter(Boolean)
  : packagedFiles();
const requiredFiles = [
  "README.md",
  "LICENSE",
  "SECURITY.md",
  "BEFORE.md",
  "AFTER.md",
  ".env.example",
  ".github/workflows/ci.yml",
  "fixtures/inverse-sine-release.json",
  "docs/architecture.md",
  "docs/provenance.md",
  "docs/traceability.md",
  "docs/testing.md",
];
const missing = requiredFiles.filter(
  (path) => !existsSync(resolve(root, path)) || !trackedFiles.includes(path),
);
add(
  "public-file-whitelist",
  missing.length === 0,
  missing.length === 0
    ? gitAvailable
      ? "required public files are present and tracked"
      : "required public files are present in the exported source archive"
    : `missing${gitAvailable ? " or untracked" : ""}: ${missing.join(", ")}`,
);

const forbiddenTrackedPaths = new Set([
  "AGENTS.md",
  "docs/00-rules-and-strategy.md",
  "docs/01-candidate-scorecard.md",
  "docs/03-submission-checklist.md",
  "docs/04-competition-landscape.md",
  "docs/05-win-sprint.md",
  "docs/06-demo-script.md",
  "docs/07-devpost-draft.md",
]);
const reachablePaths = gitAvailable
  ? git("log", "--all", "--format=", "--name-only").split("\n").filter(Boolean)
  : trackedFiles;
const forbiddenTracked = [...new Set(reachablePaths)].filter((path) =>
  forbiddenTrackedPaths.has(path),
);
add(
  "internal-files-excluded",
  forbiddenTracked.length === 0,
  forbiddenTracked.length === 0
    ? gitAvailable
      ? "internal planning files are absent from every reachable Git ref"
      : "internal planning files are not packaged"
    : `${gitAvailable ? "reachable" : "packaged"} internal files: ${forbiddenTracked.join(", ")}`,
);

const scans = [
  { label: "OpenAI-style API key", pattern: /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/ },
  { label: "private-key material", pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { label: "local Mac user path", pattern: /\/Users\/[A-Za-z0-9._-]+\// },
  { label: "local machine email", pattern: /@[A-Za-z0-9._-]+\.local\b/ },
  { label: "unfinished public placeholder", pattern: /\[(?:PENDING|UNVERIFIED|BLOCKED)[^\]]*\]/ },
];
const scanFailures: string[] = [];
for (const path of trackedFiles) {
  const absolute = resolve(root, path);
  if (!existsSync(absolute)) continue;
  const content = readFileSync(absolute);
  if (content.includes(0)) continue;
  const text = content.toString("utf8");
  for (const scan of scans) {
    if (scan.pattern.test(text)) {
      scanFailures.push(`${scan.label}: ${path}`);
    }
    scan.pattern.lastIndex = 0;
  }
}
add(
  "tracked-content-scan",
  scanFailures.length === 0,
  scanFailures.length === 0
    ? "no secret, local-path, or unfinished-placeholder pattern found"
    : scanFailures.join("; "),
);

if (gitAvailable) {
  const identityEmails = [
    ...new Set(
      git("log", "--all", "--format=%ae%n%ce").split("\n").filter(Boolean),
    ),
  ];
  const unsafeEmails = identityEmails.filter((email) => email.endsWith(".local"));
  add(
    "public-git-identity",
    unsafeEmails.length === 0,
    unsafeEmails.length === 0
      ? `author/committer email(s): ${identityEmails.join(", ") || "none"}`
      : "history contains a machine-local author or committer email",
  );
} else {
  add(
    "public-git-identity",
    true,
    "Git metadata is absent from this source archive; repository CI checks the public history",
  );
}

add(
  "environment-secret-boundary",
  !trackedFiles.includes(".env") && !trackedFiles.includes(".submission.local.json"),
  ".env and local submission state are not tracked",
);

if (requireSubmission) {
  const manifestPath = resolve(root, ".submission.local.json");
  let manifest: SubmissionManifest = {};
  let manifestValid = false;
  try {
    const parsed: unknown = JSON.parse(readFileSync(manifestPath, "utf8"));
    const stringFields = [
      "project",
      "track",
      "repositoryUrl",
      "publicCommitSha",
      "liveUrl",
      "videoUrl",
      "feedbackSessionId",
      "verifiedModel",
      "responseIdPrefix",
      "availableThrough",
      "submittedAt",
      "devpostSubmissionUrl",
      "receiptPath",
    ];
    const booleanFields = [
      "repositorySignedOutConfirmed",
      "signedOutDesktopConfirmed",
      "signedOutMobileConfirmed",
      "youtubeSignedOutConfirmed",
      "youtubeAudioConfirmed",
      "eligibilityConfirmed",
      "devpostJoined",
    ];
    const expectedFields = new Set([
      ...stringFields,
      ...booleanFields,
      "videoDurationSeconds",
    ]);
    if (
      !isRecord(parsed) ||
      stringFields.some((field) => typeof parsed[field] !== "string") ||
      booleanFields.some((field) => typeof parsed[field] !== "boolean") ||
      typeof parsed.videoDurationSeconds !== "number" ||
      Object.keys(parsed).some((field) => !expectedFields.has(field))
    ) {
      throw new Error("Invalid submission manifest shape.");
    }
    manifest = parsed as SubmissionManifest;
    manifestValid = true;
  } catch {
    // The detailed gate below remains useful even when the manifest is absent.
  }
  add(
    "submission-manifest",
    manifestValid,
    manifestValid
      ? "local manifest is valid JSON with the complete expected field set"
      : "copy submission.example.json to ignored .submission.local.json and complete it",
  );

  const repositoryUrl = publicHttpsUrl(manifest.repositoryUrl);
  const repositorySegments = repositoryUrl?.pathname.split("/").filter(Boolean) ?? [];
  const validRepository = Boolean(
      repositoryUrl &&
      repositoryUrl.hostname === "github.com" &&
      repositorySegments.length === 2 &&
      repositorySegments[0] === "demidgost-sys" &&
      repositorySegments[1] === "lessonproof" &&
      !repositoryUrl.search &&
      !repositoryUrl.hash,
  );
  const liveUrl = publicHttpsUrl(manifest.liveUrl);
  const validLive = Boolean(
    liveUrl &&
      !liveUrl.search &&
      !liveUrl.hash,
  );
  const videoUrl = publicHttpsUrl(manifest.videoUrl);
  const videoId =
    videoUrl?.hostname === "youtu.be"
      ? videoUrl.pathname.split("/").filter(Boolean)[0]
      : ["youtube.com", "www.youtube.com"].includes(videoUrl?.hostname ?? "") &&
          videoUrl?.pathname === "/watch"
        ? videoUrl.searchParams.get("v")
        : null;
  const validVideo = Boolean(
    videoUrl && videoId && /^[A-Za-z0-9_-]{6,}$/.test(videoId),
  );
  const validFeedback = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    manifest.feedbackSessionId ?? "",
  );
  const validCommitSha = /^[0-9a-f]{40}$/.test(manifest.publicCommitSha ?? "");
  const commitMatchesHead = Boolean(
    validCommitSha &&
      (!gitAvailable || manifest.publicCommitSha === git("rev-parse", "HEAD")),
  );
  const cleanCommittedTree = !gitAvailable || git("status", "--porcelain").length === 0;
  const validVideoDuration =
    Number.isFinite(manifest.videoDurationSeconds) &&
    (manifest.videoDurationSeconds ?? 0) > 0 &&
    (manifest.videoDurationSeconds ?? 180) < 180;
  const validModel = /^gpt-5\.6(?:$|-)/.test(manifest.verifiedModel ?? "");
  const validResponsePrefix = /^resp_[A-Za-z0-9_-]{7}…$/.test(
    manifest.responseIdPrefix ?? "",
  );
  const throughAnnouncement =
    isIsoDate(manifest.availableThrough) &&
    new Date(`${manifest.availableThrough}T00:00:00.000Z`).getTime() >=
      Date.UTC(2026, 7, 12);

  add(
    "project",
    manifest.project === "LessonProof",
    manifest.project === "LessonProof" ? "LessonProof" : "missing or incorrect",
  );
  add(
    "track",
    manifest.track === "Education",
    manifest.track === "Education" ? "Education" : "missing or incorrect",
  );
  add(
    "repository-url",
    validRepository,
    validRepository ? repositoryUrl!.toString() : "missing or invalid public GitHub URL",
  );
  add(
    "public-commit-sha",
    commitMatchesHead,
    validCommitSha
      ? gitAvailable
        ? commitMatchesHead
          ? "matches local HEAD"
          : "does not match local HEAD"
        : "valid 40-character SHA; archive has no Git metadata for comparison"
      : "missing or invalid",
  );
  add(
    "committed-clean-tree",
    cleanCommittedTree,
    cleanCommittedTree ? "submission source matches the recorded commit" : "commit or discard local changes",
  );
  add(
    "repository-signed-out",
    manifest.repositorySignedOutConfirmed === true,
    "operator attestation after signed-out read",
  );
  add(
    "live-url",
    validLive,
    validLive ? liveUrl!.toString() : "missing or invalid public HTTPS URL",
  );
  add(
    "signed-out-desktop",
    manifest.signedOutDesktopConfirmed === true,
    "operator attestation after deployed desktop golden path",
  );
  add(
    "signed-out-mobile",
    manifest.signedOutMobileConfirmed === true,
    "operator attestation after deployed mobile golden path",
  );
  add(
    "public-youtube-url",
    validVideo,
    validVideo ? videoUrl!.toString() : "missing or invalid public YouTube URL",
  );
  add(
    "video-duration",
    validVideoDuration,
    validVideoDuration
      ? `${manifest.videoDurationSeconds} seconds (<180)`
      : "record measured duration greater than 0 and less than 180 seconds",
  );
  add(
    "youtube-signed-out",
    manifest.youtubeSignedOutConfirmed === true,
    "operator attestation after signed-out playback",
  );
  add(
    "youtube-audio",
    manifest.youtubeAudioConfirmed === true,
    "operator attestation after audible playback",
  );
  add("feedback-session-id", validFeedback, validFeedback ? "UUID recorded" : "missing or invalid");
  add(
    "verified-model",
    validModel,
    validModel ? manifest.verifiedModel! : "missing or invalid live smoke evidence",
  );
  add(
    "response-id-prefix",
    validResponsePrefix,
    validResponsePrefix ? "safe 12-character Responses API prefix recorded" : "missing or invalid",
  );
  add(
    "eligibility-confirmed",
    manifest.eligibilityConfirmed === true,
    manifest.eligibilityConfirmed === true
      ? "owner attestation recorded"
      : "owner attestation required",
  );
  add(
    "devpost-joined",
    manifest.devpostJoined === true,
    manifest.devpostJoined === true ? "joined status recorded" : "owner account action required",
  );
  add(
    "judge-access-window",
    throughAnnouncement,
    manifest.availableThrough || "missing availability date",
  );
}

const failed = checks.filter((check) => !check.ok);
process.stdout.write(`${JSON.stringify({ ok: failed.length === 0, checks }, null, 2)}\n`);
if (failed.length > 0) process.exitCode = 1;
