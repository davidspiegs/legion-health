import type { Appointment, MockApi, Slot } from "../model/types";
import { followupSlots, formatDate, formatTime, slots, validateBirth } from "../model/fixtures";
import { eligibilityInputKey, journeyNow } from "../model/journey-state";
import { clinicianById, fitsPreference, inventory, match } from "./inventory";
import {
  PREVIEW_CODE,
  type Benefits,
  type CareTask,
  type ChatJob,
  type ChatJourney,
  type ChatState,
  type JobId,
  type Receipt,
} from "./state";

export type ChatPatch = Partial<Omit<ChatJourney, "chat">> & {
  chat?: Partial<ChatState>;
};

export interface ChatContext {
  get: () => ChatJourney;
  update: (patch: ChatPatch) => void;
  api: MockApi;
  /** Single-flight wrapper for patient-initiated actions; shows errors in the dock. Not for background jobs. */
  act: <T>(fn: () => Promise<T>) => Promise<T | undefined>;
  /** Opens a bottom sheet by name, with optional data (for example a node id or slot id). */
  openSheet: (sheet: string, data?: string) => void;
  closeSheet: () => void;
  /**
   * Answers the active question (or the one being changed). Cards and sheets pass the
   * question they belong to, and the answer is dropped if a different one is current.
   */
  answer: (value: string | string[], nodeId?: string) => void;
  /** Re-opens an earlier answer for editing (used by the journey sheet's Change buttons). */
  edit: (nodeId: string) => void;
  /** Opens or closes the full-screen visit room. */
  setVisitOpen: (open: boolean) => void;
  /** Preview-only controls. */
  preview: {
    restart: () => void;
    jump: (moment: string) => void;
    setScenario: (scenario: string) => void;
  };
}

let pace = 1;
/** Tests run the simulated vendors without their preview latency. */
export function setAgentPace(factor: number) {
  pace = factor;
}
const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms * pace));

function setJob(ctx: ChatContext, job: JobId, next: Partial<ChatJob>) {
  const jobs = ctx.get().chat.jobs;
  ctx.update({ chat: { jobs: { ...jobs, [job]: { ...jobs[job], ...next } as ChatJob } } });
}

let runs = 0;

/**
 * Starts a background job and returns a check that it's still the current run. A restart, a
 * jump, a newer run, or anything that clears the job makes a late result stale, so it's dropped.
 * `key` fingerprints the inputs, so a second call for the same inputs can tell one is under way.
 */
function begin(ctx: ChatContext, job: JobId, key = "", next: Partial<ChatJob> = {}): () => boolean {
  const token = `${key}#${++runs}`;
  setJob(ctx, job, {
    status: "running",
    startedAt: Date.now(),
    finishedAt: undefined,
    note: undefined,
    ...next,
    inputs: token,
  });
  return () => ctx.get().chat.jobs[job]?.inputs === token;
}

/** The inputs a run was started for: its token without the run number. */
const runKey = (job: ChatJob | undefined) => job?.inputs?.split("#")[0];

/** A stale result leaves no trace. If the job is still this run's, it's cleared so the work can start again. */
function drop(ctx: ChatContext, job: JobId, current: () => boolean) {
  if (!current()) return;
  const jobs = { ...ctx.get().chat.jobs };
  delete jobs[job];
  ctx.update({ chat: { jobs } });
}

/** A short, non-identifying fingerprint, so a job's record never holds the patient's details. */
function fingerprint(value: string): string {
  let hash = 5381;
  for (let index = 0; index < value.length; index++) hash = (hash * 33 + value.charCodeAt(index)) | 0;
  return (hash >>> 0).toString(36);
}

/** Times on the journey clock, so records line up with the preview's visit-day skip. */
export const stamp = (s: ChatJourney) => new Date(journeyNow(s)).toISOString();

/** Puts a follow-up in front of a person on the care team, with a receipt saying so. */
export function addTask(ctx: ChatContext, task: Omit<CareTask, "id" | "at" | "status">, receiptAction?: string) {
  const s = ctx.get();
  const tasks = s.chat.tasks;
  ctx.update({
    chat: { tasks: [...tasks, { ...task, id: `t-${tasks.length + 1}`, at: stamp(s), status: "open" }] },
  });
  receipt(ctx, receiptAction ?? `Asked the care team: ${task.title.toLowerCase()}`, "Care team queue (simulated)");
}

/** Records a product event for the measurement plan (shown in Preview tools). */
export function track(ctx: ChatContext, event: string, props?: Record<string, string | number | boolean>) {
  const s = ctx.get();
  ctx.update({ chat: { analytics: [...s.chat.analytics, { event, at: stamp(s), ...(props ? { props } : {}) }] } });
}

export function receipt(
  ctx: ChatContext,
  action: string,
  source: string,
  actor: Receipt["actor"] = "Legion AI",
) {
  const receipts = ctx.get().chat.receipts;
  ctx.update({
    chat: {
      receipts: [
        ...receipts,
        {
          id: `r-${receipts.length + 1}-${Date.now()}`,
          at: new Date().toISOString(),
          actor,
          action,
          source,
        },
      ],
    },
  });
}

/** A time by id, or undefined once it has left the preview's inventory (a state saved weeks ago). */
export function slotById(slotId: string): Slot | undefined {
  if (!slotId) return undefined;
  inventory();
  return slots.find((slot) => slot.id === slotId) ?? followupSlots.find((slot) => slot.id === slotId);
}

// Generated ids end in the Central date and time (chat-maya-20261022-1900), so a time that has
// left the inventory can still be read. Formatting that wall time as UTC keeps it as written.
const ID_DAY = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" });
const ID_TIME = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", hour: "numeric", minute: "2-digit" });

/** "Thu, Oct 22, 9:00 AM". Never throws, whatever the id. */
const EITHER_LIST = new Intl.ListFormat("en-US", { style: "long", type: "disjunction" });
const RELEASE_HOURS: Record<string, string> = {
  mornings: "mornings",
  afternoons: "afternoons",
  evenings: "evenings",
  weekends: "weekends",
};

/** The time a re-match let go of. It can fall out of the rebuilt inventory, so this never throws. */
function releasedTime(id: string): { providerId: string; time: string } | null {
  const slot = slotById(id);
  if (slot) return { providerId: slot.providerId, time: formatTime(slot) };
  // Ids carry the clinician and the Central Time start, for example chat-maya-20261021-1730.
  const parts = /^chat(?:-fu)?-([a-z]+)-\d{8}-(\d{2})(\d{2})$/.exec(id);
  if (!parts) return null;
  const hour = Number(parts[2]);
  return { providerId: parts[1], time: `${hour % 12 || 12}:${parts[3]} ${hour < 12 ? "AM" : "PM"}` };
}

/**
 * Why a re-match let the held time go, for the same reasons matching gives: the clinician isn't
 * in network, doesn't focus on what the patient came for, or the time is outside their new hours.
 */
export function releaseNotice(s: ChatJourney): string {
  const released = releasedTime(s.chat.releasedSlot);
  const clinician = released ? clinicianById(released.providerId) : undefined;
  const who = clinician?.firstName ?? "The clinician you picked";
  if (s.chat.holdNotice === "not-covered") {
    const plan = payerFor(s) || s.chat.benefits?.payer || "your plan";
    return `${who} isn’t in network with ${plan}, so I let that time go. These clinicians are.`;
  }
  const specific = s.conditions.filter((condition) => condition !== "I'm not sure" && condition !== "Other");
  if (clinician && specific.length && !specific.some((condition) => clinician.focuses.includes(condition)))
    return `${who} doesn’t focus on ${EITHER_LIST.format(specific.map(conditionWord))}, so I let that time go. These clinicians do.`;
  const words = s.chat.availability.flatMap((pref) => (RELEASE_HOURS[pref] ? [RELEASE_HOURS[pref]] : []));
  const fit = words.length ? EITHER_LIST.format(words) : "the times you picked";
  const held = released ? `Your ${released.time} time${clinician ? ` with ${clinician.firstName}` : ""}` : "The time you held";
  return `${held} doesn’t fit ${fit}, so I let it go. Pick a time that works.`;
}

/** The Terms: a change within 48 hours of a visit, or after its time has passed, costs $100. */
export const LATE_FEE = "$100 late-change fee";

/** Late-change fees the patient agreed to, counted from the receipts that record each one. */
export function lateFees(s: ChatJourney): number {
  return s.chat.receipts.filter((item) => item.action.includes(LATE_FEE)).length;
}

/**
 * The reminders a patient is told about are the ones actually scheduled: a visit
 * booked for later today gets no day-before reminder. Before any are scheduled,
 * and in preview moments, this is the policy.
 */
export function reminderTimes(s: ChatJourney): string {
  const appointment = s.appointment;
  const scheduled = appointment
    ? s.notifications.filter(
        (item) =>
          item.kind === "reminder" &&
          item.status !== "cancelled" &&
          item.id.startsWith(`${appointment.id}:${appointment.slotId}:`),
      )
    : [];
  const has = (minutes: number) => scheduled.some((item) => item.id.endsWith(`:reminder-${minutes}`));
  if (!scheduled.length || has(24 * 60)) return "the day before and an hour before";
  return has(60) ? "an hour before" : "15 minutes before";
}

export function slotLabel(slotId: string, withDay = true): string {
  const slot = slotById(slotId);
  if (slot) return withDay ? `${formatDate(slot, true)}, ${formatTime(slot)}` : formatTime(slot);
  const parts = /(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})$/.exec(slotId);
  const [year, month, day, hour, minute] = (parts ?? []).slice(1).map(Number);
  if (!parts || month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59) return "an earlier time";
  const wall = new Date(Date.UTC(year, month - 1, day, hour, minute));
  return withDay ? `${ID_DAY.format(wall)}, ${ID_TIME.format(wall)}` : ID_TIME.format(wall);
}

/** A booked visit's time, read from its own start, so it never depends on the inventory. */
export function appointmentLabel(appointment: Pick<Appointment, "start">, withDay = true): string {
  if (Number.isNaN(new Date(appointment.start).getTime())) return "your visit";
  return withDay
    ? `${formatDate(appointment.start, true)}, ${formatTime(appointment.start)}`
    : formatTime(appointment.start);
}

export function clinicianName(id: string): string {
  return clinicianById(id)?.name ?? "your clinician";
}

export function clinicianFirst(id: string): string {
  return clinicianById(id)?.firstName ?? "your clinician";
}

/** The plan the patient picked. A plan that discovery found isn't a choice, so it doesn't narrow matching. */
export function payerFor(s: ChatJourney): string {
  const choice = s.chat.payerChoice;
  return s.coverage === "insurance" && choice !== "unsure" ? choice : "";
}

/** Inputs that decide who is a good fit. A change re-runs matching; discovery filling in a plan isn't one. */
export function matchInputs(s: ChatJourney): string {
  // Coverage goes last: the matching card reads the first three.
  return JSON.stringify([s.conditions, payerFor(s), s.chat.availability, s.coverage]);
}

const listOf = (items: string[]) =>
  items.length <= 1 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;

const conditionWord = (condition: string) =>
  condition === "ADHD" || condition === "PTSD" ? condition : condition.toLowerCase();

/** The availability a match result was ranked for, read from its job's inputs. */
function availabilityIn(inputs: string | undefined): string[] | null {
  try {
    const parsed = inputs ? JSON.parse(inputs) : null;
    return Array.isArray(parsed) && Array.isArray(parsed[2]) ? parsed[2] : null;
  } catch {
    return null;
  }
}

const sameChoices = (a: string[], b: string[]) => a.length === b.length && a.every((item) => b.includes(item));

interface Release {
  notice: "not-covered" | "released";
  /** The end of the receipt, after the time and the clinician's name. */
  why: string;
}

/**
 * Whether a held time survives a re-match, and if not, why. It stays while its clinician still
 * fits on focus and network, whatever their stated hours, so a time picked from outside the
 * patient's hours stays picked. It's let go only when the clinician no longer fits, or when the
 * patient's hours changed and the time is outside the new ones.
 */
function releaseFor(s: ChatJourney, before: string[] | null): Release | null {
  const slot = slotById(s.slotId);
  const clinician = clinicianById(slot?.providerId ?? s.providerId);
  if (!clinician) return null;
  const payer = payerFor(s);
  if (payer && !clinician.payers.includes(payer))
    return { notice: "not-covered", why: `who isn’t in network with ${payer}` };
  const specific = s.conditions.filter((condition) => condition !== "I'm not sure" && condition !== "Other");
  if (specific.length && !specific.some((condition) => clinician.focuses.includes(condition)))
    return { notice: "released", why: `who doesn’t focus on ${listOf(specific.map(conditionWord))}` };
  const prefs = s.chat.availability;
  if (slot && before && !sameChoices(before, prefs) && !fitsPreference(slot, prefs))
    return { notice: "released", why: `since you said ${listOf(prefs)} work best` };
  return null;
}

export async function runMatch(ctx: ChatContext) {
  const s = ctx.get();
  const inputs = matchInputs(s);
  const job = s.chat.jobs.match;
  if (job?.inputs === inputs && (job.status === "running" || job.status === "done")) return;
  // The hours the last result was ranked for, to tell whether they changed under a held time.
  const before = availabilityIn(job?.inputs);
  const startedAt = Date.now();
  setJob(ctx, "match", { status: "running", startedAt, inputs });
  // Live matching took several seconds in the audit; the preview keeps a short, honest wait.
  await wait(1500);
  const current = ctx.get();
  if (matchInputs(current) !== inputs || current.chat.jobs.match?.startedAt !== startedAt) return;
  const result = match(s.conditions, payerFor(s), s.chat.availability, new Date(), s.coverage);
  const offerIds = result.offers.map((offer) => offer.clinician.id);
  const rankedIds = result.ranked.map((offer) => offer.clinician.id);
  const reasons = Object.fromEntries(result.ranked.map((offer) => [offer.clinician.id, offer.reasons]));
  const heldSlot = current.chat.slotChosen ? current.slotId : "";
  const release = heldSlot ? releaseFor(current, before) : null;
  ctx.update({
    ...(release ? { providerId: "", slotId: "", reservation: null } : {}),
    chat: {
      match: { offerIds, rankedIds, funnel: result.funnel, reasons },
      ...(release ? { slotChosen: false, holdNotice: release.notice, releasedSlot: heldSlot } : {}),
    },
  });
  setJob(ctx, "match", { status: "done", finishedAt: Date.now(), inputs });
  receipt(
    ctx,
    `Compared ${result.funnel[0].count} Texas clinicians and found ${rankedIds.length} with openings that fit`,
    "Legion directory and calendars",
  );
  // A time is never let go silently: the card names it, and the receipt says why.
  if (release) {
    const who = clinicianName(slotById(heldSlot)?.providerId ?? current.providerId);
    receipt(ctx, `Released your hold on ${slotLabel(heldSlot)} with ${who}, ${release.why}`, "Legion scheduling");
  }
}

/** A hold that's still in place: the reservation is for the held time and hasn't run out. */
const holding = (s: ChatJourney) =>
  !!s.slotId && s.reservation?.slotId === s.slotId && s.reservation.expiresAt > Date.now();

/**
 * Holds a time for 15 minutes. Returns false when the time couldn't be held; a hold the patient
 * already had stays exactly as it was, so a failed change of time never costs them their time.
 */
export async function runHold(ctx: ChatContext, slotId: string): Promise<boolean> {
  const slot = slotById(slotId);
  if (!slot) throw new Error("Choose an available appointment time.");
  const s = ctx.get();
  // Choosing the time that's already held changes nothing, except clearing an old notice.
  if (s.chat.slotChosen && s.slotId === slotId && holding(s)) {
    ctx.update({ chat: { holdNotice: "" } });
    const job = s.chat.jobs.hold;
    const heldAt = s.reservation!.expiresAt - 15 * 60_000;
    if (job?.status !== "done" || job.inputs !== slotId)
      setJob(ctx, "hold", { status: "done", finishedAt: heldAt, inputs: slotId });
    return true;
  }
  const startedAt = Date.now();
  const current = () => {
    const job = ctx.get().chat.jobs.hold;
    return job?.startedAt === startedAt && job.inputs === slotId;
  };
  ctx.update({ chat: { holdNotice: "" } });
  setJob(ctx, "hold", { status: "running", startedAt, finishedAt: undefined, inputs: slotId });
  try {
    await ctx.api.reserve(slot.providerId, slotId);
    if (!current()) return false;
    ctx.update({ providerId: slot.providerId, slotId, chat: { slotChosen: true, releasedSlot: "" } });
    setJob(ctx, "hold", { status: "done", finishedAt: Date.now() });
    receipt(
      ctx,
      `Held ${slotLabel(slotId)} with ${clinicianName(slot.providerId)} for 15 minutes`,
      "Legion scheduling",
    );
    return true;
  } catch {
    if (!current()) return false;
    const now = ctx.get();
    const kept = holding(now) ? now.slotId : "";
    ctx.update(
      kept
        ? { chat: { holdNotice: "taken" } }
        : { slotId: "", reservation: null, chat: { slotChosen: false, holdNotice: "taken" } },
    );
    // The job names the time it tried, so the card can mark that time as taken.
    setJob(ctx, "hold", { status: "failed", finishedAt: Date.now(), inputs: slotId });
    receipt(
      ctx,
      kept
        ? `Tried to hold ${slotLabel(slotId)}, but it was just taken; you’re still holding ${slotLabel(kept)}`
        : `Tried to hold ${slotLabel(slotId)}, but it was just taken`,
      "Legion scheduling",
    );
    return false;
  }
}

export async function sendCode(ctx: ChatContext) {
  const phone = ctx.get().profile.phone;
  const current = begin(ctx, "code");
  await wait(700);
  // A restart, or a new number while this one was sending, makes this send stale.
  if (!current() || ctx.get().profile.phone !== phone) return drop(ctx, "code", current);
  ctx.update({ chat: { codeSentAt: Date.now(), codeError: "" } });
  setJob(ctx, "code", { status: "done", finishedAt: Date.now() });
  receipt(ctx, "Texted a sign-in code to your phone", "Verified (simulated)");
}

export function verifyCode(ctx: ChatContext, code: string): boolean {
  if (code !== PREVIEW_CODE) {
    ctx.update({
      chat: { codeError: "That code didn’t match. Check the newest text, or send a new code." },
    });
    return false;
  }
  ctx.update({ chat: { codeVerified: true, codeError: "" } });
  return true;
}

/** Fictional record returned by the identity network for the preview persona. */
export const VERIFIED_RECORD = {
  firstName: "Alex",
  lastName: "Rivera",
  address: "418 Maple Hollow Dr",
  city: "Austin",
  zip: "78745",
  sexAtBirth: "Female" as const,
};

const identityKey = (s: ChatJourney) =>
  fingerprint(JSON.stringify([s.profile.phone, s.profile.month, s.profile.day, s.profile.year]));

/**
 * Finds the patient's name and address from their number and birth date. Safe to call again
 * (a reload restarts it): it runs only while a lookup is needed, and once per set of inputs.
 */
export async function runIdentity(ctx: ChatContext) {
  const s = ctx.get();
  if (!s.chat.dobEntered || s.chat.identity !== "" || validateBirth(s.profile)) return;
  const key = identityKey(s);
  const job = s.chat.jobs.identity;
  if (job?.status === "running" && runKey(job) === key) return;
  const current = begin(ctx, "identity", key);
  await wait(1300);
  const now = ctx.get();
  // A restart, a new number or birth date, or details settled another way make this answer stale.
  if (!current() || !now.chat.dobEntered || now.chat.identity !== "" || identityKey(now) !== key)
    return drop(ctx, "identity", current);
  if (now.scenario === "identity-not-found") {
    ctx.update({ chat: { identity: "not-found" } });
    // The job keeps the outcome, so the conversation can tell later that details were added by hand.
    setJob(ctx, "identity", { status: "failed", finishedAt: Date.now(), note: "not-found" });
    return;
  }
  const { sexAtBirth, ...profile } = VERIFIED_RECORD;
  ctx.update({ profile: { ...now.profile, ...profile }, chat: { identity: "found", sexAtBirth } });
  setJob(ctx, "identity", { status: "done", finishedAt: Date.now() });
  receipt(ctx, "Found your name and address from your phone number", "Verified (simulated)");
}

const DISCOVERED_PAYER = "Blue Cross Blue Shield of Texas";
const DISCOVERED_MEMBER_ID = "W2N48217";

/** What a benefits run depends on: coverage, the plan details, and who discovery searches for. */
const benefitsInputs = (s: ChatJourney) =>
  JSON.stringify([
    s.coverage,
    s.payer,
    s.memberId,
    s.chat.identity,
    s.profile.firstName,
    s.profile.lastName,
    s.profile.month,
    s.profile.day,
    s.profile.year,
  ]);

/**
 * Discovery, then verification. Runs behind the next questions so the result is waiting.
 * Discovery fills in only what the patient didn't give, once; later checks reuse what it found.
 * If anything the run depends on changes while it waits, its result is dropped.
 */
export async function runBenefits(ctx: ChatContext) {
  const s = ctx.get();
  if (s.coverage !== "insurance" || s.chat.jobs.benefits?.status === "running") return;
  const current = begin(ctx, "benefits", "", { note: "finding" });
  let expected = benefitsInputs(s);
  const still = () => current() && benefitsInputs(ctx.get()) === expected;
  await wait(1200);
  if (!still()) return drop(ctx, "benefits", current);
  const found = ctx.get();
  const payer = found.payer || DISCOVERED_PAYER;
  const memberId = found.memberId || DISCOVERED_MEMBER_ID;
  // The patient picked this plan, or asked Wren to find it.
  const askedToFind = found.chat.payerChoice === "unsure" || found.chat.payMethod === "unsure";
  const via: Benefits["via"] = payerFor(found) || (found.payer && !askedToFind) ? "chosen" : "discovery";
  if (payer !== found.payer || memberId !== found.memberId) ctx.update({ payer, memberId });
  if (!found.payer) receipt(ctx, `Found your ${payer} plan`, "Sohar insurance discovery (simulated)");
  else if (!found.memberId) receipt(ctx, `Found your ${payer} member ID`, "Sohar insurance discovery (simulated)");
  expected = benefitsInputs(ctx.get());
  setJob(ctx, "benefits", { note: "checking" });
  // The check belongs to these exact inputs, including the held time.
  const checked = eligibilityInputKey(ctx.get());
  try {
    const eligibility = await ctx.api.checkEligibility();
    if (!still() || eligibilityInputKey(ctx.get()) !== checked) return drop(ctx, "benefits", current);
    const now = ctx.get();
    // Network is a fact about the clinician holding the time. Discovery can find a plan they
    // don't take; the time stays held and the patient decides what to do.
    const holder = now.chat.slotChosen && now.slotId ? clinicianById(now.providerId) : undefined;
    const outside = !!holder && !holder.payers.includes(payer);
    const verified = eligibility.status === "verified";
    ctx.update({
      chat: {
        benefits: {
          payer,
          plan: "PPO",
          memberLast4: memberId.slice(-4),
          network: outside ? "out-of-network" : eligibility.networkStatus === "in-network" ? "in-network" : "unknown",
          copay: outside ? null : eligibility.estimate,
          deductibleRemaining: null,
          via,
        },
      },
    });
    setJob(ctx, "benefits", {
      status: verified ? "done" : eligibility.status === "pending" ? "pending" : "failed",
      finishedAt: Date.now(),
      note: eligibility.status,
    });
    receipt(
      ctx,
      verified
        ? outside
          ? `Confirmed active coverage, but ${holder!.name} isn’t in network with ${payer}`
          : `Confirmed active coverage and a $${eligibility.estimate} estimate`
        : eligibility.status === "pending"
          ? "Asked your plan for benefits; still waiting on an answer"
          : "Your plan couldn’t match these details",
      "Sohar eligibility (simulated)",
    );
  } catch {
    // A check that failed because its inputs moved underneath it is stale, not a plan problem.
    if (!still() || eligibilityInputKey(ctx.get()) !== checked) return drop(ctx, "benefits", current);
    setJob(ctx, "benefits", { status: "failed", finishedAt: Date.now(), note: "error" });
  }
}

export async function createAccount(ctx: ChatContext) {
  await ctx.api.createAccount();
  receipt(ctx, "Created your account and saved your answers to it", "Legion");
}

/**
 * A hold can run out while the patient finishes paperwork. If the time is still
 * open it's held again; if not, the conversation goes back to choosing a time.
 */
async function renewLapsedHold(ctx: ChatContext, current: () => boolean): Promise<boolean> {
  const { slotId, reservation } = ctx.get();
  if (!slotId || (reservation?.slotId === slotId && reservation.expiresAt > Date.now())) return true;
  const slot = slotById(slotId);
  try {
    if (!slot) throw new Error("That time is no longer on the calendar.");
    await ctx.api.reserve(slot.providerId, slotId);
    if (!current()) return false;
    receipt(ctx, `Held ${slotLabel(slotId)} again after the first hold ran out`, "Legion scheduling");
    return true;
  } catch {
    if (!current()) return false;
    const jobs = { ...ctx.get().chat.jobs };
    delete jobs.book;
    ctx.update({ slotId: "", reservation: null, chat: { slotChosen: false, holdNotice: "taken", jobs } });
    setJob(ctx, "hold", { status: "failed", finishedAt: Date.now(), inputs: slotId });
    receipt(ctx, `Your hold on ${slotLabel(slotId)} ran out, and the time is no longer open`, "Legion scheduling");
    return false;
  }
}

/** Booking is its own step: a saved card and a held time are not a booked visit. */
export async function runBooking(ctx: ChatContext) {
  const current = begin(ctx, "book");
  if (!(await renewLapsedHold(ctx, current)) || !current()) return;
  // An earlier change can reset the payment authorization (a new estimate, say). Booking waits
  // for the patient to agree again rather than failing inside the scheduler.
  if (!ctx.get().financialConsent) {
    setJob(ctx, "book", { status: "failed", finishedAt: Date.now(), note: "consent" });
    return;
  }
  try {
    const appointment = await ctx.api.confirm();
    if (!current()) return;
    // The preview runs on real time after booking; a reviewer can skip to visit day.
    ctx.update({ clock: { virtualStart: Date.now(), realStart: Date.now(), rate: 1 } });
    const reminded = await ctx.api.scheduleReminders(appointment.id).then(
      () => true,
      () => false,
    );
    if (!current()) return;
    setJob(ctx, "book", { status: "done", finishedAt: Date.now() });
    receipt(
      ctx,
      `Booked ${appointmentLabel(appointment)} with ${clinicianName(appointment.providerId)}`,
      "Legion scheduling",
    );
    if (reminded)
      receipt(ctx, `Scheduled reminders ${reminderTimes(ctx.get())}`, "Legion messaging (simulated)");
    // Self-pay patients get the written estimate the No Surprises Act requires with their confirmation.
    const s = ctx.get();
    if (s.coverage === "selfpay" || s.chat.benefitsChoice === "selfpay")
      receipt(
        ctx,
        "Sent your written Good Faith Estimate, $250 for your first visit, with your booking confirmation",
        "Legion billing (simulated)",
      );
  } catch (issue) {
    if (!current()) return;
    setJob(ctx, "book", {
      status: "failed",
      finishedAt: Date.now(),
      note: issue instanceof Error ? issue.message : undefined,
    });
    throw issue;
  }
}

export const RECORDS_FIXTURE = {
  sources: [
    { name: "Austin Family Medicine", kind: "clinic" as const, date: "Jun 2025" },
    { name: "CVS Pharmacy, South Congress", kind: "pharmacy" as const, date: "Sep 2026" },
  ],
  medication: {
    name: "Sertraline",
    dose: "50 mg daily",
    lastFilled: "Sep 28",
    pharmacy: "CVS Pharmacy, South Congress",
  },
  allergy: "Penicillin (rash)",
  pharmacy: { name: "CVS Pharmacy", address: "2508 S Congress Ave, Austin" },
};

/** Searches for records the patient allowed. Safe to call again: it runs only while a search is needed. */
export async function runRecords(ctx: ChatContext) {
  const s = ctx.get();
  const status = s.chat.jobs.records?.status;
  if (s.chat.records !== "yes" || status === "running" || status === "done") return;
  const current = begin(ctx, "records");
  const result = await ctx.api.requestRecords(true).catch(() => "unavailable" as const);
  // A restart, a changed answer or a newer search while waiting makes this result stale.
  if (!current() || ctx.get().chat.records !== "yes") return drop(ctx, "records", current);
  if (result === "ready") {
    ctx.update({ chat: { recordsFound: RECORDS_FIXTURE } });
    setJob(ctx, "records", { status: "done", finishedAt: Date.now() });
    receipt(ctx, "Requested your records and found 2 sources", "Metriport health network (simulated)");
  } else {
    ctx.update({ chat: { recordsFound: null } });
    setJob(ctx, "records", { status: "failed", finishedAt: Date.now(), note: result });
    receipt(ctx, "Requested your records; none were available yet", "Metriport health network (simulated)");
  }
}

const BRIEF_DRAFTED = "Drafted a visit brief for your clinician to review";

export async function runBrief(ctx: ChatContext) {
  const status = ctx.get().chat.jobs.brief?.status;
  if (status === "running" || status === "done") return;
  const current = begin(ctx, "brief");
  await ctx.api.generateBrief().catch(() => undefined);
  if (!current()) return;
  // An answer changed after approval clears the draft, so this is the redraft.
  const redraft = ctx.get().chat.receipts.some((item) => item.action === BRIEF_DRAFTED);
  setJob(ctx, "brief", { status: "done", finishedAt: Date.now() });
  receipt(ctx, redraft ? "Redrafted your visit brief with your changes" : BRIEF_DRAFTED, "Legion AI");
}

/** Preview only: moves the clock to just before the visit so joining opens. */
export function skipToVisitDay(ctx: ChatContext) {
  const appointment = ctx.get().appointment;
  if (!appointment) return;
  const start = new Date(appointment.start).getTime();
  ctx.update({
    visitDay: true,
    clock: { virtualStart: start - 14 * 60_000, realStart: Date.now(), rate: 1 },
  });
}

/**
 * Follow-up openings with the same clinician, closest to the recommended interval. Never throws,
 * and never offers a time that has already passed (a completed journey reopened weeks later).
 */
export function followupOptions(s: ChatJourney): string[] {
  const appointment = s.appointment;
  const start = appointment ? new Date(appointment.start).getTime() : NaN;
  if (!appointment || Number.isNaN(start)) return [];
  const target = start + (s.carePlan?.followupWeeks ?? 2) * 7 * 86_400_000;
  const now = journeyNow(s);
  return inventory()
    .followups.filter((slot) => slot.providerId === appointment.providerId && new Date(slot.start).getTime() > now)
    .map((slot) => ({ slot, distance: Math.abs(new Date(slot.start).getTime() - target) }))
    .filter((item) => item.distance < 5 * 86_400_000)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 3)
    .sort((a, b) => a.slot.start.localeCompare(b.slot.start))
    .map((item) => item.slot.id);
}
