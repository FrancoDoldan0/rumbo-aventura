// lib/offers-landing.ts
import { createPrisma } from "@/lib/prisma-edge";
import { computePricesBatch } from "@/lib/pricing";
import { publicR2Url } from "@/lib/storage";

const prisma = createPrisma();

// ✅ Corregido: Eliminado 'url' ya que no existe en el schema de ProductImage
type ProductImageRow = { key: string | null }; 
type ProductTagRow = { tagId: number };
type ProductVariantRow = {
  id: number;
  label: string;
  price: number | null;
  priceOriginal: number | null;
  sku: string | null;
  stock: number | null;
  sortOrder: number;
  active: boolean;
};

type ProductRow = {
  id: number;
  name: string;
  slug: string;
  status: string | null;
  price: number | null;
  categoryId: number | null;
  images?: ProductImageRow[];
  productTags?: ProductTagRow[];
  variants?: ProductVariantRow[];
};

export type LandingOffer = {
  id: number;
  name: string;
  slug: string;
  cover: string | null;
  status: string | null;
  priceOriginal: number | null;
  priceFinal: number | null;
  offer: any | null;
  hasDiscount: boolean;
  discountPercent: number;
  hasVariants: boolean;
  variants: {
    id: number;
    label: string;
    priceOriginal: number | null;
    priceFinal: number | null;
    sku: string | null;
    stock: number | null;
    sortOrder: number;
    active: boolean;
  }[];
};

type GetAllOffersOptions = {
  includeVariantDiscounts?: boolean;
};

/**
 * Devuelve TODOS los productos en oferta.
 * Solo usa imágenes basadas en la 'key' mediante publicR2Url(key).
 */
export async function getAllOffersRaw(
  options?: GetAllOffersOptions
): Promise<LandingOffer[]> {
  const includeVariantDiscounts = options?.includeVariantDiscounts ?? true;
  const now = new Date();

  // 1) Productos con Offer activa
  const directOffers = await prisma.offer.findMany({
    where: {
      productId: { not: null },
      AND: [
        { OR: [{ startAt: null }, { startAt: { lte: now } }] },
        { OR: [{ endAt: null }, { endAt: { gte: now } }] },
      ],
    },
    select: { productId: true },
  });

  const productIds = new Set<number>();
  for (const o of directOffers) {
    if (o.productId != null) productIds.add(o.productId);
  }

  // 2) Descuentos manuales en variantes
  if (includeVariantDiscounts) {
    const variantDiscounts = await prisma.productVariant.findMany({
      where: {
        active: true,
        price: { not: null },
        priceOriginal: { not: null },
      },
      select: {
        productId: true,
        price: true,
        priceOriginal: true,
      },
    });

    for (const v of variantDiscounts) {
      if (
        v.productId != null &&
        v.price! < v.priceOriginal!
      ) {
        productIds.add(v.productId);
      }
    }
  }

  if (!productIds.size) return [];

  // 3) Query de productos
  const products = await prisma.product.findMany({
    where: { id: { in: Array.from(productIds) } },
    orderBy: { id: "desc" },
    include: {
      // ✅ Corregido: 'url' eliminado del select
      images: { select: { key: true } }, 
      productTags: { select: { tagId: true } },
      variants: {
        where: { active: true },
        orderBy: { sortOrder: "asc" },
        select: {
          id: true,
          label: true,
          price: true,
          priceOriginal: true,
          sku: true,
          stock: true,
          sortOrder: true,
          active: true,
        },
      },
    },
  });

  const typedItems = products as ProductRow[];

  // 4) Cálculo de precios
  const bare = typedItems.map((p) => ({
    id: p.id,
    price: p.price ?? null,
    categoryId: p.categoryId ?? null,
    tags: (p.productTags ?? []).map((t) => t.tagId),
  }));

  let priced: Map<number, { priceOriginal: number | null; priceFinal: number | null; offer?: any }> = new Map();

  try {
    priced = await computePricesBatch(bare);
  } catch (e) {
    for (const b of bare) {
      priced.set(b.id, { priceOriginal: b.price, priceFinal: b.price, offer: null });
    }
  }

  // 5) Mapeo final
  const mapped = typedItems.map((p) => {
    const pr = priced.get(p.id);
    const basePriceOriginal = pr?.priceOriginal ?? p.price ?? null;
    const basePriceFinal = pr?.priceFinal ?? basePriceOriginal;

    const offerRatio = (basePriceOriginal && basePriceOriginal > 0) 
      ? (basePriceFinal || 0) / basePriceOriginal 
      : 1;

    let priceOriginal: number | null = basePriceOriginal;
    let priceFinal: number | null = basePriceFinal;

    const activeVariants = p.variants || [];
    const variants = activeVariants.map((v) => {
      const vOrig = v.priceOriginal ?? v.price ?? null;
      const vFinal = v.price != null ? v.price * offerRatio : null;

      return { ...v, priceOriginal: vOrig, priceFinal: vFinal };
    });

    if (variants.length) {
      const finals = variants.map((v) => v.priceFinal).filter((x): x is number => x !== null);
      const origs = variants.map((v) => v.priceOriginal).filter((x): x is number => x !== null);
      if (finals.length) priceFinal = Math.min(...finals);
      if (origs.length) priceOriginal = Math.min(...origs);
    }

    const hasDiscount = priceOriginal != null && priceFinal != null && priceFinal < priceOriginal;
    const discountPercent = (hasDiscount && priceOriginal) 
      ? Math.round((1 - (priceFinal! / priceOriginal!)) * 100) 
      : 0;

    // ✅ Corregido: Lógica de imagen simplificada para usar solo la 'key'
    const firstImg = p.images?.[0];
    let cover: string | null = null;
    if (firstImg?.key) {
      cover = publicR2Url(firstImg.key);
    }

    return {
      id: p.id,
      name: p.name,
      slug: p.slug,
      cover,
      status: p.status ?? null,
      priceOriginal,
      priceFinal,
      offer: pr?.offer ?? null,
      hasDiscount,
      discountPercent,
      hasVariants: variants.length > 0,
      variants,
    } satisfies LandingOffer;
  });

  return mapped.filter((i) => i.hasDiscount);
}

export async function getLandingOffersExplicit(limit: number = 9): Promise<LandingOffer[]> {
  const allExplicit = await getAllOffersRaw({ includeVariantDiscounts: false });
  if (!allExplicit.length) return [];
  return limit <= 0 ? allExplicit : allExplicit.slice(0, limit);
}