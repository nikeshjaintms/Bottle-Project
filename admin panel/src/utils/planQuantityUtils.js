export const getBalanceToMake = (orderQty, completedQty) =>
  (Number(orderQty) || 0) - (Number(completedQty) || 0);
