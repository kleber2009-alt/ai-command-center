import type { Db } from './index.js';
import type { Logger } from '../logger.js';
import type { LeadStatus, MessageClass } from '../types.js';

// Commercial track ranking — climbs in one direction. 'support' and
// 'negative' are orthogonal terminal labels, not part of the rank.
const COMMERCIAL_RANK: Record<LeadStatus, number> = {
  new: 0,
  cold: 1,
  warm: 2,
  hot: 3,
  buyer: 4,
  support: -1,
  negative: -1,
};

// Per-class status target on the commercial track.
const CLASS_TARGET: Partial<Record<MessageClass, LeadStatus>> = {
  GENERAL_CHAT: 'cold',
  QUESTION: 'warm',
  PRODUCT_INTEREST: 'warm',
  PRICE_REQUEST: 'hot',
  OBJECTION: 'hot',
  BUYING_INTENT: 'buyer',
};

// Decide the new status. Rules:
// - 'negative' is sticky: once set, the auto rules never change it
//   (manual override only — UI in stage 7 will allow that).
// - SUPPORT_REQUEST sets 'support' unless already 'buyer' (paying
//   customer with support need stays 'buyer' — same person, different
//   axis; we keep the commercially-relevant label).
// - NEGATIVE sets 'negative'.
// - Otherwise climb the commercial track to the per-class target.
//   Never downgrade.
export function nextLeadStatus(
  current: LeadStatus,
  cls: MessageClass,
): LeadStatus {
  if (current === 'negative') return current;
  if (cls === 'NEGATIVE') return 'negative';
  if (cls === 'SUPPORT_REQUEST') {
    return current === 'buyer' ? 'buyer' : 'support';
  }

  const target = CLASS_TARGET[cls];
  if (!target) return current; // SPAM, OWNER_REQUEST → no commercial change
  const currentRank = COMMERCIAL_RANK[current];
  const targetRank = COMMERCIAL_RANK[target];
  if (currentRank < 0) return current; // on a terminal track
  return targetRank > currentRank ? target : current;
}

export interface UserContext {
  chatId: number;
  userId: number;
  username: string | undefined;
  firstName: string | undefined;
  lastName: string | undefined;
}

export interface LeadUpdate {
  status: LeadStatus;
  previousStatus: LeadStatus;
  changed: boolean;
}

export interface LeadService {
  touchAndClassify(user: UserContext, cls: MessageClass): Promise<LeadUpdate>;
}

const DEFAULT_UPDATE: LeadUpdate = {
  status: 'new',
  previousStatus: 'new',
  changed: false,
};

export function createLeadService(db: Db, logger: Logger): LeadService {
  return {
    async touchAndClassify(user, cls): Promise<LeadUpdate> {
      if (!db) return DEFAULT_UPDATE;

      const now = new Date().toISOString();

      const { data: existing, error: readError } = await db
        .from('tg_users')
        .select('status')
        .eq('chat_id', user.chatId)
        .eq('user_id', user.userId)
        .maybeSingle();

      if (readError) {
        logger.error('lead read failed', {
          chatId: user.chatId,
          userId: user.userId,
          error: readError.message,
        });
        return DEFAULT_UPDATE;
      }

      const previousStatus: LeadStatus = (existing?.status as LeadStatus) ?? 'new';
      const newStatus = nextLeadStatus(previousStatus, cls);
      const statusChanged = newStatus !== previousStatus;

      const upsertPayload: Record<string, unknown> = {
        chat_id: user.chatId,
        user_id: user.userId,
        username: user.username ?? null,
        first_name: user.firstName ?? null,
        last_name: user.lastName ?? null,
        status: newStatus,
        last_seen_at: now,
      };
      if (statusChanged || !existing) {
        upsertPayload.status_updated_at = now;
      }

      const { error: writeError } = await db
        .from('tg_users')
        .upsert(upsertPayload, { onConflict: 'chat_id,user_id' });

      if (writeError) {
        logger.error('lead upsert failed', {
          chatId: user.chatId,
          userId: user.userId,
          error: writeError.message,
        });
      }

      return {
        status: newStatus,
        previousStatus,
        changed: statusChanged,
      };
    },
  };
}
