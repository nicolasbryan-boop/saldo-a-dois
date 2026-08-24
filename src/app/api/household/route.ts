import { z } from 'zod';
import { handle, jsonOk, readJson } from '@/server/api';
import { getAppContext } from '@/server/app-context';
import { updateHousehold } from '@/domains/households/service';
import { ensureCurrentCycle, setPlannedReserve } from '@/domains/cycles/service';

export const dynamic = 'force-dynamic';

const schema = z.object({
  name: z.string().trim().min(1, 'Dê um nome ao espaço').max(80).optional(),
  cycleStartDay: z.number().int().min(1).max(28).optional(),
  monthlyReserveCents: z.number().int().min(0).optional(),
});

export const PATCH = handle(async (request) => {
  const context = await getAppContext();
  const body = await readJson(request, schema);

  const household = await updateHousehold(
    context.db,
    context.household.id,
    context.user.id,
    body,
  );

  // The reserve target of the cycle in progress follows the household setting;
  // closed cycles keep the target they were planned with.
  if (body.monthlyReserveCents !== undefined) {
    const cycle = await ensureCurrentCycle(context.db, household);
    await setPlannedReserve(context.db, household.id, cycle.id, body.monthlyReserveCents);
  }

  return jsonOk({ household });
});
