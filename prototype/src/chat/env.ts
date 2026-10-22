/** Reviewer tools (jumps, scenarios, the clinician view) show unless the link says ?preview=0. */
export const PREVIEW =
  typeof window === "undefined" || new URLSearchParams(window.location.search).get("preview") !== "0";

/** One first-visit length everywhere, from Legion's own homepage. */
export const FIRST_VISIT_LENGTH = "30 to 45 minutes";

/**
 * The assistant patients talk to. A name, not "AI" in their face; the role line
 * still says plainly that it isn't a person (Texas HB 149 asks for clear disclosure).
 */
export const ASSISTANT = {
  name: "Wren",
  role: "Legion’s virtual assistant",
} as const;
