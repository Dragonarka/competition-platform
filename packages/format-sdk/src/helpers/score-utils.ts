export function addScores(a: string, b: string): string {
  return (parseFloat(a) + parseFloat(b)).toFixed(2);
}

export function sumScores(scores: string[]): string {
  return scores.reduce((acc, s) => acc + parseFloat(s), 0).toFixed(2);
}

export function formatScore(value: number, precision = 2): string {
  return value.toFixed(precision);
}

export function validateScoreString(value: string, min: number, max: number): boolean {
  const num = parseFloat(value);
  return !isNaN(num) && num >= min && num <= max;
}

export function compareScores(a: string, b: string): number {
  return parseFloat(a) - parseFloat(b);
}
