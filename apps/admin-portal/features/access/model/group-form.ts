export interface GroupFormValues {
  name: string;
  description: string;
  parentGroupId: string;
}

export type GroupFormErrorCode = "required" | "tooLong";
export type GroupFormErrors = Partial<Record<"name" | "description", GroupFormErrorCode>>;

const NAME_MAX = 100;
const DESCRIPTION_MAX = 255;

export function validateGroupForm(values: GroupFormValues): GroupFormErrors {
  const errors: GroupFormErrors = {};
  const name = values.name.trim();
  if (!name) errors.name = "required";
  else if (name.length > NAME_MAX) errors.name = "tooLong";
  if (values.description.trim().length > DESCRIPTION_MAX) errors.description = "tooLong";
  return errors;
}

export const NO_PARENT = "";
