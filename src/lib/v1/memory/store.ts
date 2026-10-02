/**
 * Memory contracts.
 *
 * Short-term memory = the rolling conversation window used for a single turn.
 * Long-term memory   = durable facts the user asked V1 to remember.
 *
 * Both are behind interfaces so the current in-process implementation can be
 * swapped for a database or on-device store without touching the orchestrator.
 */
import type { ChatMessage } from "../types";

export type ShortTermMemory = {
  /** Messages that fit in the model context, oldest first. */
  window(conversationId: string, incoming: ChatMessage[]): ChatMessage[];
  append(conversationId: string, message: ChatMessage): void;
  clear(conversationId: string): void;
};

export type LongTermMemoryRecord = {
  id: string;
  text: string;
  createdAt: string;
};

export type LongTermMemory = {
  list(ownerId: string): Promise<LongTermMemoryRecord[]>;
  remember(ownerId: string, text: string): Promise<LongTermMemoryRecord>;
  forget(ownerId: string, id: string): Promise<void>;
};

export const SHORT_TERM_MAX_MESSAGES = 20;
