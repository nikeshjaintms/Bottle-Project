const BottleSpec = require("../models/Bottlespecs");
const BottlePerBox = require("../models/BottlePerBox");
const Variant = require("../models/Variant");
const { resolveCanonicalPlainBottle } = require("./lacquerGroupKey");

const normalizeLacquerPrintingText = value => String(value || "")
  .replace(/\s+/g, " ")
  .trim()
  .toUpperCase();

const normalizeLacquerPrintingId = value => {
  const id = value?._id || value;
  return id === null || id === undefined ? "" : id.toString();
};

const shouldCreateLacquerPrintingRow = (lacquerPlan, printingPlan) =>
  !printingPlan && !lacquerPlan?.importedFromId;

const escapeRegex = value => String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const queryInSession = (query, session) => session ? query.session(session) : query;

const resolveVariantIds = async (plan, session = null) => {
  const explicitIds = [
    ...(Array.isArray(plan.variantIds) ? plan.variantIds : []),
    ...(plan.variantId ? [plan.variantId] : [])
  ].map(normalizeLacquerPrintingId).filter(Boolean);
  if (explicitIds.length > 0) return [...new Set(explicitIds)].sort();

  const names = [...new Set([
    ...(Array.isArray(plan.variantNames) ? plan.variantNames : []),
    plan.variantName,
    plan.printingVariant,
    plan.printingToBeDone
  ].map(normalizeLacquerPrintingText).filter(Boolean))];
  if (names.length === 0 || !plan.bottleName || !plan.brandId) return [];

  const bottleName = escapeRegex(plan.bottleName);
  const plainBottleQuery = BottlePerBox.findOne({
    $or: [
      { plainBottleName: { $regex: new RegExp(`^\\s*${bottleName}\\s*$`, "i") } },
      { bottleName: { $regex: new RegExp(`^\\s*${bottleName}\\s*$`, "i") } },
      { bottleNames: { $regex: new RegExp(`^\\s*${bottleName}\\s*$`, "i") } }
    ],
    isDeleted: { $ne: true }
  }).select("bottleName plainBottleName bottleNames");
  const plainBottle = await queryInSession(plainBottleQuery, session).lean();
  const bottleNames = [...new Set([
    plan.bottleName,
    plainBottle?.bottleName,
    plainBottle?.plainBottleName,
    ...(plainBottle?.bottleNames || [])
  ].filter(Boolean))];
  const specs = await queryInSession(BottleSpec.find({
    brandId: plan.brandId,
    isDeleted: { $ne: true },
    bottleName: { $in: bottleNames.map(name => new RegExp(`^\\s*${escapeRegex(name)}\\s*$`, "i")) }
  }).select("_id"), session).lean();
  if (specs.length === 0) return [];

  const variants = await queryInSession(Variant.find({
    bottleSpecId: { $in: specs.map(spec => spec._id) },
    isDeleted: { $ne: true },
    variantName: { $in: names.map(name => new RegExp(`^\\s*${escapeRegex(name)}\\s*$`, "i")) }
  }).select("_id"), session).lean();
  return [...new Set(variants.map(variant => normalizeLacquerPrintingId(variant._id)))].sort();
};

const getLacquerPrintingDayRange = value => {
  const start = new Date(value);
  if (Number.isNaN(start.getTime())) {
    throw new Error("A valid plan date is required to match a Printing Plan row.");
  }
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setUTCHours(23, 59, 59, 999);
  return { start, end };
};

const buildLacquerPrintingIdentity = async (plan, session = null) => {
  if (!plan?.planDate || !plan?.companyId || !plan?.brandId || !plan?.bottleName) return null;
  const { start } = getLacquerPrintingDayRange(plan.planDate);
  const companyId = normalizeLacquerPrintingId(plan.companyId);
  const brandId = normalizeLacquerPrintingId(plan.brandId);
  const canonicalBottle = await resolveCanonicalPlainBottle(
    plan.plainBottle || plan.plainBottleName || plan.bottleName,
    companyId
  );
  const variantName = [
    plan.variantName,
    plan.printingToBeDone,
    plan.printingVariant
  ].map(normalizeLacquerPrintingText).find(Boolean) || "";
  const variantIds = variantName ? [] : await resolveVariantIds(plan, session);
  const shadeKey = normalizeLacquerPrintingText(
    Array.isArray(plan.coatingShade)
      ? plan.coatingShade.join(",")
      : (plan.coatingShade || plan.colour || "")
  );
  const variantIdentity = variantName || variantIds.join(",") || shadeKey;
  if (!canonicalBottle || !variantIdentity) return null;

  return [
    start.toISOString().slice(0, 10),
    companyId,
    brandId,
    normalizeLacquerPrintingText(canonicalBottle),
    variantIdentity,
    shadeKey
  ].join("|");
};

module.exports = {
  buildLacquerPrintingIdentity,
  getLacquerPrintingDayRange,
  normalizeLacquerPrintingId,
  normalizeLacquerPrintingText,
  shouldCreateLacquerPrintingRow
};
