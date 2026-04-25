# CI Secrets & Variables Checklist

> Configure in **GitHub repo → Settings → Secrets and variables → Actions**.

## Required secrets

| Name                                | Used by                   | Notes                                     |
| ----------------------------------- | ------------------------- | ----------------------------------------- |
| `FLY_API_TOKEN`                     | `deploy.yml`              | Fly.io deployment token (already in use). |
| `CLERK_SECRET_KEY`                  | `test.yml` (e2e, burn-in) | Clerk test-environment secret key.        |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | `test.yml` (e2e, burn-in) | Clerk test-environment publishable key.   |
| `TEST_ORGANIZER_EMAIL`              | `test.yml` (e2e, burn-in) | Seeded organizer account email.           |
| `TEST_ORGANIZER_PASSWORD`           | `test.yml` (e2e, burn-in) | Seeded organizer account password.        |
| `TEST_ORGANIZER_CLERK_USER_ID`      | `test.yml` (e2e, burn-in) | Clerk user id for the seeded organizer.   |

## Required repository variables

| Name         | Value  | Purpose                                                                                               |
| ------------ | ------ | ----------------------------------------------------------------------------------------------------- |
| `ENABLE_E2E` | `true` | Gates the `e2e` and `burn-in` jobs in `test.yml`. Omit or set to anything else to keep them disabled. |

## Optional (future expansion)

| Name                   | Purpose                                             |
| ---------------------- | --------------------------------------------------- |
| `SLACK_WEBHOOK_URL`    | Post pipeline failure summaries to Slack.           |
| `CODECOV_TOKEN`        | Upload coverage reports to Codecov.                 |
| `PACT_BROKER_BASE_URL` | Pact broker URL if contract testing is added later. |
| `PACT_BROKER_TOKEN`    | Pact broker auth token.                             |

## Setup steps

1. Provision Clerk test tenant and copy both keys.
2. Create a dedicated test organizer account in the test tenant; copy email, password, and Clerk user id.
3. Add each value in **Settings → Secrets and variables → Actions → New repository secret**.
4. Add `ENABLE_E2E=true` under the **Variables** tab.
5. Push or open a PR against `main`/`develop` to trigger `test.yml`.

## Rotation

- Rotate Clerk keys whenever the test tenant is re-created.
- Rotate `FLY_API_TOKEN` when team membership changes.
- Never commit these values to the repo — the pipeline has no fallback for missing secrets; the E2E job will simply report a missing-credentials error and fail, which is the desired behavior.

## Secrets hygiene

- No `${{ inputs.* }}` or `${{ github.event.* }}` user-controlled values are used directly in `run:` blocks. All such values must go through `env:` intermediaries and be referenced as `"$ENV_VAR"`.
- Artifacts are uploaded on failure with reasonable retention (14–30 days). Review `tests/test-results/` content before making test runs public.
