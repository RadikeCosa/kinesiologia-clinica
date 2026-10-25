import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { clinicalSurfaceMode } from "@/infrastructure/runtime/clinical-surface-policy";
import { ClinicalEnvironmentProvider } from "./clinical-environment";

export const metadata: Metadata = {
  title: "Kinesiología Clínica",
  description: "Aplicación privada de registro y seguimiento clínico.",
  robots: {
    index: false,
    follow: false,
    noarchive: true,
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <body><ClinicalEnvironmentProvider pilot={clinicalSurfaceMode(process.env) === "pilot"}>{children}</ClinicalEnvironmentProvider></body>
    </html>
  );
}
