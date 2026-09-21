// Five-step journey progress indicator — Discover / Compare / Check IQ /
// Complete Trip / Confirm & Book. Added Track F (2026-09-13) as the shared
// wayfinding element for pages 2-5; Discover (page.tsx) is step 1 and is
// not shown there because the homepage hero already orients the user.
// Steps completed (n < step) show a checkmark; the active step (n === step)
// is highlighted; pending steps (n > step) are muted.
//
// Placed below the NavBar and above page-specific content on each page
// that renders it — compare, check-iq (already has its own progress bar
// for live-check progress; this component is NOT added there to avoid
// two progress indicators on the same screen), complete-your-trip, confirm.
export function JourneyProgress({ step }: { step: 2 | 3 | 4 | 5 }) {
  const steps: { n: number; label: string }[] = [
    { n: 1, label: "Discover" },
    { n: 2, label: "Compare" },
    { n: 3, label: "Check IQ" },
    { n: 4, label: "Complete Trip" },
    { n: 5, label: "Confirm" },
  ];

  return (
    <nav className="journey-progress" aria-label="Booking progress">
      {steps.map((s, i) => {
        const isDone = s.n < step;
        const isActive = s.n === step;
        const stateCls = isDone
          ? "journey-step-done"
          : isActive
          ? "journey-step-active"
          : "journey-step-pending";
        return (
          <div key={s.n} className="journey-item">
            <div
              className={`journey-step ${stateCls}`}
              aria-current={isActive ? "step" : undefined}
            >
              <div className="journey-dot" aria-hidden="true">
                {isDone ? (
                  <svg
                    width="10"
                    height="10"
                    viewBox="0 0 10 10"
                    fill="none"
                    aria-hidden="true"
                  >
                    <path
                      d="M1.5 5L3.5 7.5L8.5 2.5"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                ) : (
                  <span>{s.n}</span>
                )}
              </div>
              <span className="journey-label">{s.label}</span>
            </div>
            {i < steps.length - 1 && (
              <div
                className={`journey-connector${isDone ? " journey-connector-done" : ""}`}
                aria-hidden="true"
              />
            )}
          </div>
        );
      })}
    </nav>
  );
}
