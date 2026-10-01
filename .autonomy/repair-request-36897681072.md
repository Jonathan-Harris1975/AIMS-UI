# Autonomous repair request

- Failed workflow: AIMS-UI deployed integration
- Failed commit: d8669f6ea17191acfb1c34d4c5b8f7eaae75ada6
- Failed run: https://github.com/Jonathan-Harris1975/AIMS-UI/actions/runs/36897681072
- Run ID: 36897681072
- Security-classified workflow: false

Fix the smallest code, dependency-manifest, lockfile, build or deployment-configuration defect that caused this failure.
Delete this file only after the underlying defect is fixed and the relevant repository checks pass.

Guardrails:
- Do not weaken tests, CodeQL, Trivy, Gitleaks, required checks, branch/ruleset protections, workflow permissions, secret handling or security policy.
- Do not dismiss CodeQL alerts, reduce query coverage, add broad suppressions or change secret allowlists merely to make CI green.
- Do not merge or deploy directly.
- If credentials, destructive data changes, platform administration, alert dismissal or a security-policy decision are required, keep this marker and use autonomy:human-hold.
