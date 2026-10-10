"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function NavLinks({ links }: { links: { href: string; label: string }[] }) {
  const path = usePathname();
  const isCurrent = (href: string) =>
    href === "/" ? path === "/" : path === href || path.startsWith(`${href}/`);
  // "/admin" no debe marcarse cuando se está en "/admin/usuarios".
  const current = links
    .filter((l) => isCurrent(l.href))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;
  return (
    <nav className="app-nav" aria-label="Secciones">
      <div className="app-nav__inner">
        {links.map((l) => (
          <Link key={l.href} href={l.href} aria-current={current === l.href ? "page" : undefined}>
            {l.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
