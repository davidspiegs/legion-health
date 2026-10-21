import {
  getProvider,
  getSlot,
  providers,
  slots,
  followupSlots,
  validateBirth,
} from "./fixtures";
import type {
  Appointment,
  Eligibility,
  JourneyState,
  MockApi,
  ServiceEvent,
  ServiceName,
  PaymentSetup,
  Notification,
} from "./types";
import {
  eligibilityInputKey,
  journeyNow,
  joinAvailability,
} from "./journey-state";

interface MockApiOptions {
  getState: () => JourneyState;
  update: (patch: Partial<JourneyState>) => void;
  delayMs?: number;
  eligibilityDelayMs?: number;
}

/** All effects stay in local prototype state. No fetch, vendor SDK, email, or SMS. */
export function createMockApi({
  getState,
  update,
  delayMs = 450,
  eligibilityDelayMs = 1250,
}: MockApiOptions): MockApi {
  let sequence = 0;
  const inFlight = new Map<string, Promise<unknown>>();
  let eligibilitySequence = 0;
  let activeEligibility: {
    fingerprint: string;
    promise: Promise<Eligibility>;
  } | null = null;
  const delay = (ms = delayMs) =>
    new Promise<void>((resolve) => setTimeout(resolve, ms));
  const emit = (
    service: ServiceName,
    operation: string,
    outcome: ServiceEvent["outcome"],
    detail: string,
  ) => {
    // Event text is allowlisted below: never interpolate profile, answers, insurance IDs, or free text.
    const event: ServiceEvent = {
      id: `event-${Date.now()}-${++sequence}`,
      at: new Date().toISOString(),
      service,
      operation,
      outcome,
      detail,
    };
    update({ events: [...getState().events, event] });
  };
  const consumeFault = (scenario: JourneyState["scenario"]) => {
    const state = getState();
    if (state.scenario !== scenario || state.faultsUsed.includes(scenario))
      return false;
    update({ faultsUsed: [...state.faultsUsed, scenario] });
    return true;
  };
  const assertSlotAvailable = (slotId: string, message: string) => {
    const marker = `unavailable-slot:${slotId}`;
    if (getState().faultsUsed.includes(marker)) throw new Error(message);
    if (consumeFault("slot-taken")) {
      update({ faultsUsed: [...getState().faultsUsed, marker] });
      throw new Error(message);
    }
  };
  function run<T>(
    key: string,
    service: ServiceName,
    operation: string,
    successDetail: string,
    work: () => T | Promise<T>,
    resultEvent?: (result: T) => {
      outcome: ServiceEvent["outcome"];
      detail: string;
    },
    latency = delayMs,
  ): Promise<T> {
    const existing = inFlight.get(key);
    if (existing) return existing as Promise<T>;
    const task = (async () => {
      emit(service, operation, "pending", "Simulated request started");
      await delay(latency);
      try {
        const result = await work();
        const event = resultEvent?.(result);
        emit(
          service,
          operation,
          event?.outcome ?? "success",
          event?.detail ?? successDetail,
        );
        return result;
      } catch (error) {
        emit(
          service,
          operation,
          "error",
          "Simulated request needs attention; progress retained",
        );
        throw error;
      } finally {
        inFlight.delete(key);
      }
    })();
    inFlight.set(key, task);
    return task;
  }
  const hasAccount = () =>
    getState().events.some(
      (event) =>
        event.service === "Auth" &&
        event.operation === "account.created" &&
        event.outcome === "success",
    );
  const currentAppointment = () => {
    const appointment = getState().appointment;
    if (!appointment || appointment.status === "cancelled")
      throw new Error("Book your first visit before continuing.");
    return appointment;
  };

  const queueNotifications = (
    appointment: Appointment,
    kind: "confirmation" | "rescheduled" | null = "confirmation",
  ) => {
    const state = getState();
    const now = journeyNow(state);
    const channels: ("email" | "sms")[] = [
      "email",
      ...(state.profile.sms ? ["sms" as const] : []),
    ];
    const upcoming: Notification[] = [];
    for (const channel of channels) {
      if (kind) {
        const id = `${appointment.id}:${appointment.slotId}:${channel}:${kind}`;
        const existing = state.notifications.find((item) => item.id === id);
        upcoming.push(
          existing ?? {
            id,
            appointmentId: appointment.id,
            channel,
            kind,
            scheduledAt: new Date(now).toISOString(),
            status: "delivered",
          },
        );
      }
      if (channel === "email" && !state.emailReminder) continue;
      for (const minutes of [24 * 60, 60, 15]) {
        const scheduled =
          new Date(appointment.start).getTime() - minutes * 60_000;
        const id = `${appointment.id}:${appointment.slotId}:${channel}:reminder-${minutes}`;
        const existing = state.notifications.find((item) => item.id === id);
        // A same-day booking should never trigger a burst of already-missed reminders.
        if (scheduled <= now && !existing) continue;
        if (existing?.status === "delivered" || existing?.status === "failed") {
          upcoming.push(existing);
          continue;
        }
        upcoming.push({
          id,
          appointmentId: appointment.id,
          channel,
          kind: "reminder",
          scheduledAt: new Date(scheduled).toISOString(),
          status: "queued",
        });
      }
    }
    const previous = state.notifications.map((item) =>
      item.appointmentId === appointment.id && item.status === "queued"
        ? { ...item, status: "cancelled" as const }
        : item,
    );
    const ids = new Set(upcoming.map((item) => item.id));
    update({
      notifications: [
        ...previous.filter((item) => !ids.has(item.id)),
        ...upcoming,
      ],
      ...(appointment.followup
        ? { followupReminderScheduled: true }
        : { reminderScheduled: true }),
    });
    emit(
      "Reminders",
      "reminders.scheduled",
      "success",
      "Future appointment notification jobs updated without repeating past reminders; delivery is simulated",
    );
  };
  const assertSignedIn = () => {
    if (getState().portalAuth.status !== "signed_in")
      throw new Error("Sign in to your patient portal to continue.");
  };
  const checkInRequirements = () => {
    const state = getState();
    assertSignedIn();
    currentAppointment();
    if (!state.healthReviewed)
      throw new Error("Review your health information before checking in.");
    if (!state.deviceReady)
      throw new Error("Complete the device check before joining.");
    if (!state.currentLocation.trim() || !state.callbackConfirmed)
      throw new Error(
        "Confirm your current location and callback number before joining.",
      );
    const availability = joinAvailability(state);
    if (availability === "before")
      throw new Error(
        "Your visit room opens 15 minutes before the appointment.",
      );
    if (availability === "closed")
      throw new Error(
        "The joining window has ended. Contact your care team for help.",
      );
    if (availability === "completed")
      throw new Error(
        "This visit is complete. You can find your summary in your portal.",
      );
  };

  return {
    saveDraft(stage) {
      return run(
        "saveDraft",
        "Profile",
        "draft.saved",
        "Draft saved on this device",
        () => {
          if (consumeFault("save-retry"))
            throw new Error(
              "We couldn’t save that yet. Your answers are still here—try again.",
            );
        },
        undefined,
        stage.startsWith("fit-") || stage === "goal" ? 0 : delayMs,
      );
    },
    getProviders() {
      return run(
        "getProviders",
        "Scheduling",
        "directory.loaded",
        "Fictional provider directory and availability returned",
        () =>
          providers.map((provider) => ({
            ...provider,
            focuses: [...provider.focuses],
          })),
      );
    },
    checkEligibility() {
      const initial = getState();
      if (initial.coverage === "selfpay") {
        eligibilitySequence++;
        activeEligibility = null;
        const eligibility = { status: "unverified" as const, estimate: null };
        update({ eligibility });
        return Promise.resolve(eligibility);
      }
      if (!initial.payer.trim() || !initial.memberId.trim()) {
        return Promise.reject(
          new Error(
            "Choose your insurer and enter the member ID from your card.",
          ),
        );
      }
      // This fingerprint stays inside the adapter closure and never enters events.
      // Results belong to these exact inputs, not whichever fields exist later.
      const fingerprint = eligibilityInputKey(initial);
      if (activeEligibility?.fingerprint === fingerprint)
        return activeEligibility.promise;
      const request = ++eligibilitySequence;
      const scenario = initial.scenario;
      update({ eligibility: { status: "checking", estimate: null } });
      const promise = run<Eligibility>(
        `checkEligibility:${request}`,
        "Sohar",
        "eligibility.verification",
        "Synthetic coverage and benefit result returned; no payer contacted",
        () => {
          if (
            request !== eligibilitySequence ||
            fingerprint !== eligibilityInputKey(getState())
          ) {
            if (
              request === eligibilitySequence &&
              getState().eligibility.status === "checking"
            ) {
              update({ eligibility: { status: "unverified", estimate: null } });
            }
            throw new Error(
              "Your insurance details changed. Check the updated details again.",
            );
          }
          const checkedAt = new Date().toISOString();
          const eligibility: Eligibility =
            scenario === "coverage-pending"
              ? {
                  status: "pending",
                  estimate: null,
                  checkedAt,
                  networkStatus: "unknown",
                }
              : scenario === "coverage-unmatched"
                ? {
                    status: "unmatched",
                    estimate: null,
                    checkedAt,
                    networkStatus: "unknown",
                  }
                : {
                    status: "verified",
                    estimate: 25,
                    checkedAt,
                    activeCoverage: true,
                    networkStatus: "in-network",
                  };
          update({ eligibility });
          return eligibility;
        },
        (result) =>
          result.status === "pending"
            ? {
                outcome: "pending",
                detail:
                  "Synthetic payer response remains unresolved; no coverage or cost decision",
              }
            : result.status === "unmatched"
              ? {
                  outcome: "error",
                  detail:
                    "Synthetic member details did not match; coverage is unknown",
                }
              : {
                  outcome: "success",
                  detail:
                    "Synthetic active coverage and in-network visit estimate returned; not a payment guarantee",
                },
        eligibilityDelayMs,
      );
      activeEligibility = { fingerprint, promise };
      void promise
        .finally(() => {
          if (activeEligibility?.promise === promise) activeEligibility = null;
        })
        .catch(() => {});
      return promise;
    },
    createAccount() {
      if (hasAccount()) return Promise.resolve();
      return run(
        "createAccount",
        "Auth",
        "account.created",
        "Demo account linked to the existing draft",
        () => {
          const { profile } = getState();
          if (!profile.firstName.trim() || !profile.lastName.trim())
            throw new Error("Add your name to continue.");
          const birthError = validateBirth(profile);
          if (birthError) throw new Error(birthError);
          if (
            !profile.address.trim() ||
            !profile.city.trim() ||
            !/^\d{5}$/.test(profile.zip)
          )
            throw new Error("Check your address and 5-digit ZIP code.");
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profile.email))
            throw new Error("Enter a valid email address.");
          if (profile.phone.replace(/\D/g, "").length !== 10)
            throw new Error("Enter a 10-digit phone number.");
          update({ portalAuth: { status: "signed_in", codeExpiresAt: null } });
        },
      );
    },
    reserve(providerId, slotId) {
      return run(
        `reserve:${providerId}:${slotId}`,
        "Scheduling",
        "slot.reserved",
        "Temporary hold created; appointment is not confirmed",
        () => {
          getProvider(providerId);
          const slot = getSlot(slotId);
          if (
            slot.providerId !== providerId ||
            !slots.some((item) => item.id === slotId)
          )
            throw new Error("Choose a time with your selected provider.");
          const state = getState();
          if (
            state.reservation?.slotId === slotId &&
            state.reservation.expiresAt > Date.now()
          )
            return state.reservation;
          assertSlotAvailable(
            slotId,
            "That time was just taken. Your details are saved—please choose another time.",
          );
          const reservation = {
            id: `hold-${slotId}`,
            providerId,
            slotId,
            expiresAt: Date.now() + 15 * 60 * 1000,
          };
          update({ providerId, slotId, reservation });
          return reservation;
        },
      );
    },
    setupPayment(input) {
      const state = getState();
      if (
        state.paymentSetup.status === "succeeded" &&
        state.paymentSetup.method?.id === input.token
      )
        return Promise.resolve(state.paymentSetup);
      if (
        !input.token.startsWith("pm_mock_") ||
        !/^\d{4}$/.test(input.last4) ||
        !/^\d{5}$/.test(input.billingZip) ||
        input.expMonth < 1 ||
        input.expMonth > 12 ||
        input.expYear < new Date().getFullYear() ||
        (input.expYear === new Date().getFullYear() &&
          input.expMonth < new Date().getMonth() + 1)
      ) {
        return Promise.reject(
          new Error("Check your payment details before continuing."),
        );
      }
      if (!state.financialConsent)
        return Promise.reject(
          new Error("Authorize saving your payment method before continuing."),
        );
      const previousMethod =
        state.paymentSetup.status === "succeeded"
          ? state.paymentSetup.method
          : state.paymentSetup.previousMethod;
      update({
        paymentSetup: {
          id: state.paymentSetup.id ?? `seti_mock_${Date.now()}`,
          status: "processing",
          method: null,
          previousMethod,
        },
        paymentReady: !!previousMethod,
      });
      return run(
        "setupPayment",
        "Payment",
        "setup_intent.confirmed",
        "Synthetic Stripe setup processed; no card or charge collected",
        () => {
          if (consumeFault("payment-retry")) {
            const error =
              "We couldn’t save that payment method. Check your details and try again.";
            update({
              paymentSetup: {
                id: getState().paymentSetup.id,
                status: previousMethod ? "succeeded" : "failed",
                method: previousMethod ?? null,
                error,
              },
              paymentReady: !!previousMethod,
            });
            throw new Error(error);
          }
          const needsAuthentication =
            getState().scenario === "payment-authentication";
          const paymentSetup: PaymentSetup = {
            id: getState().paymentSetup.id,
            status: needsAuthentication ? "requires_action" : "succeeded",
            method: {
              id: input.token,
              brand: input.brand,
              last4: input.last4,
              expMonth: input.expMonth,
              expYear: input.expYear,
            },
            previousMethod: needsAuthentication ? previousMethod : undefined,
          };
          update({
            paymentSetup,
            paymentReady: paymentSetup.status === "succeeded",
          });
          return paymentSetup;
        },
      );
    },
    completePaymentAuthentication(approved) {
      return run(
        "paymentAuthentication",
        "Payment",
        "setup_intent.authentication",
        "Synthetic bank authentication resolved; no charge collected",
        () => {
          const existing = getState().paymentSetup;
          if (existing.status === "succeeded") return existing;
          if (existing.status !== "requires_action")
            throw new Error("There is no bank authentication to complete.");
          const paymentSetup: PaymentSetup = approved
            ? {
                ...existing,
                status: "succeeded",
                previousMethod: undefined,
                error: undefined,
              }
            : {
                id: existing.id,
                status: existing.previousMethod ? "succeeded" : "failed",
                method: existing.previousMethod ?? null,
                error: existing.previousMethod
                  ? "Bank verification was cancelled. Your previous payment method is still saved."
                  : "Bank verification was cancelled. Try again to save your card.",
              };
          update({
            paymentSetup,
            paymentReady: paymentSetup.status === "succeeded",
          });
          return paymentSetup;
        },
      );
    },
    confirm() {
      const existing = getState().appointment;
      if (existing && existing.status !== "cancelled")
        return Promise.resolve(existing);
      return run(
        "confirm",
        "Scheduling",
        "appointment.confirmed",
        "First visit confirmed exactly once",
        () => {
          const state = getState();
          if (!state.agreements)
            throw new Error(
              "Review and accept the agreements to book your visit.",
            );
          if (!hasAccount())
            throw new Error("Finish your contact details before booking.");
          if (
            state.coverage === "insurance" &&
            state.eligibility.status !== "verified"
          ) {
            throw new Error(
              "Your insurance is not verified yet. Wait for a coverage update, or choose self-pay before booking.",
            );
          }
          if (!state.paymentReady || state.paymentSetup.status !== "succeeded")
            throw new Error("Save a payment method to continue.");
          if (!state.financialConsent)
            throw new Error(
              "Review the payment authorization before confirming.",
            );
          if (!state.reservation || state.reservation.expiresAt <= Date.now()) {
            update({ reservation: null });
            throw new Error(
              "Your temporary hold expired. Choose a time again; your details are saved.",
            );
          }
          const slot = getSlot(state.reservation.slotId);
          const appointment: Appointment = {
            id: `visit-first-${crypto.randomUUID()}`,
            providerId: slot.providerId,
            slotId: slot.id,
            start: slot.start,
            status: "confirmed",
          };
          update({
            appointment,
            reservation: null,
            bookingMode: "first",
            clock: {
              virtualStart: new Date(appointment.start).getTime() - 45 * 60_000,
              realStart: Date.now(),
              rate: 60,
            },
            portalAuth: { status: "signed_in", codeExpiresAt: null },
            encounter: {
              status: "not_started",
              connection: "disconnected",
              clinicianStatus: "not_present",
            },
            carePlan: { status: "unavailable", followupWeeks: 2 },
          });
          queueNotifications(appointment);
          return appointment;
        },
      );
    },
    requestRecords(allowed) {
      if (!allowed) {
        update({ recordsPermission: false, recordsStatus: "declined" });
        emit(
          "Profile",
          "records_permission.declined",
          "success",
          "Optional records sharing skipped; care can continue",
        );
        return Promise.resolve("declined");
      }
      update({ recordsPermission: true });
      return run(
        "requestRecords",
        "Metriport",
        "records.requested",
        "Simulated records request resolved; review still required",
        () => {
          // Permission is rechecked after the async delay, including a decline made while waiting.
          if (!getState().recordsPermission) {
            update({ recordsStatus: "declined" });
            return "declined" as const;
          }
          if (consumeFault("records-unavailable")) {
            update({ recordsStatus: "unavailable" });
            return "unavailable" as const;
          }
          update({ recordsStatus: "ready" });
          return "ready" as const;
        },
        (result) =>
          result === "unavailable"
            ? {
                outcome: "error",
                detail:
                  "Simulated record source unavailable; preparation can continue",
              }
            : result === "declined"
              ? {
                  outcome: "success",
                  detail:
                    "Permission withdrawn while waiting; no records returned",
                }
              : {
                  outcome: "success",
                  detail: "Fictional records returned for review",
                },
      );
    },
    generateBrief() {
      return run(
        "generateBrief",
        "AI care brief",
        "brief.drafted",
        "Draft prepared for patient review; no diagnosis or medication decision",
        () => {
          const state = getState();
          update({
            briefGoal: state.briefGoal || state.goal,
            briefApproved: false,
          });
        },
      );
    },
    scheduleReminders(appointmentId) {
      const targetId = appointmentId ?? getState().appointment?.id;
      const isFollowup =
        !!targetId && targetId === getState().followupAppointment?.id;
      return run(
        `scheduleReminders:${targetId ?? "missing"}`,
        "Reminders",
        "reminders.scheduled",
        isFollowup
          ? "Follow-up demo reminder timeline saved; nothing sent"
          : "First-visit demo reminder timeline saved; nothing sent",
        () => {
          const state = getState();
          const appointment = [
            state.appointment,
            state.followupAppointment,
          ].find((item) => item && item.id === targetId);
          if (!appointment)
            throw new Error(
              "Choose an upcoming appointment before scheduling reminders.",
            );
          if (appointment.status !== "confirmed")
            throw new Error(
              "Reminders can only be scheduled for an upcoming confirmed appointment.",
            );
          queueNotifications(appointment, null);
        },
      );
    },
    saveHealthDetails() {
      return run(
        "healthDetails",
        "Profile",
        "health_details.reviewed",
        "Patient health information reviewed; no clinical content in events",
        () => {
          assertSignedIn();
          update({ healthReviewed: true });
        },
      );
    },
    checkIn() {
      if (
        getState().encounter.status === "waiting" ||
        getState().encounter.status === "in_progress"
      )
        return Promise.resolve();
      return run(
        "checkIn",
        "Video",
        "visit.checked_in",
        "Patient checked into appointment waiting room",
        () => {
          checkInRequirements();
          const state = getState();
          update({
            encounter: {
              status: "waiting",
              connection: "disconnected",
              clinicianStatus:
                state.scenario === "clinician-late"
                  ? "running_late"
                  : "not_present",
              checkedInAt: new Date().toISOString(),
            },
            clock: {
              virtualStart: journeyNow(state),
              realStart: Date.now(),
              rate: 1,
            },
          });
        },
      );
    },
    setClinicianReady(actor) {
      if (actor !== "clinician")
        return Promise.reject(
          new Error("Only the simulated clinician service can update arrival."),
        );
      return run(
        "clinicianReady",
        "Encounter",
        "clinician.ready",
        "Simulated clinician is ready to admit the patient",
        () => {
          const state = getState();
          currentAppointment();
          if (state.encounter.status !== "waiting")
            throw new Error("The patient has not checked in yet.");
          update({
            encounter: { ...state.encounter, clinicianStatus: "ready" },
          });
        },
      );
    },
    admitToVisit() {
      return run(
        "admitToVisit",
        "Video",
        "room.joined",
        "Patient connected to the clinician; visit remains incomplete",
        () => {
          checkInRequirements();
          const state = getState();
          if (state.encounter.status === "in_progress") return;
          if (
            state.encounter.status !== "waiting" ||
            state.encounter.clinicianStatus !== "ready"
          )
            throw new Error(
              "Your clinician will let you in when they are ready.",
            );
          const interrupted = consumeFault("connection-lost");
          update({
            appointment: {
              ...currentAppointment(),
              status: interrupted ? "interrupted" : "joined",
            },
            encounter: {
              ...state.encounter,
              status: "in_progress",
              joinedAt: state.encounter.joinedAt ?? new Date().toISOString(),
              pausedAt: interrupted ? new Date().toISOString() : undefined,
              pausedDurationMs: state.encounter.pausedDurationMs ?? 0,
              connection: interrupted ? "interrupted" : "connected",
            },
          });
          if (interrupted)
            emit(
              "Video",
              "connection.interrupted",
              "error",
              "Simulated connection interrupted; appointment retained",
            );
        },
      );
    },
    joinVisit() {
      return run(
        "joinVisit",
        "Video",
        "room.joined",
        "Patient connected to the clinician; visit remains incomplete",
        () => {
          checkInRequirements();
          const state = getState();
          if (state.encounter.clinicianStatus !== "ready")
            throw new Error(
              "Your clinician will let you in when they are ready.",
            );
          const interrupted = consumeFault("connection-lost");
          update({
            appointment: {
              ...currentAppointment(),
              status: interrupted ? "interrupted" : "joined",
            },
            encounter: {
              ...state.encounter,
              status: "in_progress",
              joinedAt: state.encounter.joinedAt ?? new Date().toISOString(),
              pausedAt: interrupted ? new Date().toISOString() : undefined,
              pausedDurationMs: state.encounter.pausedDurationMs ?? 0,
              connection: interrupted ? "interrupted" : "connected",
            },
          });
        },
      );
    },
    leaveVisit() {
      return run(
        "leaveVisit",
        "Video",
        "room.left",
        "Patient left the room; encounter is not marked completed",
        () => {
          const appointment = currentAppointment();
          if (appointment.status === "completed") return;
          update({
            appointment: { ...appointment, status: "interrupted" },
            encounter: {
              ...getState().encounter,
              connection: "interrupted",
              pausedAt:
                getState().encounter.pausedAt ?? new Date().toISOString(),
            },
          });
        },
      );
    },
    reconnect() {
      return run(
        "reconnect",
        "Video",
        "room.reconnected",
        "Connection restored to the same encounter",
        () => {
          assertSignedIn();
          const appointment = currentAppointment();
          if (appointment.status !== "interrupted")
            throw new Error("There is no interrupted visit to reconnect.");
          const encounter = getState().encounter;
          const pause = encounter.pausedAt
            ? Math.max(0, Date.now() - new Date(encounter.pausedAt).getTime())
            : 0;
          update({
            appointment: { ...appointment, status: "joined" },
            encounter: {
              ...encounter,
              status: "in_progress",
              connection: "connected",
              pausedAt: undefined,
              pausedDurationMs: (encounter.pausedDurationMs ?? 0) + pause,
            },
          });
        },
      );
    },
    completeVisit(actor) {
      if (actor !== "clinician")
        return Promise.reject(
          new Error("Only the simulated clinician can complete the visit."),
        );
      if (getState().appointment?.status === "completed")
        return Promise.resolve();
      return run(
        "completeVisit",
        "Encounter",
        "visit.completed",
        "Simulated clinician completed the encounter; summary awaits publication",
        () => {
          const appointment = currentAppointment();
          const state = getState();
          if (
            appointment.status !== "joined" ||
            state.encounter.status !== "in_progress" ||
            state.visitPhase < 2
          )
            throw new Error("Join and finish the visit before completing it.");
          update({
            appointment: { ...appointment, status: "completed" },
            encounter: {
              ...state.encounter,
              status: "completed",
              connection: "disconnected",
              completedAt: new Date().toISOString(),
            },
            carePlan: { status: "pending", followupWeeks: 2 },
          });
        },
      );
    },
    publishCarePlan(actor) {
      if (actor !== "clinician")
        return Promise.reject(
          new Error("Only the simulated clinician can publish the care plan."),
        );
      if (getState().carePlan.status === "published") return Promise.resolve();
      return run(
        "publishCarePlan",
        "Encounter",
        "care_plan.published",
        "Clinician reviewed and published the simulated care plan",
        () => {
          if (getState().appointment?.status !== "completed")
            throw new Error(
              "The care plan can be published after the encounter is complete.",
            );
          const state = getState();
          const id = `${state.appointment!.id}:care-plan:email`;
          const notification: Notification = {
            id,
            appointmentId: state.appointment!.id,
            channel: "email",
            kind: "care-plan",
            scheduledAt: new Date(journeyNow(state)).toISOString(),
            status: "delivered",
          };
          update({
            carePlan: {
              ...state.carePlan,
              status: "published",
              publishedAt: new Date().toISOString(),
            },
            notifications: [
              ...state.notifications.filter((item) => item.id !== id),
              notification,
            ],
          });
          emit(
            "Reminders",
            "care_plan.notification",
            "success",
            "Care-plan publication notification simulated; no email sent",
          );
        },
      );
    },
    bookFollowup(slotId) {
      return run(
        "bookFollowup",
        "Scheduling",
        "followup.confirmed",
        "One follow-up confirmed with the same care provider",
        () => {
          const appointment = currentAppointment();
          if (appointment.status !== "completed")
            throw new Error(
              "Your clinician will discuss follow-up after your first visit.",
            );
          const slot = getSlot(slotId);
          if (
            !followupSlots.some((item) => item.id === slotId) ||
            slot.providerId !== appointment.providerId
          )
            throw new Error("Choose a follow-up time with your care provider.");
          const existing = getState().followupAppointment;
          if (existing?.slotId === slot.id && existing.status !== "cancelled")
            return existing;
          const followupAppointment: Appointment = {
            id: existing && existing.status !== "cancelled" ? existing.id : `visit-followup-${crypto.randomUUID()}`,
            providerId: slot.providerId,
            slotId: slot.id,
            start: slot.start,
            status: "confirmed",
            followup: true,
          };
          update({
            followupAppointment,
            followupReminderScheduled: false,
            bookingMode: "first",
          });
          queueNotifications(followupAppointment);
          return followupAppointment;
        },
      );
    },
    reschedule(slotId) {
      return run(
        "reschedule",
        "Scheduling",
        "appointment.rescheduled",
        "Existing appointment moved; no duplicate visit created",
        () => {
          const appointment = currentAppointment();
          if (appointment.status !== "confirmed")
            throw new Error("Only an upcoming visit can be rescheduled.");
          const slot = getSlot(slotId);
          if (
            !slots.some((item) => item.id === slotId) ||
            slot.providerId !== appointment.providerId
          )
            throw new Error("Choose another time with your care provider.");
          if (slotId === appointment.slotId) return;
          assertSlotAvailable(
            slotId,
            "That time was just taken. Your original appointment is still booked.",
          );
          update({
            appointment: { ...appointment, slotId: slot.id, start: slot.start },
            providerId: slot.providerId,
            slotId: slot.id,
            reservation: null,
            bookingMode: "first",
            reminderScheduled: false,
            deviceReady: false,
            callbackConfirmed: false,
            clock: {
              virtualStart: new Date(slot.start).getTime() - 45 * 60_000,
              realStart: Date.now(),
              rate: 60,
            },
          });
          queueNotifications(getState().appointment!, "rescheduled");
        },
      );
    },
    cancelAppointment(appointmentId) {
      const targetId = appointmentId ?? getState().appointment?.id;
      return run(
        `cancel:${targetId}`,
        "Scheduling",
        "appointment.cancelled",
        "Appointment cancelled and pending reminders removed",
        () => {
          assertSignedIn();
          const state = getState();
          const appointment = [
            state.appointment,
            state.followupAppointment,
          ].find((item) => item?.id === targetId);
          if (!appointment)
            throw new Error("This appointment could not be found.");
          if (appointment.status === "cancelled") return;
          if (appointment.status !== "confirmed")
            throw new Error("Only an upcoming appointment can be cancelled.");
          const cancelled = { ...appointment, status: "cancelled" as const };
          update({
            ...(appointment.followup
              ? {
                  followupAppointment: cancelled,
                  followupReminderScheduled: false,
                }
              : {
                  appointment: cancelled,
                  reminderScheduled: false,
                  encounter: {
                    status: "not_started" as const,
                    connection: "disconnected" as const,
                    clinicianStatus: "not_present" as const,
                  },
                }),
            notifications: state.notifications.map((item) =>
              item.appointmentId === targetId && item.status === "queued"
                ? { ...item, status: "cancelled" as const }
                : item,
            ),
          });
        },
      );
    },
    deliverNotifications() {
      return run(
        "deliverNotifications",
        "Reminders",
        "notification.delivered",
        "Due notification delivery simulated; no email or SMS sent",
        () => {
          const state = getState();
          let failed = false;
          update({
            notifications: state.notifications.map((item) => {
              if (
                item.status !== "queued" ||
                new Date(item.scheduledAt).getTime() > journeyNow(state)
              )
                return item;
              const shouldFail = !failed && consumeFault("reminder-failed");
              if (shouldFail) failed = true;
              return {
                ...item,
                status: shouldFail
                  ? ("failed" as const)
                  : ("delivered" as const),
              };
            }),
          });
        },
      );
    },
    requestSignIn(email) {
      return run(
        "requestSignIn",
        "Auth",
        "signin.code_requested",
        "Synthetic secure sign-in code prepared; no email sent",
        () => {
          if (
            !hasAccount() ||
            email.trim().toLowerCase() !==
              getState().profile.email.trim().toLowerCase()
          )
            throw new Error("Use the email address you entered when booking.");
          const expired = consumeFault("signin-expired");
          update({
            portalAuth: {
              status: "code_sent",
              codeExpiresAt: Date.now() + (expired ? -1 : 10 * 60_000),
            },
          });
        },
      );
    },
    verifySignIn(code) {
      return run(
        "verifySignIn",
        "Auth",
        "signin.verified",
        "Simulated authenticated session restored with existing appointment",
        () => {
          const auth = getState().portalAuth;
          if (!auth.codeExpiresAt || auth.codeExpiresAt < Date.now()) {
            update({ portalAuth: { status: "expired", codeExpiresAt: null } });
            throw new Error(
              "That sign-in code has expired. Request a new code.",
            );
          }
          if (code.trim() !== "246810")
            throw new Error(
              "That code doesn’t match. Check the six digits and try again.",
            );
          update({ portalAuth: { status: "signed_in", codeExpiresAt: null } });
        },
      );
    },
    signOut() {
      update({ portalAuth: { status: "signed_out", codeExpiresAt: null } });
      emit(
        "Auth",
        "session.signed_out",
        "success",
        "Patient session ended; appointment and progress retained",
      );
    },
    sendCareMessage() {
      const body = getState().careMessage.trim();
      return run(
        "sendCareMessage",
        "Care team",
        "message.delivered",
        "Message delivery simulated in the local care-team thread",
        () => {
          assertSignedIn();
          if (!hasAccount())
            throw new Error("Sign in to send a message to your care team.");
          if (!body) throw new Error("Write a message before sending.");
          const state = getState();
          const message = {
            id: `message-${Date.now()}-${++sequence}`,
            body,
            at: new Date().toISOString(),
            sender: "patient" as const,
            status: "delivered" as const,
          };
          update({
            careMessages: [...(state.careMessages ?? []), message],
            careMessage:
              state.careMessage.trim() === body ? "" : state.careMessage,
          });
        },
      );
    },
    replyToCareMessage() {
      const state = getState();
      const replied = new Set(
        (state.careMessages ?? []).map((item) => item.replyTo).filter(Boolean),
      );
      const target = (state.careMessages ?? []).find(
        (item) =>
          item.sender === "patient" &&
          item.status === "delivered" &&
          !replied.has(item.id),
      );
      if (!target) return Promise.resolve();
      return run(
        `reply:${target.id}`,
        "Care team",
        "message.reply_received",
        "Simulated care-team acknowledgment received; no clinical advice generated",
        () => {
          const current = getState();
          if (current.careMessages?.some((item) => item.replyTo === target.id))
            return;
          update({
            careMessages: [
              ...(current.careMessages ?? []),
              {
                id: `reply-${target.id}`,
                replyTo: target.id,
                body: "Thanks for reaching out. We’ve received your message. Your care team can help with scheduling and visit questions here; medical questions will be reviewed by your clinician.",
                at: new Date().toISOString(),
                sender: "care-team",
                status: "delivered",
              },
            ],
          });
        },
      );
    },
  };
}
