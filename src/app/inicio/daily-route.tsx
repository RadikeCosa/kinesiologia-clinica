"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { DragDropProvider } from "@dnd-kit/react";
import { isSortable, useSortable } from "@dnd-kit/react/sortable";
import { Accessibility, PointerActivationConstraints, PointerSensor, type DragOverEvent, type DragEndEvent } from "@dnd-kit/dom";
import { move } from "@dnd-kit/helpers";
import { reconcileRoute, type DailyRoute } from "@/domain/route/daily-route";
import { refreshDailyRoute, updateDailyRoute } from "./route-actions";

// Keep descriptors stable so saving does not rebind input and accessibility plugins.
const routeAccessibility = Accessibility.configure({ screenReaderInstructions: { draggable: "Presioná espacio para tomar la visita, flechas para mover, espacio para soltar y Escape para cancelar." }, announcements: { dragstart: () => "Visita tomada para ordenar.", dragover: (event: DragOverEvent) => isSortable(event.operation.source) ? `Posición ${event.operation.source.index + 1} del recorrido.` : undefined, dragend: (event: DragEndEvent) => event.canceled ? "Movimiento cancelado." : "Visita soltada." } });
const routePointerSensor = PointerSensor.configure({ activationConstraints: [new PointerActivationConstraints.Distance({ value: 6 })] });

export function useDailyRoute(date: string, initial: DailyRoute | undefined, unavailable: boolean) {
  const router = useRouter();
  const [route, setRoute] = useState<DailyRoute>(initial ?? { date, appointmentIds: [] });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(unavailable ? "No se pudo verificar el recorrido guardado. Actualizalo antes de ordenar." : "");
  const [message, setMessage] = useState("");
  const [blocked, setBlocked] = useState(unavailable);
  const busyRef = useRef(false);
  const draggingRef = useRef(false);
  const routeRef = useRef(route);
  const update = useCallback((next: DailyRoute) => { routeRef.current = next; setRoute(next); }, []);

  const refresh = useCallback(async () => {
    if (busyRef.current || draggingRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      const result = await refreshDailyRoute();
      if (result.route) {
        if (JSON.stringify(result.route) !== JSON.stringify(routeRef.current)) setMessage("Recorrido actualizado.");
        update(result.route); setBlocked(false); setError("");
        router.refresh();
      } else { setError(result.error ?? "No se pudo actualizar el recorrido."); setBlocked(true); }
    } catch { setError("No se pudo actualizar el recorrido. Volvé a intentar."); setBlocked(true); }
    finally { busyRef.current = false; setBusy(false); }
  }, [router, update]);

  useEffect(() => {
    const focus = () => { if (!document.hidden) void refresh(); };
    window.addEventListener("focus", focus);
    document.addEventListener("visibilitychange", focus);
    return () => { window.removeEventListener("focus", focus); document.removeEventListener("visibilitychange", focus); };
  }, [refresh]);

  async function save(appointmentIds: string[]) {
    if (busyRef.current || blocked) return;
    const confirmed = routeRef.current;
    busyRef.current = true; setBusy(true); setError(""); setMessage("");
    update({ ...confirmed, appointmentIds });
    try {
      const result = await updateDailyRoute({ date, version: confirmed.version, appointmentIds });
      if (result.route) { update(result.route); setBlocked(false); }
      else { update(confirmed); if (result.conflict) setBlocked(true); }
      if (result.error) setError(result.error);
      else setMessage("Recorrido guardado.");
      router.refresh();
    } catch { update(confirmed); setError("No se pudo guardar el recorrido. Se restauró el último orden confirmado."); }
    finally { busyRef.current = false; setBusy(false); }
  }
  return { route, busy, blocked, error, message, save, refresh, draggingRef };
}

function SortableVisit({ id, index, disabled, render }: { id: string; index: number; disabled: boolean; render: (handle: ReactNode) => ReactNode }) {
  const { ref, handleRef, isDragging, isDropping } = useSortable({ id, index });
  const handle = <button ref={handleRef} type="button" className="route-drag-handle" disabled={disabled || isDropping} aria-label={`Mover visita ${index + 1}`} aria-describedby="route-instructions" title="Arrastrar para ordenar"><svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">{[5, 10, 15].flatMap(y => [7, 13].map(x => <circle key={`${x}-${y}`} cx={x} cy={y} r="1.5"/>))}</svg></button>;
  return <li ref={ref} className={`route-sortable${isDragging ? " is-dragging" : ""}`}>{render(handle)}</li>;
}

export function RouteList({ ids, disabled, onChange, draggingRef, render }: { ids: string[]; disabled: boolean; onChange: (ids: string[]) => void; draggingRef: { current: boolean }; render: (id: string, index: number, handle: ReactNode) => ReactNode }) {
  return <DragDropProvider onBeforeDragStart={event => { if (disabled) event.preventDefault(); }} plugins={defaults => [...defaults.filter(plugin => plugin !== Accessibility), routeAccessibility]} sensors={defaults => defaults.map(sensor => sensor === PointerSensor ? routePointerSensor : sensor)} onDragStart={() => { draggingRef.current = true; }} onDragEnd={event => {
    draggingRef.current = false;
    if (event.canceled || disabled) return;
    const next = move(ids, event);
    if (next.some((id, index) => id !== ids[index])) onChange(next);
  }}>
    <ol className="today-list route-list">{ids.map((id, index) => <SortableVisit key={id} id={id} index={index} disabled={disabled} render={handle => render(id, index, handle)}/>)}</ol>
  </DragDropProvider>;
}

export { reconcileRoute };
