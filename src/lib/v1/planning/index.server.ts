/**
 * Task planning store.
 *
 * A plan is an ordered list of steps V1 keeps for a conversation so a
 * multi-step request stays visible and auditable. In-process by default; the
 * `PlanStore` interface is the seam for durable storage later.
 */
import type { PlanStep, PlanStepStatus } from "../types";

export type PlanStore = {
  get(conversationId: string): PlanStep[];
  set(conversationId: string, titles: string[]): PlanStep[];
  update(
    conversationId: string,
    stepId: string,
    status: PlanStepStatus,
    note?: string,
  ): PlanStep[];
  clear(conversationId: string): void;
};

const plans = new Map<string, PlanStep[]>();
const MAX_STEPS = 12;

export const planStore: PlanStore = {
  get(conversationId) {
    return plans.get(conversationId) ?? [];
  },
  set(conversationId, titles) {
    const steps: PlanStep[] = titles
      .map((title) => title.trim())
      .filter(Boolean)
      .slice(0, MAX_STEPS)
      .map((title, index) => ({
        id: `step-${index + 1}`,
        title: title.slice(0, 200),
        status: "pending" as PlanStepStatus,
      }));
    plans.set(conversationId, steps);
    return steps;
  },
  update(conversationId, stepId, status, note) {
    const steps = plans.get(conversationId) ?? [];
    const next = steps.map((step) =>
      step.id === stepId
        ? { ...step, status, ...(note ? { note: note.slice(0, 400) } : {}) }
        : step,
    );
    plans.set(conversationId, next);
    return next;
  },
  clear(conversationId) {
    plans.delete(conversationId);
  },
};
