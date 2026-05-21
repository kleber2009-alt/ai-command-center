// /research/ig/[jobId] — polls job, renders IgResearchReport once completed.

import { ReportView } from "./ReportView";

export const dynamic = "force-dynamic";

export default async function IgResearchReportPage({ params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  return <ReportView jobId={jobId} />;
}
