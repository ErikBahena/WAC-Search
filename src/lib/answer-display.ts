const DISPLAY_ANSWER_OVERRIDES: Record<string, string> = {
  "What are the diaper changing procedures?":
    "Early learning providers must post an easily viewable diaper changing procedure at each station and must follow each step described in the procedure.",
  "How long can leftover food be stored?":
    "Refrigerated leftover food must be stored and then served again within forty-eight hours of originally being prepared.",
  "How long is puree good for after opening?":
    "Refrigerated leftover food must be stored and then served again within forty-eight hours of originally being prepared.",
  "How long are leftovers safe to eat?":
    "Refrigerated leftover food must be stored and then served again within forty-eight hours of originally being prepared.",
  "Can expired food be served to children?":
    "Food that is past the manufacturer's expiration or \"best served by\" date must not be served to enrolled children.",
  "Can children use hand sanitizer?":
    "Hand sanitizers or hand wipes with alcohol may be used for adults and children over twenty-four months of age when proper handwashing facilities are not available and hands are not visibly soiled or dirty.",
  "What immunizations are required for daycare?":
    "On or before a child's first day of attending an early learning program, parents or guardians must provide proof of vaccination or acquired immunity, and the provider must have a current certificate of immunization status form, a certificate of exemption form if applicable, or a current immunization record from the Washington state immunization information system.",
  "Can unvaccinated children attend daycare?":
    "A child who is not current with immunizations may be accepted if the parent or guardian provides written proof before enrollment that the child is scheduled to be immunized, or provides a signed and dated statement explaining when the child's immunizations will be brought up to date and acknowledging the child will be excluded if they are not completed within thirty calendar days of the specified due date.",
  "What are the requirements for a fire drill at daycare?":
    "Emergency drills must include a fire and evacuation drill once each calendar month, an earthquake, lockdown, or shelter-in-place drill once every three calendar months, variety in staff and time of day, and a recorded drill log with the date, time, number of children and staff, length of the drill, and notes for improvement.",
  "What do I do during a fire at daycare?":
    "The emergency plan for a fire that may require evacuation must cover sounding an alarm and calling 911, actions to be taken by the person discovering the emergency, how children will be evacuated, the alternate evacuation location, what to take when evacuating, how staff will maintain ratio and account for all children, how parents or guardians can contact the program, and how children will be reunited with their parents or guardians.",
  "When are two staff required in family home child care?":
    "Two early learning program staff are required anytime more than six children are in care and any child is under two years of age, more than eight children are in care and any child is under three years of age, or more than ten children are in care and any child is under school age.",
  "How much space per child indoors?":
    "Child usable and accessible areas must provide sufficient space for routine care, play, and learning activities and must allow supervision, allow children to move freely, and allow different types of activities at the same time."
}

function normalizeSpacing(text: string): string {
  return text
    .replace(/\u2019/g, "'")
    .replace(/([.;:])(?=[A-Z"])/g, "$1 ")
    .replace(/\s+/g, " ")
    .replace(/\s+([.,;:])/g, "$1")
    .trim()
}

function stripSubsectionMarkers(text: string): string {
  return text.replace(/\(([A-Za-z0-9]{1,4})\)\s*/g, "")
}

function cleanDanglingEnding(text: string): string {
  return text
    .replace(/;\s*(and|or)\s*$/i, ".")
    .replace(/;\s*$/g, ".")
    .replace(/:\s*$/g, ".")
}

export function toDisplayAnswer(question: string, answer: string): string {
  const override = DISPLAY_ANSWER_OVERRIDES[question]
  if (override) {
    return override
  }

  return cleanDanglingEnding(normalizeSpacing(stripSubsectionMarkers(answer)))
}
