const { AbilityBuilder, Ability } = require("@casl/ability");

const defineAbilityFor = (user) => {
  const { can, cannot, build } = new AbilityBuilder(Ability);

  if (user && user.role && user.role.permissions) {
    user.role.permissions.forEach((permission) => {
      // Permission format: "action-subject" (e.g., "create-user", "sidebar-brand")
      const [action, ...subjectParts] = permission.name.split("-");
      const subject = subjectParts.join("-");

      if (action && subject) {
        can(action, subject);
        if (subject === "dispatch") {
          can(action, "ready-to-dispatch");
        }
      }
    });
  }

  // Common rules can be added here
  // can('read', 'all');

  return build();
};

module.exports = defineAbilityFor;
