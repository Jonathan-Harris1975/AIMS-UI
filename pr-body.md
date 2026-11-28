This PR addresses the review findings from https://github.com/Jonathan-Harris1975/AIMS-UI/pull/252 at head 9865692709b2961aa17be25cf0756803ee2b7eec.

## Changes

### apps/console/index.html
- **connection-error template**: Changed `<h2>{{0}}</h2>` to `<h2 data-slot-0=""></h2>` for consistency with other templates that use the `data-slot-N=""` syntax.
- **newsletter-header template**: Fixed indentation from 6 spaces to 4 spaces to match other templates.
- **newsletter-note template**: Fixed indentation from 6 spaces to 4 spaces for consistency.

### tests/metrics-contract.test.mjs
- **StaticMarkup extraction**: Replaced fragile slice-based extraction with a robust regex match that captures the entire function body.
- **Mock document.getElementById**: Updated to throw an informative error when a template ID is not found, instead of returning `{ innerHTML: undefined }` which caused confusing downstream errors.

## Validation
- All metrics-contract tests pass (including the real analytics view harness test)
- Linter passes with no issues
- Changes are minimal and focused on the reported findings