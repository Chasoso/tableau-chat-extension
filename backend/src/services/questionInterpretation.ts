import { parseQuestionPeriod } from "../utils/questionPeriod";
import type {
  DashboardContext,
  QuestionGroupingIntent,
  QuestionInterpretation,
  QuestionMetricIntent,
} from "../types/tableau";

const WHITESPACE_PATTERN = /\s+/g;
const JAPANESE_RANKING = "\u30e9\u30f3\u30ad\u30f3\u30b0";
const JAPANESE_RANK = "\u9806\u4f4d";
const JAPANESE_TOP = "\u4e0a\u4f4d";
const JAPANESE_MOST = "\u6700\u3082";
const JAPANESE_MOST_COUNT = "\u6700\u591a";
const JAPANESE_VIZ = "\u30d3\u30ba";
const JAPANESE_WORKBOOK = "\u30ef\u30fc\u30af\u30d6\u30c3\u30af";
const JAPANESE_DASHBOARD = "\u30c0\u30c3\u30b7\u30e5\u30dc\u30fc\u30c9";
const JAPANESE_AUTHOR = "\u8457\u8005";
const JAPANESE_POSTER = "\u6295\u7a3f\u8005";
const JAPANESE_USER = "\u30e6\u30fc\u30b6\u30fc";
const JAPANESE_DATASOURCE = "\u30c7\u30fc\u30bf\u30bd\u30fc\u30b9";
const JAPANESE_VIEW = "\u30d3\u30e5\u30fc";
const JAPANESE_VIEW_COUNT = "\u30d3\u30e5\u30fc\u6570";
const JAPANESE_BROWSE = "\u95b2\u89a7";
const JAPANESE_PLAY = "\u518d\u751f";
const JAPANESE_FAVORITE = "Favorite";
const JAPANESE_FAVORITE_ALT = "\u304a\u6c17\u306b\u5165\u308a";
const JAPANESE_BOOKMARK = "\u30d6\u30c3\u30af\u30de\u30fc\u30af";
const JAPANESE_REACTION = "\u30ea\u30a2\u30af\u30b7\u30e7\u30f3";
const JAPANESE_LOVE = "\u3044\u3044\u306d";

const EXPLICIT_TOP_N_PATTERNS = [
  /top\s*(\d{1,2})/i,
  new RegExp(
    `${JAPANESE_TOP}\\s*(\\d{1,2})\\s*(?:\\u4ef6|${JAPANESE_RANK}|\\u307e\\u3067)?`,
    "u",
  ),
  new RegExp(
    `(\\d{1,2})\\s*(?:${JAPANESE_RANK}|\\u4ef6)\\s*\\u307e\\u3067`,
    "u",
  ),
  new RegExp(`(\\d{1,2})\\s*\\u4ef6`, "u"),
];

const RANKING_KEYWORDS = [
  JAPANESE_RANKING,
  JAPANESE_RANK,
  JAPANESE_TOP,
  JAPANESE_MOST,
  JAPANESE_MOST_COUNT,
  "top",
  "rank",
  "ranking",
  "most",
  "highest",
];

const GROUPING_KEYWORDS: Record<QuestionGroupingIntent, string[]> = {
  viz: [
    JAPANESE_VIZ,
    JAPANESE_WORKBOOK,
    JAPANESE_DASHBOARD,
    "viz",
    "workbook",
    "dashboard",
    "title",
  ],
  author: [
    JAPANESE_AUTHOR,
    JAPANESE_POSTER,
    JAPANESE_USER,
    "author",
    "creator",
    "poster",
    "profile",
  ],
  datasource: [JAPANESE_DATASOURCE, "datasource", "data source"],
  dashboard: [JAPANESE_DASHBOARD, "dashboard"],
  unknown: [],
};

const METRIC_INTENT_KEYWORDS: Record<
  Exclude<QuestionMetricIntent, "unknown">,
  string[]
> = {
  views: [
    "view",
    "views",
    JAPANESE_VIEW,
    JAPANESE_VIEW_COUNT,
    JAPANESE_BROWSE,
    `${JAPANESE_BROWSE}\u6570`,
    JAPANESE_PLAY,
  ],
  favorites: [
    "favorite",
    "favorites",
    "favourite",
    JAPANESE_FAVORITE_ALT,
    `${JAPANESE_FAVORITE}\u6570`,
    "favorite count",
  ],
  bookmarks: [
    "bookmark",
    "bookmarks",
    JAPANESE_BOOKMARK,
    `${JAPANESE_BOOKMARK}\u6570`,
  ],
  reactions: [
    "reaction",
    "reactions",
    JAPANESE_REACTION,
    `${JAPANESE_REACTION}\u6570`,
  ],
  love: ["love", "likes", JAPANESE_LOVE, `${JAPANESE_LOVE}\u6570`],
};

export function interpretQuestion(input: {
  question: string;
  dashboardContext: DashboardContext;
  preferredDatasourceName?: string;
}): QuestionInterpretation {
  const datasourceMentions = findDatasourceMentions(
    input.question,
    input.dashboardContext,
  );
  const datasourceName =
    selectDatasourceName(
      datasourceMentions,
      input.preferredDatasourceName,
      input.dashboardContext,
    ) ?? input.preferredDatasourceName;
  const sanitizedQuestion = sanitizeQuestionForInterpretation(
    input.question,
    datasourceMentions,
  );
  const investigationQuestion =
    sanitizedQuestion.trim() || input.question.trim();
  const explicitTopN =
    readExplicitTopN(input.question) ?? readExplicitTopN(investigationQuestion);
  const period =
    parseQuestionPeriod(investigationQuestion, {
      referenceDate: input.dashboardContext.capturedAt,
    }) ??
    parseQuestionPeriod(input.question, {
      referenceDate: input.dashboardContext.capturedAt,
    });
  const metricIntent = chooseKnownMetricIntent(
    detectMetricIntent(input.question),
    detectMetricIntent(investigationQuestion),
  );
  const asksForRanking =
    detectRankingIntent(input.question) ||
    detectRankingIntent(investigationQuestion) ||
    typeof explicitTopN === "number";
  const topN = inferRequestedTopN(explicitTopN, asksForRanking);
  const groupingIntent = chooseKnownGroupingIntent(
    detectGroupingIntent(input.question),
    detectGroupingIntent(investigationQuestion),
  );

  return {
    originalQuestion: input.question,
    investigationQuestion,
    ...(datasourceName ? { datasourceName } : {}),
    datasourceMentions,
    metricIntent,
    asksForRanking,
    topN,
    ...(groupingIntent !== "unknown" ? { groupingIntent } : {}),
    ...(explicitTopN ? { topNExplicitlyRequested: true } : {}),
    ...(period ? { period } : {}),
  };
}

export function detectMetricIntent(question: string): QuestionMetricIntent {
  const normalized = normalizeQuestionForIntent(question);
  for (const [intent, keywords] of Object.entries(
    METRIC_INTENT_KEYWORDS,
  ) as Array<[Exclude<QuestionMetricIntent, "unknown">, string[]]>) {
    if (
      keywords.some((keyword) =>
        normalized.includes(normalizeQuestionForIntent(keyword)),
      )
    ) {
      return intent;
    }
  }

  return "unknown";
}

export function detectRankingIntent(question: string): boolean {
  const normalized = normalizeQuestionForIntent(question);
  return RANKING_KEYWORDS.some((keyword) =>
    normalized.includes(normalizeQuestionForIntent(keyword)),
  );
}

export function inferRequestedTopN(
  questionOrExplicitTopN: string | number | undefined,
  asksForRanking: boolean,
): number {
  const explicitTopN =
    typeof questionOrExplicitTopN === "number"
      ? questionOrExplicitTopN
      : readExplicitTopN(questionOrExplicitTopN);
  return explicitTopN ?? (asksForRanking ? 10 : 1);
}

export function detectGroupingIntent(question: string): QuestionGroupingIntent {
  const normalized = normalizeQuestionForIntent(question);
  for (const [intent, keywords] of Object.entries(GROUPING_KEYWORDS) as Array<
    [QuestionGroupingIntent, string[]]
  >) {
    if (
      intent !== "unknown" &&
      keywords.some((keyword) =>
        normalized.includes(normalizeQuestionForIntent(keyword)),
      )
    ) {
      return intent;
    }
  }

  return "unknown";
}

export function metricIntentLabel(intent: QuestionMetricIntent): string {
  switch (intent) {
    case "views":
      return `${JAPANESE_VIEW}\u6570`;
    case "favorites":
      return `${JAPANESE_FAVORITE}\u6570`;
    case "bookmarks":
      return `${JAPANESE_BOOKMARK}\u6570`;
    case "reactions":
      return `${JAPANESE_REACTION}\u6570`;
    case "love":
      return `${JAPANESE_LOVE}\u6570`;
    default:
      return "\u6307\u6a19";
  }
}

export function matchesMetricFieldIntent(
  fieldName: string | undefined,
  intent: QuestionMetricIntent,
): boolean {
  if (!fieldName) {
    return false;
  }

  if (intent === "unknown") {
    return true;
  }

  const normalizedFieldName = normalizeQuestionForIntent(fieldName);
  return METRIC_INTENT_KEYWORDS[intent].some((keyword) =>
    normalizedFieldName.includes(normalizeQuestionForIntent(keyword)),
  );
}

function findDatasourceMentions(
  question: string,
  dashboardContext: DashboardContext,
): string[] {
  const datasourceNames =
    dashboardContext.dataSources
      ?.map((datasource) => datasource.name.trim())
      .filter(Boolean) ?? [];

  return datasourceNames
    .sort((left, right) => right.length - left.length)
    .filter((name) => question.includes(name));
}

function selectDatasourceName(
  datasourceMentions: string[],
  preferredDatasourceName: string | undefined,
  dashboardContext: DashboardContext,
): string | undefined {
  if (
    preferredDatasourceName &&
    datasourceMentions.some((name) => name === preferredDatasourceName)
  ) {
    return preferredDatasourceName;
  }

  if (datasourceMentions.length) {
    return datasourceMentions[0];
  }

  if (preferredDatasourceName) {
    return preferredDatasourceName;
  }

  return dashboardContext.dataSources?.[0]?.name?.trim() || undefined;
}

function sanitizeQuestionForInterpretation(
  question: string,
  datasourceMentions: string[],
): string {
  let sanitized = question;
  for (const datasourceName of datasourceMentions) {
    sanitized = sanitized.split(datasourceName).join(" ");
  }

  return sanitized
    .replace(/["'`]/g, " ")
    .replace(WHITESPACE_PATTERN, " ")
    .replace(/\s+([,.!?])/g, "$1")
    .trim();
}

function readExplicitTopN(question: string | undefined): number | undefined {
  if (!question) {
    return undefined;
  }

  for (const pattern of EXPLICIT_TOP_N_PATTERNS) {
    const match = question.match(pattern);
    if (!match?.[1]) {
      continue;
    }

    const value = Number.parseInt(match[1], 10);
    if (Number.isFinite(value) && value > 0) {
      return value;
    }
  }

  return undefined;
}

function normalizeQuestionForIntent(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[(){}\[\]<>]/g, " ")
    .replace(/[\\/_,.:;!?-]/g, " ")
    .replace(WHITESPACE_PATTERN, " ")
    .trim();
}

function chooseKnownMetricIntent(
  ...candidates: QuestionMetricIntent[]
): QuestionMetricIntent {
  return candidates.find((candidate) => candidate !== "unknown") ?? "unknown";
}

function chooseKnownGroupingIntent(
  ...candidates: QuestionGroupingIntent[]
): QuestionGroupingIntent {
  return candidates.find((candidate) => candidate !== "unknown") ?? "unknown";
}
