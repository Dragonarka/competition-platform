import { test, expect, competitionFactory } from '../support/fixtures';
import { OrganizerDashboardPage } from '../support/page-objects/organizer-dashboard.po';

test.describe('Organizer — Create competition', () => {
  test.skip('creates a competition, lands on config screen, appears in the list', async ({
    organizerPage,
  }) => {
    const seed = competitionFactory.build();
    const dashboard = new OrganizerDashboardPage(organizerPage);

    const competitionId = await dashboard.createCompetition({
      name: seed.name,
      description: seed.description,
    });

    await expect(organizerPage).toHaveURL(new RegExp(`/competitions/${competitionId}$`));

    await dashboard.gotoCompetitions();
    await dashboard.expectCompetitionInList(seed.name);
  });

  test.skip('rejects empty name with inline validation error', async ({ organizerPage }) => {
    const dashboard = new OrganizerDashboardPage(organizerPage);
    await dashboard.gotoNewCompetition();

    await organizerPage.getByRole('button', { name: /create/i }).click();

    await expect(organizerPage.getByText(/name.*required/i)).toBeVisible();
  });
});
