import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { api, CustomFieldType } from "../lib/api";
import { userFacingError } from "../lib/userFacingError";
import { useToastStore } from "../stores/toasts";
import { Button, Card, CardBody, CardHeader, EmptyState, Lozenge, TableHead } from "./ui";

type BaseType = "epic" | "story" | "task" | "bug" | "risk";

interface TypeDefinition {
  id: string;
  key: string;
  name: string;
  baseType: BaseType;
  color: string | null;
  isSystem: boolean;
  displayOrder: number;
}

interface FieldDefinition {
  id: string;
  key: string;
  label: string;
  fieldType: CustomFieldType;
  required: boolean;
  options: string[];
  appliesToKeys: string[];
  displayOrder: number;
}

const BASE_TYPES: BaseType[] = ["epic", "story", "task", "bug", "risk"];
const FIELD_TYPES: CustomFieldType[] = ["text", "long_text", "integer", "decimal", "boolean", "date", "datetime", "single_select", "multi_select", "url"];
const SELECT_TYPES: CustomFieldType[] = ["single_select", "multi_select"];

export function ProjectSchemaAdmin({ projectId, canManage }: { projectId: string; canManage: boolean }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const pushToast = useToastStore((state) => state.push);
  const [typeName, setTypeName] = useState("");
  const [baseType, setBaseType] = useState<BaseType>("task");
  const [fieldLabel, setFieldLabel] = useState("");
  const [fieldType, setFieldType] = useState<CustomFieldType>("text");
  const [required, setRequired] = useState(false);
  const [optionText, setOptionText] = useState("");
  const [appliesTo, setAppliesTo] = useState<string[]>([]);

  const schema = useQuery({
    queryKey: ["work-item-schema", projectId],
    queryFn: () => api<{ types: TypeDefinition[]; fields: FieldDefinition[] }>(`/projects/${projectId}/work-item-schema`),
  });
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["work-item-schema", projectId] });

  const createType = useMutation({
    mutationFn: () => api(`/projects/${projectId}/work-item-types`, {
      method: "POST",
      body: JSON.stringify({ name: typeName.trim(), baseType }),
    }),
    onSuccess: async () => { setTypeName(""); await invalidate(); },
    onError: (error) => pushToast("error", userFacingError(error, t)),
  });
  const archiveType = useMutation({
    mutationFn: (id: string) => api(`/work-item-types/${id}`, { method: "DELETE" }),
    onSuccess: invalidate,
    onError: (error) => pushToast("error", userFacingError(error, t)),
  });
  const createField = useMutation({
    mutationFn: () => api(`/projects/${projectId}/work-item-fields`, {
      method: "POST",
      body: JSON.stringify({
        label: fieldLabel.trim(),
        fieldType,
        required,
        options: SELECT_TYPES.includes(fieldType) ? optionText.split("\n").map((line) => line.trim()).filter(Boolean) : [],
        appliesToKeys: appliesTo,
      }),
    }),
    onSuccess: async () => { setFieldLabel(""); setOptionText(""); setRequired(false); setAppliesTo([]); await invalidate(); },
    onError: (error) => pushToast("error", userFacingError(error, t)),
  });
  const archiveField = useMutation({
    mutationFn: (id: string) => api(`/work-item-fields/${id}`, { method: "DELETE" }),
    onSuccess: invalidate,
    onError: (error) => pushToast("error", userFacingError(error, t)),
  });

  const types = schema.data?.types ?? [];
  const fields = schema.data?.fields ?? [];

  const submitType = (event: FormEvent) => {
    event.preventDefault();
    if (typeName.trim()) createType.mutate();
  };
  const submitField = (event: FormEvent) => {
    event.preventDefault();
    if (fieldLabel.trim()) createField.mutate();
  };

  if (schema.isLoading) return <p className="text-sm text-mutedForeground">{t("loading")}</p>;

  return (
    <div className="space-y-4" data-testid="project-schema-admin">
      <Card>
        <CardHeader title={t("workItemTypes")} subtitle={t("projectSchemaHelp")} badge={<Lozenge>{types.length}</Lozenge>} />
        <table className="w-full text-left text-sm">
          <TableHead className="border-b border-border bg-surfaceSubtle">
            <tr>
              <th className="px-4 py-2.5">{t("typeName")}</th>
              <th className="px-4 py-2.5">{t("workHub.key")}</th>
              <th className="px-4 py-2.5">{t("baseBehaviour")}</th>
              <th className="px-4 py-2.5" />
            </tr>
          </TableHead>
          <tbody>
            {types.map((definition) => (
              <tr key={definition.id} data-testid={`schema-type-${definition.key}`} className="border-b border-border last:border-b-0">
                <td className="px-4 py-2.5 font-medium">{definition.name}</td>
                <td className="px-4 py-2.5 font-mono text-xs text-primary">{definition.key}</td>
                <td className="px-4 py-2.5">{t(`workHub.types.${definition.baseType}`)}</td>
                <td className="px-4 py-2.5 text-right">
                  {definition.isSystem ? (
                    <Lozenge>{t("builtInType")}</Lozenge>
                  ) : canManage ? (
                    <Button
                      size="sm"
                      variant="subtle"
                      data-testid={`archive-type-${definition.key}`}
                      icon={<Trash2 size={13} />}
                      disabled={archiveType.isPending}
                      onClick={() => archiveType.mutate(definition.id)}
                    >
                      {t("archiveAction")}
                    </Button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {canManage && (
          <CardBody className="border-t border-border/70">
            <form className="flex flex-wrap items-end gap-2" onSubmit={submitType}>
              <label className="min-w-48 flex-1 text-sm">
                <span className="mb-1 block text-xs font-medium text-mutedForeground">{t("typeName")}</span>
                <input data-testid="new-type-name" className="input" maxLength={60} value={typeName} onChange={(event) => setTypeName(event.target.value)} />
              </label>
              <label className="min-w-40 text-sm">
                <span className="mb-1 block text-xs font-medium text-mutedForeground">{t("baseBehaviour")}</span>
                <select data-testid="new-type-base" className="input" value={baseType} onChange={(event) => setBaseType(event.target.value as BaseType)}>
                  {BASE_TYPES.map((value) => <option key={value} value={value}>{t(`workHub.types.${value}`)}</option>)}
                </select>
              </label>
              <Button type="submit" variant="primary" data-testid="submit-new-type" icon={<Plus size={14} />} disabled={!typeName.trim() || createType.isPending}>
                {t("addType")}
              </Button>
            </form>
            <p className="mt-1.5 text-xs text-mutedForeground">{t("baseBehaviourHelp")}</p>
          </CardBody>
        )}
      </Card>

      <Card>
        <CardHeader title={t("workItemFields")} badge={<Lozenge>{fields.length}</Lozenge>} />
        {fields.length === 0 ? (
          <EmptyState title={t("noCustomFields")} description={t("noCustomFieldsHelp")} />
        ) : (
          <table className="w-full text-left text-sm">
            <TableHead className="border-b border-border bg-surfaceSubtle">
              <tr>
                <th className="px-4 py-2.5">{t("fieldLabel")}</th>
                <th className="px-4 py-2.5">{t("fieldTypeLabel")}</th>
                <th className="px-4 py-2.5">{t("fieldRequired")}</th>
                <th className="px-4 py-2.5">{t("appliesToTypes")}</th>
                <th className="px-4 py-2.5" />
              </tr>
            </TableHead>
            <tbody>
              {fields.map((definition) => (
                <tr key={definition.id} data-testid={`schema-field-${definition.key}`} className="border-b border-border last:border-b-0">
                  <td className="px-4 py-2.5">
                    <span className="block font-medium">{definition.label}</span>
                    <span className="block font-mono text-[11px] text-mutedForeground">{definition.key}</span>
                  </td>
                  <td className="px-4 py-2.5">
                    {t(`fieldType_${definition.fieldType}`)}
                    {definition.options.length > 0 && <span className="mt-0.5 block text-xs text-mutedForeground">{definition.options.join(", ")}</span>}
                  </td>
                  <td className="px-4 py-2.5">
                    {definition.required ? <Lozenge appearance="warning">{t("fieldRequired")}</Lozenge> : <span className="text-mutedForeground">-</span>}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-mutedForeground">
                    {definition.appliesToKeys.length === 0 ? t("appliesToAll") : definition.appliesToKeys.join(", ")}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {canManage && (
                      <Button
                        size="sm"
                        variant="subtle"
                        data-testid={`archive-field-${definition.key}`}
                        icon={<Trash2 size={13} />}
                        disabled={archiveField.isPending}
                        onClick={() => archiveField.mutate(definition.id)}
                      >
                        {t("archiveAction")}
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {canManage && (
          <CardBody className="border-t border-border/70">
            <form className="space-y-3" onSubmit={submitField}>
              <div className="flex flex-wrap items-end gap-2">
                <label className="min-w-48 flex-1 text-sm">
                  <span className="mb-1 block text-xs font-medium text-mutedForeground">{t("fieldLabel")}</span>
                  <input data-testid="new-field-label" className="input" maxLength={60} value={fieldLabel} onChange={(event) => setFieldLabel(event.target.value)} />
                </label>
                <label className="min-w-40 text-sm">
                  <span className="mb-1 block text-xs font-medium text-mutedForeground">{t("fieldTypeLabel")}</span>
                  <select data-testid="new-field-type" className="input" value={fieldType} onChange={(event) => setFieldType(event.target.value as CustomFieldType)}>
                    {FIELD_TYPES.map((value) => <option key={value} value={value}>{t(`fieldType_${value}`)}</option>)}
                  </select>
                </label>
                <label className="flex items-center gap-2 pb-2 text-sm">
                  <input data-testid="new-field-required" type="checkbox" className="h-4 w-4" checked={required} onChange={(event) => setRequired(event.target.checked)} />
                  {t("fieldRequired")}
                </label>
                <Button type="submit" variant="primary" data-testid="submit-new-field" icon={<Plus size={14} />} disabled={!fieldLabel.trim() || createField.isPending}>
                  {t("addField")}
                </Button>
              </div>
              {SELECT_TYPES.includes(fieldType) && (
                <label className="block text-sm">
                  <span className="mb-1 block text-xs font-medium text-mutedForeground">{t("fieldOptions")}</span>
                  <textarea data-testid="new-field-options" className="input min-h-20 resize-y" value={optionText} onChange={(event) => setOptionText(event.target.value)} />
                  <span className="mt-1 block text-xs text-mutedForeground">{t("fieldOptionsHelp")}</span>
                </label>
              )}
              <div>
                <span className="mb-1 block text-xs font-medium text-mutedForeground">{t("appliesToTypes")}</span>
                <div className="flex flex-wrap gap-1.5">
                  {types.map((definition) => {
                    const active = appliesTo.includes(definition.key);
                    return (
                      <button
                        key={definition.id}
                        type="button"
                        aria-pressed={active}
                        data-testid={`applies-to-${definition.key}`}
                        className={`rounded-md border px-2 py-1 text-xs ${active ? "border-primary/40 bg-primary/10 text-primary" : "border-border text-foreground/80 hover:bg-muted"}`}
                        onClick={() => setAppliesTo((current) => active ? current.filter((key) => key !== definition.key) : [...current, definition.key])}
                      >
                        {definition.name}
                      </button>
                    );
                  })}
                </div>
                <p className="mt-1 text-xs text-mutedForeground">{appliesTo.length === 0 ? t("appliesToAll") : ""}</p>
              </div>
            </form>
          </CardBody>
        )}
      </Card>
    </div>
  );
}
