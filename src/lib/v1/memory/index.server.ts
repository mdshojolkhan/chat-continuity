/**
 * Default memory implementation: in-process, per-server-instance.
 *
 * Swap `longTermMemory` for a database-backed implementation later; the
 * orchestrator only depends on the interfaces in `./store`.
 */
import type { ChatMessage } from "../types";
import {
  SHORT_TERM_MAX_MESSAGES,
  type LongTermMemory,
  type LongTermMemoryRecord,
  type ShortTermMemory,
} from "./store";

const conversations = new Map<string, ChatMessage[]>();

export const shortTermMemory: ShortTermMemory = {
  window(conversationId, incoming) {
    const stored = conversations.get(conversationId) ?? [];
    const merged = incoming.length > 0 ? incoming : stored;
    return merged.slice(-SHORT_TERM_MAX_MESSAGES);
  },
  append(conversationId, message) {
    const stored = conversations.get(conversationId) ?? [];
    stored.push(message);
    conversations.set(
      conversationId,
      stored.slice(-SHORT_TERM_MAX_MESSAGES * 2),
    );
  },
  clear(conversationId) {
    conversations.delete(conversationId);
  },
};

const longTermRecords = new Map<string, LongTermMemoryRecord[]>();

export const longTermMemory: LongTermMemory = {
  async list(ownerId) {
    return longTermRecords.get(ownerId) ?? [];
  },
  async remember(ownerId, text) {
    const record: LongTermMemoryRecord = {
      id: crypto.randomUUID(),
      text,
      createdAt: new Date().toISOString(),
    };
    const existing = longTermRecords.get(ownerId) ?? [];
    longTermRecords.set(ownerId, [...existing, record].slice(-200));
    return record;
  },
  async forget(ownerId, id) {
    const existing = longTermRecords.get(ownerId) ?? [];
    longTermRecords.set(
      ownerId,
      existing.filter((record) => record.id !== id),
    );
  },
};

export type { LongTermMemory, ShortTermMemory, LongTermMemoryRecord };
