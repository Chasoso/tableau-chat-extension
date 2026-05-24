import { PutItemCommand } from "@aws-sdk/client-dynamodb";
import { marshall } from "@aws-sdk/util-dynamodb";
import { getConfig } from "../config";
import { getDynamoDbClient } from "../aws/dynamodb";
import type { ChatHistoryRecord } from "../types/chat";

export interface ChatHistoryRepository {
  save(record: ChatHistoryRecord): Promise<void>;
}

export class InMemoryChatHistoryRepository implements ChatHistoryRepository {
  private readonly records: ChatHistoryRecord[] = [];

  async save(record: ChatHistoryRecord): Promise<void> {
    this.records.push(record);
  }

  getAll(): ChatHistoryRecord[] {
    return [...this.records];
  }
}

export class DynamoDbChatHistoryRepository implements ChatHistoryRepository {
  constructor(private readonly tableName: string) {}

  async save(record: ChatHistoryRecord): Promise<void> {
    await getDynamoDbClient().send(
      new PutItemCommand({
        TableName: this.tableName,
        Item: marshall({
          pk: `SESSION#${record.sessionId}`,
          sk: `MESSAGE#${record.createdAt}#${record.messageId}`,
          ...record,
        }),
      }),
    );
  }
}

const inMemoryRepository = new InMemoryChatHistoryRepository();

export function createChatHistoryRepository(): ChatHistoryRepository {
  const config = getConfig();
  if (config.useInMemoryRepository) {
    return inMemoryRepository;
  }

  if (!config.chatHistoryTableName) {
    throw new Error("CHAT_HISTORY_TABLE_NAME is required when USE_IN_MEMORY_REPOSITORY=false.");
  }

  return new DynamoDbChatHistoryRepository(config.chatHistoryTableName);
}

