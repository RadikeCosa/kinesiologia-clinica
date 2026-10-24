import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createFhirClient } from "@/infrastructure/fhir/core/fhir.client";
import { createFhirDailyRouteRepository } from "@/infrastructure/fhir/route/fhir-daily-route.repository";
import { DailyRouteConflictError } from "@/application/route/daily-route.repository";

const endpoint = "http://localhost:8081/fhir";
const configured = process.env.FHIR_INTEGRATION_BASE_URL?.replace(/\/$/, "");
if (configured && configured !== endpoint) throw new Error("Las pruebas solo pueden usar FHIR ficticio 8081.");
(configured ? describe : describe.skip)("daily route FHIR contract", () => {
  it("atomically creates once and rejects stale updates without changing appointments", async () => {
    const date = `${4000 + Math.floor(Math.random() * 4000)}-${String(1 + Math.floor(Math.random() * 12)).padStart(2, "0")}-${String(1 + Math.floor(Math.random() * 28)).padStart(2, "0")}`;
    const repository = createFhirDailyRouteRepository(createFhirClient({ baseUrl: endpoint }));
    expect(await repository.get(date)).toBeNull();
    const ids = [randomUUID(), randomUUID()];
    const client = createFhirClient({ baseUrl: endpoint });
    try {
      for (const id of ids) await client.put(`Appointment/${id}`, { resourceType: "Appointment", id, status: "proposed", participant: [{ actor: { display: "Persona ficticia de prueba de recorrido" }, status: "accepted" }] });
      const before = await Promise.all(ids.map(id => client.get(`Appointment/${id}`)));
      const outcomes = await Promise.allSettled([repository.save({ date, appointmentIds: ids }), repository.save({ date, appointmentIds: [...ids].reverse() })]);
      expect(outcomes.filter(r => r.status === "fulfilled"), JSON.stringify(outcomes)).toHaveLength(1);
      expect(outcomes.filter(r => r.status === "rejected")).toHaveLength(1);
      const current = (await repository.get(date))!;
      expect(current.version).toBeTruthy();
      const updated = await repository.save({ ...current, appointmentIds: [...current.appointmentIds].reverse() });
      expect(updated.appointmentIds).toEqual([...current.appointmentIds].reverse());
      await expect(repository.save(current)).rejects.toBeInstanceOf(DailyRouteConflictError);
      expect(await Promise.all(ids.map(id => client.get(`Appointment/${id}`)))).toEqual(before);
    } finally {
      const response = await fetch(`${endpoint}/List/daily-route-${date}`, { method: "DELETE" });
      expect(response.ok || [404, 410].includes(response.status)).toBe(true);
      for (const id of ids) await fetch(`${endpoint}/Appointment/${id}`, { method: "DELETE" });
    }
  });
});
