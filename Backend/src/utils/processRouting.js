/**
 * Process Routing Matrix:
 * Defines which production processes route a Lacquer Plan row to the Printing Plan.
 * 
 * Rules:
 * - C: Coating only -> EXCLUDED from Printing Plan
 * - C+P: Coating + Printing -> INCLUDED in Printing Plan
 * - C+F: Coating + Foiling/Printing -> INCLUDED in Printing Plan
 * - P: Printing only -> INCLUDED in Printing Plan
 * - F: Foiling/Printing only -> INCLUDED in Printing Plan
 * - Legacy aliases: 'PRINTING', 'BOTH' -> INCLUDED in Printing Plan
 */

const PRINT_PROCESSES = new Set(["P", "C+P", "PRINTING", "BOTH", "F", "C+F"]);

function isPrintingProcess(process) {
  if (!process) return false;
  const p = String(process).trim().toUpperCase();
  return PRINT_PROCESSES.has(p);
}

module.exports = {
  PRINT_PROCESSES: Array.from(PRINT_PROCESSES),
  isPrintingProcess
};
