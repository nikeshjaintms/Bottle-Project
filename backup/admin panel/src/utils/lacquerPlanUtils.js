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

/**
 * Pool-aware yellow warning: checks if a row is yellow considering earlier rows' orders.
 * 
 * Rule: A row in a pool is yellow when:
 * - It is NOT completed, AND
 * - Stock left for it (opening stock - sum of earlier non-completed rows' remaining orders) < its own order qty
 * 
 * Partly coated rows count only their remaining part (order - coated) against the pool.
 * Earlier completed rows don't use stock (already accounted for).
 *
 * @param {Object} row - The row to check
 * @param {Array} allPoolRows - All rows in the same pool, in saved order
 * @param {number} openingStock - Pool's opening stock for that date
 * @returns {boolean}
 */
export const checkRowStockWarningInPool = (row, allPoolRows = [], openingStock = 0) => {
  const orderQty = parseFloat(row.orderQty) || 0;
  
  // Only non-completed rows can be yellow
  const isCompleted = isPlanRowCompleted(row);
  if (isCompleted || orderQty <= 0) return false;
  
  if (openingStock === undefined || openingStock === null || !Number.isFinite(Number(openingStock))) {
    return false;
  }
  
  // Find this row's index in the pool
  const rowIndex = allPoolRows.findIndex(r => r === row);
  if (rowIndex === -1) return false;
  
  // Sum all earlier non-completed rows' remaining orders
  let usedByEarlierRows = 0;
  for (let i = 0; i < rowIndex; i++) {
    const earlierRow = allPoolRows[i];
    if (!isPlanRowCompleted(earlierRow)) {
      const earlierOrder = parseFloat(earlierRow.orderQty) || 0;
      const earlierCoated = getCoatedQty(earlierRow);
      const earlierRemaining = Math.max(0, earlierOrder - earlierCoated);
      usedByEarlierRows += earlierRemaining;
    }
  }
  
  // Stock remaining for this row
  const stockLeftForThisRow = Math.max(0, openingStock - usedByEarlierRows);
  
  // Yellow if order exceeds remaining stock
  return orderQty > stockLeftForThisRow;
};
