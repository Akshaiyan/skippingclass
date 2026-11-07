"""Release gate for routine processing: stays closed until enough audited routine claims are clean.

Rules (evidence status: BUILT + TESTED in test_release_gate.py):
  - Target: wrong-routine rate below TARGET_RATE at 95% one-sided confidence.
  - Required clean streak n = ceil(ln(0.05) / ln(1 - TARGET_RATE))  (zero-failure bound).
  - ANY audited error closes the gate AND resets the streak to zero. The gate never reopens
    by resampling after an error (zero-acceptance practice: a defect rejects the lot).
  - The reported bound uses the full audit history (Clopper-Pearson one-sided 95%), so errors
    stay visible after the gate reopens.

Limit: the audit must be a random sample of routine decisions. Statistics only; no claim about
errors the auditors also miss.
"""
import math
from dataclasses import dataclass, field

ALPHA = 0.05  # one-sided 95% confidence


def required_clean(target_rate: float) -> int:
    """Smallest n with zero failures giving a one-sided 95% upper bound <= target_rate."""
    if not 0 < target_rate < 1:
        raise ValueError("target_rate must be between 0 and 1")
    return math.ceil(math.log(ALPHA) / math.log(1 - target_rate))


def upper_bound(k: int, n: int) -> float:
    """One-sided 95% Clopper-Pearson upper bound on the error rate given k errors in n audits."""
    if n == 0:
        return 1.0
    if k >= n:
        return 1.0

    def cdf(p):
        total = 0.0
        for i in range(k + 1):
            total += math.comb(n, i) * p ** i * (1 - p) ** (n - i)
        return total

    lo, hi = 0.0, 1.0
    for _ in range(200):
        mid = (lo + hi) / 2
        if cdf(mid) > ALPHA:
            lo = mid
        else:
            hi = mid
    return (lo + hi) / 2


@dataclass
class ReleaseGate:
    target_rate: float = 0.02
    history: list = field(default_factory=list)  # True = audited routine correct, False = error

    @property
    def required(self) -> int:
        return required_clean(self.target_rate)

    @property
    def streak(self) -> int:
        n = 0
        for ok in reversed(self.history):
            if not ok:
                break
            n += 1
        return n

    @property
    def errors(self) -> int:
        return sum(1 for ok in self.history if not ok)

    @property
    def is_open(self) -> bool:
        return self.streak >= self.required

    def record(self, correct: bool) -> None:
        self.history.append(bool(correct))

    def status(self) -> dict:
        n = len(self.history)
        return {
            "gate_open": self.is_open,
            "target_rate": self.target_rate,
            "clean_streak": self.streak,
            "clean_required": self.required,
            "audits_total": n,
            "errors_total": self.errors,
            "upper_bound_all_audits": round(upper_bound(self.errors, n), 4),
            "reason": ("open: clean streak meets requirement" if self.is_open else
                       f"closed: need {self.required - self.streak} more clean audits"
                       + (" (reset by an error)" if self.errors and self.streak == 0 else "")),
        }
