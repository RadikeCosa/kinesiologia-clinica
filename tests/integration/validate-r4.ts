/** Validation only; never persist or contact the private endpoint. */
export async function validateR4(resource: unknown) {
 const response = await fetch("http://localhost:8081/fhir/Encounter/$validate", { method: "POST", headers: { "Content-Type": "application/fhir+json", Accept: "application/fhir+json" }, body: JSON.stringify(resource) });
 const outcome = await response.json() as { resourceType: string; issue?: Array<{ severity: string; code?: string; diagnostics?: string }> };
 if (outcome.resourceType !== "OperationOutcome") throw new Error("FHIR validation did not return OperationOutcome.");
 return outcome.issue?.filter(i => i.severity === "error" || i.severity === "fatal") ?? [];
}
