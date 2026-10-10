import { NextResponse, type NextRequest } from "next/server";
import { ADMIN_COOKIE, isValidAdminKey } from "@/lib/admin";

/** Enlace secreto del panel: valida la clave, la guarda en una cookie y abre el panel. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const to = request.nextUrl.clone();
  to.search = "";
  if (!(await isValidAdminKey(key))) {
    to.pathname = "/sin-acceso";
    return NextResponse.redirect(to);
  }
  to.pathname = "/admin";
  const res = NextResponse.redirect(to);
  res.cookies.set(ADMIN_COOKIE, key, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 60, // 60 días
  });
  return res;
}
