/**
 * Rule L1: A row is COMPLETED when coated >= order, i.e. balance 0 or positive (over-completion counts).
 * Order 0 or coated 0 is not completed.
 *
 * Uses the larger of coatingCompletedQty and coatedQty (or whichever is present and non-zero),
 * preventing edge cases where coatingCompletedQty is 0 but coatedQty is 800.
 *
 * @param {Object} item
 * @returns {number}
 */
export const getCoatedQty = (item) => {
  if (!item) return 0;
  const c1 = Number(item.coatingCompletedQty);
  const c2 = Number(item.coatedQty);
  if (Number.isFinite(c1) && Number.isFinite(c2)) {
    return Math.max(c1, c2);
  }
  if (Number.isFinite(c1)) return c1;
  if (Number.isFinite(c2)) return c2;
  return 0;
};

/**
 * Checks if a plan row is completed.
 *
 * @param {Object} item
 * @returns {boolean}
 */
export const isPlanRowCompleted = (item) => {
  if (!item) return false;
  const order = Number(item.orderQty) || 0;
  const coated = getCoatedQty(item);

  // Order 0 or coated 0 is not completed
  if (order <= 0 || coated <= 0) {
    return false;
  }

  return coated >= order;
};

/**
 * Rule: For a row, the warning applies only when that row's own Order Qty > the opening stock
 * of its pool for that date, where the pool is (company, plain bottle) and
 * opening stock = shown stock + that date's Σ Coating Completed Qty of the pool.
 * The sum of other rows' orders is never part of it, and nothing else (coated qty, balance, other rows) triggers it.
 * A blank or zero order never warns.
 *
 * Returns false only when openingStock is not a finite number. Callers must pass the API’s openingStock,
 * never plainStock, and the warning stays hidden until the fetch has returned.
 *
 * @param {number|string} orderQty
 * @param {number} openingStock
 * @returns {boolean}
 */
export const checkRowStockWarning = (orderQty, openingStock) => {
  const order = parseFloat(orderQty) || 0;
  if (order <= 0) return false;
  if (openingStock === undefined || openingStock === null || !Number.isFinite(Number(openingStock))) {
    return false;
  }
  return order > Number(openingStock);
};
