"use client";

import { useEffect, useMemo, useState } from "react";
import { useCopy } from "@/i18n";
import { permissionName, validatePermissionForm, type PermissionFormValues } from "../model/permission-catalog";
import type { PermissionDto } from "../model/types";
import { FormDialog } from "./FormDialog";
import { TextAreaField } from "./TextAreaField";
import { TextField } from "./TextField";

export interface PermissionFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Present when editing; only the description is editable. */
  permission?: PermissionDto;
  pending: boolean;
  error?: string;
  onSubmit: (values: PermissionFormValues) => void;
}

const EMPTY: PermissionFormValues = { resource: "", action: "", description: "" };

export function PermissionFormDialog({ open, onOpenChange, permission, pending, error, onSubmit }: PermissionFormDialogProps) {
  const { t } = useCopy();
  const editing = permission !== undefined;
  const [values, setValues] = useState<PermissionFormValues>(EMPTY);
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (!open) return;
    setValues(permission ? { resource: permission.resource, action: permission.action, description: permission.description ?? "" } : EMPTY);
    setTouched(false);
  }, [open, permission]);

  const errors = useMemo(() => (editing ? {} : validatePermissionForm(values)), [values, editing]);
  const shown = touched ? errors : {};
  const set = (key: keyof PermissionFormValues) => (value: string) => setValues((v) => ({ ...v, [key]: value }));

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t(editing ? "access.permissions.form.editTitle" : "access.permissions.form.createTitle")}
      description={t("access.permissions.form.description")}
      submitLabel={t(editing ? "access.permissions.form.save" : "access.permissions.form.create")}
      cancelLabel={t("common.actions.cancel")}
      pending={pending}
      error={error}
      onSubmit={() => {
        setTouched(true);
        if (Object.keys(errors).length === 0) onSubmit(values);
      }}
    >
      <TextField
        label={t("access.permissions.form.resource")}
        hint={t("access.permissions.form.resourceHint")}
        value={values.resource}
        onChange={set("resource")}
        disabled={editing}
        required
        mono
        autoComplete="off"
        error={shown.resource ? t(`access.permissions.form.errors.${shown.resource}`) : undefined}
      />
      <TextField
        label={t("access.permissions.form.action")}
        hint={t("access.permissions.form.actionHint")}
        value={values.action}
        onChange={set("action")}
        disabled={editing}
        required
        mono
        autoComplete="off"
        error={shown.action ? t(`access.permissions.form.errors.${shown.action}`) : undefined}
      />
      {values.resource && values.action && (
        <p className="break-all font-body text-sm text-muted-foreground">
          {t("access.permissions.form.resulting")}
          <span className="ml-2 font-mono text-foreground">{permissionName(values.resource, values.action)}</span>
        </p>
      )}
      <TextAreaField
        label={t("access.permissions.form.descriptionLabel")}
        value={values.description}
        onChange={set("description")}
        optionalLabel={t("common.labels.optional")}
      />
    </FormDialog>
  );
}
