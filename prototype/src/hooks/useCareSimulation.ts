import { useEffect, useState, type RefObject } from "react";
import type { JourneyState, MockApi } from "../model/types";
import { journeyNow } from "../model/journey-state";

/**
 * The mock services play the provider and notification systems. The patient
 * never has to impersonate a clinician or open reviewer controls to finish.
 * Durable timestamps allow the same sequence to resume after navigation/reload.
 */
export function useCareSimulation(
  stateRef: RefObject<JourneyState>,
  api: MockApi,
  update: (patch: Partial<JourneyState>) => void,
) {
  const [, renderClock] = useState(0);
  useEffect(() => {
    const running = new Set<string>();
    const failures = new Map<string, number>();
    let stopped = false;
    const run = (key: string, operation: () => Promise<unknown>) => {
      if (running.has(key) || Date.now() - (failures.get(key) || 0) < 10_000)
        return;
      running.add(key);
      void operation()
        .catch(() => {
          // Adapters retain their failure state. Quiet retry cannot interrupt an
          // unrelated patient action or turn a failed operation into success.
          failures.set(key, Date.now());
        })
        .finally(() => running.delete(key));
    };
    const tick = () => {
      if (stopped) return;
      const state = stateRef.current;
      const now = Date.now();
      if (state.clock || state.appointment) renderClock((value) => value + 1);
      if (
        state.notifications.some(
          (item) =>
            item.status === "queued" &&
            new Date(item.scheduledAt).getTime() <= journeyNow(state, now),
        )
      )
        run("notifications", () => api.deliverNotifications());
      const encounter = state.encounter;
      if (
        encounter.status === "waiting" &&
        encounter.clinicianStatus !== "ready" &&
        encounter.checkedInAt
      ) {
        const wait = state.scenario === "clinician-late" ? 25_000 : 6_000;
        if (now - new Date(encounter.checkedInAt).getTime() >= wait)
          run("provider-ready", () => api.setClinicianReady("clinician"));
      }
      if (
        encounter.status === "in_progress" &&
        encounter.connection === "connected" &&
        encounter.joinedAt
      ) {
        const elapsed =
          now -
          new Date(encounter.joinedAt).getTime() -
          (encounter.pausedDurationMs || 0);
        const phase = elapsed >= 16_000 ? 2 : elapsed >= 8_000 ? 1 : 0;
        if (phase > state.visitPhase) update({ visitPhase: phase });
        if (elapsed >= 28_000)
          run("complete-visit", () => api.completeVisit("clinician"));
      }
      if (state.carePlan.status === "pending" && encounter.completedAt) {
        const wait = state.scenario === "care-plan-delayed" ? 25_000 : 5_000;
        if (now - new Date(encounter.completedAt).getTime() >= wait)
          run("publish-plan", () => api.publishCarePlan("clinician"));
      }
      const messages = state.careMessages || [];
      if (
        messages.some(
          (message) =>
            message.sender === "patient" &&
            message.status === "delivered" &&
            now - new Date(message.at).getTime() >= 3_000 &&
            !messages.some((reply) => reply.replyTo === message.id),
        )
      )
        run("care-team-reply", () => api.replyToCareMessage());
    };
    const timer = window.setInterval(tick, 1_000);
    tick();
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [api, stateRef, update]);
}
