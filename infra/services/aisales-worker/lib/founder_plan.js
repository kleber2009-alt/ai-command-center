import { query, withTx } from './db.js';

const OWNER_TELEGRAM_ID = Number(process.env.OWNER_TELEGRAM_ID || 0);
const OFFICE_HQ_BASE_URL = (process.env.OFFICE_HQ_BASE_URL || '').replace(/\/+$/, '');
const OFFICE_HQ_WEB_URL = (process.env.OFFICE_HQ_WEB_URL || OFFICE_HQ_BASE_URL || '').replace(/\/+$/, '');
const OFFICE_HQ_TIMEOUT_MS = Math.max(1000, Number(process.env.OFFICE_HQ_TIMEOUT_MS || 7000));

const AGENT_LABELS = {
  'chief-of-staff': 'Шеф штаба',
  'product-agent': 'Продукт',
  'growth-agent': 'Рост',
  'research-agent': 'Ресерч',
  'sales-agent': 'Продажи',
  'support-agent': 'Поддержка',
  'ops-agent': 'Операции',
  'finance-agent': 'Финансы',
};

const TASK_STATUS_LABELS = {
  new: 'новая',
  triaged: 'разобрана',
  in_progress: 'в работе',
  blocked: 'заблокирована',
  waiting_approval: 'ждет апрува',
  done: 'выполнена',
  canceled: 'отменена',
};

const PRIORITY_LABELS = {
  p0: 'P0',
  p1: 'P1',
  p2: 'P2',
  p3: 'P3',
};

function escapeHtml(s) {
  return String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
}

function taskStatusLabel(value) {
  return TASK_STATUS_LABELS[value] || value;
}

function taskOwnerLabel(value) {
  return AGENT_LABELS[value] || value || 'не назначен';
}

function taskPriorityLabel(value) {
  return PRIORITY_LABELS[value] || String(value || '').toUpperCase();
}

export function isFounderPlanEnabled() {
  return Boolean(OWNER_TELEGRAM_ID && OFFICE_HQ_BASE_URL);
}

export function getFounderTelegramId() {
  return OWNER_TELEGRAM_ID;
}

export function founderPlanWebUrl() {
  return OFFICE_HQ_WEB_URL;
}

export async function fetchFounderPlanSnapshot() {
  if (!OFFICE_HQ_BASE_URL) {
    return { ok: false, error: 'OFFICE_HQ_BASE_URL is not set' };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OFFICE_HQ_TIMEOUT_MS);

  try {
    const url = new URL('/api/office/hq', OFFICE_HQ_BASE_URL);
    url.searchParams.set('view', 'snapshot');
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      return { ok: false, error: data?.error || `HQ API ${res.status}` };
    }
    return { ok: true, snapshot: data };
  } catch (error) {
    return {
      ok: false,
      error: error?.name === 'AbortError' ? 'HQ API timeout' : (error?.message || String(error)),
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function listFounderPriorityTasks(limit = 3) {
  const rows = await query(
    `
      select
        t.id::text as id,
        t.title,
        t.summary,
        coalesce(t.project_slug, 'portfolio') as project_slug,
        coalesce(t.owner_agent_slug, 'unassigned') as owner_agent_slug,
        t.status::text as status,
        t.priority::text as priority,
        exists(
          select 1
          from office_task_links l
          where l.task_id = t.id
            and l.link_kind = 'execution.local.confirmed'
        ) as local_confirmed,
        exists(
          select 1
          from office_task_links l
          where l.task_id = t.id
            and l.link_kind = 'execution.prod.requested'
        ) as prod_requested,
        (
          select d.id::text
          from office_decisions d
          where d.source_task_id = t.id
            and d.status = 'pending'
            and d.recommended_option_key = 'ship_prod'
          order by d.requested_at desc
          limit 1
        ) as prod_decision_id
      from office_tasks t
      where t.status <> 'done'
        and (
          t.priority in ('p0', 'p1')
          or t.status in ('waiting_approval', 'in_progress')
        )
      order by
        case t.priority
          when 'p0' then 0
          when 'p1' then 1
          when 'p2' then 2
          else 3
        end,
        case t.status
          when 'waiting_approval' then 0
          when 'in_progress' then 1
          when 'new' then 2
          when 'triaged' then 3
          else 4
        end,
        t.updated_at desc
      limit $1
    `,
    [limit],
  );

  return rows.map((row, index) => ({
    index: index + 1,
    id: row.id,
    title: row.title,
    summary: row.summary,
    project: row.project_slug,
    ownerAgent: row.owner_agent_slug,
    status: row.status,
    priority: row.priority,
    localConfirmed: Boolean(row.local_confirmed),
    prodRequested: Boolean(row.prod_requested),
    prodDecisionId: row.prod_decision_id || null,
  }));
}

export function renderFounderPlanMessage(snapshot, tasks) {
  const lines = [
    '<b>Доброе утро. Шеф штаба собрал план дня.</b>',
    '',
    `<b>Фокус недели:</b> ${escapeHtml(snapshot?.summary?.weeklyFocus || 'не задан')}`,
    `<b>Что требует внимания:</b> ${escapeHtml(String(snapshot?.summary?.pendingDecisions || 0))} решений · ${escapeHtml(String(snapshot?.summary?.criticalAlerts || 0))} критических алертов`,
    '',
  ];

  if (!Array.isArray(tasks) || tasks.length === 0) {
    lines.push('Срочных задач на утро не найдено.');
  } else {
    lines.push('<b>3 приоритета на сегодня</b>');
    for (const task of tasks) {
      const localLine = task.localConfirmed ? 'подтверждено' : 'ждет подтверждения';
      const prodLine = task.prodRequested ? 'апрув уже запрошен' : 'пока не запрошен';
      lines.push(
        `${task.index}. <b>${escapeHtml(task.title)}</b>`,
        `   ${escapeHtml(taskPriorityLabel(task.priority))} · ${escapeHtml(taskStatusLabel(task.status))} · ${escapeHtml(task.project)}`,
        `   Владелец: ${escapeHtml(taskOwnerLabel(task.ownerAgent))}`,
        `   Локально: ${escapeHtml(localLine)} · Прод: ${escapeHtml(prodLine)}`,
      );
    }
  }

  lines.push(
    '',
    '<b>Твой ритуал:</b>',
    '1. Подтверди, что берем задачу в локальную работу.',
    '2. После локального шага отдельно запроси прод-апрув.',
    '3. Прод идет только через дополнительное подтверждение.',
  );

  return lines.join('\n');
}

export function founderPlanKeyboard(tasks) {
  const rows = [];
  for (const task of tasks) {
    if (!task.localConfirmed) {
      rows.push([{ text: `Локально #${task.index}`, callback_data: `plan:local:${task.id}` }]);
      continue;
    }
    if (!task.prodRequested) {
      rows.push([{ text: `Запросить прод #${task.index}`, callback_data: `plan:prod:${task.id}` }]);
    }
  }

  rows.push([{ text: 'Обновить план', callback_data: 'plan:refresh' }]);

  if (OFFICE_HQ_WEB_URL) {
    rows.push([
      { text: 'Открыть штаб', url: `${OFFICE_HQ_WEB_URL}/office/hq` },
      { text: 'Открыть решения', url: `${OFFICE_HQ_WEB_URL}/office/decisions` },
    ]);
  }

  return { inline_keyboard: rows };
}

export async function confirmFounderTaskLocal(taskId, actorId) {
  try {
    const result = await withTx(async (client) => {
      const taskRes = await client.query(
        `
          select id, title, project_slug, owner_agent_slug, status::text as status, priority::text as priority
          from office_tasks
          where id = $1::uuid
          for update
        `,
        [taskId],
      );

      if (!taskRes.rows.length) {
        return { ok: false, status: 404, error: 'task_not_found' };
      }

      const task = taskRes.rows[0];
      const existing = await client.query(
        `
          select id
          from office_task_links
          where task_id = $1::uuid
            and link_kind = 'execution.local.confirmed'
          limit 1
        `,
        [taskId],
      );

      if (!existing.rows.length) {
        await client.query(
          `
            update office_tasks
            set status = case
              when status in ('new', 'triaged', 'waiting_approval') then 'in_progress'::office_task_status
              else status
            end,
            updated_at = now()
            where id = $1::uuid
          `,
          [taskId],
        );

        await client.query(
          `
            insert into office_task_links (task_id, link_kind, link_ref, label)
            values ($1::uuid, 'execution.local.confirmed', $2, $3)
          `,
          [taskId, `telegram:${actorId || 'owner'}`, 'Локально подтверждено основателем'],
        );

        await client.query(
          `
            insert into office_journal_entries (entity_kind, entity_id, action_kind, actor_type, actor_id, narrative, metadata)
            values ('office_task', $1::uuid, 'task.local_confirmed', 'human', $2, $3, $4::jsonb)
          `,
          [
            taskId,
            actorId || 'owner',
            `Основатель подтвердил локальный запуск задачи «${task.title}».`,
            JSON.stringify({ stage: 'local', project: task.project_slug || null }),
          ],
        );
      }

      return {
        ok: true,
        status: 200,
        task: {
          id: task.id,
          title: task.title,
          project: task.project_slug || 'portfolio',
        },
        alreadyConfirmed: existing.rows.length > 0,
      };
    });

    return result;
  } catch (error) {
    return { ok: false, status: 503, error: error?.message || String(error) };
  }
}

export async function requestFounderTaskProdApproval(taskId, actorId) {
  try {
    const result = await withTx(async (client) => {
      const taskRes = await client.query(
        `
          select id, title, summary, project_slug
          from office_tasks
          where id = $1::uuid
          for update
        `,
        [taskId],
      );

      if (!taskRes.rows.length) {
        return { ok: false, status: 404, error: 'task_not_found' };
      }

      const task = taskRes.rows[0];

      const localConfirmed = await client.query(
        `
          select id
          from office_task_links
          where task_id = $1::uuid
            and link_kind = 'execution.local.confirmed'
          limit 1
        `,
        [taskId],
      );

      if (!localConfirmed.rows.length) {
        return { ok: false, status: 409, error: 'local_confirmation_required' };
      }

      const existingDecision = await client.query(
        `
          select id::text as id
          from office_decisions
          where source_task_id = $1::uuid
            and status = 'pending'
            and recommended_option_key = 'ship_prod'
          order by requested_at desc
          limit 1
        `,
        [taskId],
      );

      if (existingDecision.rows.length) {
        return {
          ok: true,
          status: 200,
          alreadyRequested: true,
          decision: { id: existingDecision.rows[0].id },
          task: { id: task.id, title: task.title },
        };
      }

      const decisionRes = await client.query(
        `
          insert into office_decisions (
            title,
            summary,
            status,
            project_slug,
            requested_by_agent_slug,
            source_task_id,
            recommended_option_key,
            requested_at,
            resolution_note
          )
          values ($1, $2, 'pending', $3, 'chief-of-staff', $4::uuid, 'ship_prod', now(), $5)
          returning id::text as id
        `,
        [
          `Разрешить прод по задаче: ${task.title}?`,
          task.summary || 'Локальный шаг подтвержден. Нужен отдельный апрув на прод.',
          task.project_slug || 'portfolio',
          taskId,
          'Решение создано после подтверждения локального шага основателем.',
        ],
      );

      const decisionId = decisionRes.rows[0].id;

      await client.query(
        `
          insert into office_decision_options (decision_id, option_key, label, tradeoffs, is_recommended)
          values
            ($1::uuid, 'ship_prod', 'Выкатить в прод', 'Переход в прод после локального подтверждения.', true),
            ($1::uuid, 'hold_local', 'Оставить на локали', 'Сохраняем задачу в локальной работе до следующего апрува.', false)
          on conflict (decision_id, option_key) do update set
            label = excluded.label,
            tradeoffs = excluded.tradeoffs,
            is_recommended = excluded.is_recommended
        `,
        [decisionId],
      );

      await client.query(
        `
          insert into office_task_links (task_id, link_kind, link_ref, label)
          values ($1::uuid, 'execution.prod.requested', $2, $3)
        `,
        [taskId, decisionId, 'Запрошен прод-апрув'],
      );

      await client.query(
        `
          insert into office_journal_entries (entity_kind, entity_id, action_kind, actor_type, actor_id, narrative, metadata)
          values ('office_decision', $1::uuid, 'decision.requested', 'human', $2, $3, $4::jsonb)
        `,
        [
          decisionId,
          actorId || 'owner',
          `Основатель запросил прод-апрув по задаче «${task.title}».`,
          JSON.stringify({ stage: 'prod', sourceTaskId: taskId, project: task.project_slug || null }),
        ],
      );

      return {
        ok: true,
        status: 200,
        alreadyRequested: false,
        decision: { id: decisionId },
        task: { id: task.id, title: task.title },
      };
    });

    return result;
  } catch (error) {
    return { ok: false, status: 503, error: error?.message || String(error) };
  }
}
