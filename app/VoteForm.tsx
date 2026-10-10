"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { formatDate, isComplete, MAX_SCORE, SCALE, scaleOf, todayInLima, tone, totalScore } from "@/lib/scoring";
import type { Criterion, Score, Supplier } from "@/lib/types";
import { checkVote, submitVote } from "./actions";

interface Props {
  suppliers: Supplier[];
  criteria: Criterion[];
}

interface Draft {
  name: string;
  supplierId: string;
  visitDate: string;
  scores: Record<number, Score | undefined>;
  obs: Record<number, string>;
}

const OBS_MAX = 1000;
const DRAFT_KEY = "ficha-visita:borrador";
const NAME_KEY = "ficha-visita:nombre";

const emptyDraft = (name = ""): Draft => ({ name, supplierId: "", visitDate: todayInLima(), scores: {}, obs: {} });

function descFor(c: Criterion, key: (typeof SCALE)[number]["key"]) {
  return key === "bueno" ? c.good_desc : key === "regular" ? c.regular_desc : c.bad_desc;
}

/** localStorage puede no estar disponible (modo privado, bloqueos): siempre con try/catch. */
function store(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* sin almacenamiento */
  }
}
function read(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function VoteForm({ suppliers, criteria }: Props) {
  const lastStep = criteria.length + 1; // 0 = datos, 1..6 = criterios, 7 = resumen
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [pending, startTransition] = useTransition();
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState(0);
  const [restored, setRestored] = useState(false);
  const [done, setDone] = useState<{ total: number; supplier: string; name: string } | null>(null);
  const [draft, setDraft] = useState<Draft>(() => emptyDraft());

  // Recupera el borrador o, al menos, el nombre usado en la ficha anterior.
  useEffect(() => {
    const raw = read(DRAFT_KEY);
    if (raw) {
      try {
        const saved = JSON.parse(raw) as Draft;
        if (saved && typeof saved === "object" && saved.scores) {
          setDraft({ ...emptyDraft(saved.name ?? ""), ...saved, visitDate: saved.visitDate || todayInLima() });
          setRestored(Object.keys(saved.scores).length > 0);
          return;
        }
      } catch {
        /* borrador corrupto */
      }
    }
    const name = read(NAME_KEY);
    if (name) setDraft((d) => ({ ...d, name }));
  }, []);

  useEffect(() => {
    if (!done) store(DRAFT_KEY, JSON.stringify(draft));
  }, [draft, done]);

  useEffect(() => {
    window.scrollTo({ top: 0 });
    headingRef.current?.focus({ preventScroll: true });
  }, [step, done]);

  const ids = useMemo(() => criteria.map((c) => c.id), [criteria]);
  const supplier = suppliers.find((s) => s.id === draft.supplierId);
  const total = totalScore(ids.map((id) => draft.scores[id]));
  const answered = ids.filter((id) => draft.scores[id] !== undefined).length;
  const complete = isComplete(draft.scores, ids);
  const today = todayInLima();
  const criterion = step >= 1 && step <= criteria.length ? criteria[step - 1] : null;
  const nameOk = draft.name.trim().replace(/\s+/g, " ").length >= 3;
  const dataOk = nameOk && Boolean(supplier) && Boolean(draft.visitDate) && draft.visitDate <= today;

  const canAdvance = step === 0 ? dataOk : criterion ? draft.scores[criterion.id] !== undefined : true;

  function setScore(id: number, score: Score) {
    setDraft((d) => ({ ...d, scores: { ...d.scores, [id]: score } }));
  }
  function setObs(id: number, text: string) {
    setDraft((d) => ({ ...d, obs: { ...d.obs, [id]: text.slice(0, OBS_MAX) } }));
  }
  function isStepDone(i: number) {
    if (i === 0) return dataOk;
    if (i <= criteria.length) return draft.scores[criteria[i - 1].id] !== undefined;
    return false;
  }

  async function next() {
    setError(null);
    if (step === 0) {
      // Avisa antes de llenar la ficha si ya existe una con este nombre y postor.
      setChecking(true);
      const exists = await checkVote(draft.name, draft.supplierId).catch(() => false);
      setChecking(false);
      if (exists) {
        setError(
          `Ya hay una ficha registrada a nombre de ${draft.name.trim()} para ${supplier?.name}. Elige otro postor o pide al administrador que la elimine para corregirla.`,
        );
        return;
      }
    }
    setStep(step + 1);
  }

  function goTo(i: number) {
    if (i > 0 && !dataOk) return; // primero los datos de la visita
    setError(null);
    setStep(i);
  }

  function submit(form: HTMLFormElement | null) {
    setError(null);
    if (!complete || !supplier) {
      setError("Faltan criterios por calificar. Toca un criterio en el resumen para completarlo.");
      return;
    }
    const website = form ? String(new FormData(form).get("website") ?? "") : "";
    startTransition(async () => {
      const res = await submitVote({
        evaluatorName: draft.name,
        supplierId: supplier.id,
        visitDate: draft.visitDate,
        answers: ids.map((id) => ({ criterion_id: id, score: draft.scores[id]!, observation: draft.obs[id] ?? "" })),
        website,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      store(DRAFT_KEY, null);
      store(NAME_KEY, draft.name.trim());
      setDone({ total: res.total, supplier: supplier.name, name: draft.name.trim() });
    });
  }

  function another() {
    setDone(null);
    setRestored(false);
    setDraft(emptyDraft(draft.name.trim()));
    setStep(0);
  }

  if (done) {
    return (
      <main className="shell stack-lg">
        <section className="stack" style={{ textAlign: "center", paddingTop: 24 }}>
          <p className="eyebrow">Ficha registrada</p>
          <h1 className="title" ref={headingRef} tabIndex={-1}>
            ¡Gracias, <em>{done.name.split(" ")[0]}</em>!
          </h1>
          <p className="subtitle">Tu evaluación de {done.supplier} quedó registrada.</p>
        </section>
        <div className="total-hero">
          <div>
            <p className="label-caps" style={{ color: "rgb(255 255 255 / 80%)" }}>
              {done.supplier}
            </p>
            <p className="total-hero__value">
              {done.total}
              <small> / {MAX_SCORE}</small>
            </p>
          </div>
          <p style={{ fontSize: 13, opacity: 0.85 }}>Puntaje total</p>
          <div className="total-hero__bar" aria-hidden="true">
            <span style={{ width: `${(done.total / MAX_SCORE) * 100}%` }} />
          </div>
        </div>
        <button type="button" className="btn btn-primary btn-block" onClick={another}>
          Evaluar otro postor
        </button>
        <p className="hint" style={{ textAlign: "center" }}>
          Recuerda: una ficha por cada postor visitado.
        </p>
      </main>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (step === lastStep) submit(e.currentTarget);
      }}
    >
      {/* Campo trampa para bots: invisible para personas. */}
      <div aria-hidden="true" style={{ position: "absolute", left: "-10000px", width: 1, height: 1, overflow: "hidden" }}>
        <label>
          No llenar
          <input type="text" name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>

      <div className="wizard-top">
        <div className="wizard-top__inner">
          <div className="row between">
            <div className="grow">
              <p className="label-caps" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {supplier ? supplier.name : "Ficha de visita"}
              </p>
            </div>
            <div className="meter" aria-live="polite">
              <strong>{total}</strong>
              <span>/ {MAX_SCORE} pts</span>
            </div>
          </div>
          <div className="steps" role="list" aria-label="Pasos de la ficha">
            {Array.from({ length: lastStep + 1 }, (_, i) => (
              <button
                key={i}
                type="button"
                role="listitem"
                className={i === step ? "is-current" : isStepDone(i) ? "is-done" : ""}
                aria-label={i === 0 ? "Datos de la visita" : i === lastStep ? "Resumen" : `Criterio ${i}: ${criteria[i - 1].title}`}
                aria-current={i === step ? "step" : undefined}
                onClick={() => goTo(i)}
              />
            ))}
          </div>
        </div>
      </div>

      <main className="shell stack-lg">
        {restored && step === 0 && (
          <div className="alert alert-info" role="status">
            Recuperamos la ficha que dejaste sin enviar en este dispositivo.{" "}
            <button type="button" className="btn-text" onClick={() => { setDraft(emptyDraft(draft.name)); setRestored(false); }}>
              Empezar de nuevo
            </button>
          </div>
        )}

        {step === 0 && (
          <section className="stack">
            <div className="criterion-head">
              <p className="eyebrow">Comité evaluador · Bienestar</p>
              <h1 className="title" ref={headingRef} tabIndex={-1}>
                Ficha de <em>visita</em>
              </h1>
              <p className="criterion-guide">
                Llena una ficha por cada postor visitado. Elige una sola opción por criterio: Bueno = 10 · Regular = 5 ·
                Malo = 0 (máximo {MAX_SCORE} puntos).
              </p>
            </div>
            <div className="card stack">
              <label className="field">
                <span>1. Nombre del evaluador(a)</span>
                <input
                  className="input"
                  name="evaluator"
                  required
                  minLength={3}
                  maxLength={120}
                  autoComplete="name"
                  placeholder="Nombre y apellido"
                  value={draft.name}
                  onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                />
              </label>

              <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
                <legend style={{ fontSize: 13, fontWeight: 500, color: "var(--ink-2)", marginBottom: 6 }}>
                  2. Empresa postora evaluada
                </legend>
                {suppliers.length === 0 ? (
                  <div className="empty">
                    <strong>No hay postores habilitados</strong>
                    El comité aún no ha registrado empresas para evaluar.
                  </div>
                ) : (
                  <div className="supplier-list">
                    {suppliers.map((s, i) => (
                      <label key={s.id} className={`supplier-pick${draft.supplierId === s.id ? " is-selected" : ""}`}>
                        <input
                          type="radio"
                          name="supplier"
                          value={s.id}
                          checked={draft.supplierId === s.id}
                          onChange={() => setDraft((d) => ({ ...d, supplierId: s.id }))}
                        />
                        <span className="supplier-row__letter" aria-hidden="true">
                          {String.fromCharCode(65 + i)}
                        </span>
                        <span className="supplier-row__name">{s.name}</span>
                      </label>
                    ))}
                  </div>
                )}
              </fieldset>

              <label className="field">
                <span>3. Fecha de la visita</span>
                <input
                  className="input"
                  type="date"
                  required
                  max={today}
                  value={draft.visitDate}
                  onChange={(e) => setDraft((d) => ({ ...d, visitDate: e.target.value }))}
                />
                {draft.visitDate > today && <span className="hint tone-bajo">La fecha no puede ser futura.</span>}
              </label>
            </div>
            {error && (
              <div className="alert alert-error" role="alert">
                {error}
              </div>
            )}
          </section>
        )}

        {criterion && (
          <section className="stack" key={criterion.id}>
            <div className="criterion-head">
              <div className="row">
                <span className="criterion-num" aria-hidden="true">
                  {criterion.id}
                </span>
                <p className="eyebrow">
                  Criterio {step} de {criteria.length}
                </p>
              </div>
              <h1 className="criterion-title" ref={headingRef} tabIndex={-1}>
                {criterion.title}
              </h1>
              <p className="criterion-guide">{criterion.instruction}</p>
            </div>

            <fieldset className="options">
              <legend className="sr-only">Calificación de {criterion.title}</legend>
              {SCALE.map((opt) => (
                <label key={opt.key} className={`option option--${opt.key}`}>
                  <input
                    type="radio"
                    name={`c${criterion.id}`}
                    value={opt.value}
                    checked={draft.scores[criterion.id] === opt.value}
                    onChange={() => setScore(criterion.id, opt.value)}
                  />
                  <span className="option__pts" aria-hidden="true">
                    {opt.value}
                    <small>PTS</small>
                  </span>
                  <span>
                    <span className="option__label">{opt.label}</span>
                    <span className="option__desc" style={{ display: "block" }}>
                      {descFor(criterion, opt.key)}
                    </span>
                  </span>
                  <span className="option__check" aria-hidden="true">
                    ✓ Elegido
                  </span>
                </label>
              ))}
            </fieldset>

            <label className="field">
              <span>Observación sobre {criterion.title.toLowerCase()} (opcional)</span>
              <textarea
                className="textarea"
                maxLength={OBS_MAX}
                value={draft.obs[criterion.id] ?? ""}
                onChange={(e) => setObs(criterion.id, e.target.value)}
                placeholder="Detalle lo observado, especialmente si califica Regular o Malo."
              />
              <span className="hint" style={{ textAlign: "right" }}>
                {(draft.obs[criterion.id] ?? "").length}/{OBS_MAX}
              </span>
            </label>
          </section>
        )}

        {step === lastStep && (
          <section className="stack">
            <div className="criterion-head">
              <p className="eyebrow">Revisión final</p>
              <h1 className="title" ref={headingRef} tabIndex={-1}>
                Resumen de la <em>ficha</em>
              </h1>
              <p className="criterion-guide">
                {draft.name.trim()} · {supplier?.name} · visita del {draft.visitDate ? formatDate(draft.visitDate) : "—"}
              </p>
            </div>

            <div className="total-hero">
              <div>
                <p className="label-caps" style={{ color: "rgb(255 255 255 / 80%)" }}>
                  Puntaje total
                </p>
                <p className="total-hero__value">
                  {total}
                  <small> / {MAX_SCORE}</small>
                </p>
              </div>
              <p style={{ fontSize: 13, opacity: 0.85 }}>
                {answered} de {criteria.length} criterios
              </p>
              <div className="total-hero__bar" aria-hidden="true">
                <span style={{ width: `${(total / MAX_SCORE) * 100}%` }} />
              </div>
            </div>

            <div className="card">
              <ul className="summary-list">
                {criteria.map((c, i) => {
                  const s = draft.scores[c.id];
                  const sc = s !== undefined ? scaleOf(s) : null;
                  return (
                    <li key={c.id} className="summary-item">
                      <span className="summary-item__n">{c.id}</span>
                      <span>
                        <button type="button" className="btn-text" style={{ padding: 0, textAlign: "left" }} onClick={() => goTo(i + 1)}>
                          <span className="summary-item__t">{c.title}</span>
                        </button>
                        {draft.obs[c.id]?.trim() && (
                          <span className="summary-item__obs" style={{ display: "block" }}>
                            “{draft.obs[c.id].trim()}”
                          </span>
                        )}
                      </span>
                      {sc ? (
                        <span className={`chip chip-${sc.key}`}>
                          {sc.label} · {sc.value}
                        </span>
                      ) : (
                        <span className="chip chip-pend">Sin calificar</span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>

            <p className="hint">
              Al enviar, la ficha queda registrada a tu nombre y ya no se puede editar desde aquí.
              {complete && <> Resultado: <strong className={`tone-${tone(total, MAX_SCORE)}`}>{total}/{MAX_SCORE}</strong>.</>}
            </p>

            {error && (
              <div className="alert alert-error" role="alert">
                {error}
              </div>
            )}
          </section>
        )}
      </main>

      <div className="wizard-bottom">
        <div className="wizard-bottom__inner">
          <button
            type="button"
            className="btn btn-outline"
            onClick={() => goTo(Math.max(0, step - 1))}
            disabled={pending || step === 0}
          >
            Atrás
          </button>
          {step < lastStep ? (
            <button type="button" className="btn btn-navy" disabled={!canAdvance || checking} onClick={next}>
              {checking ? "Verificando…" : step === criteria.length ? "Ver resumen" : step === 0 ? "Comenzar" : "Siguiente"}
            </button>
          ) : (
            <button type="submit" className="btn btn-primary" disabled={pending || !complete}>
              {pending ? "Enviando…" : "Registrar ficha"}
            </button>
          )}
        </div>
      </div>
    </form>
  );
}
