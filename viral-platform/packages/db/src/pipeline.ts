import type { ProjectStatus } from '@vp/shared';
import { eq } from 'drizzle-orm';
import { db } from './client.js';
import { jobsLog, projects } from './schema.js';

export async function setProjectStatus(projectId: string, status: ProjectStatus): Promise<void> {
  await db
    .update(projects)
    .set({ status, updatedAt: new Date() })
    .where(eq(projects.id, projectId));
}

export async function failProject(projectId: string, reason: string): Promise<void> {
  await db
    .update(projects)
    .set({ status: 'failed', failureReason: reason, updatedAt: new Date() })
    .where(eq(projects.id, projectId));
}

export async function logJobStart(jobId: string, projectId: string, type: string): Promise<string> {
  const [row] = await db
    .insert(jobsLog)
    .values({ jobId, projectId, type, status: 'running' })
    .returning({ id: jobsLog.id });
  return row?.id ?? '';
}

export async function logJobFinish(logId: string, status: string, error?: string): Promise<void> {
  if (!logId) return;
  await db
    .update(jobsLog)
    .set({ status, error: error ?? null, finishedAt: new Date() })
    .where(eq(jobsLog.id, logId));
}
