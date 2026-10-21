const CompanyAddress = require("../models/CompanyAddress");
const Company = require("../models/Company");

// ✅ CREATE ADDRESS
exports.createAddress = async (req, res) => {
  try {
    const {
      companyId,
      addressType,
      addressTitle,
      addressLine1,
      addressLine2,
      city,
      state,
      pincode,
      gstNo,
      contactPerson,
      contactPhone,
      isDefault,
    } = req.body;

    if (!companyId) {
      return res.status(400).json({ success: false, message: "Company is required." });
    }

    if (!addressLine1 || !addressLine1.trim()) {
      return res.status(400).json({ success: false, message: "Address Line 1 is mandatory." });
    }

    const companyExists = await Company.findOne({ _id: companyId, isDeleted: { $ne: true } });
    if (!companyExists) {
      return res.status(404).json({ success: false, message: "Selected company does not exist." });
    }

    const rawStatus = req.body.status;
    const status = typeof rawStatus === "string" ? rawStatus === "active" : rawStatus ?? true;

    const boolIsDefault = isDefault === true || isDefault === "true";

    // If marked as default, unmark other addresses for the same company
    if (boolIsDefault) {
      await CompanyAddress.updateMany(
        { companyId, isDeleted: { $ne: true } },
        { $set: { isDefault: false } }
      );
    }

    const address = await CompanyAddress.create({
      companyId,
      addressType: addressType ? addressType.trim() : "Billing",
      addressTitle: addressTitle ? addressTitle.trim() : "",
      addressLine1: addressLine1.trim(),
      addressLine2: addressLine2 ? addressLine2.trim() : "",
      city: city ? city.trim() : "",
      state: state ? state.trim() : "",
      pincode: pincode ? pincode.trim() : "",
      gstNo: gstNo ? gstNo.trim().toUpperCase() : "",
      contactPerson: contactPerson ? contactPerson.trim() : "",
      contactPhone: contactPhone ? contactPhone.trim() : "",
      isDefault: boolIsDefault,
      status,
    });

    const populated = await address.populate("companyId", "name status");

    res.status(201).json({
      success: true,
      message: "Company address created successfully",
      data: populated,
    });
  } catch (err) {
    console.error("CREATE COMPANY ADDRESS ERROR:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// ✅ GET ADDRESSES (Pagination + Search + Filter by Company + Grouped)
exports.getAddresses = async (req, res) => {
  try {
    let { page, limit, search = "", pagination = "true", companyId, addressType, grouped } = req.query;

    let parsedPage = 1;
    if (page && page !== "") {
      parsedPage = parseInt(page) || 1;
      res.cookie("companyAddressPage", parsedPage, { maxAge: 86400000, httpOnly: true });
    } else if (req.cookies?.companyAddressPage) {
      parsedPage = parseInt(req.cookies.companyAddressPage) || 1;
    }

    const parsedLimit = parseInt(limit) || 10;
    const skip = (parsedPage - 1) * parsedLimit;

    // Support grouped companies view
    if (grouped === "true" || grouped === true) {
      const companyFilter = { isDeleted: { $ne: true } };
      if (companyId) {
        companyFilter._id = companyId;
      }
      const companies = await Company.find(companyFilter).sort({ name: 1 }).lean();

      const addrFilter = { isDeleted: { $ne: true } };
      if (companyId) {
        addrFilter.companyId = companyId;
      }
      if (addressType) {
        addrFilter.addressType = addressType;
      }
      const allAddresses = await CompanyAddress.find(addrFilter)
        .sort({ isDefault: -1, createdAt: -1 })
        .lean();

      // Group addresses by companyId
      const addressesByCompany = {};
      allAddresses.forEach((addr) => {
        const cId = addr.companyId ? addr.companyId.toString() : "";
        if (!addressesByCompany[cId]) {
          addressesByCompany[cId] = [];
        }
        addressesByCompany[cId].push(addr);
      });

      const searchLower = search ? search.trim().toLowerCase() : "";

      let companyGroups = companies.map((c) => {
        const cId = c._id.toString();
        const compAddresses = addressesByCompany[cId] || [];

        return {
          _id: c._id,
          name: c.name,
          status: c.status,
          createdAt: c.createdAt,
          addressCount: compAddresses.length,
          addresses: compAddresses,
        };
      });

      // Filter by addressType if provided: only include companies with at least 1 matching address
      if (addressType) {
        companyGroups = companyGroups.filter((g) => g.addressCount > 0);
      }

      // Filter by search query if provided
      if (searchLower) {
        companyGroups = companyGroups
          .map((group) => {
            const companyMatches = group.name?.toLowerCase().includes(searchLower);
            const matchingAddresses = group.addresses.filter((addr) => {
              const type = addr.addressType?.toLowerCase() || "";
              const title = addr.addressTitle?.toLowerCase() || "";
              const line1 = addr.addressLine1?.toLowerCase() || "";
              const line2 = addr.addressLine2?.toLowerCase() || "";
              const cityVal = addr.city?.toLowerCase() || "";
              const stateVal = addr.state?.toLowerCase() || "";
              const pinVal = addr.pincode?.toLowerCase() || "";
              const gstVal = addr.gstNo?.toLowerCase() || "";
              const person = addr.contactPerson?.toLowerCase() || "";
              const phone = addr.contactPhone?.toLowerCase() || "";

              return (
                type.includes(searchLower) ||
                title.includes(searchLower) ||
                line1.includes(searchLower) ||
                line2.includes(searchLower) ||
                cityVal.includes(searchLower) ||
                stateVal.includes(searchLower) ||
                pinVal.includes(searchLower) ||
                gstVal.includes(searchLower) ||
                person.includes(searchLower) ||
                phone.includes(searchLower)
              );
            });

            if (companyMatches) {
              return group;
            }
            if (matchingAddresses.length > 0) {
              return {
                ...group,
                addresses: matchingAddresses,
                addressCount: matchingAddresses.length,
              };
            }
            return null;
          })
          .filter(Boolean);
      }

      const total = companyGroups.length;
      let paginatedGroups = companyGroups;
      if (pagination !== "false") {
        paginatedGroups = companyGroups.slice(skip, skip + parsedLimit);
      }

      if (pagination === "false") {
        return res.json({
          success: true,
          data: paginatedGroups,
          total,
        });
      }

      return res.json({
        success: true,
        data: paginatedGroups,
        page: parsedPage,
        totalPages: Math.ceil(total / parsedLimit) || 1,
        total,
      });
    }

    let filter = {
      isDeleted: { $ne: true },
    };

    if (companyId) {
      filter.companyId = companyId;
    }

    if (addressType) {
      filter.addressType = addressType;
    }

    let addresses = await CompanyAddress.find(filter)
      .populate("companyId", "name status")
      .sort({ createdAt: -1 });

    if (search) {
      const searchLower = search.toLowerCase();
      addresses = addresses.filter((addr) => {
        const companyName = addr.companyId?.name?.toLowerCase() || "";
        const type = addr.addressType?.toLowerCase() || "";
        const title = addr.addressTitle?.toLowerCase() || "";
        const line1 = addr.addressLine1?.toLowerCase() || "";
        const line2 = addr.addressLine2?.toLowerCase() || "";
        const cityVal = addr.city?.toLowerCase() || "";
        const stateVal = addr.state?.toLowerCase() || "";
        const pinVal = addr.pincode?.toLowerCase() || "";
        const gstVal = addr.gstNo?.toLowerCase() || "";
        const person = addr.contactPerson?.toLowerCase() || "";

        return (
          companyName.includes(searchLower) ||
          type.includes(searchLower) ||
          title.includes(searchLower) ||
          line1.includes(searchLower) ||
          line2.includes(searchLower) ||
          cityVal.includes(searchLower) ||
          stateVal.includes(searchLower) ||
          pinVal.includes(searchLower) ||
          gstVal.includes(searchLower) ||
          person.includes(searchLower)
        );
      });
    }

    const total = addresses.length;

    let paginatedAddresses = addresses;
    if (pagination !== "false") {
      paginatedAddresses = addresses.slice(skip, skip + parsedLimit);
    }

    if (pagination === "false") {
      return res.json({
        success: true,
        data: paginatedAddresses,
        total,
      });
    }

    res.json({
      success: true,
      data: paginatedAddresses,
      page: parsedPage,
      totalPages: Math.ceil(total / parsedLimit) || 1,
      total,
    });
  } catch (err) {
    console.error("GET COMPANY ADDRESSES ERROR:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// ✅ GET SINGLE ADDRESS BY ID
exports.getAddressById = async (req, res) => {
  try {
    const address = await CompanyAddress.findOne({
      _id: req.params.id,
      isDeleted: { $ne: true },
    }).populate("companyId", "name status");

    if (!address) {
      return res.status(404).json({ success: false, message: "Address not found." });
    }

    res.json({ success: true, data: address });
  } catch (err) {
    console.error("GET SINGLE ADDRESS ERROR:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// ✅ UPDATE ADDRESS
exports.updateAddress = async (req, res) => {
  try {
    const body = { ...req.body };

    if (typeof body.status === "string") {
      body.status = body.status === "active";
    }

    if (body.addressLine1) {
      body.addressLine1 = body.addressLine1.trim();
    }
    if (body.addressType) {
      body.addressType = body.addressType.trim();
    }
    if (body.addressTitle !== undefined) {
      body.addressTitle = body.addressTitle?.trim() || "";
    }
    if (body.city !== undefined) {
      body.city = body.city?.trim() || "";
    }
    if (body.state !== undefined) {
      body.state = body.state?.trim() || "";
    }
    if (body.pincode !== undefined) {
      body.pincode = body.pincode?.trim() || "";
    }
    if (body.gstNo !== undefined) {
      body.gstNo = body.gstNo?.trim().toUpperCase() || "";
    }
    if (body.contactPerson !== undefined) {
      body.contactPerson = body.contactPerson?.trim() || "";
    }
    if (body.contactPhone !== undefined) {
      body.contactPhone = body.contactPhone?.trim() || "";
    }

    if (body.isDefault === true || body.isDefault === "true") {
      body.isDefault = true;
      const current = await CompanyAddress.findById(req.params.id);
      const cId = body.companyId || current?.companyId;
      if (cId) {
        await CompanyAddress.updateMany(
          { companyId: cId, _id: { $ne: req.params.id }, isDeleted: { $ne: true } },
          { $set: { isDefault: false } }
        );
      }
    } else if (body.isDefault !== undefined) {
      body.isDefault = false;
    }

    const updated = await CompanyAddress.findByIdAndUpdate(req.params.id, body, {
      returnDocument: "after",
    }).populate("companyId", "name status");

    if (!updated) {
      return res.status(404).json({ success: false, message: "Address not found." });
    }

    res.json({
      success: true,
      message: "Company address updated successfully",
      data: updated,
    });
  } catch (err) {
    console.error("UPDATE COMPANY ADDRESS ERROR:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// ✅ DELETE ADDRESS (Soft delete)
exports.deleteAddress = async (req, res) => {
  try {
    const deleted = await CompanyAddress.findByIdAndUpdate(
      req.params.id,
      { isDeleted: true },
      { new: true }
    );

    if (!deleted) {
      return res.status(404).json({ success: false, message: "Address not found." });
    }

    res.json({ success: true, message: "Address deleted successfully" });
  } catch (err) {
    console.error("DELETE COMPANY ADDRESS ERROR:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};
