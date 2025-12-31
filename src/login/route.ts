import { NextResponse } from "next/server";
import bcrypt from "bcryptjs"; 

// ✅ Ruta para la raíz lib/
import { createPrisma } from "../../lib/prisma-edge"; 

// ✅ Ruta para src/lib/
import { signToken } from "../lib/jwt";

export const runtime = 'edge'; 

const prisma = createPrisma();

export async function POST(req: Request) {
  try {
    // ✅ Corregido: Definimos el tipo del body para que TS reconozca email y password
    const body = await req.json() as { email?: string; password?: string };
    const { email, password } = body;

    if (!email || !password) {
      return NextResponse.json({ error: "Email y contraseña requeridos" }, { status: 400 });
    }

    const admin = await prisma.adminUser.findUnique({
      where: { email },
    });

    if (!admin) {
      return NextResponse.json({ error: "Credenciales inválidas" }, { status: 401 });
    }

    // Usamos bcryptjs para compatibilidad con Cloudflare Edge
    const valid = await bcrypt.compare(password, admin.passwordHash);

    if (!valid) {
      return NextResponse.json({ error: "Credenciales inválidas" }, { status: 401 });
    }

    const token = signToken({ adminId: admin.id });

    return NextResponse.json({ token });
  } catch (error: any) {
    return NextResponse.json({ 
      error: "Error en el servidor", 
      details: error.message 
    }, { status: 500 });
  }
}