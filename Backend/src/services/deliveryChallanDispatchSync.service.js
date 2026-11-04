const mongoose = require("mongoose");
const { matchBottleNameFromMaster } = require("../utils/bottleMatching");

function parseBoxCount(boxStr) {
  if (!boxStr) return 0;
  const str = String(boxStr).trim();
  const match = str.match(/^(\d+)\s*\+\s*\((\d+)\s*\*\s*(\d+)\)$/);
  if (match) return parseInt(match[1]) + parseInt(match[2]);
  const num = parseInt(str);
  return isNaN(num) ? 0 : num;
}

function resolveBottleFromTitle(title, allBottles) {
  if (!title) return null;
  let match = matchBottleNameFromMaster(title, allBottles);
  if (match && match.bottleName && match.bottleName !== "MISSING") {
    return allBottles.find(
      (b) => b.bottleName === match.bottleName || b.plainBottleName === match.bottleName
    );
  }
  const cleaned = title.replace(/\s*-\s*[A-Z0-9\s]+PC.*$/i, "").trim();
  if (cleaned && cleaned !== title) {
    match = matchBottleNameFromMaster(cleaned, allBottles);
    if (match && match.bottleName && match.bottleName !== "MISSING") {
      return allBottles.find(
        (b) => b.bottleName === match.bottleName || b.plainBottleName === match.bottleName
      );
    }
  }
  const normStrict = title.toUpperCase().replace(/[^A-Z0-9]/g, "");
  for (const b of allBottles) {
    const bStrict = (b.plainBottleName || b.bottleName || "")
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "");
    if (bStrict && (normStrict.includes(bStrict) || bStrict.includes(normStrict))) {
      return b;
    }
    for (const alt of b.bottleNames || []) {
      const altStrict = alt.toUpperCase().replace(/[^A-Z0-9]/g, "");
      if (altStrict && (normStrict.includes(altStrict) || altStrict.includes(normStrict))) {
        return b;
      }
    }
  }
  return null;
}

function extractCoatingShade(desc) {
  if (!desc) return null;
  const parts = desc.split(/[-+]/).map((s) => s.trim()).filter(Boolean);
  if (parts.length > 0) return parts[0];
  return null;
}

/**
 * Sync a DeliveryChallan document to the Dispatch collection
 * @param {Object|String} challanDocOrId - Mongoose document or ID
 */
async function syncChallanToDispatch(challanDocOrId) {
  try {
    const DeliveryChallan = mongoose.model("DeliveryChallan");
    const Dispatch = mongoose.model("Dispatch");
    const BottlePerBox = mongoose.model("BottlePerBox");
    const Variant = mongoose.model("Variant");

    let dc = challanDocOrId;
    if (typeof challanDocOrId === "string" || challanDocOrId instanceof mongoose.Types.ObjectId) {
      dc = await DeliveryChallan.findById(challanDocOrId).lean();
    } else if (typeof challanDocOrId.toObject === "function") {
      dc = challanDocOrId.toObject();
    }

    if (!dc) return null;

    if (dc.isDeleted) {
      await Dispatch.updateOne(
        { deliveryChallanId: dc._id },
        { $set: { isDeleted: true } }
      );
      return null;
    }

    const [allBottles, allVariants] = await Promise.all([
      BottlePerBox.find({ isDeleted: { $ne: true } }).lean(),
      Variant.find({ isDeleted: { $ne: true } }).lean(),
    ]);

    const plainBottleKeysSet = new Set();
    const items = [];

    for (const it of dc.items || []) {
      const bottleDoc = resolveBottleFromTitle(it.title, allBottles);
      const bottleId = bottleDoc ? bottleDoc._id : null;
      const plainName = bottleDoc
        ? bottleDoc.plainBottleName || bottleDoc.bottleName
        : it.title || "Unmapped";

      if (plainName && plainName !== "Unmapped") {
        plainBottleKeysSet.add(plainName.trim().toUpperCase());
      }

      let matchedVariant = null;
      if (it.variantId) {
        matchedVariant = allVariants.find(
          (v) => String(v._id) === String(it.variantId)
        );
      }
      if (!matchedVariant && it.description) {
        const descUpper = it.description.toUpperCase();
        matchedVariant = allVariants.find((v) => {
          const vName = (v.variantName || "").trim().toUpperCase();
          if (vName.length < 3) return false;
          return descUpper.includes(vName);
        });
      }

      const boxCount = Number(it.boxCount) || parseBoxCount(it.box) || 0;
      const unit = Number(it.unit) || 1;
      const total = Number(it.total) || boxCount * unit;
      const coatingShade = extractCoatingShade(it.description);

      items.push({
        bottleId: bottleId || null,
        coatingShade: coatingShade || null,
        printingTypeId: null,
        detectedTextColor: matchedVariant?.detectedTextColor || "Not Detected",
        variantId: matchedVariant ? matchedVariant._id : null,
        productName: it.title || null,
        printing: it.description || null,
        box: boxCount,
        qty: unit,
        totalQty: total,
      });
    }

    const plainBottleKeys = Array.from(plainBottleKeysSet);

    const dispatchData = {
      dispatchDate: dc.challanDate ? new Date(dc.challanDate) : new Date(dc.createdAt || Date.now()),
      gatePassNo: dc.challanNo,
      companyId: dc.companyId,
      deliveryChallanId: dc._id,
      challanType: dc.challanType || "shayoona",
      remarks: dc.remarks || "",
      items,
      plainBottleKeys,
      createdBy: dc.createdBy || null,
      isDeleted: false,
    };

    const updated = await Dispatch.findOneAndUpdate(
      { deliveryChallanId: dc._id },
      { $set: dispatchData, $setOnInsert: { createdAt: new Date() } },
      { upsert: true, returnDocument: "after" }
    );

    return updated;
  } catch (err) {
    console.error("syncChallanToDispatch error:", err.message);
    return null;
  }
}

/**
 * Mark linked dispatch as deleted
 */
async function deleteChallanDispatch(challanId) {
  try {
    const Dispatch = mongoose.model("Dispatch");
    await Dispatch.updateOne(
      { deliveryChallanId: challanId },
      { $set: { isDeleted: true } }
    );
  } catch (err) {
    console.error("deleteChallanDispatch error:", err.message);
  }
}

/**
 * Sync all existing Delivery Challans to Dispatch collection
 */
async function syncAllChallansToDispatch() {
  try {
    const DeliveryChallan = mongoose.model("DeliveryChallan");
    const dcs = await DeliveryChallan.find({ isDeleted: { $ne: true } }).lean();
    for (const dc of dcs) {
      await syncChallanToDispatch(dc);
    }
    console.log(`[Sync] Successfully synced ${dcs.length} Delivery Challans to Dispatch register.`);
  } catch (err) {
    console.error("syncAllChallansToDispatch error:", err.message);
  }
}

module.exports = {
  syncChallanToDispatch,
  deleteChallanDispatch,
  syncAllChallansToDispatch,
};

