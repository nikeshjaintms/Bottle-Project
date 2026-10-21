import { AbilityBuilder, createMongoAbility } from '@casl/ability';

export const defineAbilitiesFor = (user) => {
  const { can, cannot, build } = new AbilityBuilder(createMongoAbility);

  if (user && user.role && user.role.permissions) {
    user.role.permissions.forEach((permission) => {
      // Permission format: "action-subject"
      const [action, ...subjectParts] = permission.name.split("-");
      const subject = subjectParts.join("-");

      if (action === "manage" && subject === "all") {
        can("manage", "all");
      } else if (action && subject) {
        can(action, subject);
        if (subject === "company") {
          can(action, "company-address");
        }
        if (subject === "delivery-challan") {
          can(action, "delivery-challan-mcnore");
          can(action, "delivery-challan-sherno");
          can(action, "delivery-challan-shayoona");
        }
        if (subject === "dispatch") {
          can(action, "ready-to-dispatch");
        }
      }
    });
  }

  return build();
};
