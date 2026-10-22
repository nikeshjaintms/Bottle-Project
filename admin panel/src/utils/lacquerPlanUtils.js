/**
 * Rule L1: A row is COMPLETED when coated >= order, i.e. balance 0 or positive (over-completion counts).
 * Order 0 or coated 0 is not completed.
 *
 * @param {Object} item
 * @returns {boolean}
 */
export const isPlanRowCompleted = (item) => {
  if (!item) return false;
  const order = Number(item.orderQty) || 0;
  const coated = Number(
    item.coatingCompletedQty !== undefined && item.coatingCompletedQty !== null
      ? item.coatingCompletedQty
      : (item.coatedQty || 0)
  );

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
 * @param {number|string} orderQty
 * @param {number} openingStock
 * @returns {boolean}
 */
export const checkRowStockWarning = (orderQty, openingStock) => {
  const order = parseFloat(orderQty) || 0;
  if (order <= 0) return false;
  return order > Number(openingStock);
};
