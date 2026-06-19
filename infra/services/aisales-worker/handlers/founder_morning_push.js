import { sendText } from '../lib/tg.js';
import {
  fetchFounderPlanSnapshot,
  founderPlanKeyboard,
  getFounderTelegramId,
  isFounderPlanEnabled,
  listFounderPriorityTasks,
  renderFounderPlanMessage,
} from '../lib/founder_plan.js';

export async function handle() {
  const founderChatId = getFounderTelegramId();
  if (!isFounderPlanEnabled() || !founderChatId) {
    return { ok: false, error: 'founder_plan_disabled' };
  }

  const snapshotResult = await fetchFounderPlanSnapshot();
  if (!snapshotResult.ok) {
    return { ok: false, error: snapshotResult.error };
  }

  const tasks = await listFounderPriorityTasks(3);
  const text = renderFounderPlanMessage(snapshotResult.snapshot, tasks);
  const tgRes = await sendText(founderChatId, text, {
    reply_markup: founderPlanKeyboard(tasks),
  });

  if (!tgRes.ok) {
    return { ok: false, error: tgRes.error || 'telegram_send_failed' };
  }

  return {
    ok: true,
    tg_message_id: tgRes.result?.message_id || null,
    priority_count: tasks.length,
  };
}
