export interface ReportNarrative {
  context: string;
  evolution: string;
  interventions: string;
  nextStep: string;
  observations: string;
}
export interface ReportContent {
  patientName: string;
  periodOrdinal: number;
  completed: number;
  quota: number | null;
  frequency: string | null;
  partialReason: string | null;
  sessionDates: string[];
  measurements: string[];
  narrative: ReportNarrative;
  professionalName: string;
  registration: string;
}
export interface PeriodReport {
  id: string;
  operationId: string;
  patientId: string;
  treatmentId: string;
  periodId: string;
  status: "current" | "superseded";
  createdAt: string;
  replaces?: string;
  replacementReason?: string;
  sourceFingerprint: string;
  content: ReportContent;
  sources: unknown;
  sourceVersions: Record<string, string | null>;
  contentHash: string;
  sourceHash: string;
  pdfHash: string;
  version?: string;
}
