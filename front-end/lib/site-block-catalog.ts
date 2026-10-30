export type SiteBlockPage = "home" | "about" | "contact";
export type SiteBlockKind = "text" | "email" | "phone";

export type SiteBlockDefinition = {
  page: SiteBlockPage;
  key: string;
  namespace: SiteBlockPage;
  catalogKey: string;
  labelKey: string;
  kind?: SiteBlockKind;
  maxLength?: number;
};

const definitions: SiteBlockDefinition[] = [
  ...[
    ["hero_eyebrow", "eyebrow", "homeHeroEyebrow"],
    ["hero_title", "title", "homeHeroTitle"],
    ["hero_intro", "intro", "homeHeroIntro"],
    ["hero_shared", "shared", "homeSharedEyebrow"],
    ["hero_thrive", "thrive", "homeThriveHeading"],
    ["hero_one", "one", "homeOneHeading"],
    ["hero_one_text", "oneText", "homeOneText"],
    ["how_eyebrow", "how", "homeHowEyebrow"],
    ["how_title", "useful", "homeHowTitle"],
    ["how_intro", "howText", "homeHowIntro"],
    ["connect_title", "connect", "homeConnectTitle"],
    ["connect_text", "connectText", "homeConnectText"],
    ["learn_title", "learn", "homeLearnTitle"],
    ["learn_text", "learnText", "homeLearnText"],
    ["act_title", "act", "homeActTitle"],
    ["act_text", "actText", "homeActText"],
    ["stat_people", "people", "homePeopleStat"],
    ["stat_ways", "ways", "homeWaysStat"],
    ["stat_ideas", "ideas", "homeIdeasStat"],
    ["stat_progress", "progress", "homeProgressStat"],
    ["coming_eyebrow", "coming", "homeComingEyebrow"],
    ["coming_title", "join", "homeComingTitle"],
    ["no_events_text", "noEvents", "homeNoEvents"],
    ["stories_eyebrow", "stories", "homeStoriesEyebrow"],
    ["stories_title", "storiesTitle", "homeStoriesTitle"],
    ["no_posts_text", "noPosts", "homeNoPosts"],
    ["cta_title", "cta", "homeCtaTitle"],
  ].map(([key, catalogKey, labelKey]) => ({
    page: "home" as const,
    key: key!,
    namespace: "home" as const,
    catalogKey: catalogKey!,
    labelKey: labelKey!,
  })),
  ...[
    ["hero_eyebrow", "eyebrow", "aboutHeroEyebrow"],
    ["hero_title", "title", "aboutHeroTitle"],
    ["hero_intro", "intro", "aboutHeroIntro"],
    ["values_eyebrow", "guides", "aboutValuesEyebrow"],
    ["values_title", "shared", "aboutValuesTitle"],
    ["values_first", "p1", "aboutValuesFirst"],
    ["values_second", "p2", "aboutValuesSecond"],
    ["approach_eyebrow", "approach", "aboutApproachEyebrow"],
    ["approach_title", "grounded", "aboutApproachTitle"],
    ["approach_intro", "approachText", "aboutApproachIntro"],
    ["accessible_title", "accessible", "aboutAccessibleTitle"],
    ["accessible_text", "accessibleText", "aboutAccessibleText"],
    ["practical_title", "practical", "aboutPracticalTitle"],
    ["practical_text", "practicalText", "aboutPracticalText"],
    ["collaborative_title", "collaborative", "aboutCollaborativeTitle"],
    ["collaborative_text", "collaborativeText", "aboutCollaborativeText"],
    ["cta_title", "cta", "aboutCtaTitle"],
  ].map(([key, catalogKey, labelKey]) => ({
    page: "about" as const,
    key: key!,
    namespace: "about" as const,
    catalogKey: catalogKey!,
    labelKey: labelKey!,
  })),
  ...[
    ["hero_eyebrow", "eyebrow", "contactHeroEyebrow"],
    ["hero_title", "title", "contactHeroTitle"],
    ["hero_intro", "intro", "contactHeroIntro"],
    ["expect_eyebrow", "expect", "contactExpectEyebrow"],
    ["reply_title", "reply", "contactReplyTitle"],
    ["reply_text", "replyText", "contactReplyText"],
    ["email_heading", "email", "contactEmailHeading"],
    ["email_invite", "emailText", "contactEmailInvite"],
    ["form_eyebrow", "say", "contactFormEyebrow"],
    ["form_title", "formTitle", "contactFormTitle"],
    ["form_help", "help", "contactFormHelp"],
  ].map(([key, catalogKey, labelKey]) => ({
    page: "contact" as const,
    key: key!,
    namespace: "contact" as const,
    catalogKey: catalogKey!,
    labelKey: labelKey!,
  })),
  {
    page: "contact",
    key: "email_address",
    namespace: "contact",
    catalogKey: "emailAddress",
    labelKey: "contactEmailAddress",
    kind: "email",
    maxLength: 254,
  },
  {
    page: "contact",
    key: "address",
    namespace: "contact",
    catalogKey: "",
    labelKey: "contactAddress",
    maxLength: 500,
  },
  {
    page: "contact",
    key: "office_hours",
    namespace: "contact",
    catalogKey: "",
    labelKey: "contactOfficeHours",
    maxLength: 500,
  },
  {
    page: "contact",
    key: "phone",
    namespace: "contact",
    catalogKey: "",
    labelKey: "contactPhone",
    kind: "phone",
    maxLength: 40,
  },
];

export const siteBlockCatalog = definitions;

export function getSiteBlockText(
  items: Array<{ key: string; text: string }> | undefined,
  key: string,
  defaultText: string,
): string {
  const saved = items?.find((item) => item.key === key)?.text;
  return saved?.trim() ? saved : defaultText;
}
