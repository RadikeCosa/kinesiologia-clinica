"use client";

import { useState } from "react";

export function FamilyVisitSummaryEditor({ initialText }: { initialText: string }) {
  const [text, setText] = useState(initialText);
  const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(text)}`;

  return <details className="family-visit-summary">
    <summary>Preparar resumen para la familia</summary>
    <div className="family-visit-summary-content">
      <p>Revisá el texto y adaptalo antes de compartirlo. Se basa en la evolución y las mediciones registradas en esta visita, sin modificar la nota clínica.</p>
      <label htmlFor="family-visit-summary-text">Resumen para compartir</label>
      <textarea
        id="family-visit-summary-text"
        value={text}
        onChange={(event) => setText(event.target.value)}
        rows={8}
        aria-describedby="family-visit-summary-note"
      />
      <p id="family-visit-summary-note" className="family-visit-summary-note">Este borrador no se guarda en la ficha. WhatsApp se abrirá con el texto preparado; elegí el contacto y confirmá el envío allí.</p>
      <a className="primary-link" href={whatsappUrl} target="_blank" rel="noreferrer">Abrir WhatsApp con el texto</a>
    </div>
  </details>;
}
