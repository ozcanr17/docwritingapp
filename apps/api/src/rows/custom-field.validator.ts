import { UnprocessableEntityException } from "@nestjs/common";
import { CustomFieldDefinition } from "@reqtrack/database";

export function validateCustomFields(
  definitions: CustomFieldDefinition[],
  values: Record<string, unknown>,
): Record<string, unknown> {
  const byKey = new Map(definitions.map((d) => [d.fieldKey, d]));
  const errors: string[] = [];
  for (const key of Object.keys(values)) {
    const def = byKey.get(key);
    if (!def) {
      errors.push(`Unknown custom field: ${key}`);
      continue;
    }
    const value = values[key];
    if (value === null || value === undefined) continue;
    if (!matchesType(def, value)) {
      errors.push(`Field ${key} does not match type ${def.fieldType}`);
    }
  }
  for (const def of definitions) {
    if (def.isRequired && (values[def.fieldKey] === null || values[def.fieldKey] === undefined)) {
      if (!(def.fieldKey in values)) continue;
      errors.push(`Field ${def.fieldKey} is required`);
    }
  }
  if (errors.length > 0) throw new UnprocessableEntityException({ message: "Custom field validation failed", errors });
  return values;
}

function matchesType(def: CustomFieldDefinition, value: unknown): boolean {
  switch (def.fieldType) {
    case "text":
    case "long_text":
    case "url":
      return typeof value === "string";
    case "integer":
      return typeof value === "number" && Number.isInteger(value);
    case "decimal":
      return typeof value === "number" && Number.isFinite(value);
    case "boolean":
      return typeof value === "boolean";
    case "date":
    case "datetime":
      return typeof value === "string" && !Number.isNaN(Date.parse(value));
    case "single_select":
      return typeof value === "string" && allowed(def).includes(value);
    case "multi_select":
      return Array.isArray(value) && value.every((v) => typeof v === "string" && allowed(def).includes(v));
    case "user":
    case "project":
      return typeof value === "string";
    default:
      return false;
  }
}

function allowed(def: CustomFieldDefinition): string[] {
  return Array.isArray(def.allowedValues) ? (def.allowedValues as string[]) : [];
}
