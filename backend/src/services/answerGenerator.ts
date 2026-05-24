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
    const worksheetCount = input.request.dashboardContext.worksheets.length;
    return `このPoCでは、まだLLMには接続していません。受け取ったダッシュボードには ${worksheetCount} 個のワークシートがあり、質問は「${input.request.question}」でした。追加コンテキストは ${input.additionalContext.provider} プロバイダーから取得する設計です。`;
  }
}

