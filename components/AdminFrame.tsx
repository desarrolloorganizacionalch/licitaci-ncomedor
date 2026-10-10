import { AppHeader } from "./AppHeader";
import type { Profile } from "@/lib/types";

export function AdminFrame({
  profile,
  eyebrow,
  title,
  accent,
  intro,
  actions,
  children,
}: {
  profile: Profile;
  eyebrow: string;
  title: string;
  accent: string;
  intro?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <>
      <AppHeader profile={profile} />
      <main className="shell wide stack-lg">
        <div className="row between wrap" style={{ alignItems: "end" }}>
          <div className="stack" style={{ gap: 4 }}>
            <p className="eyebrow">{eyebrow}</p>
            <h1 className="title">
              {title} <em>{accent}</em>
            </h1>
            {intro && <p className="subtitle">{intro}</p>}
          </div>
          {actions && <div className="row wrap no-print">{actions}</div>}
        </div>
        {children}
      </main>
    </>
  );
}
