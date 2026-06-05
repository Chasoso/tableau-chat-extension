import { parseQuestionPeriod } from "../utils/questionPeriod";
import type {
  DashboardContext,
  QuestionInterpretation,
  QuestionMetricIntent,
} from "../types/tableau";

const DATASOURCE_LITERAL_SEPARATOR_PATTERN = /\s+/g;

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
  const period =
    parseQuestionPeriod(investigationQuestion, {
      referenceDate: input.dashboardContext.capturedAt,
    }) ??
    parseQuestionPeriod(input.question, {
      referenceDate: input.dashboardContext.capturedAt,
    });
  const metricIntent = detectMetricIntent(investigationQuestion);
  const asksForRanking = detectRankingIntent(investigationQuestion);
  const topN = inferRequestedTopN(investigationQuestion, asksForRanking);

  return {
    originalQuestion: input.question,
    investigationQuestion,
    ...(datasourceName ? { datasourceName } : {}),
    datasourceMentions,
    metricIntent,
    asksForRanking,
    topN,
    ...(period ? { period } : {}),
  };
}

export function detectMetricIntent(question: string): QuestionMetricIntent {
  const normalized = question.toLowerCase();
  if (/(view|閲覧|再生)/i.test(normalized)) {
    return "views";
  }
  if (/(favorite|favourite|お気に入り)/i.test(normalized)) {
    return "favorites";
  }
  if (/(bookmark|ブックマーク)/i.test(normalized)) {
    return "bookmarks";
  }
  if (/(reaction|リアクション)/i.test(normalized)) {
    return "reactions";
  }
  if (/(love|いいね)/i.test(normalized)) {
    return "love";
  }

  return "unknown";
}

export function metricIntentLabel(intent: QuestionMetricIntent): string {
  switch (intent) {
    case "views":
      return "View数";
    case "favorites":
      return "Favorite数";
    case "bookmarks":
      return "Bookmark数";
    case "reactions":
      return "Reaction数";
    case "love":
      return "Love数";
    default:
      return "集計値";
  }
}

export function matchesMetricFieldIntent(
  fieldName: string | undefined,
  intent: QuestionMetricIntent,
): boolean {
  if (!fieldName) {
    return false;
  }

  const normalized = fieldName.toLowerCase();
  switch (intent) {
    case "views":
      return /(view|閲覧)/i.test(normalized);
    case "favorites":
      return /(favorite|favourite|お気に入り)/i.test(normalized);
    case "bookmarks":
      return /(bookmark|ブックマーク)/i.test(normalized);
    case "reactions":
      return /(reaction|リアクション)/i.test(normalized);
    case "love":
      return /(love|いいね)/i.test(normalized);
    case "unknown":
      return true;
  }
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
    .replace(/[「」"'`]/g, " ")
    .replace(DATASOURCE_LITERAL_SEPARATOR_PATTERN, " ")
    .replace(/\s+([、。,.!?])/g, "$1")
    .trim();
}

function detectRankingIntent(question: string): boolean {
  return /ランキング|rank(?:ing)?|上位|一覧|list|most|highest|top|最大|最多|最も/i.test(
    question,
  );
}

function inferRequestedTopN(question: string, asksForRanking: boolean): number {
  const explicitTop =
    question.match(/top\s*(\d{1,2})/i) ?? question.match(/上位\s*(\d{1,2})/);
  if (explicitTop?.[1]) {
    return Math.max(1, Math.min(50, Number.parseInt(explicitTop[1], 10)));
  }

  if (asksForRanking) {
    return 10;
  }

  return 1;
}
