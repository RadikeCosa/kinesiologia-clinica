import Link from "next/link";
import type { ReactNode } from "react";

/** Shared identity, context and action hierarchy for clinical cards. */
export function ClinicalCard({ id, className = "", title, href, headingLevel = 3, badge, identityDetail, children, actions }: {
  id?: string;
  className?: string;
  title: string;
  href?: string;
  headingLevel?: 3 | 4;
  badge?: ReactNode;
  identityDetail?: ReactNode;
  children?: ReactNode;
  actions?: ReactNode;
}) {
  const Heading = headingLevel === 4 ? "h4" : "h3";
  return <article id={id} tabIndex={-1} className={`home-card clinical-card ${className}`}>
    <header className="clinical-card-heading">
      <div className="clinical-card-identity">
        <Heading>{href ? <Link className="patient-name-link" href={href}>{title}</Link> : title}</Heading>
        {identityDetail}
      </div>
      {badge ? <div className="clinical-card-badge">{badge}</div> : null}
    </header>
    {children}
    {actions ? <footer className="clinical-card-actions">{actions}</footer> : null}
  </article>;
}
