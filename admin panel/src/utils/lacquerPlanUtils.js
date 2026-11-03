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
  if (item.isClosed || item.productionStatus === 'CLOSED') return true;
  const order = Number(item.orderQty) || 0;
  const coated = getCoatedQty(item);

  // Order 0 or coated 0 is not completed
  if (order <= 0 || coated <= 0) {
    return false;
  }

  return (coated - order) >= 0;
};
