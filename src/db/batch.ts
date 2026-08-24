/**
 * D1 binds at most 100 parameters per prepared statement.
 *
 * A multi-row INSERT multiplies rows by columns, so a 20-row insert of a
 * 10-column table quietly exceeds the limit and fails at runtime — not at
 * type-check time. Every bulk insert in this codebase goes through
 * `chunkRows`, which splits by the actual parameter budget rather than by an
 * arbitrary row count.
 */

export const D1_MAX_BOUND_PARAMS = 100;

/**
 * Splits `rows` into batches that each stay within the parameter budget.
 *
 * @param columnsPerRow number of columns the insert writes per row
 */
export function chunkRows<T>(rows: T[], columnsPerRow: number): T[][] {
  if (rows.length === 0) return [];

  const perBatch = Math.max(1, Math.floor(D1_MAX_BOUND_PARAMS / Math.max(1, columnsPerRow)));
  const batches: T[][] = [];

  for (let index = 0; index < rows.length; index += perBatch) {
    batches.push(rows.slice(index, index + perBatch));
  }

  return batches;
}
