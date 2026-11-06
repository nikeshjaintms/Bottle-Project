const calculateBalanceToMake = (orderQty, completedQty) =>
  (Number(orderQty) || 0) - (Number(completedQty) || 0);

const getCoatingCompletedQty = plan => {
  if (!plan) return 0;
  const coatingCompletedQty = Number(plan.coatingCompletedQty);
  const coatedQty = Number(plan.coatedQty);
  if (Number.isFinite(coatingCompletedQty) && Number.isFinite(coatedQty)) {
    return Math.max(coatingCompletedQty, coatedQty);
  }
  if (Number.isFinite(coatingCompletedQty)) return coatingCompletedQty;
  if (Number.isFinite(coatedQty)) return coatedQty;
  return 0;
};

const isCoatingHistoryEntry = entry =>
  entry.subType === "coated" ||
  entry.type === "coatedQty" ||
  (entry.type === "edit-adjustment" && entry.subType === "coated");

const isRejectionHistoryEntry = entry =>
  isCoatingHistoryEntry(entry) ||
  (entry.type === "coatingCompletedQty" && entry.subType === "carried");

const getEntryRejectionQty = (entry, boxQty = 0) => {
  if (entry.rejectionQty !== undefined && entry.rejectionQty !== null) {
    const rejectionQty = Number(entry.rejectionQty);
    if (!Number.isInteger(rejectionQty) || rejectionQty < 0) return 0;
    if (rejectionQty > 0) return rejectionQty;
  }
  const rawBoxes = Number(entry.rejectionBoxes) || 0;
  const rawLoose = Number(entry.rejectionLooseQty) || 0;
  if (!Number.isInteger(rawBoxes) || rawBoxes < 0 || !Number.isInteger(rawLoose) || rawLoose < 0) return 0;
  const boxes = rawBoxes;
  const loose = rawLoose;
  return boxes * (Number(boxQty) || 0) + loose;
};

const getCoatingRejectedQty = (entries, boxQty = 0) =>
  (Array.isArray(entries) ? entries : [])
    .filter(entry =>
      !entry.isDeleted &&
      isRejectionHistoryEntry(entry) &&
      (entry.type === "coatingCompletedQty" && entry.subType === "carried" || (Number(entry.qty) || 0) > 0)
    )
    .reduce((sum, entry) => sum + getEntryRejectionQty(entry, boxQty), 0);

const getStockDeductibleRejectedQty = (entries, boxQty = 0) =>
  (Array.isArray(entries) ? entries : [])
    .filter(entry =>
      !entry.isDeleted &&
      entry.subType !== "carried" &&
      isCoatingHistoryEntry(entry) &&
      (Number(entry.qty) || 0) > 0
    )
    .reduce((sum, entry) => sum + getEntryRejectionQty(entry, boxQty), 0);

const getActiveCoatingEntryQty = entries =>
  (Array.isArray(entries) ? entries : [])
    .filter(entry => !entry.isDeleted && isCoatingHistoryEntry(entry))
    .reduce((sum, entry) => sum + (Number(entry.qty) || 0), 0);

module.exports = {
  calculateBalanceToMake,
  getCoatingCompletedQty,
  getCoatingRejectedQty,
  getStockDeductibleRejectedQty,
  getEntryRejectionQty,
  getActiveCoatingEntryQty,
  isCoatingHistoryEntry
};
