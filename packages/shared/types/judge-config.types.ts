export type TieBreakingRule = 're_vote' | 'organizer_decision';

export interface JudgeConfig {
  cypherJudgeCount: number;
  cypherGroupCount: number;
  advancementThreshold: number;
  battlesJudgeCount: number;
  tieBreakingRule: TieBreakingRule;
}

export interface JudgeConfigPartial {
  cypherJudgeCount: number | null;
  cypherGroupCount: number | null;
  advancementThreshold: number | null;
  battlesJudgeCount: number | null;
  tieBreakingRule: TieBreakingRule | null;
}
