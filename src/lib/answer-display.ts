const DISPLAY_ANSWER_OVERRIDES: Record<string, string> = {
  "What are the diaper changing procedures?":
    "Early learning providers must post an easily viewable diaper changing procedure at each station and must follow each step described in the procedure.",
  "What are the requirements for nap time and sleep?":
    "An early learning provider must offer a supervised daily rest period for preschool-age children and younger who are in care for more than six hours or who need rest, provide quiet activities for children who do not rest, communicate sleep needs with parents or guardians, not place children directly on the floor to sleep, and provide developmentally appropriate mats, cots, or other sleep equipment that can be cleaned and sanitized.",
  "What are the food safety requirements at daycare?":
    "Early learning providers must follow food safety rules for handwashing, storing, preparing, cooking, holding, and serving food, keep perishable food refrigerated or frozen at safe temperatures, keep hot and cold foods at required holding temperatures, reheat food safely, store raw meat to prevent cross-contamination, and discard food that is expired or kept too long.",
  "What are the medication rules at daycare?":
    "An early learning program must have a medication management policy, only trained providers may give medication, medication must be stored safely and out of children's reach, written authorization and documentation are required, and additional instructions apply for special or emergency medications.",
  "What are the emergency preparedness requirements at daycare?":
    "An early learning provider must have and follow a written emergency preparedness plan that covers likely emergencies, evacuation and reunification, emergency supplies and contacts, staff responsibilities, and required practice drills, including monthly fire and evacuation drills and other emergency drills every three months.",
  "What are the center staffing and ratio requirements?":
    "For centers, the staff-to-child ratios and maximum group sizes are: infants 1:4 with a maximum group size of 8, or 1:3 with a maximum group size of 9; toddlers 1:7 with a maximum group size of 14, or 1:5 with a maximum group size of 15; preschoolers 1:10 with a maximum group size of 20; and school-age children 1:15 with a maximum group size of 30. Mixed-age groups must follow the ratio and group size for the youngest child in the group.",
  "What are the family home staffing and ratio requirements?":
    "A family home license may allow care for up to twelve children, but the approved capacity depends on the space, ages of children, and other safety factors. Family homes must follow the required age-based ratios, and additional staff are required when the number and ages of children in care trigger those staffing rules.",
  "How much outdoor play time is required?":
    "Infants and toddlers must get twenty minutes of active outdoor play for each three hours of programming, as tolerated. Children preschool age and older must get thirty minutes for each three hours of programming. Programs that operate more than six hours a day must provide sixty minutes for infants and toddlers and ninety minutes for preschool-age children and older, and up to thirty minutes of that required play time may be moderate to vigorous indoor activity.",
  "Do children have to play outside every day?":
    "Infants and toddlers must get twenty minutes of active outdoor play for each three hours of programming, as tolerated. Children preschool age and older must get thirty minutes for each three hours of programming. Programs that operate more than six hours a day must provide sixty minutes for infants and toddlers and ninety minutes for preschool-age children and older, and up to thirty minutes of that required play time may be moderate to vigorous indoor activity.",
  "What are the bottle preparation rules at daycare?":
    "Filled bottles brought from home must be clearly labeled and refrigerated right away. Bottle preparation areas must include a sink and be separated from diaper changing areas, bottles must be warmed safely without microwaving, and partially consumed bottles or unused formula must be discarded within the required time limits.",
  "What are the breast milk rules at daycare?":
    "Breast milk provided by a parent or guardian must be refrigerated or frozen right away, labeled with the child's name and the date received, stored at the required temperatures, and discarded or returned according to the time limits for frozen, thawed, and left-out breast milk.",
  "What are the discipline rules at daycare?":
    "An early learning provider, staff member, or household member must not use hostile, shaming, threatening, or physically punitive discipline. Physical separation may be used only within strict limits, and discipline may not involve humiliation, food, sleep, toileting, or any action that could harm a child.",
  "What are the general safety requirements at daycare?":
    "An early learning provider must keep indoor and outdoor spaces, materials, and equipment free from hazards and in safe working condition, keep dangerous items inaccessible to children, maintain safe water and room temperatures, and prevent choking, injury, and other avoidable risks.",
  "What are the infant feeding rules at daycare?":
    "An early learning provider must have written feeding policies, follow a feeding plan developed with the parent or guardian, support breastfeeding, feed infants and toddlers according to hunger and developmental needs, prepare and store food safely, and follow the specific rules for bottles, breast milk, formula, juice, and safe food sizes.",
  "What are the illness and exclusion rules at daycare?":
    "An early learning provider must watch children for signs of illness, notify parents or guardians when symptoms develop, decide when a child must be sent home or separated from others, follow the specific exclusion and return-to-care rules for fever, vomiting, diarrhea, and other symptoms, and report required illness outbreaks.",
  "What are the staff qualification requirements at daycare?":
    "All early learning providers must meet the age, education, background check, and preservice requirements that apply to their role before working, and many positions also have ongoing training, certification, and role-specific qualification requirements.",
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
