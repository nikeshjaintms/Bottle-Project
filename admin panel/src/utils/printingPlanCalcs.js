/**
 * UNIFIED BALANCE AND STOCK CALCULATION FOR PRINTING PLAN
 * 
 * Rules:
 * - For PLAIN shade: Balance = orderQty - producedQty (stock never enters)
 * - For non-PLAIN shade: Balance = orderQty - producedQty (stock never enters)
 * - Stock (display only): opening coated stock for the shade/company
 * 
 * This function is called by Add form, Edit form, list display, and footer totals.
 */

export const calculateBalanceAndStock = (row, allRowsInBlock, companyId) => {
  if (!row) return { balanceToMake: 0, displayStock: 0 };

  const shade = (row.coatingShade || '').trim().toUpperCase();
  const orderQty = parseFloat(row.orderQty) || 0;
  const producedQty = parseFloat(row.producedQty) || 0;
  
  // RULE 1: Balance is ALWAYS orderQty - producedQty for all shades
  const balanceToMake = Math.max(0, orderQty - producedQty);
  
  // RULE 2: Display stock (informational only, not used in balance)
  // For PLAIN: uses plainBottleStock
  // For non-PLAIN: uses coatedStockAvailable
  const displayStock = shade === 'PLAIN' 
    ? (parseFloat(row.plainBottleStock) || 0)
    : (parseFloat(row.coatedStockAvailable) || 0);
  
  return {
    balanceToMake,
    displayStock
  };
};

/**
 * Recalculate balance for all rows in a block after any change
 * Used by Add and Edit forms when balance depends on current form state
 */
export const recalculateBalanceForBlock = (items, companyId) => {
  if (!Array.isArray(items)) return items;
  
  return items.map(item => {
    const calcs = calculateBalanceAndStock(item, items, companyId);
    return {
      ...item,
      balanceToMake: calcs.balanceToMake
    };
  });
};

/**
 * Calculate balance for a single row
 * Used by list display to show current balance
 */
export const calculateBalance = (orderQty, producedQty) => {
  const o = parseFloat(orderQty) || 0;
  const p = parseFloat(producedQty) || 0;
  return Math.max(0, o - p);
};
