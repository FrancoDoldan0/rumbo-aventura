// app/api/admin/products/route.ts
export const runtime = 'edge';

import { NextResponse } from 'next/server';
import { createPrisma } from '@/lib/prisma-edge';
import { z } from 'zod';
import { audit } from '@/lib/audit';

const prisma = createPrisma();

/* =========================
   VALIDACIÓN
========================= */

const Body = z.object({
  name: z.string().min(1).max(150),
  slug: z.string().min(1).max(180).optional(),
  description: z.string().max(5000).optional().nullable(),
  price: z.coerce.number().nonnegative(),
  sku: z.string().optional().nullable(),
  stock: z.coerce.number().int().optional().nullable(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'DRAFT', 'AGOTADO']).optional(),
  subcategoryId: z.coerce.number().optional().nullable(),
});

/* =========================
   HELPERS
========================= */

function slugify(text: string) {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

/* =========================
   GET (listado)
========================= */

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);

    const status = searchParams.get('status') || undefined;
    const categoryId = searchParams.get('categoryId');
    const subcategoryId = searchParams.get('subcategoryId');

    const where: any = {};

    if (status) where.status = status;
    if (subcategoryId) where.subcategoryId = Number(subcategoryId);
    if (categoryId) {
      where.subcategory = {
        categoryId: Number(categoryId),
      };
    }

    const items = await prisma.product.findMany({
      where,
      orderBy: { id: 'desc' },
      select: {
        id: true,
        name: true,
        slug: true,
        price: true,
        sku: true,
        stock: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        subcategory: {
          select: {
            id: true,
            name: true,
            category: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
        images: {
          orderBy: { order: 'asc' },
          select: {
            id: true,
            key: true,
            isCover: true,
          },
        },
      },
    });

    return NextResponse.json(items);
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: 'admin_products_get_failed', detail: e?.message ?? String(e) },
      { status: 500 },
    );
  }
}

/* =========================
   POST (crear)
========================= */

export async function POST(req: Request) {
  try {
    const json = await req.json();
    const parsed = Body.safeParse(json);

    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: 'validation_failed', detail: parsed.error.format() },
        { status: 400 },
      );
    }

    const b = parsed.data;
    const finalSlug = b.slug ? slugify(b.slug) : slugify(b.name);

    const created = await prisma.product.create({
      data: {
        name: b.name,
        slug: finalSlug,
        description: b.description ?? null,
        price: b.price, // Zod ya garantiza que es number
        sku: b.sku && b.sku !== '' ? b.sku : null,
        stock: b.stock ?? null,
        status: b.status ?? 'ACTIVE',
        subcategoryId: b.subcategoryId ?? null,
      },
    });

    await audit(req, 'CREATE', 'Product', created.id, b);

    return NextResponse.json({ ok: true, item: created }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: 'admin_products_post_failed', detail: e?.message ?? String(e) },
      { status: 500 },
    );
  }
}

/* =========================
   PUT (actualizar)
========================= */

export async function PUT(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = Number(searchParams.get('id'));

    if (!id) {
      return NextResponse.json({ ok: false, error: 'missing_id' }, { status: 400 });
    }

    const json = await req.json();
    const parsed = Body.partial().safeParse(json);

    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: 'validation_failed', detail: parsed.error.format() },
        { status: 400 },
      );
    }

    const b = parsed.data;
    const data: any = {};

    if (b.name) data.name = b.name;
    if (b.slug) data.slug = slugify(b.slug);
    if ('description' in b) data.description = b.description ?? null;
    
    // CORRECCIÓN CLAVE AQUÍ:
    // Evitamos el uso de '?? null' si el campo en DB no acepta nulls.
    if ('price' in b && b.price !== undefined) {
        data.price = b.price; 
    }
    
    if ('sku' in b) data.sku = b.sku && b.sku !== '' ? b.sku : null;
    if ('stock' in b) data.stock = b.stock ?? null;
    if ('status' in b) data.status = b.status;
    if ('subcategoryId' in b) data.subcategoryId = b.subcategoryId ?? null;

    const updated = await prisma.product.update({
      where: { id },
      data,
    });

    await audit(req, 'UPDATE', 'Product', updated.id, b);

    return NextResponse.json({ ok: true, item: updated });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: 'admin_products_put_failed', detail: e?.message ?? String(e) },
      { status: 500 },
    );
  }
}

/* =========================
   DELETE
========================= */

export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = Number(searchParams.get('id'));

    if (!id) {
      return NextResponse.json({ ok: false, error: 'missing_id' }, { status: 400 });
    }

    await prisma.product.delete({ where: { id } });
    await audit(req, 'DELETE', 'Product', id);

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: 'admin_products_delete_failed', detail: e?.message ?? String(e) },
      { status: 500 },
    );
  }
}