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
    bottleName: "Bottle Name",
    company: "Company",
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
    bottleName: "બોટલ નું નામ",
    company: "Company",
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
