/**
 * Minimal, strongly-typed JSON Schema types plus a Zod -> JSON Schema
 * converter for the subset of Zod used by V1 tool inputs.
 *
 * The output is a plain JSON Schema object suitable for sending to a model as
 * a tool `parameters` definition. No `any` is used anywhere in this module.
 */
import { z } from "zod";

export type JsonSchemaScalarType =
  | "string"
  | "number"
  | "integer"
  | "boolean"
  | "null";

export type JsonSchema =
  | {
      type?: JsonSchemaScalarType | "array" | "object";
      description?: string;
      enum?: readonly (string | number | boolean | null)[];
      items?: JsonSchema;
      properties?: Record<string, JsonSchema>;
      required?: string[];
      additionalProperties?: boolean;
      minLength?: number;
      maxLength?: number;
      minimum?: number;
      maximum?: number;
      anyOf?: JsonSchema[];
    }
  | Record<string, never>;

/** JSON Schema for a tool's parameters: always an object schema. */
export type JsonSchemaObject = {
  type: "object";
  properties: Record<string, JsonSchema>;
  required: string[];
  additionalProperties: false;
  description?: string;
};

export const EMPTY_PARAMETERS: JsonSchemaObject = {
  type: "object",
  properties: {},
  required: [],
  additionalProperties: false,
};

function unwrap(schema: z.ZodTypeAny): {
  inner: z.ZodTypeAny;
  optional: boolean;
} {
  let current: z.ZodTypeAny = schema;
  let optional = false;
  // Unwrap optional/nullable/default wrappers, keeping track of optionality.
  for (;;) {
    if (current instanceof z.ZodOptional) {
      optional = true;
      current = current.unwrap() as z.ZodTypeAny;
      continue;
    }
    if (current instanceof z.ZodDefault) {
      optional = true;
      current = current.removeDefault() as z.ZodTypeAny;
      continue;
    }
    if (current instanceof z.ZodNullable) {
      current = current.unwrap() as z.ZodTypeAny;
      continue;
    }
    return { inner: current, optional };
  }
}

function convert(schema: z.ZodTypeAny): JsonSchema {
  const { inner } = unwrap(schema);
  const description = inner.description;
  const withDescription = (node: JsonSchema): JsonSchema =>
    description ? { ...node, description } : node;

  if (inner instanceof z.ZodString) {
    return withDescription({ type: "string" });
  }
  if (inner instanceof z.ZodNumber) {
    return withDescription({ type: inner.isInt ? "integer" : "number" });
  }
  if (inner instanceof z.ZodBoolean) {
    return withDescription({ type: "boolean" });
  }
  if (inner instanceof z.ZodLiteral) {
    const value = inner.value;
    if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
    ) {
      return withDescription({ enum: [value] });
    }
    return withDescription({});
  }
  if (inner instanceof z.ZodEnum) {
    const values = inner.options as readonly string[];
    return withDescription({ type: "string", enum: [...values] });
  }
  if (inner instanceof z.ZodArray) {
    return withDescription({
      type: "array",
      items: convert(inner.element as z.ZodTypeAny),
    });
  }
  if (inner instanceof z.ZodObject) {
    return withDescription(toJsonSchemaObject(inner));
  }
  if (inner instanceof z.ZodUnion) {
    const options = inner.options as readonly z.ZodTypeAny[];
    return withDescription({ anyOf: options.map((option) => convert(option)) });
  }
  if (inner instanceof z.ZodRecord) {
    return withDescription({ type: "object" });
  }
  // Unknown/unsupported node: permissive schema rather than a wrong one.
  return withDescription({});
}

/** Converts a Zod object schema into a model-ready JSON Schema object. */
export function toJsonSchemaObject(
  schema: z.ZodObject<z.ZodRawShape>,
): JsonSchemaObject {
  const shape = schema.shape;
  const properties: Record<string, JsonSchema> = {};
  const required: string[] = [];

  for (const [key, value] of Object.entries(shape)) {
    const field = value as z.ZodTypeAny;
    properties[key] = convert(field);
    if (!unwrap(field).optional && !field.isOptional()) required.push(key);
  }

  return {
    type: "object",
    properties,
    required,
    additionalProperties: false,
  };
}

/** Converts any supported tool input schema into JSON Schema parameters. */
export function toParametersSchema(schema: z.ZodTypeAny): JsonSchemaObject {
  const { inner } = unwrap(schema);
  if (inner instanceof z.ZodObject) {
    return toJsonSchemaObject(inner as z.ZodObject<z.ZodRawShape>);
  }
  return EMPTY_PARAMETERS;
}
