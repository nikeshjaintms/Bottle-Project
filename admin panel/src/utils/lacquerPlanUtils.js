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
