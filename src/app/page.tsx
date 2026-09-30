import { OperationsDesk } from "@/components/dashboard/operations-desk";
import { getSessionViewer, getWebRequestContext } from "@/server/auth/session";
import { getDashboard } from "@/server/services/dashboard-service";

export default async function Dashboard() {
  const [viewer, context] = await Promise.all([getSessionViewer(), getWebRequestContext()]);
  const data = getDashboard(context);
  return <OperationsDesk firstName={viewer?.name.split(" ")[0] ?? "there"} data={data} />;
}
