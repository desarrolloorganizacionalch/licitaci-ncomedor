import { BrandLockup } from "./BrandLockup";

export function PublicHeader() {
  return (
    <header className="app-header">
      <div className="app-header__bar">
        <BrandLockup size="sm" />
      </div>
    </header>
  );
}
