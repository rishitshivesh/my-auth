"use client";

import { useEffect, useMemo, useState } from "react";
import { useCopy } from "@/i18n";
import { FormDialog } from "@/features/access/components/FormDialog";
import { TextField } from "@/features/access/components/TextField";
import { profileChanges, validateProfile, type ProfileValues } from "../model/person";

export interface EditProfileDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial: ProfileValues;
  pending: boolean;
  error?: string;
  onSubmit: (changes: Partial<ProfileValues>) => void;
}

export function EditProfileDialog({ open, onOpenChange, initial, pending, error, onSubmit }: EditProfileDialogProps) {
  const { t, tk } = useCopy();
  const [values, setValues] = useState<ProfileValues>(initial);
  const [touched, setTouched] = useState(false);
  useEffect(() => { if (open) { setValues(initial); setTouched(false); } }, [open, initial]);
  const errors = useMemo(() => validateProfile(values), [values]);
  const changes = useMemo(() => profileChanges(initial, values), [initial, values]);
  const set = (key: keyof ProfileValues) => (value: string) => setValues((v) => ({ ...v, [key]: value }));
  const fields: readonly (keyof ProfileValues)[] = ["firstName", "lastName", "displayName", "phone"];

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("users.edit.title")}
      description={t("users.edit.description")}
      submitLabel={t("common.actions.save")}
      cancelLabel={t("common.actions.cancel")}
      submitDisabled={Object.keys(changes).length === 0}
      pending={pending}
      error={error}
      onSubmit={() => {
        setTouched(true);
        if (Object.keys(errors).length === 0) onSubmit(changes);
      }}
    >
      {fields.map((field) => {
        const code = errors[field];
        return (
          <TextField
            key={field}
            label={tk(`users.edit.fields.${field}`)}
            value={values[field]}
            onChange={set(field)}
            optionalLabel={t("common.labels.optional")}
            autoComplete="off"
            error={touched && code ? tk(`users.edit.errors.${code}`) : undefined}
          />
        );
      })}
    </FormDialog>
  );
}
