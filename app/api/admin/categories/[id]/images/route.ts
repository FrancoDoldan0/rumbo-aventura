// app/api/admin/categories/[id]/images/route.ts
export const runtime = 'edge';

import { NextResponse } from 'next/server';
import { publicR2Url, r2List, r2Delete, r2Put } from '@/lib/storage';
import { createPrisma } from '@/lib/prisma-edge';
import { audit } from '@/lib/audit';

const prisma = createPrisma();

/* ---------- helpers ---------- */
async function readParams(ctx: any): Promise<{ categoryId: number | null }> {
  const p = ctx?.params;
  const obj = typeof p?.then === 'function' ? await p : p;
  const n = Number(obj?.id);
  return { categoryId: Number.isFinite(n) ? n : null };
}

function sanitizeName(name: string): string {
  return (name || 'upload').replace(/[^\w.\-]+/g, '_');
}

/* ============================================================
   GET: listar SIEMPRE desde R2 y fusionar con DB si existe
   ============================================================ */
export async function GET(_req: Request, ctx: any) {
  const { categoryId } = await readParams(ctx);
  if (categoryId == null) {
    return NextResponse.json({ ok: false, error: 'missing category id' }, { status: 400 });
  }

  try {
    const prefix = `categories/${categoryId}/`;

    const r2Objs = await r2List(prefix);
    const r2Map = new Map(r2Objs.map((o) => [o.key, o] as const));

    let rows: any[] = [];
    try {
      rows =
        (await (prisma as any)?.categoryImage?.findMany({
          where: { categoryId },
          select: {
            id: true,
            key: true,
            alt: true,
            isCover: true,
            sortOrder: true,
            size: true,
            width: true,
            height: true,
            createdAt: true,
          },
          orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
        })) ?? [];
    } catch {
      rows = [];
    }

    const items = r2Objs.map((o, i) => {
      const row = rows.find((r) => r.key === o.key);
      return {
        id: row?.id,
        key: o.key,
        url: publicR2Url(o.key),
        alt: row?.alt ?? null,
        isCover: row?.isCover ?? i === 0,
        sortOrder: Number.isFinite(row?.sortOrder) ? row!.sortOrder : i,
        size: o.size ?? row?.size ?? null,
        width: row?.width ?? null,
        height: row?.height ?? null,
        createdAt: row?.createdAt ?? o.uploaded ?? null,
      };
    });

    for (const r of rows) {
      if (r?.key && !r2Map.has(r.key)) {
        items.push({
          id: r.id,
          key: r.key,
          url: publicR2Url(r.key),
          alt: r.alt ?? null,
          isCover: !!r.isCover,
          sortOrder: Number.isFinite(r.sortOrder) ? r.sortOrder : null,
          size: r.size ?? null,
          width: r.width ?? null,
          height: r.height ?? null,
          createdAt: r.createdAt ?? null,
        });
      }
    }

    items.sort((a: any, b: any) => {
      const soA = Number.isFinite(a.sortOrder) ? a.sortOrder : 999999;
      const soB = Number.isFinite(b.sortOrder) ? b.sortOrder : 999999;
      if (soA !== soB) return soA - soB;
      const tA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const tB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return tA - tB;
    });

    const res = NextResponse.json({ ok: true, items, images: items });
    res.headers.set('Cache-Control', 'no-store');
    return res;
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: 'internal_error', detail: e?.message ?? String(e) },
      { status: 500 },
    );
  }
}

/* ============================================================
   POST: subir a R2 + (best-effort) DB
   ============================================================ */
export async function POST(req: Request, ctx: any) {
  const { categoryId } = await readParams(ctx);
  if (categoryId == null) {
    return NextResponse.json({ ok: false, error: 'missing category id' }, { status: 400 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json(
      { ok: false, error: 'bad_request: expected multipart/form-data' },
      { status: 400 },
    );
  }

  const file = form.get('file') as File | null;
  const alt = (String(form.get('alt') ?? '').trim() || null) as string | null;

  if (!file || typeof (file as any).arrayBuffer !== 'function') {
    return NextResponse.json({ ok: false, error: 'bad_request: field "file" required' }, { status: 400 });
  }

  try {
    let sortOrder = Number(form.get('sortOrder'));
    if (!Number.isFinite(sortOrder)) {
      try {
        sortOrder = (await (prisma as any)?.categoryImage?.count({ where: { categoryId } })) ?? 0;
      } catch {
        sortOrder = 0;
      }
    }

    const isFirst = sortOrder === 0;

    const safeName = sanitizeName((file as any).name || 'upload');
    const key = `categories/${categoryId}/${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}-${safeName}`;

    await r2Put(key, file, (file as any).type || undefined);

    let created: any = {
      key,
      alt,
      sortOrder,
      isCover: isFirst,
      createdAt: new Date().toISOString(),
    };

    try {
      created = await (prisma as any)?.categoryImage?.create({
        data: {
          categoryId,
          key,
          alt,
          sortOrder,
          isCover: isFirst ? true : undefined,
          size: typeof (file as any).size === 'number' ? (file as any).size : undefined,
        },
      });
    } catch {}

    // ✅ FIX: solo actualizar imageKey (imageUrl NO existe en el schema)
    try {
      await (prisma as any).category?.update({
        where: { id: categoryId },
        data: {
          imageKey: key,
        },
      });
    } catch {}

    await audit(req, 'category_images.create', 'category', String(categoryId), {
      imageId: created?.id,
      key,
    }).catch(() => {});

    return NextResponse.json(
      { ok: true, item: { ...created, url: publicR2Url(key) } },
      { status: 201 },
    );
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: 'internal_error', detail: e?.message ?? String(e) },
      { status: 500 },
    );
  }
}

/* ============================================================
   DELETE
   ============================================================ */
export async function DELETE(req: Request, ctx: any) {
  const { categoryId } = await readParams(ctx);
  if (categoryId == null) {
    return NextResponse.json({ ok: false, error: 'missing category id' }, { status: 400 });
  }

  const url = new URL(req.url);
  const imageId = Number(url.searchParams.get('imageId')) || undefined;
  const key = url.searchParams.get('key') || undefined;

  if (!imageId && !key) {
    return NextResponse.json({ ok: false, error: 'missing imageId or key' }, { status: 400 });
  }

  try {
    let keyToDelete = key;

    if (imageId) {
      try {
        const img = await (prisma as any)?.categoryImage?.findFirst({
          where: { id: imageId, categoryId },
        });
        keyToDelete = img?.key;
        await (prisma as any)?.categoryImage?.deleteMany({ where: { id: imageId, categoryId } });
      } catch {}
    }

    if (keyToDelete) {
      await r2Delete(keyToDelete).catch(() => {});
    }

    await audit(req, 'category_images.delete', 'category', String(categoryId), {
      imageId,
      key: keyToDelete,
    }).catch(() => {});

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: 'internal_error', detail: e?.message ?? String(e) },
      { status: 500 },
    );
  }
}
