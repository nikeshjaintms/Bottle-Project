import { useEffect, useState } from 'react';

const STORAGE_KEY = 'summaryLanguage';

export const SUMMARY_LABELS = {
  en: {
    // Page Header & Navigation
    title: 'Summary Register',
    subtitle: 'Side-by-side comparison of Incoming, Dispatch, and SHRENO logs',
    backToCompanies: 'Back to Companies',
    companySummary: 'Company Summary',
    overviewTitle: 'Overview: All Bottles',
    bottleDetailTitle: 'Bottle Detail Log',
    languageToggle: 'ગુજરાતી',

    // Selectors & Filters
    selectCompany: 'Select Company',
    company: 'Company',
    bottle: 'Bottle',
    allBottles: 'All Bottles (Overview)',
    searchBottles: 'Search bottle name...',
    searchRecords: 'Search in records...',
    searchCompanies: 'Search companies...',
    fromDate: 'From Date',
    toDate: 'To Date',
    reset: 'Reset Filters',
    apply: 'Apply',
    entriesPerPage: 'Show',
    entries: 'entries',

    // KPIs & Cards
    totalIncoming: 'Total Incoming',
    totalDispatch: 'Total Dispatch',
    totalShreno: 'Total Packing Material',
    totalPackingMaterial: 'Total Packing Material',
    netDifference: 'Net Stock Balance (Incoming − Dispatch)',
    shrenoDifference: 'Packing Material Balance (PM − Dispatch)',
    boxes: 'boxes',
    pcs: 'pcs',

    // Block Titles
    blockIncoming: 'Incoming',
    blockDispatch: 'Dispatch',
    blockShreno: 'Packing Material',
    blockPackingMaterial: 'Packing Material',

    // Incoming Table Headers: sr no , po date, po no , po qty , date challan no, no of box qty and total
    incSr: 'SR NO',
    incPoDate: 'PO DATE',
    incPoNo: 'PO NO',
    incPoQty: 'PO QTY',
    incDate: 'DATE',
    incChallanNo: 'CHALLAN NO',
    incBox: 'NO OF BOX',
    incQty: 'QTY',
    incTotal: 'TOTAL',

    // Dispatch Table Headers: Date, D C NO, Product name , Box, Qty, Dispatch Qty
    dispDate: 'DATE',
    dispDcNo: 'D C NO',
    dispGatePass: 'D C NO',
    dispProductName: 'PRODUCT NAME',
    dispCoating: 'COATING',
    dispPrinting: 'PRINTING',
    dispType: 'TYPE',
    dispBox: 'BOX',
    dispQty: 'QTY',
    dispDispatchQty: 'DISPATCH QTY',
    dispTotal: 'DISPATCH QTY',
    dispRemarks: 'REMARKS',

    // Packing Material (SHRENO Incoming) Table Headers: item type, configurations Qty
    shrenoDate: 'DATE',
    shrenoChallan: 'CHALLAN NO',
    shrenoPoNo: 'PO NO',
    shrenoPoDate: 'PO DATE',
    shrenoItemType: 'ITEM TYPE',
    shrenoConfig: 'CONFIGURATIONS',
    shrenoQty: 'QTY',
    pmDate: 'DATE',
    pmItemType: 'ITEM TYPE',
    pmConfig: 'CONFIGURATIONS',
    pmQty: 'QTY',

    // Overview Table Headers
    ovBottle: 'Bottle Name',
    ovIncoming: 'Incoming Total',
    ovDispatch: 'Dispatch Total',
    ovShreno: 'Packing Material Total',
    ovDifference: 'Difference',
    ovStatus: 'Status',
    ovAction: 'Action',
    ovViewDetail: 'View Detail',
    grandTotal: 'GRAND TOTAL',

    // Empty States & Badges
    noRecords: 'No records found for the selected filters.',
    noIncomingRecords: 'No incoming records for this bottle.',
    noDispatchRecords: 'No dispatch records for this bottle.',
    noShrenoRecords: 'No packing material records for this bottle.',
    noPackingMaterialRecords: 'No packing material records for this bottle.',
    noCompanies: 'No companies found.',
    unmatchedBadge: 'UNMATCHED MASTER',
    unmatchedTooltip: 'This bottle was not matched in Bottle Master and is flagged.',
    normalCompany: 'Standard Company',
    shrenoCompany: 'SHRENO Company',
    showing: 'Showing',
    to: 'to',
    of: 'of',
    records: 'records',
    previous: 'Previous',
    next: 'Next',
    loading: 'Loading summary data...',
  },
  gu: {
    // Page Header & Navigation
    title: 'સારાંશ રજિસ્ટર (Summary Register)',
    subtitle: 'ઇનકમિંગ, ડિસ્પેચ અને શ્રેણો લોગ્સની સામ-સામે સરખામણી',
    backToCompanies: 'કંપનીઓની યાદી પર પાછા જાઓ',
    companySummary: 'કંપની સારાંશ',
    overviewTitle: 'ઓવરવ્યૂ: બધી બોટલો',
    bottleDetailTitle: 'બોટલ વિગત લોગ',
    languageToggle: 'English',

    // Selectors & Filters
    selectCompany: 'કંપની પસંદ કરો',
    company: 'કંપની',
    bottle: 'બોટલ',
    allBottles: 'બધી બોટલો (ઓવરવ્યૂ)',
    searchBottles: 'બોટલનું નામ શોધો...',
    searchRecords: 'રેકોર્ડમાં શોધો...',
    searchCompanies: 'કંપની શોધો...',
    fromDate: 'શરૂઆત તારીખ',
    toDate: 'અંતિમ તારીખ',
    reset: 'રીસેટ',
    apply: 'લાગુ કરો',
    entriesPerPage: 'બતાવો',
    entries: 'એન્ટ્રી',

    // KPIs & Cards
    totalIncoming: 'કુલ ઇનકમિંગ',
    totalDispatch: 'કુલ ડિસ્પેચ',
    totalShreno: 'કુલ પેકિંગ મટિરિયલ',
    totalPackingMaterial: 'કુલ પેકિંગ મટિરિયલ',
    netDifference: 'ઇનકમિંગ − ડિસ્પેચ બાકી સ્ટોક',
    shrenoDifference: 'પેકિંગ મટિરિયલ − ડિસ્પેચ બાકી સ્ટોક',
    boxes: 'બોક્સ',
    pcs: 'પીસ',

    // Block Titles
    blockIncoming: 'ઇનકમિંગ (Incoming)',
    blockDispatch: 'ડિસ્પેચ (Dispatch)',
    blockShreno: 'પેકિંગ મટિરિયલ (Packing Material)',
    blockPackingMaterial: 'પેકિંગ મટિરિયલ (Packing Material)',

    // Incoming Table Headers: sr no , po date, po no , po qty , date challan no, no of box qty and total
    incSr: 'SR NO',
    incPoDate: 'PO તારીખ',
    incPoNo: 'PO નંબર',
    incPoQty: 'PO જથ્થો',
    incDate: 'તારીખ',
    incChallanNo: 'ચલણ નંબર',
    incBox: 'બોક્સની સંખ્યા',
    incQty: 'પીસ/બોક્સ',
    incTotal: 'કુલ જથ્થો',

    // Dispatch Table Headers: Date, D C NO, Product name , Box, Qty, Dispatch Qty
    dispDate: 'તારીખ',
    dispDcNo: 'D C NO',
    dispGatePass: 'D C NO',
    dispProductName: 'પ્રોડક્ટનું નામ',
    dispCoating: 'કોટિંગ',
    dispPrinting: 'પ્રિન્ટિંગ',
    dispType: 'પ્રકાર',
    dispBox: 'બોક્સ',
    dispQty: 'પીસ/બોક્સ',
    dispDispatchQty: 'ડિસ્પેચ જથ્થો',
    dispTotal: 'ડિસ્પેચ જથ્થો',
    dispRemarks: 'રીમાર્ક',

    // Packing Material Table Headers
    shrenoDate: 'તારીખ',
    shrenoChallan: 'ચલણ નંબર',
    shrenoPoNo: 'પી.ઓ. નંબર',
    shrenoPoDate: 'પી.ઓ. તારીખ',
    shrenoItemType: 'આઇટમ પ્રકાર',
    shrenoConfig: 'કન્ફિગ્યુરેશન',
    shrenoQty: 'જથ્થો (Qty)',
    pmDate: 'તારીખ',
    pmItemType: 'આઇટમ પ્રકાર',
    pmConfig: 'કન્ફિગ્યુરેશન',
    pmQty: 'જથ્થો (Qty)',

    // Overview Table Headers
    ovBottle: 'બોટલનું નામ',
    ovIncoming: 'ઇનકમિંગ જથ્થો',
    ovDispatch: 'ડિસ્પેચ જથ્થો',
    ovShreno: 'પેકિંગ મટિરિયલ જથ્થો',
    ovDifference: 'તફાવત (બાકી)',
    ovStatus: 'સ્થિતિ',
    ovAction: 'એક્શન',
    ovViewDetail: 'વિગત જુઓ',
    grandTotal: 'કુલ સરવાળો (GRAND TOTAL)',

    // Empty States & Badges
    noRecords: 'પસંદ કરેલ ફિલ્ટર માટે કોઈ રેકોર્ડ મળ્યા નથી.',
    noIncomingRecords: 'આ બોટલ માટે કોઈ ઇનકમિંગ રેકોર્ડ નથી.',
    noDispatchRecords: 'આ બોટલ માટે કોઈ ડિસ્પેચ રેકોર્ડ નથી.',
    noShrenoRecords: 'આ બોટલ માટે કોઈ પેકિંગ મટિરિયલ રેકોર્ડ નથી.',
    noPackingMaterialRecords: 'આ બોટલ માટે કોઈ પેકિંગ મટિરિયલ રેકોર્ડ નથી.',
    noCompanies: 'કોઈ કંપની મળી નથી.',
    unmatchedBadge: 'મેળ વગરની બોટલ',
    unmatchedTooltip: 'આ બોટલ માસ્ટરમાં મળી નથી તેથી ચિહ્નિત કરેલ છે.',
    normalCompany: 'સામાન્ય કંપની',
    shrenoCompany: 'શ્રેણો કંપની',
    showing: 'દર્શાવે છે',
    to: 'થી',
    of: 'કુલ',
    records: 'રેકોર્ડ્સ',
    previous: 'પાછળ',
    next: 'આગળ',
    loading: 'માહિતી લોડ થઈ રહી છે...',
  }
};

export const useSummaryLanguage = () => {
  const [language, setLanguage] = useState(() => {
    if (typeof window === 'undefined') return 'en';
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved === 'gu' ? 'gu' : 'en';
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, language);
  }, [language]);

  const labels = language === 'gu' ? SUMMARY_LABELS.gu : SUMMARY_LABELS.en;

  const toggleLanguage = () => {
    setLanguage(prev => (prev === 'en' ? 'gu' : 'en'));
  };

  return {
    language,
    labels,
    toggleLanguage
  };
};
