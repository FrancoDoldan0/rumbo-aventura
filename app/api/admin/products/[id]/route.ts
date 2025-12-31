// app/api/admin/products/[id]/route.ts
export const runtime = 'edge';

import { NextRequest, NextResponse } from 'next/server';
import { createPrisma } from '@/lib/prisma-edge';
import { z } from 'zod';
import { slugify } from '@/lib/slug';
import { audit } from '@/lib/audit';
import { r2List, r2Delete } from '@/lib/storage';

const prisma = createPrisma();

/* =========================
   ESTADOS
========================= */

const STATUS_VALUES = new Set(['ACTIVE', 'INACTIVE', 'DRAFT', 'AGOTADO'] as const);

/* =========================
   UPDATE SCHEMA
========================= */

const UpdateSchema = z.object({
  name: z.string().min(1).optional(),
  slug: z.string().optional(), // "" => recalcular
  description: z.string().max(5000).optional().nullable(),
  price: z.coerce.number().optional(),
  sku: z.string().max(120).optional().nullable(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'DRAFT', 'AGOTADO']).optional(),
  subcategoryId: z.coerce.number().optional().nullable(),
});

/* =========================
   HELPERS
========================= */

function getIdFromUrl(req: NextRequest): number | null {
  const { pathname } = new URL(req.url);
  const m = pathname.match(/\/api\/admin\/products\/(\d+)(?:\/)?$/);
  if (!m) return null;
  const id = Number(m[1]);
  return Number.isFinite(id) && id > 0 ? id : null;
}

/* =========================
   GET
========================= */

export async function GET(req: NextRequest) {
  const id = getIdFromUrl(req);
  if (!id) {
    return NextResponse.json({ ok: false, error: 'invalid_id' }, { status: 400 });
  }

  const item = await prisma.product.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      slug: true,
      description: true,
      price: true,
      offerPrice: true,
      sku: true,
      stock: true,
      status: true,

      subcategoryId: true,
      subcategory: {
        select: {
          id: true,
          name: true,
          category: {
            select: { id: true, name: true },
          },
        },
      },
    },
  });

  if (!item) {
    return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
  }

  return NextResponse.json({ ok: true, item });
}

/* =========================
   PUT
========================= */

export async function PUT(req: NextRequest) {
  const id = getIdFromUrl(req);
  if (!id) {
    return NextResponse.json({ ok: false, error: 'invalid_id' }, { status: 400 });
  }

  try {
    const json = await req.json().catch(() => ({}));
    const parsed = UpdateSchema.safeParse(json);

    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: 'validation_failed', detail: parsed.error.format() },
        { status: 400 },
      );
    }

    const b = parsed.data;
    const data: any = {};

    if ('name' in b) data.name = b.name;
    if ('description' in b) data.description = b.description ?? null;
    if ('price' in b) data.price = b.price;
    if ('sku' in b) data.sku = (b.sku ?? '') || null;
    if ('subcategoryId' in b) data.subcategoryId = b.subcategoryId ?? null;

    if ('status' in b && STATUS_VALUES.has(b.status as any)) {
      data.status = b.status;
    }

    // slug: "" => recalcular
    if ('slug' in b && typeof b.slug === 'string') {
      const s = b.slug.trim();
      if (s === '') {
        const current = await prisma.product.findUnique({
          where: { id },
          select: { name: true },
        });
        const base = (b.name ?? current?.name ?? '').trim();
        data.slug = slugify(base || `product-${id}`);
      } else {
        data.slug = s;
      }
    }

    await prisma.product.update({
      where: { id },
      data,
    });

    const item = await prisma.product.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        price: true,
        offerPrice: true,
        sku: true,
        stock: true,
        status: true,
        subcategoryId: true,
      },
    });

    await audit(req, 'UPDATE', 'Product', id, data).catch(() => {});
    return NextResponse.json({ ok: true, item });
  } catch (e: any) {
    if (e?.code === 'P2002') {
      return NextResponse.json(
        { ok: false, error: 'unique_constraint', field: 'slug' },
        { status: 409 },
      );
    }

    return NextResponse.json(
      { ok: false, error: 'update_failed', detail: e?.message ?? String(e) },
      { status: 500 },
    );
  }
}

/* =========================
   DELETE
========================= */

export async function DELETE(req: NextRequest) {
  const id = getIdFromUrl(req);
  if (!id) {
    return NextResponse.json({ ok: false, error: 'invalid_id' }, { status: 400 });
  }

  try {
    // Limpiar imágenes en R2
    try {
      const prefix = `products/${id}/`;
      const objs = await r2List(prefix);
      await Promise.allSettled(objs.map(o => r2Delete(o.key)));
    } catch {}

    await prisma.productImage.deleteMany({ where: { productId: id } }).catch(() => {});
    await prisma.offer.updateMany({ where: { productId: id }, data: { productId: null } });

    await prisma.product.delete({ where: { id } });

    await audit(req, 'DELETE', 'Product', id, null).catch(() => {});
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: 'delete_failed', detail: e?.message ?? String(e) },
      { status: 500 },
    );
  }
}
