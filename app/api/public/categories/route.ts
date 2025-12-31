// app/api/public/categories/route.ts
export const runtime = 'edge';

import { createPrisma } from '@/lib/prisma-edge';
import { json } from '@/lib/json';

const prisma = createPrisma();

export async function GET() {
  const cats = await prisma.category.findMany({
    orderBy: { name: 'asc' },
    select: {
      id: true,
      name: true,
      slug: true,
      imageUrl: true,
      imageKey: true,
      // ✅ Cambiado de subcats a subcategories (nombre real en el esquema)
      subcategories: {
        orderBy: { name: 'asc' },
        select: { id: true, name: true, slug: true },
      },
    },
  });

  const items = cats.map((c) => ({
    id: c.id,
    name: c.name,
    slug: c.slug,
    imageUrl: c.imageUrl ?? null,
    imageKey: c.imageKey ?? null,
    // ✅ Mapeamos el resultado de la relación a la clave "subcats" que espera tu frontend
    subcats: (c.subcategories || []).map((s) => ({ id: s.id, name: s.name, slug: s.slug })),
  }));

  return json({ ok: true, items });
}