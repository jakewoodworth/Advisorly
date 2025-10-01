import { PlannerShell } from "@/components/Planner/PlannerShell";

export default function PlannerPage() {
  const advisorEnabled = process.env.AI_ENABLED === "true";

  return <PlannerShell advisorEnabled={advisorEnabled} />;
}
