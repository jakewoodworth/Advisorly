import { describe, expect, it } from "vitest";

import { scoreByInterest } from "../interestMap";

describe("scoreByInterest", () => {
  const interestTags = {
    Strategy: 0.8,
    Quant: 0.6,
    Leadership: 0.7,
  };

  it("returns 0 when there are no course tags", () => {
    expect(scoreByInterest([], interestTags)).toBe(0);
  });

  it("returns 0 when there are no matching interest tags", () => {
    expect(scoreByInterest(["Design", "Ethics"], interestTags)).toBe(0);
  });

  it("computes the mean score for partial matches", () => {
    const result = scoreByInterest(["Strategy", "Ethics", "Quant"], interestTags);
    const expected = (interestTags.Strategy + interestTags.Quant) / 2;
    expect(result).toBeCloseTo(expected, 6);
  });

  it("caps the score at 1", () => {
    const result = scoreByInterest(["Strategy"], { Strategy: 1.2 });
    expect(result).toBe(1);
  });

  it("handles all course tags mapping to interests", () => {
    const result = scoreByInterest(["Strategy", "Leadership", "Quant"], interestTags);
    const expected =
      (interestTags.Strategy + interestTags.Leadership + interestTags.Quant) / 3;
    expect(result).toBeCloseTo(expected, 6);
  });
});
