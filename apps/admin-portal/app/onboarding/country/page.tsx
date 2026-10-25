import { redirect } from "next/navigation";
import { onboardingRoutes } from "@/constants/routes";

// Country persistence has no backend contract (checklist T04); the step is not offered.
export default function CountryPage() {
  redirect(onboardingRoutes.root());
}
