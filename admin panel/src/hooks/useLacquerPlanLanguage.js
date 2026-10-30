import { useEffect, useState } from 'react';

const STORAGE_KEY = 'lacquerPlanLanguage';

export const LACQUER_PLAN_LABELS = {
  en: {
    sr: "Sr.",
    variant: "Variant",
    coatingShade: "Coating Shade",
    brand: "Brand",
    process: "Process",
    plainStock: "Plain Stock",
    orderQty: "Order Qty",
    coatingCompletedQty: "Coating Completed Qty",
    balanceToMake: "Balance to Make",
    dispatchPendingQty: "Dispatch Pending Qty",
    soldQty: "Sold Qty",
    bottlePerBox: "Bottle per Box",
    noOfOrderBoxes: "No. of Order Boxes",
    remarks: "Remarks",
    actions: "Actions",
    plainStockExceedWarning: "Total Order Qty exceeds Plain / Coloured Bottle Stock",
    orderExceedsOpeningStock: "Order Qty exceeds the opening plain bottle stock for this group",
    orderExceedsOpeningStockTitle: "Stock Warning",
    coatedQtyExceedsStock: "Coating Qty cannot exceed the plain bottle stock",

    // General & Actions
    addPlan: "Add Plan",
    edit: "Edit",
    // History Section
    history: "History",
    usedFrom: "Used from",
    planEntries: "Plan Entries",
    orderQtyHistory: "Order Qty History",
    coatingCompletedHistory: "Coating Completed History",
    dateTime: "Date & Time",
    type: "Type",
    qtyChange: "Qty Change",
    runningTotal: "Running Total",
    user: "User",
    note: "Note",
    balanceAfterEntry: "Balance to Make",
    poolStockRemaining: "Plain Stock Remaining",
    poolStockTooltip: "Plain stock remaining for the pool at the plan date",
    openingBalance: "Opening balance",
    added: "Added",
    editAdjustment: "Edit adjustment",
    removed: "Removed",
    currentTotal: "Current Total",
    opening: "Opening",
    totalAdded: "Total Added",
    current: "Current",
    loadOlderEntries: "Load older entries",
    loadOlderEntriesCount: "Load older entries ({count} remaining)",
    detailsOfSelectedPlan: "Details of the selected lacquer plan",
    view: "View",
    delete: "Delete",
    save: "Save",
    cancel: "Cancel",
    search: "Search",
    reset: "Reset",
    createNewPlan: "Create New Plan",
    importPreviousPlan: "Import Previous Plan",
    importExcel: "Import Excel",
    date: "Date",
    fromDate: "From Date",
    toDate: "To Date",
    bottleName: "Plain Bottle",
    company: "Company",
    status: "Status",
    reason: "Reason",
    selectBottle: "Select bottle...",
    selectCompany: "Select company...",
    updatePlan: "Update Plan",
    close: "Close"
  },

  gu: {
    sr: "નંબર",
    variant: "પ્રોડક્ટ નામ",
    coatingShade: "કલર",
    brand: "BRAND",
    process: "પ્રક્રિયા",
    plainStock: "પ્લેઈન સ્ટોક",
    orderQty: "બનાવવાનો ઓર્ડર",
    coatingCompletedQty: "કોટીંગ થયેલ માલ",
    balanceToMake: "બનાવવાનો બાકી માલ",
    dispatchPendingQty: "મોકલવાનું બાકી માલ",
    soldQty: "વેચેલ માલ",
    bottlePerBox: "બોક્સ ના પીસ",
    noOfOrderBoxes: "ઓર્ડર બોક્સ",
    remarks: "રીમાર્ક",
    actions: "એક્શન",
    plainStockExceedWarning: "કુલ બનાવવાનો ઓર્ડર સ્ટોક કરતા વધી ગયો",
    orderExceedsOpeningStock: "ઓર્ડર ઓપનિંગ સ્ટોક કરતા વધારે છે",
    orderExceedsOpeningStockTitle: "સ્ટોક ચેતવણી",
    coatedQtyExceedsStock: "કોટીંગ ક્વોન્ટીટી સ્ટોક કરતા વધી શકે નહીં",
    usedFrom: "ક્યાંથી વપરાયેલ",

    // General & Actions
    addPlan: "Add Plan",
    edit: "Edit",
    view: "View",
    delete: "Delete",
    save: "Save",
    cancel: "Cancel",
    search: "Search",
    reset: "Reset",
    createNewPlan: "Create New Plan",
    importPreviousPlan: "Import Previous Plan",
    importExcel: "Import Excel",
    date: "Date",
    fromDate: "From Date",
    toDate: "To Date",
    bottleName: "પ્લેઈન બોટલ",
    company: "કંપની",
    status: "સ્ટેટસ",
    reason: "કારણ",
    selectBottle: "Select bottle...",
    selectCompany: "Select company...",
    updatePlan: "Update Plan",
    close: "Close"
  }
};

export const useLacquerPlanLanguage = () => {
  const [language, setLanguage] = useState(() => {
    if (typeof window === "undefined") {
      return "en";
    }
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved === "gu" ? "gu" : "en";
  });

  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY, language);
    }
  }, [language]);

  const labels = language === "gu" ? LACQUER_PLAN_LABELS.gu : LACQUER_PLAN_LABELS.en;

  const changeLanguage = (nextLanguage) => {
    if (nextLanguage !== "en" && nextLanguage !== "gu") {
      return;
    }
    setLanguage(nextLanguage);
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY, nextLanguage);
    }
  };

  const toggleLanguage = () => {
    changeLanguage(language === "en" ? "gu" : "en");
  };

  return {
    language,
    setLanguage: changeLanguage,
    toggleLanguage,
    labels
  };
};
