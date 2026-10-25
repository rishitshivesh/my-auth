"use client";

import { useEffect, useMemo, useState } from "react";
import { useCopy } from "@/i18n";
import { validateRoleForm, type RoleFormValues } from "../model/role-form";
import type { PermissionDto, RoleDto } from "../model/types";
import { CheckList } from "./CheckList";
import { FormDialog } from "./FormDialog";
import { TextAreaField } from "./TextAreaField";
import { TextField } from "./TextField";

export interface RoleFormSubmit {
  values: RoleFormValues;
  permissionNames: string[];
}

export interface RoleFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Existing role when editing; absent when creating. */
  role?: RoleDto;
  permissions: readonly PermissionDto[];
  pending: boolean;
  error?: string;
  onSubmit: (submit: RoleFormSubmit) => void;
}

const EMPTY: RoleFormValues = { name: "", displayName: "", description: "" };

export function RoleFormDialog({ open, onOpenChange, role, permissions, pending, error, onSubmit }: RoleFormDialogProps) {
  const { t } = useCopy();
  const mode = role ? "edit" : "create";
  const [values, setValues] = useState<RoleFormValues>(EMPTY);
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (!open) return;
    setValues(role ? { name: role.name, displayName: role.displayName ?? "", description: role.description ?? "" } : EMPTY);
    setPicked(new Set());
    setTouched(false);
  }, [open, role]);

  const errors = useMemo(() => validateRoleForm(values, mode), [values, mode]);
  const visible = touched ? errors : {};
  const items = useMemo(
    () => permissions.map((p) => ({ id: p.name, label: p.name, description: p.description ?? undefined })),
    [permissions],
  );
  const set = (key: keyof RoleFormValues) => (value: string) => setValues((v) => ({ ...v, [key]: value }));
  const toggle = (id: string) =>
    setPicked((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t(mode === "create" ? "access.roles.form.createTitle" : "access.roles.form.editTitle")}
      description={t("access.roles.form.description")}
      submitLabel={t(mode === "create" ? "access.roles.form.create" : "access.roles.form.save")}
      cancelLabel={t("common.actions.cancel")}
      pending={pending}
      error={error}
      onSubmit={() => {
        setTouched(true);
        if (Object.keys(errors).length === 0) onSubmit({ values, permissionNames: [...picked] });
      }}
    >
      {mode === "create" && (
        <TextField
          label={t("access.roles.form.name")}
          hint={t("access.roles.form.nameHint")}
          value={values.name}
          onChange={set("name")}
          error={visible.name ? t(`access.roles.form.errors.${visible.name}`) : undefined}
          required
          mono
          autoComplete="off"
        />
      )}
      <TextField
        label={t("access.roles.form.displayName")}
        value={values.displayName}
        onChange={set("displayName")}
        error={visible.displayName ? t(`access.roles.form.errors.${visible.displayName}`) : undefined}
        optionalLabel={t("common.labels.optional")}
      />
      <TextAreaField
        label={t("access.roles.form.descriptionLabel")}
        value={values.description}
        onChange={set("description")}
        error={visible.description ? t(`access.roles.form.errors.${visible.description}`) : undefined}
        optionalLabel={t("common.labels.optional")}
      />
      {mode === "create" && (
        <CheckList
          legend={t("access.roles.form.permissions")}
          items={items}
          selected={picked}
          onToggle={toggle}
          emptyText={t("access.permissions.table.emptyTitle")}
        />
      )}
    </FormDialog>
  );
}
