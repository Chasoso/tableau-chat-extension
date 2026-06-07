import { parseQuestionPeriod } from "../utils/questionPeriod";
import type {
  DashboardContext,
  QuestionGroupingIntent,
  QuestionInterpretation,
  QuestionMetricIntent,
  QuestionRequestType,
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
const JAPANESE_FIELDS = "\u30d5\u30a3\u30fc\u30eb\u30c9";
const JAPANESE_LIST = "\u4e00\u89a7";
const JAPANESE_TELL_ME = "\u6559\u3048\u3066";
const JAPANESE_WHAT = "\u4f55";
const JAPANESE_WHICH = "\u3069\u306e";
const JAPANESE_USED = "\u4f7f\u308f\u308c\u3066\u3044\u308b";
const JAPANESE_USING = "\u4f7f\u3063\u3066\u3044\u308b";
const JAPANESE_IN_USE = "\u4f7f\u7528\u3057\u3066\u3044\u308b";
const JAPANESE_SCHEMA = "\u30b9\u30ad\u30fc\u30de";
const JAPANESE_COLUMN = "\u5217";
const JAPANESE_METADATA = "\u30e1\u30bf\u30c7\u30fc\u30bf";
const JAPANESE_VIEW = "\u30d3\u30e5\u30fc";
const JAPANESE_VIEW_COUNT = "\u30d3\u30e5\u30fc\u6570";
const JAPANESE_BROWSE = "\u95b2\u89a7";
const JAPANESE_PLAY = "\u518d\u751f";
const JAPANESE_FAVORITE = "Favorite";
const JAPANESE_FAVORITE_ALT = "\u304a\u6c17\u306b\u5165\u308a";
const JAPANESE_BOOKMARK = "\u30d6\u30c3\u30af\u30de\u30fc\u30af";
const JAPANESE_REACTION = "\u30ea\u30a2\u30af\u30b7\u30e7\u30f3";
const JAPANESE_LOVE = "\u3044\u3044\u306d";
const JAPANESE_COUNT = "\u6570";
const JAPANESE_ITEM_COUNT = "\u4ef6\u6570";
const JAPANESE_RATE = "\u7387";
const JAPANESE_TRANSITION = "\u63a8\u79fb";
const JAPANESE_TOTAL = "\u5408\u8a08";
const JAPANESE_AVERAGE = "\u5e73\u5747";
const JAPANESE_MANY = "\u591a\u3044";
const JAPANESE_FEW = "\u5c11\u306a\u3044";
const JAPANESE_EXISTS = "\u3042\u308a\u307e\u3059\u304b";
const JAPANESE_COMPARISON = "\u6bd4\u8f03";
const JAPANESE_INCREASE_DECREASE = "\u5897\u6e1b";

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
  const requestType = detectQuestionRequestType({
    originalQuestion: input.question,
    sanitizedQuestion: investigationQuestion,
    metricIntent,
    asksForRanking,
    hasPeriod: Boolean(period),
  });

  return {
    originalQuestion: input.question,
    investigationQuestion,
    ...(datasourceName ? { datasourceName } : {}),
    datasourceMentions,
    requestType: requestType.requestType,
    ...(typeof requestType.confidence === "number"
      ? { requestTypeConfidence: requestType.confidence }
      : {}),
    ...(requestType.signals.length
      ? { requestTypeSignals: requestType.signals }
      : {}),
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
      keywords.some((keyword) => containsNormalizedKeyword(normalized, keyword))
    ) {
      return intent;
    }
  }

  return "unknown";
}

export function detectRankingIntent(question: string): boolean {
  const normalized = normalizeQuestionForIntent(question);
  return RANKING_KEYWORDS.some((keyword) =>
    containsNormalizedKeyword(normalized, keyword),
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
      keywords.some((keyword) => containsNormalizedKeyword(normalized, keyword))
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
    containsNormalizedKeyword(normalizedFieldName, keyword),
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
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .toLowerCase()
    .replace(/[(){}\[\]<>]/g, " ")
    .replace(/[\\/_,.:;!?-]/g, " ")
    .replace(WHITESPACE_PATTERN, " ")
    .trim();
}

function containsNormalizedKeyword(
  normalizedQuestion: string,
  keyword: string,
): boolean {
  const normalizedKeyword = normalizeQuestionForIntent(keyword);
  if (!normalizedKeyword) {
    return false;
  }

  const hasAsciiLetterOrDigit = /[a-z0-9]/i.test(normalizedKeyword);
  if (!hasAsciiLetterOrDigit) {
    return normalizedQuestion.includes(normalizedKeyword);
  }

  const paddedQuestion = ` ${normalizedQuestion} `;
  const paddedKeyword = ` ${normalizedKeyword} `;
  if (normalizedKeyword.includes(" ")) {
    return paddedQuestion.includes(paddedKeyword);
  }

  const escapedKeyword = normalizedKeyword.replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&",
  );
  const boundaryPattern = new RegExp(
    `(^|[^a-z0-9])${escapedKeyword}(?=$|[^a-z0-9])`,
    "i",
  );
  return boundaryPattern.test(normalizedQuestion);
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

function detectQuestionRequestType(input: {
  originalQuestion: string;
  sanitizedQuestion: string;
  metricIntent: QuestionMetricIntent;
  asksForRanking: boolean;
  hasPeriod: boolean;
}): {
  requestType: QuestionRequestType;
  confidence: number;
  signals: string[];
} {
  const signals: string[] = [];

  if (input.metricIntent !== "unknown" || input.asksForRanking) {
    if (input.metricIntent !== "unknown") {
      signals.push("metric_intent_detected");
    }
    if (input.asksForRanking) {
      signals.push("ranking_detected");
    }
    return { requestType: "general", confidence: 0.98, signals };
  }

  const normalized = normalizeQuestionForIntent(input.originalQuestion);
  const sanitized = normalizeQuestionForIntent(input.sanitizedQuestion);
  const combined = `${normalized} ${sanitized}`;

  const datasourceInventoryKeywords = [
    JAPANESE_DATASOURCE,
    "datasource",
    "data source",
  ];
  const fieldInventoryKeywords = [
    JAPANESE_FIELDS,
    JAPANESE_SCHEMA,
    JAPANESE_COLUMN,
    JAPANESE_METADATA,
    "field",
    "fields",
    "column",
    "columns",
    "schema",
    "metadata",
  ];
  const analysisLikeKeywords = [
    JAPANESE_COUNT,
    JAPANESE_ITEM_COUNT,
    JAPANESE_RATE,
    JAPANESE_TRANSITION,
    JAPANESE_TOTAL,
    JAPANESE_AVERAGE,
    JAPANESE_MANY,
    JAPANESE_FEW,
    JAPANESE_EXISTS,
    JAPANESE_COMPARISON,
    JAPANESE_INCREASE_DECREASE,
    "count",
    "counts",
    "rate",
    "rates",
    "trend",
    "total",
    "sum",
    "average",
    "avg",
    "compare",
    "growth",
    "increase",
    "decrease",
    "how many",
  ];

  const hasDatasourceKeyword = datasourceInventoryKeywords.some((keyword) =>
    containsNormalizedKeyword(combined, keyword),
  );
  const hasFieldKeyword = fieldInventoryKeywords.some((keyword) =>
    containsNormalizedKeyword(combined, keyword),
  );
  const hasPromptingKeyword = [
    JAPANESE_LIST,
    JAPANESE_TELL_ME,
    JAPANESE_WHAT,
    JAPANESE_WHICH,
    "show",
    "tell me",
    "what",
    "which",
    "list",
  ].some((keyword) => containsNormalizedKeyword(combined, keyword));
  const hasAnalysisLikeSignal =
    input.hasPeriod ||
    analysisLikeKeywords.some((keyword) =>
      containsNormalizedKeyword(combined, keyword),
    );
  const hasExplicitDatasourceInventoryPhrase = [
    `${JAPANESE_USED}${JAPANESE_DATASOURCE}`,
    `${JAPANESE_USING}${JAPANESE_DATASOURCE}`,
    `${JAPANESE_IN_USE}${JAPANESE_DATASOURCE}`,
    `${JAPANESE_DATASOURCE}${JAPANESE_LIST}`,
    `${JAPANESE_DATASOURCE}\u3092${JAPANESE_TELL_ME}`,
    `${JAPANESE_WHICH}${JAPANESE_DATASOURCE}`,
    `${JAPANESE_WHAT}${JAPANESE_DATASOURCE}`,
    "which datasource",
    "which data source",
    "what datasource",
    "what data source",
    "datasource used",
    "data source used",
    "used datasource",
    "used data source",
    "show datasource",
    "list datasource",
    "list data source",
  ].some((keyword) => containsNormalizedKeyword(combined, keyword));

  if (input.hasPeriod) {
    signals.push("period_detected");
  }
  if (hasAnalysisLikeSignal) {
    signals.push("analysis_like_signal");
  }
  if (hasDatasourceKeyword) {
    signals.push("datasource_keyword");
  }
  if (hasExplicitDatasourceInventoryPhrase) {
    signals.push("explicit_datasource_inventory_phrase");
  }
  if (hasFieldKeyword) {
    signals.push("field_keyword");
  }
  if (hasPromptingKeyword) {
    signals.push("prompting_keyword");
  }

  if (hasAnalysisLikeSignal) {
    return { requestType: "general", confidence: 0.9, signals };
  }

  const mentionsDatasourceInventory =
    hasExplicitDatasourceInventoryPhrase ||
    (hasDatasourceKeyword &&
      hasPromptingKeyword &&
      !hasFieldKeyword &&
      !hasAnalysisLikeSignal);

  if (mentionsDatasourceInventory) {
    return { requestType: "datasource_inventory", confidence: 0.96, signals };
  }

  const mentionsFieldInventory =
    hasFieldKeyword &&
    (hasDatasourceKeyword ||
      hasPromptingKeyword ||
      /schema|metadata/.test(combined));
  if (mentionsFieldInventory) {
    return { requestType: "field_inventory", confidence: 0.95, signals };
  }

  return { requestType: "general", confidence: 0.6, signals };
}
