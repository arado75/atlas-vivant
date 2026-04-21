import type { PropsWithChildren, ReactNode } from "react";

interface PanelProps extends PropsWithChildren {
  title: string;
  eyebrow?: string;
  actions?: ReactNode;
  className?: string;
  panelId?: string;
}

export function Panel({ title, eyebrow, actions, className, panelId, children }: PanelProps) {
  return (
    <section id={panelId} className={`panel ${className ?? ""}`.trim()}>
      <div className="panel-header">
        <div>
          {eyebrow ? <div className="panel-eyebrow">{eyebrow}</div> : null}
          <h2>{title}</h2>
        </div>
        {actions ? <div className="panel-actions">{actions}</div> : null}
      </div>
      {children}
    </section>
  );
}
