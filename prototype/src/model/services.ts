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
  JourneyState,
  MockApi,
  ServiceEvent,
  ServiceName,
} from "./types";

interface MockApiOptions {
  getState: () => JourneyState;
  update: (patch: Partial<JourneyState>) => void;
  delayMs?: number;
}

/** All effects stay in local prototype state. No fetch, vendor SDK, email, or SMS. */
export function createMockApi({
  getState,
  update,
  delayMs = 450,
}: MockApiOptions): MockApi {
  let sequence = 0;
  const inFlight = new Map<string, Promise<unknown>>();
  const delay = () =>
    new Promise<void>((resolve) => setTimeout(resolve, delayMs));
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
  ): Promise<T> {
    const existing = inFlight.get(key);
    if (existing) return existing as Promise<T>;
    const task = (async () => {
      emit(service, operation, "pending", "Simulated request started");
      await delay();
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

  return {
    saveDraft(_stage) {
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
      if (getState().coverage === "selfpay") {
        const eligibility = { status: "unverified" as const, estimate: null };
        update({ eligibility });
        return Promise.resolve(eligibility);
      }
      return run(
        "checkEligibility",
        "Sohar",
        "eligibility.checked",
        "Coverage status returned; no real payer contacted",
        () => {
          const state = getState();
          const eligibility =
            state.scenario === "coverage-pending"
              ? { status: "pending" as const, estimate: null }
              : { status: "verified" as const, estimate: 25 };
          update({ eligibility });
          return eligibility;
        },
      );
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
    setupPayment() {
      if (getState().paymentReady) return Promise.resolve();
      return run(
        "setupPayment",
        "Payment",
        "payment_method.prepared",
        "Demo payment method ready; no card or charge collected",
        () => {
          if (consumeFault("payment-retry"))
            throw new Error(
              "We couldn’t prepare the demo payment method. Your details are safe—try again.",
            );
          update({ paymentReady: true });
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
          if (!state.paymentReady)
            throw new Error("Prepare your demo payment method to continue.");
          if (!state.reservation || state.reservation.expiresAt <= Date.now()) {
            update({ reservation: null });
            throw new Error(
              "Your temporary hold expired. Choose a time again; your details are saved.",
            );
          }
          const slot = getSlot(state.reservation.slotId);
          const appointment: Appointment = {
            id: "visit-first",
            providerId: slot.providerId,
            slotId: slot.id,
            start: slot.start,
            status: "confirmed",
          };
          update({ appointment, reservation: null, bookingMode: "first" });
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
          update(
            appointment.followup
              ? { followupReminderScheduled: true }
              : { reminderScheduled: true },
          );
        },
      );
    },
    joinVisit() {
      return run(
        "joinVisit",
        "Video",
        "room.joined",
        "Demo room entered; visit remains incomplete",
        () => {
          const appointment = currentAppointment();
          if (appointment.status === "completed")
            throw new Error("This visit is complete. Your care plan is ready.");
          if (!getState().deviceReady)
            throw new Error("Complete the device check before joining.");
          const interrupted = consumeFault("connection-lost");
          update({
            appointment: {
              ...appointment,
              status: interrupted ? "interrupted" : "joined",
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
    reconnect() {
      return run(
        "reconnect",
        "Video",
        "room.reconnected",
        "Demo connection restored to the same visit",
        () => {
          const appointment = currentAppointment();
          if (appointment.status !== "interrupted")
            throw new Error("There is no interrupted visit to reconnect.");
          update({ appointment: { ...appointment, status: "joined" } });
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
        "Simulated clinician completed the encounter",
        () => {
          const appointment = currentAppointment();
          if (appointment.status !== "joined")
            throw new Error("Join and finish the visit before completing it.");
          update({ appointment: { ...appointment, status: "completed" } });
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
            id: "visit-followup",
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
          });
        },
      );
    },
    sendCareMessage() {
      const body = getState().careMessage.trim();
      return run(
        "sendCareMessage",
        "Care team",
        "message.simulated",
        "Demo message recorded locally; not delivered to a care team",
        () => {
          currentAppointment();
          if (!body) throw new Error("Write a message before sending.");
          const state = getState();
          const message = {
            id: `message-${Date.now()}-${++sequence}`,
            body,
            at: new Date().toISOString(),
          };
          update({
            careMessages: [...(state.careMessages ?? []), message],
            careMessage:
              state.careMessage.trim() === body ? "" : state.careMessage,
          });
        },
      );
    },
  };
}
