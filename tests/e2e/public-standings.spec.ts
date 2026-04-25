import { test, expect } from '../support/fixtures';

test.describe('Public — Live standings', () => {
  test.skip('anonymous viewer sees standings without login', async ({ publicPage }) => {
    const competitionId = process.env.E2E_COMPETITION_ID;
    test.skip(!competitionId, 'E2E_COMPETITION_ID not set — seed a competition first');

    await publicPage.goto(`/public/${competitionId}`);
    await expect(publicPage.getByRole('heading', { level: 1 })).toBeVisible();

    await expect(publicPage.getByText(/sign in|sign up/i)).not.toBeVisible();
  });

  test.skip('standings update within 10s of a score submission (NFR3)', async () => {
    test.info().annotations.push({
      type: 'todo',
      description:
        'Requires real-time score aggregation from Story 3.4. Setup: seed competition, open public page, submit score via judge, assert leaderboard updates within 10s.',
    });
  });
});
