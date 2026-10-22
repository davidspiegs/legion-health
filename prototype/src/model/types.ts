import type { MatchResult } from "../chat/inventory";

export type Step =
  | "welcome"
  | "fit-state"
  | "fit-age"
  | "fit-coverage"
  | "fit-safety"
  | "fit-history"
  | "fit-virtual"
  | "fit-exit"
  | "needs"
  | "goal"
  | "coverage"
  | "match"
  | "slots"
  | "name"
  | "birth"
  | "address"
  | "insurance"
  | "email"
  | "phone"
  | "review"
  | "confirmed"
  | "records"
  | "brief"
  | "visit-home"
  | "reminders"
  | "device"
  | "waiting"
  | "visit"
  | "complete"
  | "followup"
  | "feedback"
  | "portal-visits"
  | "portal-messages"
  | "portal-account"
  | "portal-signin"
  | "health-details";
export type Scenario =
  | "standard"
  | "slot-taken"
  | "coverage-pending"
  | "coverage-unmatched"
  | "records-unavailable"
  | "payment-retry"
  | "connection-lost"
  | "save-retry"
  | "payment-authentication"
  | "clinician-late"
  | "care-plan-delayed"
  | "signin-expired"
  | "reminder-failed"
  | "identity-not-found"
  | "code-not-delivered"
  | "coverage-not-found"
  | "calendars-unavailable"
  | "id-unreadable"
  | "share-failed"
  | "prescription-failed"
  | "mychart-unavailable";
export type Coverage = "selfpay" | "insurance";
export type ServiceName =
  | "Profile"
  | "Scheduling"
  | "Sohar"
  | "Payment"
  | "Auth"
  | "Metriport"
  | "AI care brief"
  | "Reminders"
  | "Video"
  | "Encounter"
  | "Care team"
  | "Verified"
  | "Persona"
  | "Clinician directory"
  | "DoseSpot"
  | "Epic MyChart";
export interface Profile {
  firstName: string;
  lastName: string;
  month: string;
  day: string;
  year: string;
  address: string;
  city: string;
  zip: string;
  email: string;
  phone: string;
  sms: boolean;
}
export interface Provider {
  id: string;
  name: string;
  firstName: string;
  initials: string;
  title: string;
  photo?: string;
  focuses: string[];
  description: string;
}
export interface Slot {
  id: string;
  start: string;
  providerId: string;
}
export interface Reservation {
  id: string;
  slotId: string;
  providerId: string;
  expiresAt: number;
}
export interface Appointment {
  id: string;
  providerId: string;
  slotId: string;
  start: string;
  status: "confirmed" | "joined" | "interrupted" | "completed" | "cancelled";
  followup?: boolean;
}
export interface Eligibility {
  status: "unverified" | "checking" | "pending" | "unmatched" | "verified";
  estimate: number | null;
  checkedAt?: string;
  activeCoverage?: boolean;
  networkStatus?: "in-network" | "unknown";
}
export interface ServiceEvent {
  id: string;
  at: string;
  service: ServiceName;
  operation: string;
  outcome: "pending" | "success" | "error";
  detail: string;
}
export interface PaymentMethod {
  id: string;
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
}
/** Only tokenized synthetic metadata enters the adapter, never a PAN or CVC. */
export interface PaymentMethodInput {
  token: string;
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
  billingZip: string;
}
export interface PaymentSetup {
  id: string | null;
  status: "empty" | "processing" | "requires_action" | "succeeded" | "failed";
  method: PaymentMethod | null;
  previousMethod?: PaymentMethod | null;
  error?: string;
}
export interface Notification {
  id: string;
  appointmentId: string;
  channel: "email" | "sms";
  kind: "confirmation" | "reminder" | "rescheduled" | "cancelled" | "care-plan";
  scheduledAt: string;
  status: "queued" | "delivered" | "failed" | "cancelled";
}
export interface CareMessage {
  id: string;
  body: string;
  at: string;
  sender: "patient" | "care-team";
  status: "sending" | "delivered" | "failed";
  replyTo?: string;
  /** Risk language was found, so the care team checks in today instead of sending the routine reply. */
  urgent?: boolean;
  /** Who on the care team wrote a reply, when it's their clinician ("Dr. Chen") rather than the team. */
  author?: string;
  /** The model's first pass on a patient's message, for the care team inbox. */
  triage?: CareTriage;
}
export type TriageCategory = "scheduling" | "billing" | "medication" | "clinical" | "records" | "other";
export interface CareTriage {
  category: TriageCategory;
  /** One line for the team. */
  summary: string;
  /** A reply the team can edit and send; empty when there's nothing to start from. */
  draft: string;
  status: "drafting" | "ready" | "failed";
}
/** The patient's pharmacy for e-prescribing, saved in DoseSpot (simulated). */
export interface Pharmacy {
  name: string;
  address: string;
  ncpdpId: string;
}
/** A prescription the clinician sent through DoseSpot (simulated). */
export interface Prescription {
  id: string;
  medication: string;
  supply: string;
  pharmacy: string;
  /** Failed means the pharmacy didn't confirm it; the care team resends it. */
  status: "sent" | "failed";
  at: string;
}
/** A chart the patient shared from Epic MyChart (simulated). */
export interface ChartImport {
  organization: string;
  importedAt: string;
  conditions: string[];
  medications: string[];
  allergies: string[];
  labResults: number;
  visitNotes: number;
  /** Shared after the patient approved their visit brief, so the brief shows it as added later. */
  afterApproval?: boolean;
}
export interface JourneyState {
  version: 1;
  step: Step;
  history: Step[];
  scenario: Scenario;
  fit: Record<string, string>;
  exitReason: string;
  conditions: string[];
  /** Retained only to read saved drafts from the earlier single-topic design. */
  topic: string;
  goal: string;
  coverage: Coverage;
  payer: string;
  memberId: string;
  profile: Profile;
  providerId: string;
  slotId: string;
  eligibility: Eligibility;
  reservation: Reservation | null;
  paymentReady: boolean;
  paymentSetup: PaymentSetup;
  financialConsent: boolean;
  portalAuth: {
    status: "signed_in" | "signed_out" | "code_sent" | "expired";
    codeExpiresAt: number | null;
  };
  notifications: Notification[];
  clock: { virtualStart: number; realStart: number; rate: number } | null;
  healthReviewed: boolean;
  medications: string;
  allergies: string;
  currentLocation: string;
  callbackConfirmed: boolean;
  encounter: {
    status: "not_started" | "waiting" | "in_progress" | "completed";
    connection: "disconnected" | "connected" | "interrupted";
    clinicianStatus: "not_present" | "running_late" | "ready";
    checkedInAt?: string;
    joinedAt?: string;
    pausedAt?: string;
    pausedDurationMs?: number;
    completedAt?: string;
  };
  carePlan: {
    status: "unavailable" | "pending" | "published";
    publishedAt?: string;
    followupWeeks: number;
  };
  pharmacy?: Pharmacy | null;
  prescriptions?: Prescription[];
  chartImport?: ChartImport | null;
  appointment: Appointment | null;
  followupAppointment: Appointment | null;
  bookingMode: "first" | "reschedule" | "followup";
  agreements: boolean;
  recordsPermission: boolean;
  recordsStatus: "idle" | "ready" | "unavailable" | "declined";
  recordsReviewed: boolean;
  briefGoal: string;
  briefNote: string;
  outdatedRecord: boolean;
  briefApproved: boolean;
  deviceReady: boolean;
  emailReminder: boolean;
  reminderScheduled: boolean;
  followupReminderScheduled?: boolean;
  visitDay: boolean;
  micOn: boolean;
  cameraOn: boolean;
  visitPhase: number;
  rating: number;
  feedback: string;
  feedbackSaved: boolean;
  careMessage: string;
  careMessages?: CareMessage[];
  events: ServiceEvent[];
  faultsUsed: string[];
}
export interface IdentityRecord {
  firstName: string;
  lastName: string;
  address: string;
  city: string;
  zip: string;
  sexAtBirth: "Female" | "Male";
}
export type IdentityLookup = { status: "found"; record: IdentityRecord } | { status: "not-found" };
export type InsuranceDiscovery = { status: "found"; payer: string; memberId: string } | { status: "not-found" };
export interface MatchRequest {
  conditions: string[];
  payer: string;
  availability: string[];
  coverage: Coverage;
}
export type PhotoIdResult = { status: "verified" } | { status: "unreadable" };
export interface MockApi {
  saveDraft(stage: string): Promise<void>;
  getProviders(): Promise<Provider[]>;
  checkEligibility(): Promise<Eligibility>;
  createAccount(): Promise<void>;
  reserve(providerId: string, slotId: string): Promise<Reservation>;
  setupPayment(input: PaymentMethodInput): Promise<PaymentSetup>;
  completePaymentAuthentication(approved: boolean): Promise<PaymentSetup>;
  confirm(): Promise<Appointment>;
  requestRecords(
    allowed: boolean,
  ): Promise<"ready" | "unavailable" | "declined">;
  generateBrief(): Promise<void>;
  scheduleReminders(appointmentId?: string): Promise<void>;
  saveHealthDetails(): Promise<void>;
  checkIn(): Promise<void>;
  admitToVisit(): Promise<void>;
  setClinicianReady(actor: "clinician"): Promise<void>;
  joinVisit(): Promise<void>;
  leaveVisit(): Promise<void>;
  publishCarePlan(actor: "clinician"): Promise<void>;
  cancelAppointment(appointmentId?: string): Promise<void>;
  deliverNotifications(): Promise<void>;
  requestSignIn(email: string): Promise<void>;
  verifySignIn(code: string): Promise<void>;
  signOut(): void;
  reconnect(): Promise<void>;
  completeVisit(actor: "clinician"): Promise<void>;
  bookFollowup(slotId: string): Promise<Appointment>;
  reschedule(slotId: string): Promise<void>;
  sendCareMessage(): Promise<void>;
  replyToCareMessage(): Promise<void>;
  /** Texts a sign-in code to the phone on file (Verified, simulated). */
  sendVerificationCode(): Promise<{ sentAt: string }>;
  checkVerificationCode(code: string): Promise<{ valid: boolean }>;
  /** Name and address from the phone number and birth date (Verified, simulated). */
  lookupIdentity(): Promise<IdentityLookup>;
  /** Plan and member ID for the patient (Sohar insurance discovery, simulated). */
  discoverInsurance(): Promise<InsuranceDiscovery>;
  /** Clinicians ranked by focus, plan and openings (Legion directory and calendars, simulated). */
  matchClinicians(request: MatchRequest): Promise<MatchResult>;
  /** Matches a selfie to a photo ID (Persona, simulated). */
  verifyPhotoId(): Promise<PhotoIdResult>;
  /** Sends the visit summary to the patient's doctor over the health network (Metriport, simulated). */
  shareVisitSummary(): Promise<{ sentAt: string }>;
  /** Saves the patient's pharmacy for prescriptions (DoseSpot, simulated). */
  savePharmacy(pharmacy: { name: string; address: string }): Promise<Pharmacy>;
  /** Sends a prescription to the saved pharmacy (DoseSpot, simulated). */
  sendPrescription(request: { medication: string; supply: string }): Promise<Prescription>;
  /** Imports the chart the patient chose to share in MyChart (Epic MyChart, simulated). */
  importChart(organization: string): Promise<ChartImport>;
}
export interface ScreenProps {
  state: JourneyState;
  update: (patch: Partial<JourneyState>) => void;
  updateProfile: (patch: Partial<Profile>) => void;
  go: (step: Step) => void;
  back: () => void;
  api: MockApi;
  busy: boolean;
  error: string;
  setError: (message: string) => void;
  act: <T>(fn: () => Promise<T>) => Promise<T | undefined>;
  openHelp: () => void;
}
