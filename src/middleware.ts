import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
// ✅ Corregido: Usamos ruta relativa para llegar a src/lib/jwt.ts
// Si el middleware está en /src/middleware.ts, la ruta es ./lib/jwt
import { verifyToken } from "./lib/jwt";

export function middleware(req: NextRequest) {
  const token = req.headers.get("authorization")?.replace("Bearer ", "");

  if (!token) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const decoded = verifyToken(token);
    if (!decoded) {
      return NextResponse.json({ error: "Token inválido" }, { status: 401 });
    }
    return NextResponse.next();
  } catch (error) {
    return NextResponse.json({ error: "Token expirado o inválido" }, { status: 401 });
  }
}

// Opcional: Configura en qué rutas se debe ejecutar el middleware
export const config = {
  matcher: "/api/admin/:path*",
};