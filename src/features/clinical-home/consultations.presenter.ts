import type { OpenConsultationViewModel } from "./clinical-home.types";
import { formatFriendlyDateTime, getLocalDate } from "./clinical-home.presenter";

export function consultationAttention(consultation: OpenConsultationViewModel, referenceNow: string) {
  const due = consultation.followUps.find(item => getLocalDate(item.dueAt) <= getLocalDate(referenceNow));
  if (due) return { group: "follow-up" as const, dueAt: due.dueAt, label: `${due.overdue ? "Contacto atrasado" : "Contacto para hoy"} · ${formatConsultationDate(due.dueAt)}` };
  if (!consultation.followUps.length && !consultation.nextEvaluation) return { group: "no-next-step" as const, label: "Sin seguimiento ni evaluación agendada" };
  return null;
}

export function consultationsToAttend(consultations: OpenConsultationViewModel[], referenceNow: string) {
  return consultations.flatMap(consultation => {
    const attention = consultationAttention(consultation, referenceNow);
    return attention ? [{ consultation, attention }] : [];
  }).sort((a, b) => {
    if (a.attention.group !== b.attention.group) return a.attention.group === "follow-up" ? -1 : 1;
    return (a.attention.dueAt ?? "").localeCompare(b.attention.dueAt ?? "") || a.consultation.patientName.localeCompare(b.consultation.patientName, "es");
  });
}

export function formatConsultationDate(instant: string) {
  const time = new Intl.DateTimeFormat("es-AR", { timeZone: "America/Argentina/Buenos_Aires", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(instant));
  return formatFriendlyDateTime(getLocalDate(instant), time);
}

export function consultationNextStep(consultation: OpenConsultationViewModel) {
  const contact = consultation.followUps[0];
  const evaluation = consultation.nextEvaluation;
  if (contact && (!evaluation || getLocalDate(contact.dueAt) <= evaluation.date)) return `Próximo contacto · ${formatConsultationDate(contact.dueAt)}`;
  if (evaluation) return `Evaluación · ${formatFriendlyDateTime(evaluation.date, evaluation.time)}`;
  return "Sin seguimiento ni evaluación agendada";
}
