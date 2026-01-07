export const revalidate = 300; 

import InfoBar from "@/components/landing/InfoBar";
import Header from "@/components/landing/Header";
import MainNav from "@/components/landing/MainNav";
import HeroSlider, { type BannerItem } from "@/components/landing/HeroSlider";
import CategoriesRow from "@/components/landing/CategoriesRow";
import OffersCarousel from "@/components/landing/OffersCarousel";
import BestSellersGrid from "@/components/landing/BestSellersGrid";
import dynamic from "next/dynamic";
import type { Branch } from "@/components/landing/MapHours";
import Sustainability from "@/components/landing/Sustainability";
import { prisma } from "@/lib/prisma-edge"; // Usando tu archivo de Edge optimizado
import { getAllOffersRaw } from "@/lib/offers-landing";

/* ───────── CARGA DIFERIDA ───────── */
const RecipesPopularLazy = dynamic(() => import("@/components/landing/RecipesPopular"), { loading: () => null });
const TestimonialsBadgesLazy = dynamic(() => import("@/components/landing/TestimonialsBadges"), { loading: () => null });
const MapHoursLazy = dynamic(() => import("@/components/landing/MapHours"), { loading: () => null });
const WhatsAppFloatLazy = dynamic(() => import("@/components/landing/WhatsAppFloat"), { loading: () => null });

/* ───────── HELPERS DE SHUFFLE ───────── */
function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}
function seededRand(seed: string) {
  let x = hash(seed) || 1;
  return () => (x = (x * 1664525 + 1013904223) % 4294967296) / 4294967296;
}
function shuffleSeed<T>(arr: T[], seed: string) {
  const rand = seededRand(seed);
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* ───────── DATA FETCHERS ───────── */

async function getBanners(): Promise<BannerItem[]> {
  try {
    const data = await prisma.banner.findMany({
      where: { isActive: true },
      orderBy: { createdAt: 'desc' }
    });
    return data.map((b) => ({
      id: b.id,
      title: b.title || "",
      image: b.imageUrl || "",
      linkUrl: b.linkUrl || null,
    })).filter(b => !!b.image);
  } catch (e) {
    console.error("Error banners:", e);
    return [];
  }
}

async function getCategories() {
  try {
    return await prisma.category.findMany({
      orderBy: { name: 'asc' }
    });
  } catch (e) {
    return [];
  }
}

async function getCatalogForGrid() {
  try {
    const products = await prisma.product.findMany({
      where: { status: 'ACTIVE' }, // Corregido: Mayúsculas para cumplir con el Enum de Prisma
      take: 20,
      orderBy: { id: 'desc' },
      include: { images: true, offer: true }
    });
    return products.map(p => ({
      id: p.id,
      name: p.name,
      slug: p.slug,
      image: p.images[0]?.url || null,
      cover: p.images[0]?.url || null,
      price: Number(p.price),
      status: p.status,
    }));
  } catch (e) {
    console.error("Error catálogo:", e);
    return [];
  }
}

export default async function LandingPage() {
  const seed = new Date().toISOString().slice(0, 10);

  const [banners, cats, catalog] = await Promise.all([
    getBanners(),
    getCategories(),
    getCatalogForGrid(),
  ]);

  const catsDaily = shuffleSeed(cats, `${seed}:cats`).slice(0, 8);
  
  const hours: [string, string][] = [["Lun–Vie", "09:00–19:00"], ["Sáb", "09:00–13:00"], ["Dom", "Cerrado"]];
  const branches: Branch[] = [
    { name: "Las Piedras", address: "Av. Artigas 600", mapsUrl: "#", embedUrl: "#", hours },
    { name: "La Paz", address: "César Mayo Gutiérrez 15900", mapsUrl: "#", embedUrl: "#", hours }
  ];

  return (
    <div className="bg-black text-emerald-400 min-h-screen">
      <InfoBar />
      <Header />
      <MainNav />
      <div className="relative left-1/2 right-1/2 -mx-[50vw] w-screen overflow-hidden">
        <HeroSlider items={banners} />
      </div>
      <CategoriesRow cats={catsDaily as any} />
      <OffersCarousel items={[] as any} visible={3} rotationMs={6000} />
      <BestSellersGrid items={catalog as any} />
      <RecipesPopularLazy />
      <TestimonialsBadgesLazy />
      <MapHoursLazy locations={branches} />
      <Sustainability />
      <WhatsAppFloatLazy />
    </div>
  );
}