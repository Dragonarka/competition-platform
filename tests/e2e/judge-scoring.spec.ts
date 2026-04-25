import { test, expect } from '../support/fixtures';
import { JudgeScoringPage } from '../support/page-objects/judge-scoring.po';

test.describe('Judge — Invite link & scoring interface', () => {
  test.skip('opens a valid judge link and sees welcome + judge label', async ({ judgePage }) => {
    const token = process.env.E2E_JUDGE_TOKEN;
    test.skip(!token, 'E2E_JUDGE_TOKEN not set — seed a token and set the env var');

    const judge = new JudgeScoringPage(judgePage);
    await judge.open(token!);
    await judge.expectValidLink('Judge 1');
  });

  test.skip('rejects an invalid judge token with Link Not Valid', async ({ judgePage }) => {
    const judge = new JudgeScoringPage(judgePage);
    await judge.open('definitely-not-a-valid-token');
    await judge.expectInvalidLink();
  });

  test.skip('scoring cycle under 10 seconds on mobile viewport', async ({ judgePage }) => {
    const token = process.env.E2E_JUDGE_TOKEN;
    test.skip(!token, 'E2E_JUDGE_TOKEN not set');

    const judge = new JudgeScoringPage(judgePage);

    const start = Date.now();
    await judge.open(token!);
    await judge.submitScore({ Musicality: 8.5, Technique: 7.0, Creativity: 9.25 });
    await judge.expectConfirmation();
    const elapsed = Date.now() - start;

    expect(elapsed).toBeLessThan(10_000);
  });
});
