// The "Rate Signal" — turns the numeric score into a plain-language tier so
// a reveal decision doesn't require reading a number. Four bands per the
// brand spec (see DECISIONS.md "Brand system v2"): 90+ is Strong, 75-89 is
// Good, 55-74 is Fair, below 55 is Weak. Strong and Good share the same
// "green" semantic color deliberately — both mean "a reasonable person
// would book this" — Fair is amber (worth a second look), Weak is red
// (something else checked is meaningfully better). Thresholds are a
// starting judgment call, not a tuned model.
export type DealSignalTier = "strong" | "good" | "fair" | "weak";

export interface DealSignal {
  tier: DealSignalTier;
  label: string;
  colorVar: string; // CSS custom property name carrying this tier's color
  verdict: string; // one-line plain-language recommendation
}

export function getDealSignal(score: number): DealSignal {
  if (score >= 90) {
    return { tier: "strong", label: "Strong", colorVar: "--signal-good", verdict: "Book it." };
  }
  if (score >= 75) {
    return { tier: "good", label: "Good", colorVar: "--signal-good", verdict: "A solid offer — book with confidence." };
  }
  if (score >= 55) {
    return {
      tier: "fair",
      label: "Fair",
      colorVar: "--signal-fair",
      verdict: "Reasonable, but worth comparing before you commit.",
    };
  }
  return {
    tier: "weak",
    label: "Weak",
    colorVar: "--signal-wait",
    verdict: "Another offer checked here is meaningfully better.",
  };
}
