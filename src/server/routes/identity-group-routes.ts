import { z } from "zod";
import { and, asc, eq, ilike, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { identityGroups, identityGroupMembers, users } from "@/db/schema";
import { route, type RouteDef } from "../router";
import { badRequest, notFound } from "../core";

const groupInput = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().max(500).default(""),
  badge: z.string().trim().min(1).max(24).default("身分"),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#37d3ff"),
  enabled: z.boolean().default(true),
});

export const routes: RouteDef[] = [
  route({
    method: "GET",
    path: "/admin/identity-groups",
    auth: "admin",
    handler: async (ctx) => {
      const q = ctx.query.get("q")?.trim();
      const groups = await db.select().from(identityGroups).where(q ? or(ilike(identityGroups.name, `%${q}%`), ilike(identityGroups.description, `%${q}%`)) : undefined).orderBy(asc(identityGroups.name));
      const result = [];
      for (const group of groups) {
        const members = await db.select({ userId: users.userId, displayName: users.displayName, email: users.email, status: users.status }).from(identityGroupMembers).innerJoin(users, eq(users.userId, identityGroupMembers.userId)).where(eq(identityGroupMembers.identityGroupId, group.id)).orderBy(asc(users.displayName));
        result.push({ ...group, memberCount: members.length, members });
      }
      return { groups: result };
    },
  }),
  route({
    method: "POST",
    path: "/admin/identity-groups",
    auth: "admin",
    handler: async (ctx) => {
      const admin = ctx.requireUser();
      const body = await ctx.json(groupInput);
      const rows = await db.insert(identityGroups).values({ ...body, createdBy: admin.userId }).returning();
      return { group: rows[0] };
    },
  }),
  route({
    method: "PATCH",
    path: "/admin/identity-groups/:id",
    auth: "admin",
    handler: async (ctx) => {
      const body = await ctx.json(groupInput.partial());
      const group = (await db.select().from(identityGroups).where(eq(identityGroups.id, ctx.params.id)).limit(1))[0];
      if (!group) throw notFound("找不到身分組");
      const rows = await db.update(identityGroups).set({ ...body, updatedAt: new Date() }).where(eq(identityGroups.id, group.id)).returning();
      return { group: rows[0] };
    },
  }),
  route({
    method: "DELETE",
    path: "/admin/identity-groups/:id",
    auth: "admin",
    handler: async (ctx) => {
      const group = (await db.select().from(identityGroups).where(eq(identityGroups.id, ctx.params.id)).limit(1))[0];
      if (!group) throw notFound("找不到身分組");
      await db.delete(identityGroups).where(eq(identityGroups.id, group.id));
      return { deleted: true };
    },
  }),
  route({
    method: "PUT",
    path: "/admin/identity-groups/:id/members",
    auth: "admin",
    handler: async (ctx) => {
      const admin = ctx.requireUser();
      const body = await ctx.json(z.object({ userIds: z.array(z.string().uuid()).max(500) }));
      const group = (await db.select({ id: identityGroups.id }).from(identityGroups).where(eq(identityGroups.id, ctx.params.id)).limit(1))[0];
      if (!group) throw notFound("找不到身分組");
      const valid = body.userIds.length ? await db.select({ userId: users.userId }).from(users).where(sql`${users.userId} in (${sql.join(body.userIds.map((id) => sql`${id}::uuid`), sql`, `)})`) : [];
      const validIds = valid.map((row) => row.userId);
      await db.delete(identityGroupMembers).where(eq(identityGroupMembers.identityGroupId, group.id));
      if (validIds.length) await db.insert(identityGroupMembers).values(validIds.map((userId) => ({ identityGroupId: group.id, userId, addedBy: admin.userId })));
      return { memberCount: validIds.length };
    },
  }),
];
