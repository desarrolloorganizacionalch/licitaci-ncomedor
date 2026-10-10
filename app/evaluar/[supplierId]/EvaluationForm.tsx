"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatDate, isComplete, MAX_SCORE, SCALE, scaleOf, todayInLima, totalScore } from "@/lib/scoring";
import type { Criterion, Evaluation, Score, Supplier } from "@/lib/types";
import { submitEvaluation } from "../actions";

interface Props {
  userId: string;
  evaluatorName: string;
  supplier: Supplier;
  criteria: Criterion[];
  existing: Evaluation | null;
}

interface Draft {
  visitDate: string;
  scores: Record<number, Score | undefined>;
  obs: Record<number, string>;
}

const OBS_MAX = 1000;

function descFor(c: Criterion, key: (typeof SCALE)[number]["key"]) {
  return key === "bueno" ? c.good_desc : key === "regular" ? c.regular_desc : c.bad_desc;
}

export function EvaluationForm({ userId, evaluatorName, supplier, criteria, existing }: Props) {
  const router = useRouter();
  const draftKey = `ficha:${userId}:${supplier.id}`;
  const lastStep = criteria.length + 1; // 0 = datos, 1..6 = criterios, 7 = resumen
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState(0);
  const [restored, setRestored] = useState(false);

  const [draft, setDraft] = useState<Draft>(() => {
    if (existing) {
      const scores: Draft["scores"] = {};
      const obs: Draft["obs"] = {};
      for (const a of existing.evaluation_answers ?? []) {
        scores[a.criterion_id] = a.score;
        obs[a.criterion_id] = a.observation ?? "";
      }
      return { visitDate: existing.visit_date, scores, obs };
    }
    return { visitDate: todayInLima(), scores: {}, obs: {} };
  });

  // Borrador local (solo comodidad del dispositivo; la fuente de verdad es Supabase).
  useEffect(() => {
    if (existing) return;
    try {
      const raw = localStorage.getItem(draftKey);
      if (raw) {
        const saved = JSON.parse(raw) as Draft;
        if (saved && typeof saved === "object" && saved.scores) {
          setDraft({ visitDate: saved.visitDate || todayInLima(), scores: saved.scores, obs: saved.obs ?? {} });
          setRestored(Object.keys(saved.scores).length > 0);
        }
      }
    } catch {
      /* almacenamiento no disponible */
    }
  }, [draftKey, existing]);

  useEffect(() => {
    try {
      localStorage.setItem(draftKey, JSON.stringify(draft));
    } catch {
      /* almacenamiento no disponible */
    }
  }, [draft, draftKey]);

  useEffect(() => {
    window.scrollTo({ top: 0 });
    headingRef.current?.focus({ preventScroll: true });
  }, [step]);

  const ids = useMemo(() => criteria.map((c) => c.id), [criteria]);
  const total = totalScore(ids.map((id) => draft.scores[id]));
  const answered = ids.filter((id) => draft.scores[id] !== undefined).length;
  const complete = isComplete(draft.scores, ids);
  const today = todayInLima();
  const criterion = step >= 1 && step <= criteria.length ? criteria[step - 1] : null;

  const canAdvance =
    step === 0 ? Boolean(draft.visitDate) && draft.visitDate <= today : criterion ? draft.scores[criterion.id] !== undefined : true;

  function setScore(id: number, score: Score) {
    setDraft((d) => ({ ...d, scores: { ...d.scores, [id]: score } }));
  }
  function setObs(id: number, text: string) {
    setDraft((d) => ({ ...d, obs: { ...d.obs, [id]: text.slice(0, OBS_MAX) } }));
  }

  function isStepDone(i: number) {
    if (i === 0) return Boolean(draft.visitDate);
    if (i <= criteria.length) return draft.scores[criteria[i - 1].id] !== undefined;
    return false;
  }

  function submit() {
    setError(null);
    if (!complete) {
      setError("Faltan criterios por calificar. Toca un criterio en el resumen para completarlo.");
      return;
    }
    startTransition(async () => {
      const res = await submitEvaluation({
        supplierId: supplier.id,
        visitDate: draft.visitDate,
        answers: ids.map((id) => ({ criterion_id: id, score: draft.scores[id]!, observation: draft.obs[id] ?? "" })),
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      try {
        localStorage.removeItem(draftKey);
      } catch {
        /* sin almacenamiento */
      }
      router.replace(`/?ok=${supplier.id}`);
      router.refresh();
    });
  }

  return (
    <>
      <div className="wizard-top">
        <div className="wizard-top__inner">
          <div className="row between">
            <div className="grow">
              <p className="label-caps" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {supplier.name}
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
                onClick={() => setStep(i)}
              />
            ))}
          </div>
        </div>
      </div>

      <main className="shell stack-lg">
        {restored && step === 0 && (
          <div className="alert alert-info" role="status">
            Recuperamos el avance que dejaste sin enviar en este dispositivo.
          </div>
        )}
        {existing && step === 0 && (
          <div className="alert alert-info" role="status">
            Ya enviaste esta ficha ({existing.total_score}/{MAX_SCORE}, visita del {formatDate(existing.visit_date)}). Si
            la vuelves a enviar, se reemplazará.
          </div>
        )}

        {step === 0 && (
          <section className="stack">
            <div className="criterion-head">
              <p className="eyebrow">Ficha de visita</p>
              <h1 className="title" ref={headingRef} tabIndex={-1}>
                Datos de la <em>visita</em>
              </h1>
              <p className="criterion-guide">
                Evaluarás 6 criterios. Prueba el menú del día y observa la cocina, el almacén, el personal y la línea de
                servicio.
              </p>
            </div>
            <div className="card stack">
              <label className="field">
                <span>Nombre del evaluador(a)</span>
                <input className="input" value={evaluatorName} readOnly />
              </label>
              <label className="field">
                <span>Empresa postora evaluada</span>
                <input className="input" value={supplier.name} readOnly />
              </label>
              <label className="field">
                <span>Fecha de la visita</span>
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
                {supplier.name} · visita del {draft.visitDate ? formatDate(draft.visitDate) : "—"}
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
                        <button type="button" className="btn-text" style={{ padding: 0, textAlign: "left" }} onClick={() => setStep(i + 1)}>
                          <span className="summary-item__t">{c.title}</span>
                        </button>
                        {draft.obs[c.id]?.trim() && <span className="summary-item__obs" style={{ display: "block" }}>“{draft.obs[c.id].trim()}”</span>}
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

            {error && (
              <div className="alert alert-error" role="alert">
                {error}
              </div>
            )}
          </section>
        )}

        <p className="hint" style={{ textAlign: "center" }}>
          <Link href="/">Volver a la lista de postores</Link> · el avance se guarda en este dispositivo hasta enviarlo.
        </p>
      </main>

      <div className="wizard-bottom">
        <div className="wizard-bottom__inner">
          <button
            type="button"
            className="btn btn-outline"
            onClick={() => (step === 0 ? router.push("/") : setStep(step - 1))}
            disabled={pending}
          >
            {step === 0 ? "Salir" : "Atrás"}
          </button>
          {step < lastStep ? (
            <button type="button" className="btn btn-navy" disabled={!canAdvance} onClick={() => setStep(step + 1)}>
              {step === criteria.length ? "Ver resumen" : "Siguiente"}
            </button>
          ) : (
            <button type="button" className="btn btn-primary" disabled={pending || !complete} onClick={submit}>
              {pending ? "Enviando…" : existing ? "Actualizar ficha" : "Enviar ficha"}
            </button>
          )}
        </div>
      </div>
    </>
  );
}
