import assert from "node:assert/strict";
import test from "node:test";
import { getTableColumns } from "drizzle-orm";
import {
  account,
  invitation,
  member,
  organization,
  session,
  user,
  verification,
} from "../src/db/postgres/schema";

const authDateColumns = [
  user.createdAt,
  user.updatedAt,
  session.expiresAt,
  session.createdAt,
  session.updatedAt,
  account.accessTokenExpiresAt,
  account.refreshTokenExpiresAt,
  account.createdAt,
  account.updatedAt,
  verification.expiresAt,
  verification.createdAt,
  verification.updatedAt,
  organization.createdAt,
  member.createdAt,
  invitation.expiresAt,
  invitation.createdAt,
];

test("PostgreSQL Better Auth date fields accept JavaScript Date values", () => {
  for (const column of authDateColumns) {
    assert.equal(column.dataType, "date");
    assert.equal(column.columnType, "PgTimestamp");
  }

  assert.equal(getTableColumns(user).createdAt.getSQLType(), "timestamp");
});
