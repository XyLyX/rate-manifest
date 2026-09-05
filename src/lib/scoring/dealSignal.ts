// The "Rate Signal" — turns the numeric score into a plain-language tier so
// a reveal decision doesn't require reading a number. Four bands per the
// brand spec (see DECISIONS.md "Brand system v2"): 90+ is Strong, 75-89 is
// Good, 55-74 is Fair, below 55 is Weak. Strong and Good share the same
// "green" semantic color deliberately — both mean "a reasonable person
// would book this" — Fair is amber (worth a second look), Weak is red
// (something else checked is meaningfully better). Thresholds are a
// starting judgment call, not a tuned model.
export type DealSignalTier = "strong" | "good" | "fair" | "weak";

// The four-page journey's Check IQ page (Page 2) needs the RATE+VALUE+
// TERMS+MARKET+TIMING framework to collapse to one of exactly three
// decision words - see claude/travel-decision-platform-assessment.md,
// "RateManifest — Final Customer Journey": "BOOK NOW / WATCH / CONSIDER
// ALTERNATIVE." This is a vocabulary mapping over the existing four tiers,
// not a new scoring pass - scoreOffers()/getDealSignal()'s own thresholds
// and weights are unchanged (per that spec's own non-goal: "don't design
// the perfect scoring algorithm yet"). Strong/Good both mean "a reasonable
// person would book this" already (see the tier comment below) - that's
// exactly BOOK NOW. Fair ("worth a second look") maps to WATCH. Weak
// ("something else checked is meaningfully better") maps to CONSIDER
// ALTERNATIVE.
export type VerdictAction = "BOOK NOW" | "WATCH" | "CONSIDER ALTERNATIVE";

// Four bands per the brand spec (see DECISIONS.md "Brand system v2"): 90+ is Strong, 75-89 is
// Good, 55-74 is Fair, below 55 is Weak. Strong and Good share the same
// "green" semantic color deliberately — both mean "a reasonable person
// would book this" — Fair is amber (worth a second look), Weak is red
// (something else checked is meaningfully better). Thresholds are a
// starting judgment call, not a tuned model.
export interface DealSignal {
  tier: DealSignalTier;
  label: string;
  colorVar: string; // CSS custom property name carrying this tier's color
  verdict: string; // one-line plain-language recommendation
  action: VerdictAction; // Page 2/Page 4's fixed decision vocabulary — see VerdictAction above
}

export function getDealSignal(score: number): DealSignal {
  if (score >= 90) {
    return { tier: "strong", label: "Strong", colorVar: "--signal-good", verdict: "Book it.", action: "BOOK NOW" };
  }
  if (score >= 75) {
    return {
      tier: "good",
      label: "Good",
      colorVar: "--signal-good",
      verdict: "A solid offer — book with confidence.",
      action: "BOOK NOW",
    };
  }
  if (score >= 55) {
    return {
      tier: "fair",
      label: "Fair",
      colorVar: "--signal-fair",
      verdict: "Reasonable, but worth comparing before you commit.",
      action: "WATCH",
    };
  }
  return {
    tier: "weak",
    label: "Weak",
    colorVar: "--signal-wait",
    verdict: "Another offer checked here is meaningfully better.",
    action: "CONSIDER ALTERNATIVE",
  };
}
