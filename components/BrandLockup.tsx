import { BRAND } from "@/lib/brand";

/** Lockup co-branded: Nogasa · separador · Vistony (versiones blancas sobre rojo). */
export function BrandLockup({ size = "sm" }: { size?: "sm" | "lg" }) {
  const { nogasaWhite: n, vistonyWhite: v } = BRAND.logos;
  return (
    <div className={`lockup lockup--${size}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="lockup__nogasa" src={n.src} width={n.width} height={n.height} alt={n.alt} />
      <span className="lockup__sep" aria-hidden="true" />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="lockup__vistony" src={v.src} width={v.width} height={v.height} alt={v.alt} />
    </div>
  );
}
