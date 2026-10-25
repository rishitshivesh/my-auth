"use client";

import { useEffect, useMemo, useState } from "react";
import { FormField } from "@repo/ui";
import { useCopy } from "@/i18n";
import { NO_PARENT, validateGroupForm, type GroupFormValues } from "../model/group-form";
import { flattenGroups } from "../model/group-tree";
import type { GroupDto } from "../model/types";
import { FormDialog } from "./FormDialog";
import { TextAreaField } from "./TextAreaField";
import { TextField } from "./TextField";

const NESTING_MARK = "— ";

export interface GroupFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Present when editing; the API cannot re-parent an existing group. */
  group?: GroupDto;
  groups: readonly GroupDto[];
  pending: boolean;
  error?: string;
  onSubmit: (values: GroupFormValues) => void;
}

const EMPTY: GroupFormValues = { name: "", description: "", parentGroupId: NO_PARENT };

export function GroupFormDialog({ open, onOpenChange, group, groups, pending, error, onSubmit }: GroupFormDialogProps) {
  const { t } = useCopy();
  const editing = group !== undefined;
  const [values, setValues] = useState<GroupFormValues>(EMPTY);
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (!open) return;
    setValues(group ? { name: group.name, description: group.description ?? "", parentGroupId: group.parentGroupId ?? NO_PARENT } : EMPTY);
    setTouched(false);
  }, [open, group]);

  const errors = useMemo(() => validateGroupForm(values), [values]);
  const shown = touched ? errors : {};
  const options = useMemo(() => flattenGroups(groups), [groups]);
  const set = (key: keyof GroupFormValues) => (value: string) => setValues((v) => ({ ...v, [key]: value }));

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t(editing ? "access.groups.form.editTitle" : "access.groups.form.createTitle")}
      description={t("access.groups.form.description")}
      submitLabel={t(editing ? "access.groups.form.save" : "access.groups.form.create")}
      cancelLabel={t("common.actions.cancel")}
      pending={pending}
      error={error}
      onSubmit={() => {
        setTouched(true);
        if (Object.keys(errors).length === 0) onSubmit(values);
      }}
    >
      <TextField
        label={t("access.groups.form.name")}
        value={values.name}
        onChange={set("name")}
        required
        autoComplete="off"
        error={shown.name ? t(`access.groups.form.errors.${shown.name}`) : undefined}
      />
      <TextAreaField
        label={t("access.groups.form.descriptionLabel")}
        value={values.description}
        onChange={set("description")}
        rows={2}
        optionalLabel={t("common.labels.optional")}
        error={shown.description ? t(`access.groups.form.errors.${shown.description}`) : undefined}
      />
      <FormField
        label={t("access.groups.form.parent")}
        hint={t(editing ? "access.groups.form.parentLocked" : "access.groups.form.parentHint")}
        optionalLabel={t("common.labels.optional")}
      >
        {(control) => (
          <select
            {...control}
            value={values.parentGroupId}
            disabled={editing}
            onChange={(event) => set("parentGroupId")(event.target.value)}
            className="h-[42px] w-full min-w-0 rounded-sm border border-border bg-muted px-3 font-body text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
          >
            <option value={NO_PARENT}>{t("access.groups.form.noParent")}</option>
            {options.map(({ group: g, depth }) => (
              <option key={g.id} value={g.id}>{`${NESTING_MARK.repeat(depth)}${g.name}`}</option>
            ))}
          </select>
        )}
      </FormField>
    </FormDialog>
  );
}
