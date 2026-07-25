import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { CustomFieldType, Prisma, WorkItemType } from "@docsys/database";
import { PrismaService } from "../prisma/prisma.service";
import { AccessService } from "../access/access.service";
import { AuditService } from "../audit/audit.service";

export interface TypeDefinitionInput {
  key?: string;
  name: string;
  description?: string | null;
  baseType: WorkItemType;
  color?: string | null;
  displayOrder?: number;
}

export interface FieldDefinitionInput {
  key?: string;
  label: string;
  helpText?: string | null;
  fieldType: CustomFieldType;
  required?: boolean;
  options?: string[];
  appliesToKeys?: string[];
  displayOrder?: number;
}

const SELECT_TYPES: CustomFieldType[] = ["single_select", "multi_select"];

function normalizeKey(value: string): string {
  const base = value
    .toLocaleLowerCase("en")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (!base || !/^[a-z]/.test(base)) return `f_${base || "field"}`;
  return base;
}

@Injectable()
export class WorkItemSchemaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly audit: AuditService,
  ) {}

  private async requireProject(projectId: string) {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, deletedAt: null },
      select: { id: true, organizationId: true, workspaceId: true },
    });
    if (!project) throw new NotFoundException("Project not found");
    return project;
  }

  private async assertRead(actorId: string, projectId: string) {
    const project = await this.requireProject(projectId);
    await this.access.assertPermission(actorId, "project.read", {
      organizationId: project.organizationId,
      workspaceId: project.workspaceId,
      projectId,
    });
    return project;
  }

  private async assertManage(actorId: string, projectId: string) {
    const project = await this.requireProject(projectId);
    await this.access.assertPermission(actorId, "project.manage", {
      organizationId: project.organizationId,
      workspaceId: project.workspaceId,
      projectId,
    });
    return project;
  }

  async listSchema(actorId: string, projectId: string) {
    await this.assertRead(actorId, projectId);
    const [types, fields] = await Promise.all([
      this.prisma.workItemTypeDefinition.findMany({
        where: { projectId, archivedAt: null },
        orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
      }),
      this.prisma.workItemFieldDefinition.findMany({
        where: { projectId, archivedAt: null },
        orderBy: [{ displayOrder: "asc" }, { label: "asc" }],
      }),
    ]);
    return { types, fields };
  }

  async createType(actorId: string, projectId: string, input: TypeDefinitionInput) {
    const project = await this.assertManage(actorId, projectId);
    const key = normalizeKey(input.key || input.name);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const created = await tx.workItemTypeDefinition.create({
          data: {
            projectId,
            key,
            name: input.name,
            description: input.description ?? null,
            baseType: input.baseType,
            color: input.color ?? null,
            displayOrder: input.displayOrder ?? 100,
            isSystem: false,
          },
        });
        await this.audit.record(tx, {
          organizationId: project.organizationId,
          workspaceId: project.workspaceId,
          actorId,
          action: "work_item_type.created",
          entityType: "work_item_type_definition",
          entityId: created.id,
          nextData: { key, name: created.name, baseType: created.baseType },
        });
        return created;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException("A work item type with this key already exists in the project");
      }
      throw error;
    }
  }

  async updateType(actorId: string, typeId: string, input: Partial<TypeDefinitionInput>) {
    const existing = await this.prisma.workItemTypeDefinition.findFirst({ where: { id: typeId, archivedAt: null } });
    if (!existing) throw new NotFoundException("Work item type not found");
    const project = await this.assertManage(actorId, existing.projectId);
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.workItemTypeDefinition.update({
        where: { id: typeId },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.description !== undefined ? { description: input.description ?? null } : {}),
          ...(input.color !== undefined ? { color: input.color ?? null } : {}),
          ...(input.displayOrder !== undefined ? { displayOrder: input.displayOrder } : {}),
          ...(input.baseType !== undefined && !existing.isSystem ? { baseType: input.baseType } : {}),
        },
      });
      await this.audit.record(tx, {
        organizationId: project.organizationId,
        workspaceId: project.workspaceId,
        actorId,
        action: "work_item_type.updated",
        entityType: "work_item_type_definition",
        entityId: typeId,
        previousData: { name: existing.name, baseType: existing.baseType },
        nextData: { name: updated.name, baseType: updated.baseType },
      });
      return updated;
    });
  }

  async archiveType(actorId: string, typeId: string) {
    const existing = await this.prisma.workItemTypeDefinition.findFirst({ where: { id: typeId, archivedAt: null } });
    if (!existing) throw new NotFoundException("Work item type not found");
    if (existing.isSystem) throw new BadRequestException("Built-in work item types cannot be archived");
    const project = await this.assertManage(actorId, existing.projectId);
    const usage = await this.prisma.workItem.count({ where: { typeDefinitionId: typeId, deletedAt: null } });
    if (usage > 0) throw new ConflictException("This work item type is still used by existing work items");
    await this.prisma.$transaction(async (tx) => {
      await tx.workItemTypeDefinition.update({ where: { id: typeId }, data: { archivedAt: new Date() } });
      await this.audit.record(tx, {
        organizationId: project.organizationId,
        workspaceId: project.workspaceId,
        actorId,
        action: "work_item_type.archived",
        entityType: "work_item_type_definition",
        entityId: typeId,
        previousData: { key: existing.key, name: existing.name },
      });
    });
    return { archived: true };
  }

  async createField(actorId: string, projectId: string, input: FieldDefinitionInput) {
    const project = await this.assertManage(actorId, projectId);
    const key = normalizeKey(input.key || input.label);
    const options = SELECT_TYPES.includes(input.fieldType) ? (input.options ?? []).filter(Boolean) : [];
    if (SELECT_TYPES.includes(input.fieldType) && options.length === 0) {
      throw new BadRequestException("Select fields need at least one option");
    }
    try {
      return await this.prisma.$transaction(async (tx) => {
        const created = await tx.workItemFieldDefinition.create({
          data: {
            projectId,
            key,
            label: input.label,
            helpText: input.helpText ?? null,
            fieldType: input.fieldType,
            required: input.required ?? false,
            options,
            appliesToKeys: input.appliesToKeys ?? [],
            displayOrder: input.displayOrder ?? 100,
          },
        });
        await this.audit.record(tx, {
          organizationId: project.organizationId,
          workspaceId: project.workspaceId,
          actorId,
          action: "work_item_field.created",
          entityType: "work_item_field_definition",
          entityId: created.id,
          nextData: { key, label: created.label, fieldType: created.fieldType, required: created.required },
        });
        return created;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException("A field with this key already exists in the project");
      }
      throw error;
    }
  }

  async updateField(actorId: string, fieldId: string, input: Partial<FieldDefinitionInput>) {
    const existing = await this.prisma.workItemFieldDefinition.findFirst({ where: { id: fieldId, archivedAt: null } });
    if (!existing) throw new NotFoundException("Field not found");
    const project = await this.assertManage(actorId, existing.projectId);
    const nextType = input.fieldType ?? existing.fieldType;
    const nextOptions = input.options !== undefined
      ? (SELECT_TYPES.includes(nextType) ? input.options.filter(Boolean) : [])
      : existing.options;
    if (SELECT_TYPES.includes(nextType) && nextOptions.length === 0) {
      throw new BadRequestException("Select fields need at least one option");
    }
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.workItemFieldDefinition.update({
        where: { id: fieldId },
        data: {
          ...(input.label !== undefined ? { label: input.label } : {}),
          ...(input.helpText !== undefined ? { helpText: input.helpText ?? null } : {}),
          ...(input.fieldType !== undefined ? { fieldType: input.fieldType } : {}),
          ...(input.required !== undefined ? { required: input.required } : {}),
          ...(input.appliesToKeys !== undefined ? { appliesToKeys: input.appliesToKeys } : {}),
          ...(input.displayOrder !== undefined ? { displayOrder: input.displayOrder } : {}),
          options: nextOptions,
        },
      });
      await this.audit.record(tx, {
        organizationId: project.organizationId,
        workspaceId: project.workspaceId,
        actorId,
        action: "work_item_field.updated",
        entityType: "work_item_field_definition",
        entityId: fieldId,
        previousData: { label: existing.label, fieldType: existing.fieldType, required: existing.required },
        nextData: { label: updated.label, fieldType: updated.fieldType, required: updated.required },
      });
      return updated;
    });
  }

  async archiveField(actorId: string, fieldId: string) {
    const existing = await this.prisma.workItemFieldDefinition.findFirst({ where: { id: fieldId, archivedAt: null } });
    if (!existing) throw new NotFoundException("Field not found");
    const project = await this.assertManage(actorId, existing.projectId);
    await this.prisma.$transaction(async (tx) => {
      await tx.workItemFieldDefinition.update({ where: { id: fieldId }, data: { archivedAt: new Date() } });
      await this.audit.record(tx, {
        organizationId: project.organizationId,
        workspaceId: project.workspaceId,
        actorId,
        action: "work_item_field.archived",
        entityType: "work_item_field_definition",
        entityId: fieldId,
        previousData: { key: existing.key, label: existing.label },
      });
    });
    return { archived: true };
  }

  async validateCustomFields(
    tx: Prisma.TransactionClient,
    projectId: string,
    typeKey: string,
    provided: Record<string, unknown> | undefined,
    { partial = false }: { partial?: boolean } = {},
  ): Promise<Record<string, unknown>> {
    const definitions = await tx.workItemFieldDefinition.findMany({
      where: { projectId, archivedAt: null },
      orderBy: { displayOrder: "asc" },
    });
    const applicable = definitions.filter(
      (definition) => definition.appliesToKeys.length === 0 || definition.appliesToKeys.includes(typeKey),
    );
    const result: Record<string, unknown> = {};
    for (const definition of applicable) {
      const raw = provided?.[definition.key];
      if (raw === undefined || raw === null || raw === "") {
        if (definition.required && !partial) {
          throw new BadRequestException(`Field "${definition.label}" is required`);
        }
        continue;
      }
      result[definition.key] = this.coerce(definition.fieldType, definition.label, definition.options, raw);
    }
    return result;
  }

  private coerce(fieldType: CustomFieldType, label: string, options: string[], raw: unknown): unknown {
    switch (fieldType) {
      case "integer": {
        const value = Number(raw);
        if (!Number.isInteger(value)) throw new BadRequestException(`Field "${label}" must be a whole number`);
        return value;
      }
      case "decimal": {
        const value = Number(raw);
        if (!Number.isFinite(value)) throw new BadRequestException(`Field "${label}" must be a number`);
        return value;
      }
      case "boolean":
        return raw === true || raw === "true";
      case "date":
      case "datetime": {
        const value = new Date(String(raw));
        if (Number.isNaN(value.getTime())) throw new BadRequestException(`Field "${label}" must be a valid date`);
        return value.toISOString();
      }
      case "single_select": {
        const value = String(raw);
        if (!options.includes(value)) throw new BadRequestException(`Field "${label}" has an unsupported value`);
        return value;
      }
      case "multi_select": {
        const values = Array.isArray(raw) ? raw.map(String) : [String(raw)];
        for (const value of values) {
          if (!options.includes(value)) throw new BadRequestException(`Field "${label}" has an unsupported value`);
        }
        return values;
      }
      case "url": {
        const value = String(raw);
        if (!/^https?:\/\//i.test(value)) throw new BadRequestException(`Field "${label}" must be an HTTP or HTTPS address`);
        return value;
      }
      default:
        return String(raw);
    }
  }
}
