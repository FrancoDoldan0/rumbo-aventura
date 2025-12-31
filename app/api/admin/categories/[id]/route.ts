// app/api/admin/categories/[id]/route.ts
export const runtime = 'edge';

import { NextResponse } from 'next/server';
import { createPrisma } from '@/lib/prisma-edge';
import { audit } from '@/lib/audit';
import { r2List, r2Delete } from '@/lib/storage';

const prisma = createPrisma();

// Lee el id desde ctx.params (objeto o promesa en Next 15)
async function readId(ctx: any): Promise<number | null> {
  const p = ctx?.params;
  const obj = typeof p?.then === 'function' ? await p : p;
  const id = Number(obj?.id);
  return Number.isFinite(id) ? id : null;
}

/* ============================
   GET
   ============================ */
export async function GET(_req: Request, ctx: any) {
  const id = await readId(ctx);
  if (id == null) {
    return NextResponse.json({ ok: false, error: 'invalid_id' }, { status: 400 });
  }

  const item = await prisma.category.findUnique({ where: { id } });
  if (!item) {
    return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
  }

  return NextResponse.json({ ok: true, item });
}

/* ============================
   PUT
   ============================ */
export async function PUT(req: Request, ctx: any) {
  const id = await readId(ctx);
  if (id == null) {
    return NextResponse.json({ ok: false, error: 'invalid_id' }, { status: 400 });
  }

  const body = await req.json<any>().catch(() => ({}));
  const data: any = {};

  if (typeof body.name === 'string') data.name = body.name.trim();
  if (typeof body.slug === 'string') data.slug = body.slug.trim();

  const item = await prisma.category.update({
    where: { id },
    data,
  });

  await audit(req, 'category.update', 'category', String(id), { data }).catch(() => {});

  return NextResponse.json({ ok: true, item });
}

/* ============================
   DELETE
   ============================ */
export async function DELETE(req: Request, ctx: any) {
  const id = await readId(ctx);
  if (id == null) {
    return NextResponse.json({ ok: false, error: 'invalid_id' }, { status: 400 });
  }

  try {
    // 1) Obtener subcategorías de la categoría
    const subcats = await prisma.subcategory.findMany({
      where: { categoryId: id },
      select: { id: true },
    });

    const subcategoryIds = subcats.map((s) => s.id);

    // 2) Desasociar productos de esas subcategorías
    if (subcategoryIds.length > 0) {
      await prisma.product.updateMany({
        where: { subcategoryId: { in: subcategoryIds } },
        data: { subcategoryId: null },
      });
    }

    // 3) Borrar imágenes en R2 (best-effort)
    try {
      const prefix = `categories/${id}/`;
      const objs = await r2List(prefix);
      for (const o of objs) {
        await r2Delete(o.key).catch(() => {});
      }
    } catch {}


    // 5) Borrar subcategorías
    await prisma.subcategory.deleteMany({
      where: { categoryId: id },
    });

    // 6) Borrar categoría
    await prisma.category.delete({
      where: { id },
    });

    await audit(req, 'category.delete', 'category', String(id)).catch(() => {});

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    if (e?.code === 'P2003') {
      return NextResponse.json(
        { ok: false, error: 'delete_failed', detail: 'constraint_violation' },
        { status: 409 },
      );
    }

    return NextResponse.json(
      { ok: false, error: 'delete_failed', detail: e?.message ?? String(e) },
      { status: 500 },
    );
  }
}
