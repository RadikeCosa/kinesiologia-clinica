import type { Patient } from "@/domain/patient/patient";
import type { Treatment } from "@/domain/treatment/treatment";
import type { TreatmentPeriod } from "@/domain/treatment-period/treatment-period";
import { periodVisits } from "@/domain/treatment-period/treatment-period";
import type { Visit, FunctionalMetric } from "@/domain/visit/visit";
import type { ClinicalEvaluation, ClinicalSymptom, PerformedProcedure } from "@/domain/visit/clinical-entry";
import type { Diagnosis } from "@/domain/condition/condition";
import type { ReportContent } from "@/domain/treatment-period/period-report";
import type { ReportTools } from "./report.repository";

export interface SourceInput { patient: Patient; treatment: Treatment; period: TreatmentPeriod; visits: Visit[]; diagnoses: Diagnosis[]; evaluations: ClinicalEvaluation[]; symptoms: ClinicalSymptom[]; metrics: FunctionalMetric[]; procedures: PerformedProcedure[] }
const date = (v: string) => new Date(v).toISOString();
const nullable = (v: unknown): unknown => {
  if (v === undefined) return null;
  if (Array.isArray(v)) return v.map(nullable);
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k,x]) => [k, nullable(x)]));
  return v;
};
const context = (value: ClinicalEvaluation["context"] | ClinicalSymptom["context"]) => {
  const data = value as Record<string, unknown> | undefined;
  return Object.fromEntries(["bodySite", "laterality", "method", "assistanceDevice", "conditions", "interpretation", "note"].map(k => [k, data?.[k] ?? null]));
};
function ordered<T extends { id: string }>(items: T[]) { return [...new Map(items.map(v => [v.id, v])).values()].sort((a,b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0); }
export function reportSource(input: SourceInput, tools: Pick<ReportTools, "canonical" | "hash">) {
  const visits = periodVisits(input.period, input.visits);
  const finished = new Set(visits.filter(v => v.status === "finished").map(v => v.id));
  const eligible = <T extends { visitId: string; status?: string }>(items: T[]) => items.filter(i => finished.has(i.visitId) && i.status !== "entered-in-error");
  const symptoms = ordered(eligible(input.symptoms)), evaluations = ordered(eligible(input.evaluations));
  const observationIds = new Set([...symptoms, ...evaluations].map(i => i.id));
  // Prefer the richer clinical projection of historical observations; one source identity once.
  const metrics = ordered(eligible(input.metrics)).filter(m => !observationIds.has(m.id));
  const source = {
    schema: "sourceFingerprintV1",
    patient: { id: input.patient.id, givenName: input.patient.givenName, familyName: input.patient.familyName },
    treatment: { id: input.treatment.id, context: { initialFunctionalStatus: input.treatment.clinicalContext?.initialFunctionalStatus ?? null, therapeuticGoals: input.treatment.clinicalContext?.therapeuticGoals ?? null, frameworkPlan: input.treatment.clinicalContext?.frameworkPlan ?? null }, precautions: [...(input.treatment.precautions ?? [])].sort(), diagnoses: ordered(input.diagnoses).map(d => ({ id: d.id, text: d.text, kind: input.treatment.diagnosisReferences?.find(r => r.conditionId === d.id)?.kind ?? null })) },
    period: { id: input.period.id, ordinal: input.period.ordinal, quota: input.period.quota ?? null, frequency: input.period.frequency ?? null, partialReason: input.period.partialReason ?? null },
    visits: ordered(visits).map(v => ({ id: v.id, periodId: input.period.id, status: v.status, startedAt: v.status === "finished" ? date(v.startedAt) : null, endedAt: v.status === "finished" && v.endedAt ? date(v.endedAt) : null, note: v.status === "finished" ? Object.fromEntries(["statusAndResponse","subjective","objective","intervention","assessment","tolerance","homeInstructions","nextPlan"].map(k => [k, v.clinicalNote?.[k as keyof NonNullable<Visit["clinicalNote"]>] ?? null])) : null })),
    observations: ordered([
      ...symptoms.map(s => ({ id: s.id, visitId: s.visitId, seriesId: s.seriesId, date: date(s.effectiveDateTime), type: "symptom", name: s.code === "custom" ? s.name : s.code, result: { kind: "quantity", value: s.severity, unit: "/10" }, context: context(s.context) })),
      ...evaluations.filter(e => !symptoms.some(s => s.id === e.id)).map(e => ({ id: e.id, visitId: e.visitId, seriesId: e.seriesId, date: date(e.effectiveDateTime), type: "evaluation", name: e.name, domain: e.domain, result: { ...e.result, unit: e.result.kind === "quantity" ? e.result.unit ?? null : null, note: e.result.kind === "absent" ? e.result.note ?? null : null }, context: context(e.context) })),
      ...metrics.map(m => ({ id: m.id, visitId: m.visitId, seriesId: `metric:${m.code}`, date: date(m.effectiveDateTime), type: "metric", name: m.code, result: { kind: "quantity", value: m.value, unit: m.unit }, context: context(undefined) })),
    ]),
    procedures: ordered(eligible(input.procedures)).map(p => ({ id: p.id, visitId: p.visitId, family: p.family, name: p.otherName ?? null, start: date(p.performedStart), end: date(p.performedEnd) })),
  };
  const sourceVersions: Record<string,string|null> = {};
  const traced: [string, { id: string; version?: string }][] = [
    ["Patient", input.patient], ["EpisodeOfCare", input.treatment], ["CarePlan", input.period],
    ...input.diagnoses.map(v => ["Condition", v] as [string, typeof v]),
    ...visits.map(v => ["Encounter", v] as [string, typeof v]),
    ...[...symptoms, ...evaluations, ...metrics].map(v => ["Observation", v] as [string, typeof v]),
    ...ordered(eligible(input.procedures)).map(v => ["Procedure", v] as [string, typeof v]),
  ];
  for (const [type,v] of traced) sourceVersions[`${type}/${v.id}`] = v.version ?? null;
  return { source: nullable(source), sourceFingerprint: tools.hash(tools.canonical(source)), sourceVersions };
}
const zone = "America/Argentina/Buenos_Aires";
export function reportDate(value: string) { return new Intl.DateTimeFormat("es-AR", { timeZone: zone, dateStyle: "short", timeStyle: "short" }).format(new Date(value)); }
const SYMPTOMS: Record<string,string> = { pain: "Dolor", tiredness: "Cansancio", drowsiness: "Somnolencia", nausea: "Náuseas", "lack-of-appetite": "Falta de apetito", "shortness-of-breath": "Falta de aire", depression: "Ánimo bajo", anxiety: "Ansiedad" };
const METRICS: Record<string,string> = { pain_nrs_0_10: "Dolor NRS", tug_seconds: "TUG", standing_tolerance_minutes: "Tolerancia de pie", gait_duration_minutes: "Duración de marcha" };
const ABSENT: Record<string,string> = { "not-relevant": "No pertinente", deferred: "Diferido", "not-tolerated": "No tolerado", "unsafe-contraindicated": "Inseguro o contraindicado", refused: "Rechazado" };
const PROCEDURES: Record<string,string> = { "therapeutic-exercise": "Ejercicio terapéutico", "manual-therapy": "Terapia manual", "gait-transfers": "Marcha y transferencias", respiratory: "Intervención respiratoria", "education-instructions": "Educación e indicaciones", "environment-assistive-devices": "Entorno y ayudas técnicas" };
export function draftContent(input: SourceInput): ReportContent {
  const visits = periodVisits(input.period, input.visits).filter(v => v.status === "finished").sort((a,b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime() || a.id.localeCompare(b.id));
  const ids = new Set(visits.map(v => v.id));
  const projections: { id: string; series: string; name: string; date: string; value: string; unit?: string; context: unknown }[] = [];
  for (const s of input.symptoms.filter(v => ids.has(v.visitId) && v.status !== "entered-in-error")) projections.push({ id: s.id, series: s.seriesId, name: s.name ?? SYMPTOMS[s.code] ?? s.code, date: s.effectiveDateTime, value: `${s.severity}/10`, unit: "/10", context: context(s.context) });
  for (const e of input.evaluations.filter(v => ids.has(v.visitId) && v.status !== "entered-in-error" && !projections.some(p => p.id === v.id))) {
    const r=e.result, value = r.kind === "quantity" ? `${r.value} ${r.unit ?? ""}`.trim() : r.kind === "absent" ? `No realizado: ${ABSENT[r.reason]}${r.note ? ` · ${r.note}` : ""}` : r.kind === "boolean" ? r.value ? "Sí" : "No" : r.value;
    projections.push({ id: e.id, series: e.seriesId, name: e.name, date: e.effectiveDateTime, value, unit: r.kind === "quantity" ? r.unit : undefined, context: context(e.context) });
  }
  for (const m of input.metrics.filter(v => ids.has(v.visitId) && v.status !== "entered-in-error" && !projections.some(p => p.id === v.id))) projections.push({ id: m.id, series: `metric:${m.code}`, name: METRICS[m.code] ?? m.code, date: m.effectiveDateTime, value: `${m.value} ${m.unit}`, unit: m.unit, context: context(undefined) });
  const groups = new Map<string, typeof projections>();
  for (const item of ordered(projections)) groups.set(item.series, [...(groups.get(item.series) ?? []), item]);
  const measurement = (p: typeof projections[number]) => `${p.value} (${reportDate(p.date)})${Object.values(p.context as Record<string, unknown>).filter(v => v !== null).length ? ` · ${Object.values(p.context as Record<string, unknown>).filter(v => v !== null).join(" · ")}` : ""}`;
  const measurements = [...groups.entries()].sort(([a],[b]) => a.localeCompare(b)).map(([,items]) => {
    items.sort((a,b) => new Date(a.date).getTime() - new Date(b.date).getTime() || a.id.localeCompare(b.id)); const first=items[0], last=items.at(-1)!;
    if (items.length === 1) return `${first.name}: Única medición · ${measurement(first)}. Sin dato para comparación.`;
    const compatible = first.unit === last.unit && JSON.stringify(first.context) === JSON.stringify(last.context);
    return `${first.name}: Primera · ${measurement(first)}; Última · ${measurement(last)}.${compatible ? "" : " Unidades o contextos diferentes; sin cálculo de diferencia."}`;
  });
  return { patientName: `${input.patient.givenName} ${input.patient.familyName}`, periodOrdinal: input.period.ordinal, completed: visits.length, quota: input.period.quota ?? null, frequency: input.period.frequency ?? null, partialReason: input.period.partialReason ?? null, sessionDates: visits.map(v => reportDate(v.startedAt)), measurements, narrative: {
    context: [input.treatment.clinicalContext?.initialFunctionalStatus, input.treatment.clinicalContext?.therapeuticGoals && `Objetivos: ${input.treatment.clinicalContext.therapeuticGoals}`, input.treatment.clinicalContext?.frameworkPlan, input.treatment.precautions?.length && `Precauciones: ${input.treatment.precautions.join("; ")}`, input.diagnoses.length && `Diagnósticos: ${input.diagnoses.map(d => d.text).join("; ")}`].filter(Boolean).join("\n"),
    evolution: visits.length ? [`Primera sesión (${reportDate(visits[0].startedAt)}): ${visits[0].clinicalNote?.statusAndResponse ?? visits[0].clinicalNote?.assessment ?? "Sin registrar"}`, visits.length > 1 ? `Última sesión (${reportDate(visits.at(-1)!.startedAt)}): ${visits.at(-1)!.clinicalNote?.statusAndResponse ?? visits.at(-1)!.clinicalNote?.assessment ?? "Sin registrar"}` : ""].filter(Boolean).join("\n") : "",
    interventions: [...new Set([...visits.map(v => v.clinicalNote?.intervention).filter(Boolean), ...input.procedures.filter(p => ids.has(p.visitId) && p.status !== "entered-in-error").map(p => p.otherName ?? PROCEDURES[p.family])])].join("\n"),
    nextStep: visits.at(-1)?.clinicalNote?.nextPlan ?? "", observations: "",
  }, professionalName: "", registration: "" };
}
