import { execFileSync } from "node:child_process";

const EXACT_GIT_SHA = /^[0-9a-f]{40}(?:[0-9a-f]{24})?$/iu;

function clean(value) {
  return String(value || "").trim();
}

function first(values) {
  return values.map(clean).find(Boolean) || "";
}

function defaultGit(args) {
  try {
    return clean(execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }));
  } catch {
    return "";
  }
}

export function isExactGitSha(value) {
  return EXACT_GIT_SHA.test(clean(value));
}

export function resolveReleaseMetadata({ env = process.env, required = false, git = defaultGit } = {}) {
  const environmentSha = first([
    env.AIMS_UI_RELEASE_SHA,
    env.WORKERS_CI_COMMIT_SHA,
    env.GITHUB_SHA,
  ]);
  const repositorySha = clean(git(["rev-parse", "HEAD"]));

  if (required && environmentSha && repositorySha && isExactGitSha(repositorySha)
      && environmentSha.toLowerCase() !== repositorySha.toLowerCase()) {
    throw new Error(`Release SHA ${environmentSha} does not match checked-out Git SHA ${repositorySha}.`);
  }

  const releaseSha = environmentSha || repositorySha || "development";
  if (required && !isExactGitSha(releaseSha)) {
    throw new Error("Production release SHA is unavailable or is not an exact full Git SHA.");
  }

  const environmentBranch = first([
    env.AIMS_UI_RELEASE_BRANCH,
    env.WORKERS_CI_BRANCH,
    env.GITHUB_HEAD_REF,
    env.GITHUB_REF_NAME,
  ]);
  const repositoryBranch = clean(git(["branch", "--show-current"]));

  if (required && environmentBranch && repositoryBranch && environmentBranch !== repositoryBranch) {
    throw new Error(`Release branch ${environmentBranch} does not match checked-out Git branch ${repositoryBranch}.`);
  }

  const releaseBranch = environmentBranch || repositoryBranch || "development";
  if (required && (!releaseBranch || releaseBranch === "development" || releaseBranch === "HEAD")) {
    throw new Error("Production release branch cannot be determined safely.");
  }

  return {
    releaseSha: isExactGitSha(releaseSha) ? releaseSha.toLowerCase() : releaseSha,
    releaseBranch,
  };
}

// Artifact builds may run on pull requests; only deployment to the production
// gateway is restricted to main. Check every provider signal so an explicit
// release label cannot disguise a feature-branch Workers Build.
export function resolveProductionDeploymentMetadata({ env = process.env, git = defaultGit } = {}) {
  const metadata = resolveReleaseMetadata({ env, git, required: true });
  const branches = [metadata.releaseBranch, env.WORKERS_CI_BRANCH,
    env.GITHUB_HEAD_REF, env.GITHUB_REF_NAME].map(clean).filter(Boolean);
  if (branches.some((branch) => branch !== "main")) {
    const evidence = {
      resolvedBranch: metadata.releaseBranch,
      workersCiBranch: clean(env.WORKERS_CI_BRANCH) || "(unset)",
      githubHeadRef: clean(env.GITHUB_HEAD_REF) || "(unset)",
      githubRefName: clean(env.GITHUB_REF_NAME) || "(unset)",
      gitBranch: clean(git(["branch", "--show-current"])) || "(detached/unavailable)",
      workersCiCommitSha: clean(env.WORKERS_CI_COMMIT_SHA) || "(unset)",
      gitCommitSha: clean(git(["rev-parse", "HEAD"])) || "(unavailable)",
    };
    throw new Error("Production deployment requires the main branch; feature branches must not deploy this gateway. Branch evidence: " + JSON.stringify(evidence));
  }
  return metadata;
}
