import Link from "next/link";
import { ClinicalCard } from "@/app/components/clinical-card";
import type { OpenConsultationViewModel } from "@/features/clinical-home/clinical-home.types";

export function ConsultationCard({ consultation, description, headingLevel = 3 }: {
  consultation: OpenConsultationViewModel;
  description: string;
  headingLevel?: 3 | 4;
}) {
  return <ClinicalCard className="consultation-card" title={consultation.patientName} headingLevel={headingLevel}
    badge={<span className="home-status">{consultation.statusLabel}</span>}
    actions={<Link className="clinical-card-link" href={`/consultas/${encodeURIComponent(consultation.id)}`}>Revisar consulta <span aria-hidden="true">→</span></Link>}>
    <p className="clinical-card-context">{description}</p>
  </ClinicalCard>;
}
