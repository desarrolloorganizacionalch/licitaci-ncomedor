import Link from "next/link";
import type { Profile } from "@/lib/types";
import { BrandLockup } from "./BrandLockup";
import { NavLinks } from "./NavLinks";

export function AppHeader({ profile }: { profile: Profile | null }) {
  const isAdmin = profile?.active && profile.role === "admin";
  const links = isAdmin
    ? [
        { href: "/", label: "Evaluar" },
        { href: "/admin", label: "Panel" },
        { href: "/admin/usuarios", label: "Usuarios" },
        { href: "/admin/postores", label: "Postores" },
      ]
    : null;

  return (
    <>
      <header className="app-header">
        <div className="app-header__bar">
          <Link href="/" aria-label="Inicio">
            <BrandLockup size="sm" />
          </Link>
          {profile && (
            <div className="user-chip">
              <div className="user-chip__name">
                {profile.full_name || profile.email}
                <small>{profile.role === "admin" ? "Administrador" : "Evaluador"}</small>
              </div>
              <form action="/auth/signout" method="post">
                <button className="btn-ghost-light" type="submit">
                  Salir
                </button>
              </form>
            </div>
          )}
        </div>
      </header>
      {links && <NavLinks links={links} />}
    </>
  );
}
