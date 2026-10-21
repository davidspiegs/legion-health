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
  | "feedback";
export type Scenario =
  | "standard"
  | "slot-taken"
  | "coverage-pending"
  | "coverage-unmatched"
  | "records-unavailable"
  | "payment-retry"
  | "connection-lost"
  | "save-retry";
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
  | "Care team";
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
  careMessages?: { id: string; body: string; at: string }[];
  events: ServiceEvent[];
  faultsUsed: string[];
}
export interface MockApi {
  saveDraft(stage: string): Promise<void>;
  getProviders(): Promise<Provider[]>;
  checkEligibility(): Promise<Eligibility>;
  createAccount(): Promise<void>;
  reserve(providerId: string, slotId: string): Promise<Reservation>;
  setupPayment(): Promise<void>;
  confirm(): Promise<Appointment>;
  requestRecords(
    allowed: boolean,
  ): Promise<"ready" | "unavailable" | "declined">;
  generateBrief(): Promise<void>;
  scheduleReminders(appointmentId?: string): Promise<void>;
  joinVisit(): Promise<void>;
  reconnect(): Promise<void>;
  completeVisit(actor: "clinician"): Promise<void>;
  bookFollowup(slotId: string): Promise<Appointment>;
  reschedule(slotId: string): Promise<void>;
  sendCareMessage(): Promise<void>;
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
