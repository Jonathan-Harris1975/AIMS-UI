import test from 'node:test'
import assert from 'node:assert/strict'
import { assessDeployedIntegrationClosure } from '../scripts/workflow-run-gate.mjs'

const base = {
  eventName: 'workflow_run',
  sourceEvent: 'push',
  sourceConclusion: 'success',
  sourceBranch: 'main',
  sourceRepository: 'Jonathan-Harris1975/AIMS-UI',
  repository: 'Jonathan-Harris1975/AIMS-UI',
  sourceSha: '0123456789abcdef0123456789abcdef01234567',
  integrationResult: 'success',
  attestation: {
    repository: 'Jonathan-Harris1975/AIMS-UI',
    source_sha: '0123456789abcdef0123456789abcdef01234567',
    deployed_sha: '0123456789abcdef0123456789abcdef01234567',
    status: 'deployed-integration-green-full',
    health_check: 'passed',
    hive_handoff: 'passed',
  },
}

test('successful same-repository main push closes only after exact-SHA integration succeeds', () => {
  assert.deepEqual(assessDeployedIntegrationClosure(base), {
    status: 'verified',
    required: true,
    reason: `exact-SHA deployed integration passed for ${base.sourceSha}`,
  })
})

test('missing, skipped, cancelled or failed required integration blocks closure', () => {
  for (const integrationResult of ['missing', 'skipped', 'cancelled', 'failure']) {
    const result = assessDeployedIntegrationClosure({ ...base, integrationResult })
    assert.equal(result.status, 'failed', integrationResult)
    assert.equal(result.required, true, integrationResult)
  }
})

test('missing, stale or incomplete attestation blocks closure even when the job reports success', () => {
  for (const attestation of [
    null,
    { ...base.attestation, deployed_sha: 'f'.repeat(40) },
    { ...base.attestation, hive_handoff: 'unknown' },
  ]) {
    const result = assessDeployedIntegrationClosure({ ...base, attestation })
    assert.equal(result.status, 'failed')
    assert.match(result.reason, /attestation is missing, stale, or incomplete/)
  }
})

test('malformed or absent source revision blocks required release evidence', () => {
  for (const sourceSha of ['', 'abc', 'z'.repeat(40)]) {
    const result = assessDeployedIntegrationClosure({ ...base, sourceSha })
    assert.equal(result.status, 'failed', sourceSha)
    assert.match(result.reason, /full 40-character/)
  }
})

test('non-release events remain explicit and do not claim health verification', () => {
  const cases = [
    [{ ...base, eventName: 'pull_request' }, /outside/],
    [{ ...base, sourceEvent: 'pull_request' }, /not a push/],
    [{ ...base, sourceConclusion: 'failure' }, /not success/],
    [{ ...base, sourceBranch: 'feature' }, /not main/],
    [{ ...base, sourceRepository: 'fork/AIMS-UI' }, /not from this repository/],
  ]
  for (const [input, expectedReason] of cases) {
    const result = assessDeployedIntegrationClosure(input)
    assert.equal(result.status, 'not_applicable')
    assert.equal(result.required, false)
    assert.match(result.reason, expectedReason)
  }
})

test('workflow configuration covers lifecycle producers and always evaluates deployment closure', async () => {
  const { readFile } = await import('node:fs/promises')
  const lifecycle = await readFile(new URL('../.github/workflows/lifecycle-evidence.yml', import.meta.url), 'utf8')
  const integration = await readFile(new URL('../.github/workflows/deployed-integration.yml', import.meta.url), 'utf8')
  const diagnostics = await readFile(new URL('../.github/workflows/failure-diagnostics.yml', import.meta.url), 'utf8')
  for (const producer of [
    '"Repository Council"',
    '"Validate AIMS UI"',
    '"CodeQL"',
    '"Security and repository quality"',
    '"AIMS-UI deployed integration"',
  ]) assert.ok(lifecycle.includes(producer), `missing current-head lifecycle producer ${producer}`)
  for (const unrelated of [
    '"Autonomous main-branch repair PR"',
    '"Autonomous PR issue repair"',
    '"Trusted automation and native auto-merge"',
  ]) assert.ok(!lifecycle.includes(unrelated), `unrelated workflow must not produce lifecycle evidence: ${unrelated}`)
  assert.ok(lifecycle.includes("github.ref == 'refs/heads/main'"), 'manual evidence dispatch must stay on main')
  assert.ok(lifecycle.includes('group: hive-lifecycle-evidence-${{ github.repository }}'), 'evidence runs must share a per-repository concurrency group')
  assert.ok(lifecycle.includes('cancel-in-progress: false'))
  assert.ok(!lifecycle.includes('"*"'), 'lifecycle monitor must use an explicit producer list')
  assert.ok(
    integration.includes([
      '  integration_closure:',
      '    name: Deployed integration closure (exact SHA)',
      '    needs: [integration]',
      '    if: ${{ always() }}',
    ].join('\n')),
    'integration closure guard must stay in the same job block',
  )
  assert.ok(integration.includes('needs: [integration]'))
  assert.ok(integration.includes('INTEGRATION_RESULT: ${{ needs.integration.result }}'))
  assert.ok(integration.includes('run: node scripts/workflow-run-gate.mjs'))
  assert.ok(integration.includes('actions/download-artifact@9000827ccba6bdab643e8b6fd33ac0654aef8333'))
  assert.ok(integration.includes('ATTESTATION_PATH:'))
  assert.ok(integration.includes('deployed-integration-attestation.json'))
  assert.ok(diagnostics.includes('deployment-failure-diagnostics-${{ github.event.workflow_run.id'))
  assert.ok(diagnostics.includes('cancel-in-progress: false'))
})
