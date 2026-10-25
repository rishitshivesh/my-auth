"use client";

import { useMemo, useState } from "react";
import { PageHeader } from "@repo/ui";
import { useCopy } from "@/i18n";
import { useUserDirectory } from "@/features/users/api/use-users";
import { personName } from "@/features/users/model/person";
import { errorText } from "../api/error-text";
import { useSimulation } from "../api/use-access";
import { SimulationForm } from "../components/SimulationForm";
import { SimulationResultPanel } from "../components/SimulationResultPanel";
import { buildSimulationRequest, toSimulationView, validateSimulation, type SimulationFormErrors, type SimulationFormValues } from "../model/simulation";

const INITIAL: SimulationFormValues = { userId: "", action: "", resource: "*", ipAddress: "", mfaVerified: false };

/** T09 policy simulation and N12 diagnostics: explains the decision the service returns. */
export function SimulatorView({ slug }: { slug: string }) {
  const { t } = useCopy();
  const [values, setValues] = useState<SimulationFormValues>(INITIAL);
  const [errors, setErrors] = useState<SimulationFormErrors>({});
  const [search, setSearch] = useState("");
  const directory = useUserDirectory(slug, search);
  const simulation = useSimulation();

  const principals = useMemo(
    () => (directory.data?.users ?? []).map((u) => ({ id: u.id, label: `${personName(u)} (${u.email})` })),
    [directory.data],
  );

  const submit = () => {
    const found = validateSimulation(values);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    simulation.mutate(buildSimulationRequest(values));
  };

  return (
    <div className="space-y-6">
      <PageHeader title={t("access.simulator.title")} subtitle={t("access.simulator.subtitle")} />
      <div className="grid gap-6 lg:grid-cols-2">
        <SimulationForm
          values={values}
          onChange={setValues}
          errors={errors}
          principals={principals}
          principalSearch={search}
          onPrincipalSearch={setSearch}
          principalsLoading={directory.isFetching}
          pending={simulation.isPending}
          onSubmit={submit}
          serverError={errorText(simulation.error)}
        />
        {simulation.data ? (
          <SimulationResultPanel view={toSimulationView(simulation.data)} />
        ) : (
          <p className="rounded-md border border-dashed border-border p-6 font-body text-sm text-muted-foreground">{t("access.simulator.idle")}</p>
        )}
      </div>
    </div>
  );
}
