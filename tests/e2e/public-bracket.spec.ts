import { test, expect } from '../support/fixtures';

test.describe('Public — Bracket view', () => {
  test('unknown competition ID renders 404 (no auth required)', async ({ publicPage }) => {
    // This test is runnable without seeding: the server returns NOT_FOUND for
    // an unrecognised competitionId, and Next.js renders its not-found page.
    await publicPage.goto('/definitely-not-a-real-competition-id/bracket');

    // Next.js not-found page should display
    await expect(publicPage).not.toHaveURL(/sign-in/);
    await expect(publicPage.getByRole('main')).toBeVisible();
  });

  test.skip('anonymous viewer sees bracket page for active competition', async ({ publicPage }) => {
    const competitionId = process.env.E2E_COMPETITION_ID;
    test.skip(!competitionId, 'E2E_COMPETITION_ID not set — seed a competition first');

    await publicPage.goto(`/${competitionId}/bracket`);

    // Page title (from PublicBracket.pageTitle translation key)
    await expect(publicPage.getByRole('heading', { level: 1 })).toBeVisible();

    // Connection badge should render (even if disconnected in test env)
    await expect(publicPage.getByTestId('connection-status-label')).toBeVisible();

    // Should not prompt for sign-in — bracket is public
    await expect(publicPage.getByText(/sign.?in/i)).not.toBeVisible();
  });

  test.skip('bracket stale-wrapper reflects WebSocket connection state', async ({ publicPage }) => {
    const competitionId = process.env.E2E_COMPETITION_ID;
    test.skip(!competitionId, 'E2E_COMPETITION_ID not set');

    await publicPage.goto(`/${competitionId}/bracket`);

    const wrapper = publicPage.getByTestId('bracket-stale-wrapper');
    await expect(wrapper).toBeVisible();

    // Initially connected → stale=false
    await expect(wrapper).toHaveAttribute('data-stale', 'false');
  });
});
