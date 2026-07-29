import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { categories } from "@/db/schema";
import { getAdminUser } from "@/lib/auth/admin-auth";
import { slugify } from "@/lib/slug";
import { auditLogEntry } from "@/lib/admin/audit";

export const dynamic = "force-dynamic";

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  slug: z.string().optional(),
  description: z.string().optional(),
  status: z.enum(["active", "inactive"]).optional(),
  sortOrder: z.coerce.number().int().optional(),
});

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const admin = await getAdminUser();
  if (!admin) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;

  const parsed = updateSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: "Invalid category payload." }, { status: 400 });
  const data = parsed.data;

  const [row] = await db
    .update(categories)
    .set({
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.slug !== undefined ? { slug: slugify(data.slug) } : {}),
      ...(data.description !== undefined ? { description: data.description || null } : {}),
      ...(data.status !== undefined ? { status: data.status } : {}),
      ...(data.sortOrder !== undefined ? { sortOrder: data.sortOrder } : {}),
      updatedAt: new Date(),
    })
    .where(eq(categories.id, id))
    .returning();

  if (!row) return Response.json({ error: "Category not found." }, { status: 404 });

  await auditLogEntry({ actorEmail: admin.email, action: "category.update", entityType: "category", entityId: id, detail: data });

  return Response.json({ category: row });
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const admin = await getAdminUser();
  if (!admin) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;

  const [row] = await db
    .update(categories)
    .set({ status: "inactive", updatedAt: new Date() })
    .where(eq(categories.id, id))
    .returning();
  if (!row) return Response.json({ error: "Category not found." }, { status: 404 });

  await auditLogEntry({ actorEmail: admin.email, action: "category.deactivate", entityType: "category", entityId: id });

  return Response.json({ ok: true });
}
