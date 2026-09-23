# Security maintenance

## API diagnostics

The API emits structured JSON request-completion records. Unexpected server failures
also emit an `api_error` record with the same locally generated request ID returned in
the response. These records include the HTTP method, status and registered route
template (for example, `/api/v1/t/:slug`); unmatched requests use `[unmatched]`.

Error diagnostics include a fixed error class and, for recognized Prisma exceptions,
an explicitly allowed database error code. They never serialize exception messages,
stacks, causes, SQL/parameters, request bodies, cookies, authorization headers, query
strings or path parameter values. Unknown thrown values receive a generic category.
Routine client errors remain visible in completion records without an extra diagnostic.
Public error responses keep their existing safe envelope.

Use the response request ID to correlate a failure with completion and diagnostic
records. Classes such as `TypeError` indicate application failures; a recognized code
such as `P1001` helps identify database connectivity failures. Detailed stack traces
are deliberately absent, so reproducing a problem locally may still be necessary.
Logging sink failures are contained so they cannot replace an HTTP response or create
an unhandled promise rejection. Log storage, retention and alerting belong to the
deployment environment.

## Dependency checks

Run `npm run audit:dependencies` from the repository root. It audits the committed
lockfile, including development dependencies, without installing packages or running
their lifecycle scripts. It submits dependency names and versions, including workspace
package names, to `https://registry.npmjs.org` for known-advisory matching. It does not
upload application source or credentials.

The dedicated Dependency audit workflow runs on pull requests, supported branch pushes,
Monday mornings and manual dispatch. High and critical findings fail the check; lower
severities remain visible for review. Registry/network failures also fail the check, so
an unavailable advisory service is never reported as a clean audit. A passing audit
means no known finding reached the configured threshold at that time, not that every
dependency is vulnerability-free. Container and OS advisories are outside this npm check.

Dependabot proposes weekly npm workspace and GitHub Actions updates. Compatible npm
patch/minor updates are grouped; major updates stay separate. Updates are reviewed and
tested through pull requests, with no automatic merge. Actions remain pinned to commit
SHAs. Docker image updates remain a reviewed manual task.

When a finding appears:

1. Read the advisory and identify the affected dependency path and application exposure.
2. Prefer a compatible update to the direct dependency. Use a narrowly scoped override
   only when its compatibility is understood and document why it is needed.
3. Run the audit, lint, typechecking and application tests. Run database/browser checks
   for changes to runtime or build dependencies.
4. Keep unresolved high/critical findings visible and blocking. Do not use
   `npm audit fix --force`, hide errors with `|| true`, or silently exclude development
   dependencies to obtain a green result.

These files take effect in GitHub after publication; a successful local check does not
verify repository-level branch protection. Requiring the `audit` status for merging is
a separate repository setting.

References: [npm audit](https://docs.npmjs.com/cli/v11/commands/npm-audit/),
[Dependabot options](https://docs.github.com/en/code-security/reference/supply-chain-security/dependabot-options-reference).
