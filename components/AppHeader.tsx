import Link from "next/link";
import { BrandLockup } from "./BrandLockup";
import { NavLinks } from "./NavLinks";

/** Cabecera del panel administrativo. */
export function AppHeader() {
  return (
    <>
      <header className="app-header">
        <div className="app-header__bar">
          <Link href="/admin" aria-label="Panel">
            <BrandLockup size="sm" />
          </Link>
          <div className="user-chip">
            <div className="user-chip__name">
              Panel del comité
              <small>Administración</small>
            </div>
            <form action="/panel/salir" method="post">
              <button className="btn-ghost-light" type="submit">
                Salir
              </button>
            </form>
          </div>
        </div>
      </header>
      <NavLinks
        links={[
          { href: "/admin", label: "Panel" },
          { href: "/admin/postores", label: "Postores" },
          { href: "/", label: "Ficha pública ↗" },
        ]}
      />
    </>
  );
}
