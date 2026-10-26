const mongoose = require('mongoose');

function normalizeBottleName(name) {
  if (!name) return '';
  return String(name)
    .trim()
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .replace(/\bROLL\s+ON\b/g, 'ROLLON')
    .replace(/\bROLL-ON\b/g, 'ROLLON');
}

function formatPlanDate(date) {
  if (!date) return '';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '';
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

async function resolveCanonicalPlainBottle(rawBottleName, companyId = null) {
  if (!rawBottleName) return '';
  const trimmed = String(rawBottleName).trim();
  const BottlePerBox = require('../models/BottlePerBox');

  const bp = await BottlePerBox.findOne({
    $or: [
      { bottleName: { $regex: new RegExp('^' + trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', 'i') } },
      { plainBottleName: { $regex: new RegExp('^' + trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', 'i') } },
      { bottleNames: { $regex: new RegExp('^' + trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', 'i') } }
    ],
    isDeleted: false
  }).lean();

  if (bp) {
    return normalizeBottleName(bp.plainBottleName || bp.bottleName);
  }

  let derivePlainBottleName = null;
  try {
    derivePlainBottleName = require('./derivePlainBottleName').derivePlainBottleName;
  } catch (e) {
    derivePlainBottleName = null;
  }

  const derived = derivePlainBottleName ? derivePlainBottleName(trimmed) : trimmed;
  return normalizeBottleName(derived || trimmed);
}

/**
 * Computes the canonical group key for a lacquer plan:
 * groupKey = plan date + company + brand + canonical plain bottle (normalized)
 */
async function computePlanGroupKey(plan) {
  if (!plan) return '';
  const dateStr = formatPlanDate(plan.planDate);
  const compId = (plan.canonicalCompanyId || (plan.companyId?._id || plan.companyId) || '').toString().trim();
  const brandId = (plan.brandId?._id || plan.brandId || '').toString().trim() || String(plan.brandName || '').trim().toUpperCase();
  const rawBottle = plan.plainBottle || plan.plainBottleName || plan.bottleName || '';
  const canonicalBottle = await resolveCanonicalPlainBottle(rawBottle, compId);

  return `${dateStr}__${compId}__${brandId}__${canonicalBottle}`;
}

module.exports = {
  normalizeBottleName,
  formatPlanDate,
  resolveCanonicalPlainBottle,
  computePlanGroupKey
};
