import type { JourneyState, PaymentSetup } from "./types";

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
  if (
    !previous.appointment &&
    (previous.coverage !== next.coverage ||
      previous.payer !== next.payer ||
      previous.eligibility.estimate !== next.eligibility.estimate)
  ) {
    next.financialConsent = false;
  }
  return next;
}

/** A compressed preview clock advances waiting time; in a live adapter clock is null. */
export function journeyNow(state: JourneyState, realNow = Date.now()): number {
  if (state.clock) {
    const calculated =
      state.clock.virtualStart +
      Math.max(0, realNow - state.clock.realStart) * state.clock.rate;
    // Do not make a patient miss a visit just because preview time is compressed.
    if (state.clock.rate > 1 && state.appointment) {
      return Math.min(
        calculated,
        new Date(state.appointment.start).getTime() + 10 * 60_000,
      );
    }
    return calculated;
  }
  if (state.visitDay && state.appointment)
    return new Date(state.appointment.start).getTime() - 5 * 60_000;
  return realNow;
}

export function joinAvailability(
  state: JourneyState,
  realNow = Date.now(),
): "before" | "open" | "closed" | "completed" | "cancelled" {
  const appointment = state.appointment;
  if (!appointment || appointment.status === "cancelled") return "cancelled";
  if (appointment.status === "completed") return "completed";
  if (
    state.encounter.status === "waiting" ||
    state.encounter.status === "in_progress"
  )
    return "open";
  const delta =
    journeyNow(state, realNow) - new Date(appointment.start).getTime();
  if (delta < -15 * 60_000) return "before";
  if (delta > 60 * 60_000) return "closed";
  return "open";
}

/** Reload must never replace the active saved card with an unfinished replacement. */
export function recoverPaymentSetup(saved: PaymentSetup): PaymentSetup {
  if (saved.status !== "processing") return saved;
  if (saved.previousMethod)
    return {
      id: saved.id,
      status: "succeeded",
      method: saved.previousMethod,
      error:
        "The card update was interrupted. Your previous payment method is still saved.",
    };
  return {
    id: saved.id,
    status: "failed",
    method: null,
    error: "The connection was interrupted. Please try again.",
  };
}
