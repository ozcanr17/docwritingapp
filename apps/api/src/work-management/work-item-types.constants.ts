import { WorkItemType } from "@docsys/database";

export interface BuiltInWorkItemType {
  key: string;
  name: string;
  baseType: WorkItemType;
  displayOrder: number;
}

/**
 * Every project starts with these five types. They mirror the WorkItemType enum
 * one-to-one, so an item created before any custom type existed can always be
 * pointed at a definition. Archiving them is rejected by WorkItemSchemaService.
 */
export const BUILT_IN_WORK_ITEM_TYPES: readonly BuiltInWorkItemType[] = [
  { key: "epic", name: "Epic", baseType: WorkItemType.epic, displayOrder: 0 },
  { key: "story", name: "Story", baseType: WorkItemType.story, displayOrder: 1 },
  { key: "task", name: "Task", baseType: WorkItemType.task, displayOrder: 2 },
  { key: "bug", name: "Bug", baseType: WorkItemType.bug, displayOrder: 3 },
  { key: "risk", name: "Risk", baseType: WorkItemType.risk, displayOrder: 4 },
];
