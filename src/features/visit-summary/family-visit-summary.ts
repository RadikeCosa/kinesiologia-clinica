import type { ClinicalEvaluation, ClinicalSymptom } from "@/domain/visit/clinical-entry";
import type { FunctionalMetric } from "@/domain/visit/visit";

type FamilyEvaluation = Pick<ClinicalEvaluation, "name" | "result" | "context" | "status">;
type FamilySymptom = Pick<ClinicalSymptom, "code" | "name" | "severity" | "status">;
type FamilyMetric = Pick<FunctionalMetric, "code" | "value" | "unit" | "status">;

export interface FamilyVisitSummaryInput {
  patientGivenName: string;
  visitDate: string;
  response: string;
  intervention: string;
  nextPlan?: string;
  evaluations?: FamilyEvaluation[];
  symptoms?: FamilySymptom[];
  metrics?: FamilyMetric[];
}

const symptomLabels: Record<Exclude<ClinicalSymptom["code"], "custom">, string> = {
  pain: "Dolor",
  tiredness: "Cansancio",
  drowsiness: "Somnolencia",
  nausea: "Náuseas",
  "lack-of-appetite": "Falta de apetito",
  "shortness-of-breath": "Falta de aire",
  depression: "Ánimo bajo",
  anxiety: "Ansiedad",
};

const metricLabels: Record<FunctionalMetric["code"], string> = {
  tug_seconds: "Timed Up and Go",
  pain_nrs_0_10: "Dolor",
  standing_tolerance_minutes: "Tolerancia a bipedestación",
  gait_duration_minutes: "Duración de marcha",
};

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase();
}

function alreadyIncluded(source: string, label: string, value: string) {
  const normalizedSource = normalize(source);
  return normalizedSource.includes(normalize(label)) && normalizedSource.includes(normalize(value));
}

function evaluationValue(evaluation: FamilyEvaluation): string | null {
  const result = evaluation.result;
  if (result.kind === "quantity") return `${result.value}${result.unit ? ` ${result.unit}` : ""}`;
  if (result.kind === "coded" || result.kind === "narrative") return result.value;
  if (result.kind === "boolean") return result.value ? "Sí" : "No";
  return null;
}

function evaluationLabel(evaluation: FamilyEvaluation) {
  const site = evaluation.context?.bodySite?.trim();
  const laterality = evaluation.context?.laterality;
  const side = laterality === "left" ? "izquierda" : laterality === "right" ? "derecha" : laterality === "bilateral" ? "bilateral" : "";
  const location = [site, side].filter(Boolean).join(" ");
  return `${evaluation.name}${location ? ` (${location})` : ""}`;
}

function measurements(input: FamilyVisitSummaryInput, source: string) {
  const lines: string[] = [];
  for (const evaluation of input.evaluations ?? []) {
    if (evaluation.status === "entered-in-error") continue;
    const value = evaluationValue(evaluation);
    if (!value) continue;
    const label = evaluationLabel(evaluation);
    if (!alreadyIncluded(source, label, value)) lines.push(`${label}: ${value}`);
  }
  for (const symptom of input.symptoms ?? []) {
    if (symptom.status === "entered-in-error") continue;
    const label = symptom.code === "custom" ? symptom.name?.trim() || "Otro síntoma" : symptomLabels[symptom.code];
    const value = symptom.severity === 0 ? "ausente (0/10)" : `${symptom.severity}/10`;
    if (!alreadyIncluded(source, label, value)) lines.push(`${label}: ${value}`);
  }
  for (const metric of input.metrics ?? []) {
    if (metric.status === "entered-in-error") continue;
    const label = metricLabels[metric.code];
    const value = `${metric.value}${metric.unit ? ` ${metric.unit}` : ""}`;
    if (!alreadyIncluded(source, label, value)) lines.push(`${label}: ${value}`);
  }
  return lines.length ? `También se registró:\n${lines.map((line) => `• ${line}`).join("\n")}` : "";
}

export function createFamilyVisitSummary(input: FamilyVisitSummaryInput): string {
  const name = input.patientGivenName.trim();
  const date = input.visitDate.trim();
  const source = [input.response, input.intervention, input.nextPlan].filter(Boolean).join(" ");
  const sections = [
    `Hola. Te comparto un resumen de la visita de ${name} del ${date}.`,
    input.response.trim(),
    input.intervention.trim() ? `Durante la visita se trabajó: ${input.intervention.trim()}` : "",
    measurements(input, source),
    input.nextPlan?.trim() ? `Próximo paso: ${input.nextPlan.trim()}` : "",
  ].filter(Boolean);

  return sections.join("\n\n");
}
