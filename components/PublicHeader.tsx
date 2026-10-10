import Link from "next/link";
import { BrandLockup } from "./BrandLockup";

export function PublicHeader() {
  return (
    <header className="app-header">
      <div className="app-header__bar">
        <BrandLockup size="sm" />
        <Link href="/admin" className="btn-ghost-light" style={{ marginLeft: "auto", textDecoration: "none" }}>
          Administración
        </Link>
      </div>
    </header>
  );
}
