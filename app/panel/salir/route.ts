import { NextResponse, type NextRequest } from "next/server";
import { ADMIN_COOKIE } from "@/lib/admin";

export async function POST(request: NextRequest) {
  const to = request.nextUrl.clone();
  to.pathname = "/";
  to.search = "";
  const res = NextResponse.redirect(to, { status: 303 });
  res.cookies.delete(ADMIN_COOKIE);
  return res;
}
