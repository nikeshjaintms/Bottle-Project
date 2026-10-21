import { useEffect, useState } from 'react';

const STORAGE_KEY = 'printingPlanLanguage';

export const PRINTING_PLAN_LABELS = {
  en: {
    sr: "Sr.",
    bottleName: "Plain Bottle",
    coatingShade: "Coating Shade",
    printingToBeDone: "Printing to be done",
    textColor: "Text Color",
    brand: "Brand",
    process: "Process",
    plainColouredBottleStock: "Plain / Coloured Bottle Stock",
    orderQty: "Order Qty",
    balanceToMake: "Balance still to be made",
    bottlePerBox: "Bottle per Box",
    noOfOrderBoxes: "No. of Order Boxes",
    readyPrintedQty: "Ready (Printed) Qty",
    balanceToBeDispatched: "Balance still to be dispatched",
    soldQty: "Sold Qty",
    readyBoxes: "Ready Boxes",
    remarks: "Remarks",
    actions: "Actions",
    plainStockExceedWarning: "Total Order Qty exceeds Plain / Coloured Bottle Stock",

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
    company: "Company",
    status: "Status",
    reason: "Reason"
  },
  gu: {
    sr: "નંબર",
    bottleName: "પ્લેઈન બોટલ",
    coatingShade: "પ્રોડક્ટ નામ",
    printingToBeDone: "પ્રિન્ટિંગ કરવાનું",
    textColor: "ટેક્સ્ટ કલર",
    brand: "BRAND",
    process: "પ્રક્રિયા",
    plainColouredBottleStock: "પ્લેઈન / કલરવાળું બોટલ સ્ટોક",
    orderQty: "બનાવવાનો ઓર્ડર",
    balanceToMake: "બનાવવાનો બાકી માલ",
    bottlePerBox: "બોક્સ ના પીસ",
    noOfOrderBoxes: "ઓર્ડર બોક્સ",
    readyPrintedQty: "તૈયાર થયેલ માલ",
    balanceToBeDispatched: "મોકલવાનું બાકી માલ",
    soldQty: "વેચેલ માલ",
    readyBoxes: "રેડી બોક્સ",
    remarks: "રીમાર્ક",
    actions: "એક્શન",
    plainStockExceedWarning: "કુલ બનાવવાનો ઓર્ડર સ્ટોક કરતા વધી ગયો",

    // General & Actions (Not requested to be translated except for headers, but falling back to English just in case they are used in header context)
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
    company: "કંપની",
    status: "સ્ટેટસ",
    reason: "કારણ"
  }
};

export const usePrintingPlanLanguage = () => {
  const [language, setLanguage] = useState(() => {
    if (typeof window === 'undefined') {
      return 'en';
    }
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved === 'gu' ? 'gu' : 'en';
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, language);
  }, [language]);

  const labels = language === 'gu' ? PRINTING_PLAN_LABELS.gu : PRINTING_PLAN_LABELS.en;

  const toggleLanguage = () => {
    const nextLanguage = language === 'en' ? 'gu' : 'en';
    setLanguage(nextLanguage);
    localStorage.setItem(STORAGE_KEY, nextLanguage);
  };

  const changeLanguage = (nextLanguage) => {
    if (nextLanguage !== 'en' && nextLanguage !== 'gu') return;
    setLanguage(nextLanguage);
    localStorage.setItem(STORAGE_KEY, nextLanguage);
  };

  return {
    language,
    setLanguage: changeLanguage,
    toggleLanguage,
    labels
  };
};
