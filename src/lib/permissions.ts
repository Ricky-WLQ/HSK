import { createAccessControl } from "better-auth/plugins/access";
import { defaultStatements, adminAc } from "better-auth/plugins/admin/access";

/**
 * Access-control statements: the admin plugin's default (user management)
 * statements extended with our app's teacher-capable resources.
 */
export const statement = {
  ...defaultStatements,
  class: ["create", "read", "update", "delete"],
  assignment: ["create", "read", "update", "delete"],
  liveSession: ["host"],
} as const;

export const ac = createAccessControl(statement);

/** Learner — no teaching or admin permissions. */
export const student = ac.newRole({});

/** Teacher — manage classes & assignments, host live sessions. */
export const teacher = ac.newRole({
  class: ["create", "read", "update", "delete"],
  assignment: ["create", "read", "update", "delete"],
  liveSession: ["host"],
});

/** Admin — full user management plus everything a teacher can do. */
export const admin = ac.newRole({
  ...adminAc.statements,
  class: ["create", "read", "update", "delete"],
  assignment: ["create", "read", "update", "delete"],
  liveSession: ["host"],
});

export const roles = { student, teacher, admin };

export type AppRole = keyof typeof roles;
