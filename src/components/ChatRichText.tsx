"use client";

import React from "react";

function formulaText(value: string) {
  return value
    .replace(/\\(?:text|mathrm|textrm|mbox)\{([^{}]*)\}/g, "$1")
    .replace(/\\ext\{([^{}]*)\}/g, "$1")
    .replace(/\\ce\{([^{}]*)\}/g, "$1")
    .replace(/\\left|\\right/g, "")
    .replace(/\\times/g, "×")
    .replace(/\\rightarrow/g, "→")
    .replace(/\\leq/g, "≤")
    .replace(/\\geq/g, "≥")
    .replace(/\^\{([^{}]+)\}/g, "^$1")
    .replace(/_\{([^{}]+)\}/g, "_$1");
}

function InlineText({ value }: { value: string }) {
  const tokens = value.split(/(\$\$[^$]+\$\$|\$[^$]+\$|\\\([^)]*\\\)|\\\[[^\]]*\\\]|\^\{[^}]+\}|_[0-9]+|\^[0-9+−-]+|_[A-Za-z0-9]+)/g).filter(Boolean);
  return <>{tokens.map((token, index) => {
    const isMath = (token.startsWith("$") && token.endsWith("$")) || (token.startsWith("\\(") && token.endsWith("\\)")) || (token.startsWith("\\[") && token.endsWith("\\]"));
    if (isMath) {
      const raw = token.replace(/^\$\$?|\$\$?$|^\\\(|\\\)$|^\\\[|\\\]$/g, "");
      return <span key={index} className="font-mono text-[#b9f2ff]" aria-label={`公式 ${raw}`}>{renderFormula(formulaText(raw))}</span>;
    }
    const sub = token.match(/^_([0-9A-Za-z]+)$/);
    if (sub) return <sub key={index}>{sub[1]}</sub>;
    const sup = token.match(/^\^([0-9+−-]+)$/);
    if (sup) return <sup key={index}>{sup[1]}</sup>;
    return <React.Fragment key={index}>{token}</React.Fragment>;
  })}</>;
}

function renderFormula(value: string) {
  const parts = value.split(/(_[0-9A-Za-z]+|\^[0-9+−-]+)/g).filter(Boolean);
  return <>{parts.map((part, index) => part.startsWith("_") ? <sub key={index}>{part.slice(1)}</sub> : part.startsWith("^") ? <sup key={index}>{part.slice(1)}</sup> : <React.Fragment key={index}>{part}</React.Fragment>)}</>;
}

export function ChatRichText({ content, className = "" }: { content: string; className?: string }) {
  const lines = content.replace(/\\r\\n/g, "\n").split("\n");
  return <div className={`whitespace-pre-wrap break-words ${className}`}>{lines.map((line, index) => {
    const match = line.match(/^(\s*)([-*]|\d+[.)])\s+(.*)$/);
    const text = match ? match[3] : line;
    const boldParts = text.split(/(\*\*[^*]+\*\*)/g);
    const rendered = boldParts.map((part, partIndex) => part.startsWith("**") && part.endsWith("**") ? <strong key={partIndex}><InlineText value={part.slice(2, -2)} /></strong> : <InlineText key={partIndex} value={part} />);
    return <div key={index} className={match ? "pl-4 before:mr-2 before:text-[#7dd3fc] before:content-['•']" : undefined}>{rendered}</div>;
  })}</div>;
}

export default ChatRichText;
