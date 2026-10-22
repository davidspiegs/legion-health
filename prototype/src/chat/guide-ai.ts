/**
 * Language work the guide does. The preview runs a deterministic interpreter so
 * it works offline and behaves predictably in review; a model-backed adapter can
 * replace it behind the same contract. Either way, anything that changes the
 * journey is shown back to the patient for confirmation, and the crisis check
 * runs locally first so it never depends on a network call. A model can add to
 * the crisis check but never replaces it. The labeled evals are in
 * language-eval.test.ts and docs/language-evals.md.
 */

import { FIRST_VISIT_LENGTH } from "./env";
import { CLINICIANS } from "./inventory";

export type ConditionLabel =
  | "ADHD"
  | "Depression"
  | "Anxiety"
  | "Bipolar Disorder"
  | "PTSD"
  | "I'm not sure"
  | "Other";

export interface StoryReading {
  conditions: ConditionLabel[];
  /** One sentence summarizing what the patient said, never a diagnosis or a feeling. */
  reflection: string;
  crisis: boolean;
}

export interface GuideAnswer {
  intent:
    | "cost"
    | "insurance"
    | "medication"
    | "ai"
    | "privacy"
    | "timing"
    | "visits"
    | "changes"
    | "clinician"
    | "crisis"
    /** Overdose, poisoning, or "should I go to the ER?": 911 and Poison Control now. */
    | "emergency"
    | "other";
  text: string;
  /** Questions the guide should not answer itself are noted for the clinician. */
  forClinician: boolean;
}

// ================================================================ Normalizing

/** Apostrophe look-alikes: ‘ ’ ‚ ‛ ′ ‵ ʹ ʻ ʼ ʽ ˈ ` ´ and the full-width one. */
const APOSTROPHES = /[\u2018\u2019\u201A\u201B\u2032\u2035\u02B9\u02BB\u02BC\u02BD\u02C8`\u00B4\uFF07]/g;

/** normalizeText without lowercasing, for the one cue where case matters ("ADD"). */
function tidy(text: string): string {
  return text
    .replace(APOSTROPHES, "'")
    .normalize("NFKC")
    .replace(APOSTROPHES, "'")
    .replace(/[\u200B-\u200D\u2060\uFEFF\u00AD]/g, "") // zero-width characters and soft hyphens
    .replace(/[\u201C\u201D\u201E\u201F\u2033\u2036]/g, '"')
    .replace(/[\u2010-\u2012\u2212]/g, "-") // hyphens and the minus sign
    .replace(/[\u2013-\u2015]/g, " - ") // en and em dashes
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * The text every pattern here reads: NFKC, one straight apostrophe, plain hyphens,
 * no zero-width characters, lowercase, single spaces. iOS Smart Punctuation types ’
 * for every apostrophe, so raw text would miss "I don’t want to live".
 */
export function normalizeText(text: string): string {
  return tidy(text).toLowerCase();
}

// ================================================================ Crisis floor

/*
 * The floor favors recall. Denials ("I'm not suicidal") and someone else's suicide match
 * on purpose, because a pattern can't tell a denial from ambivalence and a person on the
 * care team should read it the same day. The exclusions are narrow everyday uses
 * ("killing me", "cutting back", "go on medication"), each pinned by a labeled case.
 * Patterns read normalizeText output, where an apostrophe may also be missing ("dont").
 */

const PILLS = String.raw`(?:pills?|tablets?|capsules?|meds|medications?|medicines?|sleeping pills|tylenol|advil|ibuprofen|acetaminophen|aspirin|xanax|klonopin|ativan|valium|adderall|vyvanse|ritalin|lexapro|zoloft|prozac|wellbutrin|seroquel|lithium|ambien|benadryl|oxy|oxycodone|percocet|vicodin|fentanyl|heroin|opioids|painkillers|insulin)`;

/** People someone might be afraid of hurting. */
const PEOPLE = String.raw`(?:my (?:husband|wife|partner|spouse|boyfriend|girlfriend|fiancée?|fiancee?|ex|kids?|child|children|sons?|daughters?|bab(?:y|ies)|newborn|toddler|mom|mother|dad|father|parents?|brother|sister|siblings?|family|roommate|boss|manager|coworkers?|co-workers?|neighbou?rs?|friends?|teacher|classmates?)|him|her|them|someone|somebody|anyone|anybody|(?:the |those |these |all the |some )?(?:people|others|guys|men|women|kids)|other people|everyone|everybody|a (?:person|kid|child))`;

const HARM = String.raw`(?:hurt|hurts|hurting|harm|harms|harming|harmed|kill|kills|killing|killed|stab|stabs|stabbing|stabbed|shoot|shooting|strangle|strangling|strangled|choke|choking|choked|murder|murdering|murdered|attack|attacking|attacked|poison|poisoning|poisoned|smother|smothering|smothered)`;

/** Words that can sit between "I" and the verb: "I'm scared I might", "I keep having thoughts about". */
const LEAD = String.raw`(?:will|would|could|might|may|can|really|just|sometimes|often|still|almost|nearly|never|actually|seriously|honestly|literally|probably|definitely|even|keep|kept|have|had|been|be|was|am|want|wanted|wanna|to|going|gonna|feel|felt|like|think|thought|thinking|about|of|worry|worried|fear|afraid|scared|that|having|thoughts|urges?|get|these|imagine|imagined|imagining|picture|picturing|fantasi[sz]e|fantasi[sz]ing|dream|dreaming|plan|planning|tempted|tried|try|trying|i|i'll|i'd|i'm)`;

/** Taking a dangerous amount of something. Also an emergency in Help. */
const OVERDOSE: RegExp[] = [
  /\boverdos/,
  /\bod(?:'d|'ed|'ing|ing|s)?\b(?! on (?:caffeine|coffee|sugar|candy|chocolate)\b)/,
  new RegExp(
    String.raw`\b(?:took|take|taking|taken|swallowed|swallowing|ate|downed|popped|popping) (?:way |far |so many |a lot )?too (?:many|much)(?: of)? (?:${PILLS}|of (?:my|the|them|those|these|her|his|their))\b`,
  ),
  /\b(?:took|take|taking|taken|swallowed|swallowing|ate|downed|popped) (?:a |an |the |my |her |his )?(?:whole|entire|full) (?:bottle|pack|packet|box|blister pack|strip|container)\b(?! of (?:wine|vodka|whiskey|whisky|tequila|rum|gin|beer|soda|water|juice|champagne)\b)/,
  new RegExp(
    String.raw`\b(?:took|take|taking|swallowed|swallowing|ate|downed|popped) (?:a bunch|a handful|handfuls|a lot|dozens|a ton) of (?:my |the |her |his |those |these )?${PILLS}\b`,
  ),
  new RegExp(String.raw`\b(?:took|take|taking|swallowed|swallowing) all (?:of )?(?:my |the |her |his )?${PILLS} at once\b`),
  new RegExp(
    String.raw`\b(?:plan\w*|going to|gonna|want to|about to|thinking about|thought about)\b[\w' ]{0,20}\b(?:take|taking|swallow\w*) all (?:of )?(?:my |the |her |his )?${PILLS}\b`,
  ),
  // Saving pills up is preparation.
  new RegExp(
    String.raw`\b(?:stockpil\w*|hoard\w*|stash\w*)\b[\w' ]{0,30}\b${PILLS}\b|\b${PILLS}\b[\w' ]{0,30}\b(?:saved up|stockpiled|stashed|hoarded)\b`,
  ),
  /\b(?:lethal|fatal|deadly) (?:dose|amount)\b/,
  /\bhow many\b[\w' ]{0,40}?\b(?:to die|kill me|would kill|be fatal|be lethal|to od|to overdose)\b/,
  new RegExp(
    String.raw`\bhow (?:many|much)\b(?: of)?(?: my| the| your)? ${PILLS}\b[\w' ]{0,30}?\b(?:(?:it would|would it|does it|it'd|will it) take(?= ?(?:$|[.,!?;]))|to die|to kill|to od|to overdose|lethal|fatal|deadly)`,
  ),
  /\bpoison(?:ed|ing)? my ?self\b/,
  /\b(?:drank|drink|drinking|swallowed) (?:some )?(?:bleach|antifreeze|drain cleaner|rat poison|poison)\b/,
];

/** "I don't want to", "not wanting to", "I don't think I want to". */
const NOT_WANT = String.raw`\b(?:(?:don'?t|do not|didn'?t|did not|doesn'?t|does not)(?: (?:really|even|actually|think i|feel like i|know if i))?|not(?: sure (?:if |that )?i| really)?|no longer|never|barely) (?:want|wanna|wish|wanting)(?:ed)? (?:to )?`;

const CRISIS: RegExp[] = [
  // Suicide, said any way.
  /\bsuicid/,
  /\bsewer ?slide\b|\bself-?delet(?:e|ing|ed)\b/,
  /\bunaliv/,
  /(?<![\d.] ?)(?<!\b(?:few|many|several|some|of) )\bkms\b(?! (?:away|from|per|a day|an hour|each|every)\b)/,
  /\bhomicid/,
  // Wishing to be dead, or not to wake up.
  /\b(?:want|wants|wanted|wanting|wanna|wish|wished|wishing|ready|plan|plans|planning|trying|tried|deserve|deserves) (?:to )?die\b(?! (?:of|from) (?:embarrassment|laughter|laughing|boredom|cringe)\b| on (?:this|that) hill\b)/,
  /\bwish(?:ed|ing)? (?:that )?i (?:could|would|might) (?:just )?die\b/,
  /\b(?:hope|hoping|pray|praying) (?:that )?i (?:just )?die\b/,
  // "I'd rather die than give a speech" is an idiom; "rather die than keep living like this" is not.
  /\brather (?:just )?(?:die|be dead)\b(?! than (?!(?:live|living|keep|go on|going on|be alive|feel|feeling|wake up)\b))/,
  /\bbetter off (?:dead|without me)\b/,
  /\b(?:better|happier|easier) (?:off )?(?:without me|if i (?:just |simply |really )?(?:was|were|wasn'?t|weren'?t|was not|were not) (?:gone|dead|here|around|alive|born))\b/,
  /\bif i (?:was|were) dead\b|\bin case i(?:'m| am)? (?:gone|not here|not around|dead|die)\b/,
  /\bwish(?:ed|ing)? (?:that )?i (?:was|were|could be) dead\b/,
  /\bwish(?:ed|ing)? (?:that )?i (?:wasn'?t|weren'?t|was not|were not) (?:alive|here|around|born)\b/,
  /\bwish(?:ed|ing)? (?:that )?i(?:'d| had| was| were)? never (?:been born|born|existed|woken up)\b/,
  /\b(?:want|wanna|wish) (?:to )?be dead\b/,
  /\b(?:hope|hoping|wish|wishing|pray|praying|want|wanted|wanting) (?:that )?(?:i |to )?(?:could |would |will |just )*(?:go to sleep and |fall asleep and |sleep and )?(?:never|not|don'?t|do not|won'?t|wouldn'?t) (?:to )?wake up\b/,
  /\b(?:go to sleep|fall asleep|sleep) and (?:never|not) wake up\b/,
  new RegExp(String.raw`${NOT_WANT}(?:be alive|exist|keep living|be on this (?:earth|planet)|be in this world)\b`),
  new RegExp(String.raw`${NOT_WANT}live\b(?! (?:in|at|with|near|there|here|alone|on|by|far|close|together|abroad|downtown|like that)\b)`),
  new RegExp(String.raw`${NOT_WANT}be here\b(?! (?:in|at|with|for|on|because|when|if)\b)`),
  new RegExp(String.raw`${NOT_WANT}be around\b(?! (?:people|anyone|anybody|my|them|him|her|crowds|others|family|friends|kids)\b)`),
  new RegExp(String.raw`${NOT_WANT}wake up\b(?! (?:early|at|before|so|for|to|in time|on time)\b)`),
  /\b(?:don'?t|do not|didn'?t|did not|doesn'?t|does not|no longer|never|can'?t|cannot|can not|couldn'?t|could not) (?:really |even |actually )?(?:want to |wanna )?(?:go on|keep going|keep living)(?= ?(?:$|[.,!?;:"-]|like this|living|anymore|any more|any longer|much longer|without|with (?:my |this )?life))/,
  /\b(?:don'?t|do not) care if i (?:die|live|wake up|don'?t wake up|never wake up)\b/,
  /\bwouldn'?t mind (?:dying|being dead|not waking up|never waking up)\b/,
  /\b(?:not|isn'?t|is not|no longer|never) (?:really )?worth (?:living|being alive)\b/,
  /\blife(?:'s| is)? (?:not|isn'?t|is not|no longer) (?:really )?worth (?:it|living)\b/,
  /\bno (?:point|reason|purpose) (?:in |to |for me to |of )?(?:living|live|life|being alive|be alive|going on|keep going|keep living|be here|being here)\b/,
  /\bwhat'?s the point (?:of|in) (?:living|life|being alive|going on)\b/,
  /\bnothing (?:left )?to live for\b/,
  /\b(?:tired|sick|done) (?:of|with) (?:living\b(?! (?:paycheck|in|with|alone|here|there|on|off|like (?:a|an))\b)|life\b|being alive\b|existing\b|this life\b)/,
  /\b(?:want|wanna|wish|wishing)(?: to| i could)? (?:just )?stop (?:existing|being alive|breathing|living(?= ?(?:$|[.,!?;]|anymore|altogether|for good)))/,
  /\b(?:fantasi[sz]\w*|daydream\w*) about (?:my own death|dying|being dead|my funeral)\b|\b(?:think|thinking|thought) about my own death\b/,
  /\b(?:won'?t|will not) be (?:here|around|alive) (?:much longer|for long|anymore|any more)\b/,
  /\bwant (?:it all|everything|my life|this life|life|it) to (?:end|stop|be over)\b/,
  /\b(?:to|just|could|would|rather|better) (?:just )?not (?:exist|be alive|be here anymore|be around anymore|wake up)\b/,
  /\b(?:about|of) not (?:existing|being alive|being here|waking up)\b/,
  // Thinking about dying, often. This also catches some fear of dying; a person sorts that out.
  /\b(?:think|thinking|thought) (?:about|of) (?:dying|death|being dead)\b(?= ?(?:every day|everyday|all the time|constantly|a lot|most days|daily|nonstop))/,
  /\b(?:want|wanna|wish|wishing|hope)(?: to| i could)? (?:just )?(?:go to )?sleep forever\b/,
  /\bwant(?:s|ed)? out of (?:life|this life|this world|existence)\b/,
  /\b(?:only|no|other) way out\b[\w' ]{0,30}\b(?:die|dying|death|dead|suicide|end it)\b|\bway out (?:other than|but|except) (?:dying|death|to die)\b/,
  /\b(?:suicide|goodbye) (?:note|letter)s?\b/,
  /\b(?:ways|how) to (?:die|end it|end my life|kill myself)\b/,
  /\b(?:wish|want|hope|pray)(?:s|ed|ing)? (?:that )?(?:someone|somebody|something|god|a car|a truck|a bus) (?:would |could |will |to )?(?:kill|kills|hit|hits|run over|runs over|take|takes) me\b/,
  // Ending a life, or "it". A breakup ("ending it with him") is not.
  /\b(?:end|ending|ended|take|taking|took) my (?:own )?life\b(?! (?:back|away|over|in|into)\b)/,
  /\b(?:end|ending) (?:it all|everything|my ?self)\b(?! with\b)/,
  /(?<!\bthe )\b(?:end|ending) (?:it|things)\b(?! (?:with|between|off|early|soon|there|here|for (?:us|good))\b)/,
  /\b(?:almost|nearly) (?:ended|end) (?:it|things|my life)\b/,
  /\btook (?:his|her|their) (?:own )?life\b/,
  // Killing oneself, and methods. "Killing myself at work" is overwork.
  /\bkill(?:s|ing|ed)? ?my ?self\b(?! (?:at (?:work|the gym|my job|school)|for (?:work|my job|this job)|working|studying|over (?:work|this job))\b)/,
  /\b(?:want|wants|wanted|wanna|going|gonna|plan|planning|planned|try|tried|trying|attempt|attempted|thought|thoughts|thinking|think|considered|considering|urge|urges|decided|ready|how)\b(?: [\w']+){0,3} (?:to )?kill(?:ing)? ?my ?self\b/,
  /\bkill(?:ed|s|ing)? (?:him|her|them)sel(?:f|ves)\b/,
  /\boff(?:ing)? my ?self\b/,
  /\bjump(?:s|ing|ed)? (?:off|from|in front of) (?:a |an |the |my |our |this |that )?(?:[\w-]+ )?(?:bridge|building|roof|rooftop|balcony|cliff|overpass|parking garage|window|ledge|tower|train|subway|bus|truck|car)\b/,
  /\b(?:step|stepping|walk|walking|throw my ?self|throwing my ?self) (?:out )?in front of (?:a |an |the )?(?:car|bus|train|truck|subway)\b/,
  /\bhang(?:s|ing|ed)? my ?self\b|\bnoose\b/,
  /\bshoot(?:ing)? my ?self\b|\bgun to my head\b|\bbullet (?:in|through) my (?:head|brain)\b/,
  /\b(?:use|using|used|turn|turning|point|pointing) (?:it|a gun|the gun|my gun|a knife|the knife) on my ?self\b/,
  /\b(?:drown|drowning|suffocate|suffocating|smother|smothering) my ?self\b/,
  /\b(?:drive|driving|crash|crashing|steer|steering) (?:my car |the car )?(?:into|off) (?:a |the )?(?:wall|tree|traffic|oncoming|bridge|cliff|pole|barrier)\b/,
  /\b(?:slit|slitting|slash|slashing|cut|cutting) (?:my |both )?wrists?\b/,
  // Self-harm. Accidents and "cutting back" are the everyday uses.
  /(?<!accidentally |by accident )\b(?:hurt|hurts|hurting|harm|harms|harming|harmed|cut|cuts|cutting|burn|burns|burning|burned|burnt|hit|hits|hitting|punch|punching|stab|stabbing) my ?self\b(?! (?:at (?:the gym|work)|playing|lifting|running|skiing|hiking|working out|exercising|cooking|shaving|chopping|on (?:the|a)|in (?:a|an|the) (?:accident|fall|crash|game|match)|by accident|accidentally|falling|while (?:running|lifting|playing|working out|exercising|skiing|hiking|cooking|shaving))\b)/,
  /\bself[- ]?(?:harm|injur|mutilat)/,
  /\bcutting (?:again|my (?:arms?|wrists?|legs?|thighs?|stomach|skin|body))\b/,
  /\bcut(?:ting)? (?:to cope|to feel|to release|to numb|to calm|when i|whenever i|because i)\b/,
  /\b(?:scratch|scratching|pick|picking|bite|biting|cut|cutting|hit|hitting)\b[\w' ]{0,25}\buntil (?:it|they|i) (?:bleed|bleeds|bled|bruise|bruises)\b/,
  // Hurting oneself "on purpose": the car, a hand, an arm.
  /\b(?:crash\w*|wreck\w*|hurt\w*|cut\w*|burn\w*|broke|break\w*|hit\w*|punch\w*|bang\w*)\b[\w' ]{0,30}\b(?:my|myself)\b[\w' ]{0,20}\bon purpose\b/,
  /\b(?:been|started|start|keep|kept|stopped|quit|urges? to|urge of|history of|used to|go back to|went back to|back to|still|want to|wanted to|wanna|thinking about|thought about) cut(?:ting)?\b(?! (?:back|down|out|off|corners|ties|class|classes|school|carbs|sugar|caffeine|coffee|gluten|meat|dairy|alcohol|drinking|my hair|hair|it close|costs?|calories|weight|hours|my hours|people|contact|them|him|her|the)\b)/,
  ...OVERDOSE,
  // Hurting someone else: "I" or a thought word close before the verb, then a person.
  new RegExp(
    String.raw`(?:\b(?:i|i'll|i'd|i've|ive|i'm|im)(?: ${LEAD})*|^|[.!?;:,] ?|\b(?:thoughts?|urges?|images?|fantas(?:y|ies)|fears?|scared|afraid|worried|thinking|think|thought|imagine|imagining|picture|picturing) (?:of|about|that)?) ?${HARM} ${PEOPLE}\b(?!'s|s'| (?:feelings?|reputation|chances|career|grades|business|pride|ego)\b)`,
  ),
  new RegExp(String.raw`\b(?:snap|lose it|lose control|black out|go off)\b[\w' ]{0,15}?\b(?:and )?${HARM} ${PEOPLE}\b`),
  /\b(?:want|wanted|wish|wished) (?:him|her|them|my [\w-]+) (?:dead|gone forever)\b/,
  /\bwish (?:that )?(?:he|she|they|my [\w-]+) (?:was|were) dead\b/,
  // Spanish, the other language Legion's clinicians see patients in.
  /\b(?:quiero|quisiera|ganas de) (?:morir(?:me)?|matarme|suicidarme)\b(?! de (?:risa|verg[uü]enza|hambre|sue[nñ]o|calor|fr[ií]o|aburrimiento)\b)/,
  /\bme quiero (?:morir|matar)\b(?! de (?:risa|verg[uü]enza|hambre|sue[nñ]o|calor|fr[ií]o|aburrimiento)\b)/,
  /(?<!\bva a |\bvan a |\bvas a )\bmatarme\b/,
  /\bno quiero (?:vivir|seguir viviendo|despertar|existir)\b(?! (?:en|con|cerca|aqu|all)\b)/,
  /\bquitarme la vida\b/,
  /\b(?:hacerme da[nñ]o|lastimarme|cortarme)\b(?! el (?:pelo|cabello)\b)/,
];

/** The local floor under every free-text answer. Same signature a model adapter keeps. */
export function mentionsCrisis(text: string): boolean {
  const plain = normalizeText(text);
  return CRISIS.some((pattern) => pattern.test(plain));
}

// ================================================================ Reading a story

interface Cue {
  condition: ConditionLabel;
  /** How the read-back names it: what was said, never a feeling or a diagnosis. */
  phrase: string;
  patterns: RegExp[];
}

/** Patterns read normalizeText output. A condition can have more than one entry. */
const CUES: Cue[] = [
  {
    condition: "ADHD",
    phrase: "trouble staying focused",
    patterns: [
      /\badhd\b/,
      /\bfocus(?:ing|ed)?\b(?! on (?:my|getting|myself|the|what|work|family|school|health|recovery)\b)/,
      /\bconcentrat/,
      /\bdistract/,
      /\bprocrastinat/,
      /(?<!can'?t |never |won'?t )\bforget(?:ful|ting|s)?\b/,
      /(?<!medical )\battention\b(?! to detail)/,
      /\bdisorgani[sz]/,
      /\b(?:miss|missing|missed|blow|blowing|blew) (?:my |a lot of |all my )?deadlines?\b/,
      /\bcan'?t sit still\b/,
      /\bhyperactiv/,
      /\bimpulsiv/,
      /\b(?:zone|zoning|zoned|space|spacing|spaced) out\b/,
      /\bfidget/,
      /\bexecutive function/,
      /\btime blindness\b/,
      /\b(?:lose|losing) (?:my )?(?:keys|phone|wallet|track of time|things|stuff)\b/,
      /\b(?:never|can'?t|rarely|hard to) finish/,
    ],
  },
  {
    condition: "Anxiety",
    phrase: "a lot of worry",
    patterns: [
      /\banxi/,
      /\bworr(?:y|ied|ies|ying)\b/,
      /\bpanic/,
      /\bnervous/,
      /\bon edge\b/,
      /\b(?:mind|thoughts?|heart) (?:race|races|raced|racing|pounds|pounding)\b/,
      /\bracing (?:thoughts|heart|mind)\b/,
      /\boverthink/,
      /\bcan'?t (?:relax|calm down|stop worrying)\b/,
      /(?<!traumatic )\bstress/,
      /\bdread/,
      /\bphobi/,
      /\bfreak(?:ing|s)? out\b/,
      /\bsomething (?:terrible|bad|awful|horrible) (?:will|is going to|might|is about to) happen\b/,
    ],
  },
  {
    condition: "Depression",
    phrase: "feeling low",
    patterns: [
      /\bdepress/,
      /\bsad(?:ness)?\b/,
      /\bhopeless/,
      /\bempty\b/,
      /\bnumb\b/,
      /\b(?:no|zero|lost|lost my|lost all|little|lack of|any) motivation\b|\bunmotivated\b/,
      /\b(?:no|zero|low|little|any) energy\b/,
      /\bcan'?t get out of bed\b|\b(?:stay|staying|lie|lying) in bed all day\b|\bsleep(?:ing)? all day\b/,
      /\blow mood\b/,
      /\b(?:feel|feels|feeling|felt|been|so|really|pretty) (?:really |so |pretty |very |kind of |kinda )?(?:down|low)\b(?! (?:on|about) (?:money|cash|gas|battery)\b)/,
      /\bcr(?:y|ies|ying)\b|\bin tears\b/,
      /\bworthless/,
      /\bmiserable\b/,
      /\bunhappy\b/,
      /\b(?:feel|feeling|felt) flat\b|\bnothing matters\b/,
    ],
  },
  {
    // Losing interest is a depression symptom in its own right, so it gets its own words.
    condition: "Depression",
    phrase: "losing interest in things",
    patterns: [
      /\banhedoni/,
      /\bnothing (?:feels|is|seems|sounds) (?:fun|enjoyable|exciting|good|interesting)\b/,
      /\b(?:lost|losing|lose) (?:all )?(?:interest|joy|pleasure)\b/,
      /\b(?:no|zero|little) (?:interest|joy|pleasure) in (?:anything|things|doing|hobbies|life|people|activities|stuff|what)\b/,
      /\b(?:don'?t|do not|can'?t|cannot|no longer|never) (?:really )?(?:enjoy|care about|look forward to|get excited about) (?:anything|things|much|stuff|my hobbies|hobbies|life|the things|what i|activities|my life|it anymore|anymore)\b/,
      /\bnothing (?:makes me happy|excites me|interests me|brings me joy)\b/,
      /\b(?:stopped|quit) (?:enjoying|caring about|doing) (?:anything|things|the things|what i|my hobbies|hobbies|stuff)\b/,
    ],
  },
  {
    condition: "Depression",
    phrase: "pulling away from people",
    patterns: [
      /\b(?:stopped|quit|avoid|avoiding) (?:seeing|talking to|calling|texting|hanging out with) (?:my )?(?:friends|anyone|people|family)\b/,
      /\b(?:isolating|withdrawn|withdrawing) (?:myself|from)\b/,
    ],
  },
  {
    condition: "Depression",
    phrase: "a change in appetite",
    patterns: [/\b(?:lost|losing|no|zero|don'?t have (?:an|any)) (?:my )?appetite\b/],
  },
  {
    condition: "Bipolar Disorder",
    phrase: "big swings in mood",
    patterns: [
      /\bbipolar\b/,
      /\b(?:hypo)?mani(?:a|c)\b/,
      /\bmood swings?\b/,
      /\bmoods? (?:goes|go|swings|shifts|changes|change) (?:up and down|so fast|so quickly|really fast|all the time)\b/,
      /\bhighs and lows\b|\bextreme (?:highs|ups)\b/,
      /\b(?:on top of the world|invincible|unstoppable|full of energy)\b[\w' ,]{0,40}\b(?:then|and then|before i|until i) (?:crash|crashing|come down|hit (?:a )?(?:low|bottom))\b/,
      /\bspending sprees?\b/,
    ],
  },
  {
    condition: "PTSD",
    phrase: "something difficult you went through",
    patterns: [
      /\bptsd\b|\bpost-?traumatic\b/,
      /\btrauma/,
      /\bflashbacks?\b/,
      /\bnightmares\b|\b(?:have|having|had|get|getting) (?:a )?nightmares?\b|\bnightmares? (?:about|of|every)\b/,
      /\bassault/,
      /\b(?:since|after) (?:the|my|that) (?:car )?(?:crash|accident|wreck|attack|shooting|deployment|combat|fire|robbery|mugging)\b/,
      /\brap(?:e|ed)\b/,
      /\bhypervigilan/,
      // Abuse, but not "alcohol abuse" or "abusing pills", which are substance use.
      /(?<!(?:alcohol|drug|substance|opioid|pill|cocaine|meth|weed|marijuana|cannabis|prescription|xanax|adderall) )\babus(?:e|ed|ive)\b(?! (?:alcohol|drugs|substances|pills|opioids|meth|cocaine|weed|marijuana|xanax|adderall|my meds|prescription)\b)/,
    ],
  },
  // Concerns Legion treats that aren't intake choices are noted as "Other".
  {
    condition: "Other",
    phrase: "trouble sleeping",
    patterns: [
      /\binsomnia\b/,
      /\b(?:can'?t|cannot|can not|don'?t|never|barely|hardly) (?:fall |stay )?(?:asleep|sleep)\b(?! (?:in|over|with)\b)/,
      /\btrouble (?:sleeping|falling asleep|staying asleep)\b/,
      /\b(?:not|barely|hardly) sleeping\b/,
      /\bsleep(?:ing)? (?:is|has been|was) (?:bad|awful|terrible|a mess|horrible)\b/,
      /\b(?:bad|poor|terrible|awful|broken) sleep\b|\bsleep (?:badly|poorly|terribly)\b/,
      /\bwak(?:e|ing) up (?:at (?:[234]|three|four)\b|at [234](?:am|:\d\d)|in the middle of the night|every (?:hour|night)|multiple times|several times)/,
      /\b(?:can'?t|cannot|never|couldn'?t) (?:get|go) back to sleep\b/,
    ],
  },
  {
    condition: "Other",
    phrase: "intrusive thoughts or habits that are hard to stop",
    patterns: [
      /\bocd\b/,
      /\bintrusive thoughts?\b/,
      /\bcompulsi/,
      /\bobsess(?:ive|ion|ions|ing)\b|\bobsess over\b/,
      /\b(?:keep|constantly|always|compulsively) (?:checking|re-?checking|washing my hands|counting|cleaning)\b(?! (?:my )?(?:phone|email|emails|messages|texts|social media|instagram|tiktok|the news|in)\b)/,
      // Skin picking and hair pulling, but not "pulling my hair out" over a bad week.
      /\b(?:pick|picking|pull|pulling|bite|biting)(?: at)? (?:my )?(?:skin|hair|nails|cuticles|scabs|lips)\b(?! out\b)|\b(?:skin|hair) picking\b|\btrichotillomania\b|\bdermatillomania\b/,
    ],
  },
  {
    // Substance use is its own concern for the clinician, never read as trauma.
    condition: "Other",
    phrase: "alcohol or drug use",
    patterns: [
      /\balcohol/,
      /\b(?:drink|drinking|drank) (?:too much|a lot|so much|heavily|every (?:night|day)|daily|more|again|to cope|to sleep|to relax|alone)\b(?! of (?:coffee|water|tea|soda|caffeine|energy drinks)\b)/,
      /\b(?:started|been|stop|quit|problem with|binge) drinking\b|\bdrinking problem\b|\bbinge drink/,
      // How much or how often, not a glass of wine at dinner or coffee every morning.
      /\b(?:wine|beers?|vodka|whiske?y|liquor|tequila|shots|booze)\b[\w' ]{0,30}\b(?:a bottle|bottles|most nights|every night|every day|daily|to (?:fall )?asleep|to sleep|to cope|to relax|to calm down)\b/,
      /\b(?:drink|drinks|drinking|drank)\b(?![\w' ]{0,30}\b(?:coffee|water|tea|soda|juice|milk|caffeine|energy drinks?|protein|smoothies?)\b)[\w' ]{0,30}\b(?:a bottle|bottles|most nights|every night|every day|daily|to (?:fall )?asleep|to sleep|to cope|to relax|to calm down)\b/,
      /\b(?:drunk|hungover|hangovers?)\b/,
      /\b(?:weed|marijuana|cannabis|cocaine|meth|heroin|opioids?|opiates?|fentanyl|ketamine|mdma|molly|ecstasy|psychedelics|shrooms)\b/,
      /\b(?:addict|addicts|addiction|addicted)\b(?! to (?:my phone|social media|tiktok|instagram|games|gaming|video games|scrolling|netflix|shopping|work|coffee|caffeine|sugar)\b)/,
      /\b(?:sober|sobriety|in recovery|rehab|alcoholic|alcoholism)\b|(?<!digital )\bdetox\b/,
      /\b(?:substance|drug) (?:use|abuse|problem)\b|\b(?:using|doing|on|take|taking) drugs\b/,
    ],
  },
];

const SLEEP_CUE = CUES.find((cue) => cue.phrase === "trouble sleeping")!;
const MANIC = /\b(?:hypo)?mani(?:a|c)\b/;

/** "ADD" in capitals is the condition; "add" is the verb ("I'd like to add that..."). */
function expandAcronyms(text: string): string {
  // In all-caps text, only "HAVE ADD", "WITH ADD" and the like are the condition.
  if (!/[a-z]/.test(text)) return text.replace(/\b(HAVE|HAD|WITH|MY|OF|FOR|FROM) A\.?D\.?D\b\.?/g, "$1 ADHD");
  return text.replace(/\bA\.?D\.?D\b\.?/g, "ADHD");
}

/** Spans that one "not" or one subject can cover. */
function clauses(text: string): string[] {
  return text
    .split(
      /[.!?;:,()]+| - |\s(?=(?:but|though|although|however|except|whereas|yet|just)\b)|(?<!\b(?:me|i))\s(?=and (?:i|i'm|im|i've|ive|i'd|my|lately|recently|now)\b)/,
    )
    .map((part) => part.trim())
    .filter(Boolean);
}

const NEGATION =
  /\b(?:not|no|never|don'?t|do not|doesn'?t|does not|didn'?t|did not|isn'?t|wasn'?t|aren'?t|weren'?t|haven'?t|hasn'?t|hadn'?t|without|nor|neither|ruled? out)\b(?: [\w'-]+){0,4} $/;
/** Uncertainty and inability read like negation but aren't: "not sure if it's ADHD", "can't stop worrying". */
const NOT_NEGATION =
  /\b(?:not sure|not certain|unsure|don'?t know|do not know|no idea|not only|not just|wonder|(?:never|not|haven'?t|hasn'?t) been (?:diagnosed|tested|evaluated|treated)|not diagnosed|undiagnosed|(?:not|never|don'?t|doesn'?t|can'?t|won'?t) (?:\w+ )?(?:stop|stops|be able|able))\b/;
const SOMEONE =
  /\b(?:(?:my|our|his|her|their) (?:mom|mother|mum|dad|father|parents?|brother|sister|siblings?|sons?|daughters?|kids?|children|child|husband|wife|partner|spouse|boyfriend|girlfriend|fiancée?|fiancee?|aunt|uncle|cousins?|grandma|grandmother|grandpa|grandfather|grandparents?|family|roommate|(?:best )?friends?|coworkers?|boss|ex)|he|she|they)\b/g;
const ME = /\b(?:i|i'm|im|i've|ive|i'd|me|myself)\b/;
const FAMILY_TALK = /\bruns in (?:my|the|our) family\b|\bfamily history\b|\bin (?:my|our) family\b/;
/** "So do I" or "I think I have it too" makes a relative's condition the patient's as well. */
const SAME_HERE =
  /\b(?:so do i|me too|same (?:here|for me|with me)|i (?:do|might|may) (?:too|as well)|i (?:think i |probably |might |may )?(?:have|do|might have|may have) (?:it|that|them|the same)(?: thing)? (?:too|as well)|i see (?:a lot of )?(?:myself|it|that|the same) in (?:him|her|them|myself))\b/;

/** Whose concern a cue is, from the words before it in its clause. */
function whose(clause: string, before: string): "mine" | "theirs" | "ruled out" {
  if (/\bmy (?:own )?$/.test(before)) return "mine"; // "my anxiety"
  if (
    /\b(?:his|her|their|(?:mom|mother|dad|father|brother|sister|son|daughter|husband|wife|partner|boyfriend|girlfriend|friend|family|kid|child)'s) $/.test(before) ||
    FAMILY_TALK.test(clause)
  )
    return "theirs";
  const near = before.split(" ").slice(-7).join(" ");
  if (NEGATION.test(near) && !NOT_NEGATION.test(near)) return "ruled out";
  if (/\b(?:me|i) and (?:my|our) /.test(before)) return "mine"; // "me and my sister both have anxiety"
  let end = -1;
  for (const match of before.matchAll(SOMEONE)) end = match.index + match[0].length;
  return end >= 0 && !ME.test(before.slice(end)) ? "theirs" : "mine";
}

function joinPhrases(phrases: string[], conjunction = "and"): string {
  if (phrases.length <= 1) return phrases[0] ?? "";
  return `${phrases.slice(0, -1).join(", ")} ${conjunction} ${phrases[phrases.length - 1]}`;
}

export function readStory(text: string): StoryReading {
  const crisis = mentionsCrisis(text);
  const mine = new Set<Cue>();
  let lastTheirs: Cue[] = [];
  for (const clause of clauses(expandAcronyms(tidy(text)).toLowerCase())) {
    const here = new Set<Cue>();
    const theirs: Cue[] = [];
    for (const cue of CUES) {
      const owners = cue.patterns.flatMap((pattern) => {
        const match = pattern.exec(clause);
        return match ? [whose(clause, clause.slice(0, match.index))] : [];
      });
      if (owners.includes("mine")) here.add(cue);
      else if (owners.includes("theirs")) theirs.push(cue);
    }
    // Needing little sleep is part of a manic episode, not a separate sleep concern.
    if (MANIC.test(clause)) here.delete(SLEEP_CUE);
    for (const cue of here) mine.add(cue);
    if (SAME_HERE.test(clause)) for (const cue of [...lastTheirs, ...theirs]) mine.add(cue);
    lastTheirs = theirs;
  }
  const matched = CUES.filter((cue) => mine.has(cue));
  const conditions: ConditionLabel[] = matched.length
    ? Array.from(new Set(matched.map((cue) => cue.condition)))
    : ["I'm not sure"];
  // A plain summary of what was said, for the patient to confirm. It never
  // interprets feelings or names a diagnosis.
  const reflection = matched.length
    ? `Here’s what I heard: ${joinPhrases(Array.from(new Set(matched.map((cue) => cue.phrase))))}.`
    : "Thank you for putting that into words. Your clinician can help make sense of it with you.";
  return { conditions, reflection, crisis };
}

// ================================================================ Answering questions

const EMERGENCY: RegExp[] = [
  ...OVERDOSE,
  /\bpoison/,
  /\b(?:the|an|to) (?:er|e\.r)\b/,
  /\b(?:emergency room|emergency department|urgent care)\b/,
  /\b(?:go|going|get|take me) to (?:the |a )?hospital\b/,
  /\bcall(?:ing)? (?:911|an ambulance)\b/,
  /\b(?:is|was) (?:this|it|that) an emergency\b|\bmedical emergency\b|\bin an emergency\b/,
  new RegExp(
    String.raw`\b(?:swallowed|got into|ate|chewed) (?:(?:some|a few|one|two|a couple|several|a bunch|a handful|all)(?: of)? )?(?:my |his |her |their |the )?${PILLS}\b`,
  ),
  /\b(?:took|taken|swallowed) (?:a |my )?(?:double|extra|second) dose\b|\b(?:took|taken) (?:my )?(?:[\w-]+ )?(?:twice|two doses|2 doses)\b|\baccidentally (?:took|taken|swallowed|gave)\b/,
];

const INTENTS: { intent: GuideAnswer["intent"]; pattern: RegExp }[] = [
  { intent: "medication", pattern: /\b(?:med|meds|medication|medications|adderall|vyvanse|ritalin|stimulants?|ssris?|prescri\w*|refills?|dose|doses|dosage|pills?|xanax|lexapro|zoloft|sertraline|wellbutrin)\b/ },
  {
    intent: "changes",
    pattern:
      /\b(?:cancel\w*|reschedul\w*|refunds?)\b|\b(?:move|change|switch|push)\b(?:\s+\w+){0,3}?\s+(?:visit|appointment|time|date|day)\b|\b(?:a different|another|an earlier|a later|a new) (?:time|day|date)\b/,
  },
  { intent: "cost", pattern: /\b(?:cost|costs|price|how much|pay|fee|fees|charge|charged|expensive|afford|copay|deductible|hsa|fsa)\b/ },
  { intent: "insurance", pattern: /\b(?:insurance|insured|insurer|cover|covers|covered|coverage|in-network|in network|out-of-network|out of network|my plan|aetna|cigna|blue ?cross|blue ?shield|bcbs\w*|united|uhc|oscar|humana|medicare|medicaid|tri ?care|kaiser|ambetter|molina|anthem|well ?care)\b/ },
  { intent: "visits", pattern: /\b(?:video|zoom|camera|in-person|in person|visits?|appointments?|sessions?|therapy|therapist)\b/ },
  { intent: "ai", pattern: /\b(?:ai|bot|robot|human|real person|chatgpt|automated|are you real)\b/ },
  { intent: "privacy", pattern: /\b(?:privacy|private|hipaa|data|share|sell|confidential|secure|employer)\b/ },
  { intent: "timing", pattern: /\b(?:how soon|wait|waitlist|when can|availability|today|this week|tomorrow|how long)\b/ },
  { intent: "clinician", pattern: /\b(?:nurse practitioner|pmhnp|psychiatrist|doctor|clinician|provider|qualified|licensed)\b/ },
];

/** Plans the directory's clinicians take, so Help can't drift from matching. */
const ACCEPTED = Array.from(new Set(CLINICIANS.flatMap((clinician) => clinician.payers)));

/** How patients name the plans; "takes" is decided by ACCEPTED, not by this list. */
const PAYER_NAMES: { name: string; pattern: RegExp }[] = [
  { name: "Aetna", pattern: /\baetna\b/ },
  { name: "Blue Cross Blue Shield of Texas", pattern: /\b(?:blue ?cross|blue ?shield|bcbs\w*)\b/ },
  { name: "Cigna", pattern: /\bcigna\b/ },
  { name: "UnitedHealthcare", pattern: /\b(?:united ?health ?care|united ?health|uhc|united)\b(?! (?:states|kingdom|nations|airlines)\b)/ },
  { name: "Oscar", pattern: /\boscar\b/ },
  { name: "Medicare", pattern: /\bmedicare\b/ },
  { name: "Medicaid", pattern: /\bmedicaid\b/ },
  { name: "Tricare", pattern: /\btri ?care\b/ },
  { name: "Humana", pattern: /\bhumana\b/ },
  { name: "Kaiser", pattern: /\bkaiser\b/ },
  { name: "Ambetter", pattern: /\bambetter\b/ },
  { name: "Molina", pattern: /\bmolina\b/ },
  { name: "Anthem", pattern: /\banthem\b/ },
  { name: "Wellcare", pattern: /\bwell ?care\b/ },
];

const BENEFITS_CHECK = "Once I have your name and birth date, I can confirm your benefits and show your estimated cost before you book.";
const SELF_PAY = "pay yourself: $250 for a first visit and $150 for follow-ups";

/** Yes or no for each plan the patient names, from the same list matching uses. */
function insuranceAnswer(question: string): string {
  const named = PAYER_NAMES.filter((payer) => payer.pattern.test(question)).map((payer) => payer.name);
  if (!named.length)
    return `Legion takes ${joinPhrases(ACCEPTED)}. It can’t accept Medicare or Medicaid yet. ${BENEFITS_CHECK}`;
  const takes = named.filter((name) => ACCEPTED.includes(name));
  const publicPlans = named.filter((name) => !takes.includes(name) && (name === "Medicare" || name === "Medicaid"));
  const others = named.filter((name) => !takes.includes(name) && !publicPlans.includes(name));
  const lines: string[] = [];
  if (takes.length) {
    const yes = others.length || publicPlans.length ? "" : "Yes, ";
    lines.push(`${yes}Legion takes ${joinPhrases(takes)}. I’ll only suggest clinicians in network with your plan. ${BENEFITS_CHECK}`);
  }
  if (others.length) {
    lines.push(`${joinPhrases(others)} ${others.length > 1 ? "aren’t plans" : "isn’t a plan"} Legion takes.`);
    lines.push(takes.length ? `You can also ${SELF_PAY}.` : `Legion takes ${joinPhrases(ACCEPTED)}, or you can ${SELF_PAY}.`);
  }
  if (publicPlans.length)
    lines.push(
      `Legion can’t accept ${joinPhrases(publicPlans, "or")} yet. The member services number on your card can tell you who takes your plan.`,
    );
  return lines.join(" ");
}

/** Grounded in the preview's own stated policies; nothing here is medical advice. */
export function answerQuestion(question: string): GuideAnswer {
  const plain = normalizeText(question);
  // An overdose is a medical emergency before it's anything else, so this runs first.
  if (EMERGENCY.some((pattern) => pattern.test(plain))) {
    return {
      intent: "emergency",
      text: "This can’t wait for your visit. If you think you need the ER, or someone may have taken too much of a medicine or something harmful, call 911 now. Poison Control is at 1-800-222-1222, any time. If you’re having thoughts of suicide, call or text 988.",
      forClinician: false,
    };
  }
  if (mentionsCrisis(question)) {
    return {
      intent: "crisis",
      text: "I’m really glad you told me. If you might act on these thoughts, call or text 988 now, or call 911. You can come back to this anytime.",
      forClinician: false,
    };
  }
  const intent = INTENTS.find((item) => item.pattern.test(plain))?.intent ?? "other";
  const lateChange = "Changing a visit within 48 hours, or missing it, costs $100.";
  const answers: Record<GuideAnswer["intent"], Omit<GuideAnswer, "intent">> = {
    crisis: { text: "", forClinician: false },
    emergency: { text: "", forClinician: false },
    medication: {
      text: "That’s a question for your clinician, and a good one to bring to your first visit. Medication is always their decision, made with you, and never guaranteed. I’ll add it to your visit notes so it doesn’t get lost.",
      forClinician: true,
    },
    cost: {
      text: `Paying yourself, a first visit is $250 and follow-ups are $150. With insurance, I’ll check your plan and show an estimate before you book. You’re charged after each visit, not before. ${lateChange}`,
      forClinician: false,
    },
    insurance: { text: insuranceAnswer(plain), forClinician: false },
    ai: {
      text: "I’m Wren, Legion’s virtual assistant. I’m an AI, not a person. I handle setup, insurance, scheduling and visit prep. Your clinician is a licensed person who makes every medical decision. You can reach the care team through Talk to a person.",
      forClinician: false,
    },
    privacy: {
      text: "What you share here goes to your Legion care team to prepare your care. It isn’t shared with your employer, and this preview stores everything only on this device.",
      forClinician: false,
    },
    timing: {
      text: "You’ll see real open times before you choose anything. I’ll look for times that fit when you’re free.",
      forClinician: false,
    },
    visits: {
      text: `Visits are by video from a private place in Texas. The first one takes about ${FIRST_VISIT_LENGTH} with a psychiatric clinician, focused on understanding what’s going on and making a plan together. Legion focuses on psychiatric care rather than weekly talk therapy.`,
      forClinician: false,
    },
    changes: {
      text: `You can move your visit with Reschedule on your visit card. To cancel, ask the care team through Talk to a person. ${lateChange}`,
      forClinician: false,
    },
    clinician: {
      text: "Your clinician is a licensed psychiatric provider, often a psychiatric nurse practitioner, licensed in Texas. You’ll see their credentials and why I suggested them before you choose.",
      forClinician: false,
    },
    other: {
      text: "I’m not certain about that one, so I won’t guess. I’ll pass it to your clinician, and you can also ask the care team through Talk to a person.",
      forClinician: true,
    },
  };
  return { intent, ...answers[intent] };
}
