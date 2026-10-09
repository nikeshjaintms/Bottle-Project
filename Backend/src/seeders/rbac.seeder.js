const Permission = require("../models/permission.model");
const Role = require("../models/role.model");

const seedRBAC = async () => {
  try {
    // 1. Define Default Permissions
    const permissionsData = [
      "create-user", "edit-user", "delete-user", "show-user", "sidebar-user", "read-user",
      "sidebar-dashboard", "read-dashboard",
      "create-brand", "edit-brand", "delete-brand", "sidebar-brand", "read-brand",
      "create-bottlespec", "edit-bottlespec", "delete-bottlespec", "sidebar-bottlespec", "read-bottlespec", "read-bottlespecdetail",
      "create-variant", "edit-variant", "delete-variant", "sidebar-variant", "read-variant",
      "create-production", "edit-production", "delete-production", "sidebar-production", "read-production", "read-productiondetail",
      "create-coatingproduction", "edit-coatingproduction", "delete-coatingproduction", "sidebar-coatingproduction", "read-coatingproduction", "read-coatingproductiondetail",
      "create-coatingspec", "edit-coatingspec", "delete-coatingspec", "sidebar-coatingspec", "read-coatingspec",
      "create-role", "edit-role", "delete-role", "sidebar-role", "read-role",
      "create-permission", "edit-permission", "delete-permission", "sidebar-permission", "read-permission",
      "create-printing-type", "edit-printing-type", "delete-printing-type", "sidebar-printing-type", "read-printing-type",
      "create-printing-color", "edit-printing-color", "delete-printing-color", "sidebar-printing-color", "read-printing-color",
      "create-coating-type", "edit-coating-type", "delete-coating-type", "sidebar-coating-type", "read-coating-type",
      "create-raw-material", "edit-raw-material", "delete-raw-material", "sidebar-raw-material", "read-raw-material",
      "create-company", "edit-company", "delete-company", "sidebar-company", "read-company",
      "create-operator", "edit-operator", "delete-operator", "sidebar-operator", "read-operator",
      "create-shift", "edit-shift", "delete-shift", "sidebar-shift", "read-shift",
      "create-unit", "edit-unit", "delete-unit", "sidebar-unit", "read-unit",
      "create-sg-label", "edit-sg-label", "delete-sg-label", "sidebar-sg-label", "read-sg-label",
      "create-sg-label-2", "edit-sg-label-2", "delete-sg-label-2", "sidebar-sg-label-2", "read-sg-label-2",
      "create-formula", "edit-formula", "delete-formula", "sidebar-formula", "read-formula",
      "create-stock_entry", "edit-stock_entry", "delete-stock_entry", "sidebar-stock_entry", "read-stock_entry", "rate-stock_entry", "ledger-stock_entry", "stockout-stock_entry",
      "create-incoming", "edit-incoming", "delete-incoming", "sidebar-incoming", "read-incoming",
      "create-itemType", "edit-itemType", "delete-itemType", "sidebar-itemType", "read-itemType",
      "create-gst", "edit-gst", "delete-gst", "sidebar-gst", "read-gst",
      "use-vision", "manage-all",
      "production-date-validation", "coating-production-date-validation",
      "production-record-unlock", "coating-production-record-unlock"
    ];

    // Create permissions if they don't exist, and restore if softly deleted
    const permissions = await Promise.all(
      permissionsData.map(async (name) => {
        let p = await Permission.findOne({ name });
        if (!p) {
          p = await Permission.create({ name, isDeleted: false });
        } else if (p.isDeleted) {
          p.isDeleted = false;
          await p.save();
        }
        return p;
      })
    );

    // 2. Define Roles
    const dbPermissions = await Permission.find();
    const allPermissionIds = dbPermissions.map(p => p._id);
    const rolesData = [
      {
        name: "Admin",
        permissionIds: allPermissionIds // All permissions
      },
      {
        name: "Manager",
        permissionNames: [
          "sidebar-dashboard", "read-dashboard",
          "show-user", "sidebar-user", "read-user",
          "sidebar-unit", "read-unit",
          "create-brand", "edit-brand", "sidebar-brand", "read-brand", "read-company",
          "create-bottlespec", "edit-bottlespec", "sidebar-bottlespec", "read-bottlespec", "read-bottlespecdetail",
          "read-printing-type", "read-printing-color", "read-coating-type",
          "create-variant", "edit-variant", "sidebar-variant", "read-variant",
          "create-formula", "edit-formula", "sidebar-formula", "read-formula",
          "create-production", "edit-production", "sidebar-production", "read-production", "read-productiondetail", "use-vision",
          "create-coatingproduction", "edit-coatingproduction", "sidebar-coatingproduction", "read-coatingproduction", "read-coatingproductiondetail",
          "create-coatingspec", "edit-coatingspec", "sidebar-coatingspec", "read-coatingspec",
          "create-incoming", "edit-incoming", "sidebar-incoming", "read-incoming",
          "create-itemType", "edit-itemType", "sidebar-itemType", "read-itemType",
          "create-gst", "edit-gst", "sidebar-gst", "read-gst",
          "create-sg-label", "edit-sg-label", "delete-sg-label", "sidebar-sg-label", "read-sg-label",
          "create-sg-label-2", "edit-sg-label-2", "delete-sg-label-2", "sidebar-sg-label-2", "read-sg-label-2",
          "create-stock_entry", "edit-stock_entry", "delete-stock_entry", "sidebar-stock_entry", "read-stock_entry", "rate-stock_entry", "ledger-stock_entry", "stockout-stock_entry"
        ]
      },
      {
        name: "Operator",
        permissionNames: [
          "sidebar-dashboard", "read-dashboard",
          "sidebar-unit", "read-unit",
          "sidebar-brand", "read-brand", "read-company",
          "sidebar-bottlespec", "read-bottlespec",
          "read-printing-type", "read-printing-color", "read-coating-type",
          "sidebar-variant", "read-variant",
          "sidebar-formula", "read-formula",
          "sidebar-production", "read-production", "create-production", "use-vision",
          "sidebar-coatingproduction", "read-coatingproduction", "create-coatingproduction",
          "sidebar-coatingspec", "read-coatingspec",
          "sidebar-incoming", "read-incoming",
          "show-user", "read-user",
          "sidebar-stock_entry", "read-stock_entry"
        ]
      }
    ];

    // Create roles
    for (const roleData of rolesData) {
      let rolePermissions = [];
      if (roleData.permissionIds) {
        rolePermissions = roleData.permissionIds;
      } else {
        rolePermissions = dbPermissions.filter(p => roleData.permissionNames.includes(p.name)).map(p => p._id);
      }

      const existingRole = await Role.findOne({ name: roleData.name });
      if (!existingRole) {
        await Role.create({ name: roleData.name, permissions: rolePermissions });
        console.log(`Created default role: ${roleData.name}`);
      } else if (roleData.name === "Admin") {
        existingRole.permissions = rolePermissions;
        await existingRole.save();
      }
    }

    // 3. Migrate existing users
    const User = require("../models/user");
    const allUsers = await User.find();
    const allRoles = await Role.find();

    for (const user of allUsers) {
      if (typeof user.role === "string") {
        const matchingRole = allRoles.find(r => r.name.toLowerCase() === user.role.toLowerCase());
        if (matchingRole) {
          user.role = matchingRole._id;
          await user.save();
          console.log(`Migrated user ${user.email} to role ${matchingRole.name}`);
        }
      }
    }
    
    // 4. Seed Default Printing Types
    const PrintingType = require("../models/PrintingType");
    const defaultTypes = ["Foil", "Organic"];
    for (const name of defaultTypes) {
      const exists = await PrintingType.findOne({ name });
      if (!exists) {
        await PrintingType.create({ name, status: true });
        console.log(`Created default printing type: ${name}`);
      }
    }

    console.log("RBAC Seeding and Migration completed successfully!");
  } catch (error) {
    console.error("RBAC Seeding failed:", error);
  }
};

module.exports = seedRBAC;
