import { appendFileSync, readFileSync } from 'node:fs'

const REQUIRED_CONCLUSION = 'success'
const REQUIRED_BRANCH = 'main'
const FULL_SHA = /^[0-9a-f]{40}$/i

export function assessDeployedIntegrationClosure({
  eventName,
  sourceEvent,
  sourceConclusion,
  sourceBranch,
  sourceRepository,
  repository,
  sourceSha,
  integrationResult,
  attestation,
}) {
  const required = eventName === 'workflow_run'
    && sourceEvent === 'push'
    && sourceConclusion === REQUIRED_CONCLUSION
    && sourceBranch === REQUIRED_BRANCH
    && Boolean(repository)
    && sourceRepository === repository

  if (!required) {
    let reason = 'event is not a successful same-repository main-branch push'
    if (eventName !== 'workflow_run') reason = `event ${eventName || '(missing)'} is outside the workflow_run release scope`
    else if (sourceEvent !== 'push') reason = `source event ${sourceEvent || '(missing)'} is not a push`
    else if (sourceConclusion !== REQUIRED_CONCLUSION) reason = `source workflow conclusion ${sourceConclusion || '(missing)'} is not success`
    else if (sourceBranch !== REQUIRED_BRANCH) reason = `source branch ${sourceBranch || '(missing)'} is not main`
    else if (sourceRepository !== repository) reason = 'source run is not from this repository'
    return { status: 'not_applicable', required: false, reason }
  }

  if (!FULL_SHA.test(sourceSha || '')) {
    return { status: 'failed', required: true, reason: 'required source revision is not a full 40-character commit SHA' }
  }
  if (integrationResult !== 'success') {
    return {
      status: 'failed',
      required: true,
      reason: `required exact-SHA deployed integration job concluded ${integrationResult || 'missing'}`,
    }
  }
  const validAttestation = attestation
    && attestation.repository === repository
    && attestation.source_sha === sourceSha.toLowerCase()
    && attestation.deployed_sha === sourceSha.toLowerCase()
    && attestation.status === 'deployed-integration-green-full'
    && attestation.health_check === 'passed'
    && attestation.hive_handoff === 'passed'
  if (!validAttestation) {
    return { status: 'failed', required: true, reason: 'exact-SHA health attestation is missing, stale, or incomplete' }
  }
  return { status: 'verified', required: true, reason: `exact-SHA deployed integration passed for ${sourceSha.toLowerCase()}` }
}

function main() {
  let attestation = null
  try {
    if (process.env.ATTESTATION_PATH) attestation = JSON.parse(readFileSync(process.env.ATTESTATION_PATH, 'utf8'))
  } catch {
    attestation = null
  }
  const result = assessDeployedIntegrationClosure({
    eventName: process.env.EVENT_NAME,
    sourceEvent: process.env.SOURCE_EVENT,
    sourceConclusion: process.env.SOURCE_CONCLUSION,
    sourceBranch: process.env.SOURCE_BRANCH,
    sourceRepository: process.env.SOURCE_REPOSITORY,
    repository: process.env.REPOSITORY,
    sourceSha: process.env.SOURCE_SHA,
    integrationResult: process.env.INTEGRATION_RESULT,
    attestation,
  })
  const line = `### Deployed integration closure: ${result.status}\n\n${result.reason}.\n`
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, line)
  }
  if (result.status === 'failed') {
    console.error(`::error::${result.reason}. Release verification is not closed.`)
    process.exitCode = 1
  } else {
    console.log(line.trim())
  }
}


if (import.meta.url === `file://${process.argv[1]}`) main()
