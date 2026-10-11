"use client";

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char] ?? char);
}

function renderFormula(value: string) {
  let html = escapeHtml(value);
  html = html.replace(/\\ce\{([^}]*)\}/g, "$1");
  html = html.replace(/\\mathrm\{([^}]*)\}/g, "$1");
  html = html.replace(/\\times/g, "×").replace(/\\cdot/g, "·").replace(/\\rightarrow/g, "→").replace(/\\Delta/g, "Δ").replace(/\\sqrt\{([^}]*)\}/g, "√($1)");
  html = html.replace(/\^\{([^}]*)\}/g, "<sup>$1</sup>").replace(/_\{([^}]*)\}/g, "<sub>$1</sub>");
  html = html.replace(/\^([A-Za-z0-9])/g, "<sup>$1</sup>").replace(/_([A-Za-z0-9])/g, "<sub>$1</sub>");
  html = html.replace(/\b([A-Z][a-z]?)(\d+)/g, "$1<sub>$2</sub>");
  return html;
}

export function MathContent({ children, className = "" }: { children: string; className?: string }) {
  const parts = children.split(/(\$\$[^$]+\$\$|\$[^$]+\$|\\\([^)]*\\\))/g).filter(Boolean);
  return <span className={className}>{parts.map((part, index) => {
    const isFormula = part.startsWith("$$") || part.startsWith("$") || part.startsWith("\\(");
    const content = isFormula ? part.replace(/^\$\$?|\$\$?$|^\\\(|\\\)$/g, "") : part;
    return isFormula ? <span key={index} className="formula-content rounded-md bg-amber-300/10 px-1 font-mono text-amber-100" dangerouslySetInnerHTML={{ __html: renderFormula(content) }} /> : <span key={index}>{part}</span>;
  })}</span>;
}
