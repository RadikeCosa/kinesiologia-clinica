import { checkClinicalRecord } from "@/application/clinical-record/check-clinical-record";
import { createFhirHealthGateway } from "@/infrastructure/fhir/fhir-health.gateway";

export const dynamic = "force-dynamic";

export async function GET() {
  const clinicalRecord = await checkClinicalRecord(
    createFhirHealthGateway(),
  );

  return Response.json(
    {
      application: "available",
      clinicalRecord,
    },
    { status: clinicalRecord.status === "available" ? 200 : 503 },
  );
}
