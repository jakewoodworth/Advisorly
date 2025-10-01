export function scoreByInterest(
  courseTags: string[],
  interestTags: Record<string, number>
): number {
  if (!Array.isArray(courseTags) || courseTags.length === 0) {
    return 0;
  }

  const matchedScores = courseTags
    .map((tag) => interestTags[tag])
    .filter((value): value is number => typeof value === "number" && !Number.isNaN(value));

  if (matchedScores.length === 0) {
    return 0;
  }

  const total = matchedScores.reduce((sum, value) => sum + value, 0);
  const average = total / matchedScores.length;

  if (average < 0) return 0;
  if (average > 1) return 1;

  return average;
}
