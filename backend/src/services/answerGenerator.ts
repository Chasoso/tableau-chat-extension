import type { ChatRequest } from "../types/chat";
import type { TableauAdditionalContext } from "../types/tableau";

export interface AnswerGenerator {
  readonly name: string;
  generate(input: {
    request: ChatRequest;
    prompt: string;
    additionalContext: TableauAdditionalContext;
  }): Promise<string>;
}

export class MockAnswerGenerator implements AnswerGenerator {
  readonly name = "mock";

  async generate(input: {
    request: ChatRequest;
    prompt: string;
    additionalContext: TableauAdditionalContext;
  }): Promise<string> {
    const { dashboardContext } = input.request;
    const worksheetNames = dashboardContext.worksheets.map((worksheet) => worksheet.name);
    const filters = dashboardContext.filters.map((filter) => {
      const values = filter.appliedValues?.length ? filter.appliedValues.join(", ") : "値は未取得";
      return `${filter.worksheetName ? `${filter.worksheetName} / ` : ""}${filter.fieldName}: ${values}`;
    });
    const parameters = dashboardContext.parameters.map((parameter) => {
      const value = parameter.currentValue ?? "値は未取得";
      return `${parameter.name}: ${String(value)}`;
    });
    const frontendDatasourceNames = (dashboardContext.dataSources ?? []).map((datasource) => datasource.name);
    const additionalDatasourceNames = extractNames(input.additionalContext.datasources);
    const datasourceNames = unique([...frontendDatasourceNames, ...additionalDatasourceNames]);
    const metadataSummary = summarizeUnknown(input.additionalContext.metadata);
    const workbookSummary = summarizeUnknown(input.additionalContext.workbook);
    const warnings = input.additionalContext.warnings ?? [];

    return [
      `質問「${input.request.question}」について、取得済みの Tableau コンテキストから分かる範囲で回答します。`,
      "",
      `このダッシュボードは「${dashboardContext.dashboardName}」です。${
        dashboardContext.workbookName ? `ワークブックは「${dashboardContext.workbookName}」です。` : "ワークブック名は取得できていません。"
      }`,
      worksheetNames.length
        ? `含まれるワークシートは ${worksheetNames.length} 個です: ${worksheetNames.join(", ")}。`
        : "ワークシート情報は取得できていません。",
      filters.length
        ? `現在確認できるフィルターは ${filters.join("; ")} です。`
        : "現在適用されているフィルターは取得できていません。",
      parameters.length
        ? `パラメーターは ${parameters.join("; ")} です。`
        : "パラメーターは取得できていません。",
      datasourceNames.length
        ? `関連するデータソース候補は ${datasourceNames.join(", ")} です。`
        : "関連データソース名は取得できていません。",
      workbookSummary ? `追加のワークブック情報: ${workbookSummary}` : "",
      metadataSummary ? `追加メタデータ: ${metadataSummary}` : "",
      `追加コンテキストは ${input.additionalContext.provider} プロバイダーから取得しました。`,
      warnings.length ? `注意: ${warnings.join(" ")}` : "",
      "この回答は、現時点で取得済みのメタデータに基づく要約です。行レベルの詳細、未取得の計算式、権限外の情報、LLMによる推論が必要な内容はこの段階では分かりません。",
    ]
      .filter(Boolean)
      .join("\n");
  }
}

function extractNames(values: unknown[] | undefined): string[] {
  return (values ?? [])
    .flatMap((value) => findNameValues(value))
    .filter(Boolean)
    .slice(0, 12);
}

function findNameValues(value: unknown): string[] {
  if (!value || typeof value !== "object") {
    return [];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item) => findNameValues(item));
  }

  const record = value as Record<string, unknown>;
  const directName = typeof record.name === "string" ? [record.name] : [];
  return [
    ...directName,
    ...Object.values(record)
      .filter((item) => item && typeof item === "object")
      .flatMap((item) => findNameValues(item)),
  ];
}

function summarizeUnknown(value: unknown): string {
  if (!value) {
    return "";
  }

  if (typeof value === "string") {
    return value.slice(0, 240);
  }

  if (typeof value === "object") {
    const names = findNameValues(value).slice(0, 8);
    if (names.length) {
      return `名称候補: ${unique(names).join(", ")}`;
    }

    return "構造化メタデータを取得しましたが、このPoC回答では詳細展開していません。";
  }

  return String(value);
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}
