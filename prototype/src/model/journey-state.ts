import type { JourneyState } from "./types";

/** Private comparison key only: contains patient data and must never enter events. */
export function eligibilityInputKey(state: JourneyState): string {
  return JSON.stringify([
    state.coverage,
    state.payer.trim(),
    state.memberId.trim(),
    state.profile.firstName.trim(),
    state.profile.lastName.trim(),
    state.profile.month,
    state.profile.day,
    state.profile.year,
    state.profile.address.trim(),
    state.profile.city.trim(),
    state.profile.zip,
    state.providerId,
    state.slotId,
    state.scenario,
  ]);
}

/** A benefits result belongs to the inputs that produced it, even after success. */
export function applyJourneyPatch(
  previous: JourneyState,
  patch: Partial<JourneyState>,
): JourneyState {
  const next: JourneyState = {
    ...previous,
    ...patch,
    profile: patch.profile
      ? { ...previous.profile, ...patch.profile }
      : previous.profile,
  };
  if (eligibilityInputKey(previous) !== eligibilityInputKey(next)) {
    next.eligibility = { status: "unverified", estimate: null };
  }
  return next;
}
