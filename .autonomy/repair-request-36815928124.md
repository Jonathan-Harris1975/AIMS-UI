# Autonomous repair request

- Failed workflow: AIMS-UI deployed integration
- Failed commit: 7a6731c76432e5b3180ca54b531fe6ab086b144c
- Failed run: https://github.com/Jonathan-Harris1975/AIMS-UI/actions/runs/36815928124
- Run ID: 36815928124
- Security-classified workflow: false

Fix the smallest code, dependency-manifest, lockfile, build or deployment-configuration defect that caused this failure.
Delete this file only after the underlying defect is fixed and the relevant repository checks pass.

Guardrails:
- Do not weaken tests, CodeQL, Trivy, Gitleaks, required checks, branch/ruleset protections, workflow permissions, secret handling or security policy.
- Do not dismiss CodeQL alerts, reduce query coverage, add broad suppressions or change secret allowlists merely to make CI green.
- Do not merge or deploy directly.
- If credentials, destructive data changes, platform administration, alert dismissal or a security-policy decision are required, keep this marker and use autonomy:human-hold.
