const mongoose = require("mongoose");
const BottlePerBox = require("../models/BottlePerBox");
const PlainBottleStock = require("../models/PlainBottleStock");
const Incoming = require("../models/Incoming");
const { derivePlainBottleName } = require("../utils/derivePlainBottleName");

const escapeRegex = (string) => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// CREATE
exports.createBottlePerBox = async (req, res) => {
  try {
    let { bottleName, bottleNames, plainBottleName, ...rest } = req.body;
    if (typeof rest.status === 'string') {
      rest.status = rest.status === 'active';
    }

    const rawNames = bottleNames && Array.isArray(bottleNames) && bottleNames.length > 0 
      ? bottleNames 
      : (bottleName ? [bottleName] : []);

    if (rawNames.length === 0 && !plainBottleName) {
      return res.status(400).json({ success: false, message: "Bottle Name or Plain Bottle is required" });
    }

    // Determine target plainBottleName
    let targetPlain = plainBottleName && String(plainBottleName).trim() !== ''
      ? String(plainBottleName).trim()
      : (rawNames.length > 0 ? derivePlainBottleName(rawNames[0]).plainBottleName : '');

    if (!targetPlain) {
      return res.status(400).json({ success: false, message: "Unable to determine Plain Bottle name" });
    }

    // Combine any provided bottle names, plus targetPlain itself
    const allNames = Array.from(new Set([
      targetPlain,
      ...rawNames.map(n => String(n).trim()).filter(Boolean)
    ]));

    const filter = { plainBottleName: new RegExp(`^${escapeRegex(targetPlain)}$`, 'i') };
    const update = {
      $set: {
        plainBottleName: targetPlain,
        bottleName: targetPlain,
        ...rest,
        isDeleted: false
      },
      $addToSet: {
        bottleNames: { $each: allNames }
      }
    };

    const doc = await BottlePerBox.findOneAndUpdate(filter, update, { upsert: true, returnDocument: 'after' });
    res.json({ success: true, data: doc });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET ALL
exports.getBottlePerBoxes = async (req, res) => {
  try {
    let { page, limit, search, pagination = "true" } = req.query;

    let parsedPage = 1;
    if (page && page !== '') {
      parsedPage = parseInt(page) || 1;
    }

    const parsedLimit = parseInt(limit) || 10;
    const skip = (parsedPage - 1) * parsedLimit;

    let query = { isDeleted: { $ne: true } };

    if (search && search.trim() !== "") {
      const searchRegex = new RegExp(search.trim(), "i");
      query.$or = [
        { plainBottleName: { $regex: searchRegex } },
        { bottleName: { $regex: searchRegex } },
        { bottleNames: { $regex: searchRegex } }
      ];
    }

    const total = await BottlePerBox.countDocuments(query);

    let records;
    if (pagination === "false") {
      records = await BottlePerBox.find(query).sort({ plainBottleName: 1 });
      return res.json({ success: true, data: records, total });
    } else {
      records = await BottlePerBox.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parsedLimit);
    }

    res.json({
      success: true,
      data: records,
      page: parsedPage,
      totalPages: Math.ceil(total / parsedLimit),
      total,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET SINGLE
exports.getSingleBottlePerBox = async (req, res) => {
  try {
    const record = await BottlePerBox.findOne({ _id: req.params.id, isDeleted: { $ne: true } });
    if (!record) {
      return res.status(404).json({ success: false, message: "Record not found" });
    }
    res.json({ success: true, data: record });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// DROPDOWN - All bottle names across all BottlePerBox documents
exports.getBottlePerBoxDropdown = async (req, res) => {
  try {
    const docs = await BottlePerBox.find({ isDeleted: { $ne: true } })
      .select("plainBottleName bottleName bottleNames")
      .lean();

    const nameMap = new Map();

    for (const doc of docs) {
      const pName = (doc.plainBottleName || doc.bottleName || '').trim().replace(/\s+/g, ' ');
      const docId = String(doc._id);

      const addName = (name) => {
        if (!name) return;
        const normalized = String(name).trim().replace(/\s+/g, ' ');
        if (!normalized) return;
        if (!nameMap.has(normalized)) {
          nameMap.set(normalized, {
            name: normalized,
            plainBottleName: pName,
            id: docId
          });
        }
      };

      if (pName) addName(pName);
      if (doc.bottleName) addName(doc.bottleName);
      if (Array.isArray(doc.bottleNames)) {
        for (const n of doc.bottleNames) {
          addName(n);
        }
      }
    }

    const items = Array.from(nameMap.values()).sort((a, b) => a.name.localeCompare(b.name));
    res.json({
      success: true,
      data: items,
      names: items.map(i => i.name)
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// UPDATE (ATOMIC MERGE-ON-SAVE)
exports.updateBottlePerBox = async (req, res) => {
  let session = null;
  let useSession = false;

  try {
    const targetId = req.params.id;
    let { bottleName, bottleNames, plainBottleName, deleteEmpty = false, ...rest } = req.body;

    if (typeof rest.status === 'string') {
      rest.status = rest.status === 'active';
    }
    if (rest.bottlePerBox !== undefined) {
      rest.bottlePerBox = rest.bottlePerBox === '' || rest.bottlePerBox === null ? null : parseFloat(rest.bottlePerBox);
    }

    const cleanName = (n) => String(n || '').trim().replace(/\s+/g, ' ');

    const oldRecord = await BottlePerBox.findOne({ _id: targetId, isDeleted: { $ne: true } });
    if (!oldRecord) {
      return res.status(404).json({ success: false, message: "Record not found" });
    }

    let rawRequested = [];
    if (Array.isArray(bottleNames)) {
      rawRequested = bottleNames.map(cleanName).filter(Boolean);
    } else if (bottleName) {
      rawRequested = [cleanName(bottleName)].filter(Boolean);
    } else if (oldRecord.bottleNames && oldRecord.bottleNames.length > 0) {
      rawRequested = oldRecord.bottleNames.map(cleanName).filter(Boolean);
    }
    const requestedNames = Array.from(new Set(rawRequested));

    if (requestedNames.length === 0) {
      return res.status(400).json({ success: false, message: "A Plain Bottle must have at least one bottle name" });
    }

    const currentOldNames = (oldRecord.bottleNames && oldRecord.bottleNames.length > 0)
      ? oldRecord.bottleNames.map(cleanName).filter(Boolean)
      : [oldRecord.plainBottleName || oldRecord.bottleName].map(cleanName).filter(Boolean);

    const removedNames = currentOldNames.filter(oldName =>
      !requestedNames.some(reqName => reqName.toLowerCase() === oldName.toLowerCase())
    );

    let targetPlain = plainBottleName && String(plainBottleName).trim() !== ''
      ? cleanName(plainBottleName)
      : (oldRecord.plainBottleName || oldRecord.bottleName || requestedNames[0]);

    // If targetPlain was itself removed, re-point targetPlain to the first remaining requested name
    if (removedNames.some(rn => rn.toLowerCase() === targetPlain.toLowerCase())) {
      targetPlain = requestedNames[0];
    }

    // Check if MongoDB deployment supports multi-document transactions (ReplicaSet or Sharded)
    const desc = mongoose.connection.client?.topology?.description;
    const isReplicaSet = desc?.type?.includes('ReplicaSet') || desc?.type === 'Sharded' || !!desc?.setName;

    if (isReplicaSet) {
      try {
        session = await mongoose.startSession();
        session.startTransaction();
        useSession = true;
      } catch (sessErr) {
        session = null;
        useSession = false;
      }
    } else {
      useSession = false;
    }

    const rollbackActions = [];
    const restoredPlainBottles = [];

    // Restore any removed bottle names as standalone Plain Bottle records
    for (const removedName of removedNames) {
      const existingQuery = {
        _id: { $ne: oldRecord._id },
        plainBottleName: new RegExp(`^${escapeRegex(removedName)}$`, 'i')
      };

      const existingDoc = useSession
        ? await BottlePerBox.findOne(existingQuery).session(session)
        : await BottlePerBox.findOne(existingQuery);

      if (existingDoc) {
        if (existingDoc.isDeleted) {
          const origSnapshot = {
            isDeleted: existingDoc.isDeleted,
            status: existingDoc.status,
            bottleNames: [...(existingDoc.bottleNames || [])],
            bottlePerBox: existingDoc.bottlePerBox
          };
          existingDoc.isDeleted = false;
          existingDoc.status = true;
          existingDoc.bottleNames = [removedName];
          existingDoc.bottleName = removedName;
          existingDoc.plainBottleName = removedName;
          existingDoc.bottlePerBox = null;
          if (useSession) {
            await existingDoc.save({ session });
          } else {
            await existingDoc.save();
            rollbackActions.push(async () => {
              await BottlePerBox.updateOne({ _id: existingDoc._id }, { $set: origSnapshot });
            });
          }
        } else {
          // If active and missing the name in bottleNames, ensure it is added
          if (!existingDoc.bottleNames.some(n => n.toLowerCase() === removedName.toLowerCase())) {
            const origNames = [...(existingDoc.bottleNames || [])];
            existingDoc.bottleNames.push(removedName);
            if (useSession) {
              await existingDoc.save({ session });
            } else {
              await existingDoc.save();
              rollbackActions.push(async () => {
                await BottlePerBox.updateOne({ _id: existingDoc._id }, { $set: { bottleNames: origNames } });
              });
            }
          }
        }
        restoredPlainBottles.push({
          _id: existingDoc._id,
          plainBottleName: removedName,
          bottleName: removedName,
          bottleNames: existingDoc.bottleNames,
          bottlePerBox: existingDoc.bottlePerBox
        });
      } else {
        const newDoc = new BottlePerBox({
          plainBottleName: removedName,
          bottleName: removedName,
          bottleNames: [removedName],
          bottlePerBox: null,
          status: true,
          isDeleted: false
        });
        if (useSession) {
          await newDoc.save({ session });
        } else {
          await newDoc.save();
          rollbackActions.push(async () => {
            await BottlePerBox.deleteOne({ _id: newDoc._id });
          });
        }
        restoredPlainBottles.push({
          _id: newDoc._id,
          plainBottleName: removedName,
          bottleName: removedName,
          bottleNames: [removedName],
          bottlePerBox: null
        });
      }
    }

    // Find any other documents that currently hold ANY of requestedNames
    const otherQuery = {
      _id: { $ne: oldRecord._id },
      isDeleted: { $ne: true },
      $or: [
        { bottleNames: { $in: requestedNames } },
        { plainBottleName: { $in: requestedNames } },
        { bottleName: { $in: requestedNames } }
      ]
    };

    const otherDocs = useSession
      ? await BottlePerBox.find(otherQuery).session(session)
      : await BottlePerBox.find(otherQuery);

    const movedNamesLog = [];
    const emptiedPlainBottles = [];
    const deletedPlainBottles = [];

    for (const otherDoc of otherDocs) {
      const otherDocPlain = otherDoc.plainBottleName || otherDoc.bottleName;
      const currentOtherNames = Array.from(new Set([
        ...(otherDoc.bottleNames || []),
        otherDoc.bottleName,
        otherDoc.plainBottleName
      ].map(cleanName).filter(Boolean)));

      const movingFromThis = requestedNames.filter(rn =>
        currentOtherNames.some(existing => existing.toLowerCase() === rn.toLowerCase())
      );

      if (movingFromThis.length === 0) continue;

      const remainingOtherNames = (otherDoc.bottleNames || []).map(cleanName).filter(existing =>
        !movingFromThis.some(m => m.toLowerCase() === existing.toLowerCase())
      );

      movedNamesLog.push({
        fromDocId: otherDoc._id,
        fromPlainBottle: otherDocPlain,
        movedNames: movingFromThis
      });

      if (!useSession) {
        const origBottleNames = [...(otherDoc.bottleNames || [])];
        rollbackActions.push(async () => {
          await BottlePerBox.updateOne({ _id: otherDoc._id }, { $set: { bottleNames: origBottleNames } });
        });
      }

      if (remainingOtherNames.length === 0) {
        // Removing it empties the other Plain Bottle's bottleNames array entirely!
        if (deleteEmpty === true) {
          // Repoint and merge PlainBottleStock
          const existingStock = useSession
            ? await PlainBottleStock.findOne({ bottleId: oldRecord._id }).session(session)
            : await PlainBottleStock.findOne({ bottleId: oldRecord._id });

          const otherStock = useSession
            ? await PlainBottleStock.findOne({ bottleId: otherDoc._id }).session(session)
            : await PlainBottleStock.findOne({ bottleId: otherDoc._id });

          if (otherStock) {
            if (existingStock) {
              const origAvail = existingStock.availableQuantity;
              const origRes = existingStock.reservedQuantity;
              const otherStockCopy = otherStock.toObject ? otherStock.toObject() : { ...otherStock };

              existingStock.availableQuantity = (existingStock.availableQuantity || 0) + (otherStock.availableQuantity || 0);
              existingStock.reservedQuantity = (existingStock.reservedQuantity || 0) + (otherStock.reservedQuantity || 0);
              if (useSession) {
                await existingStock.save({ session });
                await PlainBottleStock.deleteOne({ _id: otherStock._id }).session(session);
              } else {
                await existingStock.save();
                await PlainBottleStock.deleteOne({ _id: otherStock._id });
                rollbackActions.push(async () => {
                  await existingStock.updateOne({ availableQuantity: origAvail, reservedQuantity: origRes });
                  await PlainBottleStock.collection.insertOne(otherStockCopy);
                });
              }
            } else {
              otherStock.bottleId = oldRecord._id;
              if (useSession) {
                await otherStock.save({ session });
              } else {
                await otherStock.save();
                rollbackActions.push(async () => {
                  await PlainBottleStock.updateOne({ _id: otherStock._id }, { $set: { bottleId: otherDoc._id } });
                });
              }
            }
          }

          // Repoint Incoming records
          const incFilter = { 'items.bottleId': otherDoc._id };
          const incUpdate = { $set: { 'items.$[elem].bottleId': oldRecord._id } };
          const incOptions = { arrayFilters: [{ 'elem.bottleId': otherDoc._id }] };
          if (useSession) incOptions.session = session;

          const incRes = await Incoming.updateMany(incFilter, incUpdate, incOptions);
          if (incRes.modifiedCount > 0) {
            if (!useSession) {
              rollbackActions.push(async () => {
                await Incoming.updateMany(
                  { 'items.bottleId': oldRecord._id },
                  { $set: { 'items.$[elem].bottleId': otherDoc._id } },
                  { arrayFilters: [{ 'elem.bottleId': oldRecord._id }] }
                );
              });
            }
          }

          // Delete the empty BottlePerBox record
          if (useSession) {
            await BottlePerBox.deleteOne({ _id: otherDoc._id }).session(session);
          } else {
            const otherDocSnapshot = otherDoc.toObject ? otherDoc.toObject() : { ...otherDoc };
            await BottlePerBox.deleteOne({ _id: otherDoc._id });
            rollbackActions.push(async () => {
              await BottlePerBox.collection.insertOne(otherDocSnapshot);
            });
          }

          deletedPlainBottles.push({
            _id: otherDoc._id,
            plainBottleName: otherDocPlain
          });
        } else {
          // Do not delete without confirmation: flag clearly and leave empty
          otherDoc.bottleNames = [];
          if (useSession) {
            await otherDoc.save({ session });
          } else {
            await otherDoc.save();
          }
          emptiedPlainBottles.push({
            _id: otherDoc._id,
            plainBottleName: otherDocPlain
          });
        }
      } else {
        otherDoc.bottleNames = remainingOtherNames;
        if (useSession) {
          await otherDoc.save({ session });
        } else {
          await otherDoc.save();
        }
      }
    }

    // Update target document
    const origTargetDoc = {
      plainBottleName: oldRecord.plainBottleName,
      bottleName: oldRecord.bottleName,
      bottleNames: [...(oldRecord.bottleNames || [])],
      bottlePerBox: oldRecord.bottlePerBox,
      status: oldRecord.status
    };

    oldRecord.plainBottleName = targetPlain;
    oldRecord.bottleName = targetPlain;
    oldRecord.bottleNames = requestedNames;
    if (rest.bottlePerBox !== undefined) oldRecord.bottlePerBox = rest.bottlePerBox;
    if (rest.status !== undefined) oldRecord.status = rest.status;
    oldRecord.isDeleted = false;

    if (!useSession) {
      rollbackActions.push(async () => {
        await BottlePerBox.updateOne({ _id: oldRecord._id }, { $set: origTargetDoc });
      });
    }

    if (useSession) {
      await oldRecord.save({ session });
    } else {
      await oldRecord.save();
    }

    // Strict duplicate check before commit / finalize
    const dupQuery = {
      _id: { $ne: oldRecord._id },
      isDeleted: { $ne: true },
      bottleNames: { $in: requestedNames }
    };
    const duplicateDocs = useSession
      ? await BottlePerBox.find(dupQuery).session(session)
      : await BottlePerBox.find(dupQuery);

    if (duplicateDocs.length > 0) {
      const dupNames = duplicateDocs.map(d => d.plainBottleName || d.bottleName).join(', ');
      throw new Error(`Enforcement failure: Bottle name(s) still exist in other Plain Bottle(s): ${dupNames}`);
    }

    if (useSession && session) {
      await session.commitTransaction();
      session.endSession();
    }

    let message = "Bottle per Box configuration updated successfully";
    if (restoredPlainBottles.length > 0 && deletedPlainBottles.length > 0) {
      message = `Configuration updated. Restored [${restoredPlainBottles.map(r => r.plainBottleName).join(', ')}] as standalone Plain Bottle(s), and deleted empty [${deletedPlainBottles.map(d => d.plainBottleName).join(', ')}].`;
    } else if (restoredPlainBottles.length > 0) {
      message = `Configuration updated. Restored [${restoredPlainBottles.map(r => r.plainBottleName).join(', ')}] as standalone Plain Bottle(s).`;
    } else if (deletedPlainBottles.length > 0) {
      message = `Configuration updated. Empty Plain Bottle(s) [${deletedPlainBottles.map(d => d.plainBottleName).join(', ')}] removed.`;
    } else if (emptiedPlainBottles.length > 0) {
      message = `Configuration updated. Warning: Plain Bottle(s) [${emptiedPlainBottles.map(d => d.plainBottleName).join(', ')}] are now empty.`;
    }

    res.json({
      success: true,
      data: oldRecord,
      movedNames: movedNamesLog,
      restoredPlainBottles,
      emptiedPlainBottles,
      deletedPlainBottles,
      message
    });
  } catch (err) {
    if (useSession && session) {
      await session.abortTransaction();
      session.endSession();
    } else if (rollbackActions && rollbackActions.length > 0) {
      for (const rb of rollbackActions.reverse()) {
        try { await rb(); } catch (rbErr) { console.error('Rollback step error:', rbErr.message); }
      }
    }
    console.error("updateBottlePerBox error:", err.message);
    res.status(500).json({ success: false, message: err.message });
  }
};

// DELETE
exports.deleteBottlePerBox = async (req, res) => {
  try {
    const record = await BottlePerBox.findByIdAndUpdate(req.params.id, { isDeleted: true }, { returnDocument: 'after' });
    res.json({ success: true, msg: "Deleted" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
