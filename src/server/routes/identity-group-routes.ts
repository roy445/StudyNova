import { z } from "zod";
import { asc, eq, ilike, inArray, or } from "drizzle-orm";
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
        const members = await db.select({ userId: users.userId, novaId: users.novaId, displayName: users.displayName, email: users.email, status: users.status }).from(identityGroupMembers).innerJoin(users, eq(users.userId, identityGroupMembers.userId)).where(eq(identityGroupMembers.identityGroupId, group.id)).orderBy(asc(users.displayName));
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
      let body;
      try {
        body = await ctx.json(groupInput.partial());
      } catch (error) {
        console.warn("[StudyNova][identity-group-validation]", JSON.stringify({ requestId: ctx.req.headers.get("x-request-id") ?? null, method: "PATCH", route: "/admin/identity-groups/:id", groupId: ctx.params.id, error: error instanceof Error ? error.message : String(error) }));
        throw error;
      }
      console.info("[StudyNova][identity-group-patch]", JSON.stringify({ requestId: ctx.req.headers.get("x-request-id") ?? null, groupId: ctx.params.id, fields: Object.keys(body), nameLength: typeof body.name === "string" ? body.name.trim().length : null }));
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
      let body;
      try {
        body = await ctx.json(z.object({ userIds: z.array(z.string().uuid()).max(500) }));
      } catch (error) {
        console.warn("[StudyNova][identity-group-validation]", JSON.stringify({ requestId: ctx.req.headers.get("x-request-id") ?? null, method: "PUT", route: "/admin/identity-groups/:id/members", groupId: ctx.params.id, error: error instanceof Error ? error.message : String(error) }));
        throw error;
      }
      console.info("[StudyNova][identity-group-members]", JSON.stringify({ requestId: ctx.req.headers.get("x-request-id") ?? null, groupId: ctx.params.id, requestedUserCount: body.userIds.length }));
      const group = (await db.select({ id: identityGroups.id }).from(identityGroups).where(eq(identityGroups.id, ctx.params.id)).limit(1))[0];
      if (!group) throw notFound("找不到身分組");
      const valid = body.userIds.length ? await db.select({ userId: users.userId }).from(users).where(inArray(users.userId, body.userIds)) : [];
      const validIds = valid.map((row) => row.userId);
      await db.transaction(async (tx) => {
        await tx.delete(identityGroupMembers).where(eq(identityGroupMembers.identityGroupId, group.id));
        if (validIds.length) await tx.insert(identityGroupMembers).values(validIds.map((userId) => ({ identityGroupId: group.id, userId, addedBy: admin.userId })));
      });
      return { memberCount: validIds.length };
    },
  }),
];
