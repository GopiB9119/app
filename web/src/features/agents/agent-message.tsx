"use client";

import { useId, useState } from "react";
import type { ReactNode } from "react";
import { Check, Copy, Download, FoldVertical, ImageIcon, ListOrdered, UnfoldVertical } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeHighlight from "rehype-highlight";
import rehypeKatex from "rehype-katex";
import { toText } from "hast-util-to-text";

import { useText } from "@/features/i18n/i18n";
import type { AgentMessagePart } from "./client";
import styles from "./agent-message.module.css";

function safeMessageUrl(value: string) {
  if (/^#user-content-(?:fn|fnref)-/.test(value)) return value;
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password ? url.href : "";
  } catch { return ""; }
}

function downloadText(content: string, filename: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  try { link.click(); } finally {
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

function ContentActions({ content, code = false }: { content: string; code?: boolean }) {
  const t = useText();
  const [feedback, setFeedback] = useState<"copied" | "copyError" | "downloadError" | null>(null);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setFeedback("copied");
    } catch { setFeedback("copyError"); }
  };
  const download = () => {
    try {
      downloadText(content, code ? "agent-code.txt" : "agent-answer.md", code ? "text/plain;charset=utf-8" : "text/markdown;charset=utf-8");
      setFeedback(null);
    } catch { setFeedback("downloadError"); }
  };
  return <div className={styles.actionGroup}>
    <div className={styles.actions} role="group" aria-label={t(code ? "agent.codeActions" : "agent.messageActions")}>
      <button type="button" className="icon-button" aria-label={t(code ? "agent.copyCode" : "agent.copyMessage")}
        title={t(code ? "agent.copyCode" : "agent.copyMessage")} onClick={() => void copy()}>
        {feedback === "copied" ? <Check size={17} aria-hidden /> : <Copy size={17} aria-hidden />}
      </button>
      <button type="button" className="icon-button" aria-label={t(code ? "agent.downloadCode" : "agent.downloadMessage")}
        title={t(code ? "agent.downloadCode" : "agent.downloadMessage")} onClick={download}><Download size={17} aria-hidden /></button>
    </div>
    {feedback && <p className={styles.feedback} role={feedback === "copied" ? "status" : "alert"}>{t(`agent.${feedback}`)}</p>}
  </div>;
}

function CodeBlock({ content, language, children }: { content: string; language: string; children: ReactNode }) {
  const t = useText();
  const fieldId = useId();
  const [expanded, setExpanded] = useState(true);
  const [numbered, setNumbered] = useState(true);
  const lines = content.replace(/\n$/, "").split("\n").map((_line, index) => index + 1).join("\n");
  return <figure className={styles.codeBlock}>
    <figcaption className={styles.codeHeader}>
      <span className={styles.language}>{language || t("agent.codeBlock")}</span>
      <div className={styles.codeControls}>
        <ContentActions content={content} code />
        <button type="button" className="icon-button" aria-pressed={numbered}
          aria-label={t(numbered ? "agent.hideLineNumbers" : "agent.showLineNumbers")} title={t(numbered ? "agent.hideLineNumbers" : "agent.showLineNumbers")}
          onClick={() => setNumbered(value => !value)}><ListOrdered size={17} aria-hidden /></button>
        <button type="button" className="icon-button" aria-expanded={expanded} aria-controls={fieldId}
          aria-label={t(expanded ? "agent.collapseCode" : "agent.expandCode")} title={t(expanded ? "agent.collapseCode" : "agent.expandCode")}
          onClick={() => setExpanded(value => !value)}>{expanded ? <FoldVertical size={17} aria-hidden /> : <UnfoldVertical size={17} aria-hidden />}</button>
      </div>
    </figcaption>
    <div className={styles.codeScroll} id={fieldId} hidden={!expanded} tabIndex={0} role="region" aria-label={t("agent.codeBlock")}>
      {numbered && <pre className={styles.lineNumbers} aria-hidden>{lines}</pre>}
      <pre className={styles.codeText}>{children}</pre>
    </div>
  </figure>;
}

export function AgentMarkdown({ content }: { content: string }) {
  const t = useText();
  return <div className={styles.markdown}>
    <ReactMarkdown skipHtml urlTransform={safeMessageUrl} remarkPlugins={[remarkGfm, remarkMath]}
      rehypePlugins={[[rehypeHighlight, { detect: false }], [rehypeKatex, { output: "mathml", trust: false, strict: "error", maxExpand: 1000, maxSize: 10 }]]}
      components={{
        a: ({ href, children }) => href ? <a href={href} target={href.startsWith("#") ? undefined : "_blank"} rel="noopener noreferrer" referrerPolicy="no-referrer">{children}</a> : <span>{children}</span>,
        img: ({ src, alt }) => typeof src === "string" && src ? <a href={src} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">
          <ImageIcon size={16} aria-hidden />{alt || t("agent.imageLink")}</a> : <span>{alt}</span>,
        pre: ({ node, children }) => {
          const code = node?.children.find(child => child.type === "element" && child.tagName === "code");
          const names = code?.type === "element" ? code.properties.className : [];
          const language = Array.isArray(names) ? names.find(name => typeof name === "string" && name.startsWith("language-")) : undefined;
          return <CodeBlock content={node ? toText(node) : ""} language={typeof language === "string" ? language.slice(9) : ""}>{children}</CodeBlock>;
        },
        table: ({ children }) => <div className={styles.tableScroll} tabIndex={0} role="region" aria-label={t("agent.table")}><table>{children}</table></div>,
      }}>{content}</ReactMarkdown>
  </div>;
}

export function AgentMessageContent({ parts }: { parts: AgentMessagePart[] }) {
  const content = parts.filter(part => part.type === "text" || part.type === "markdown");
  if (!content.length) return null;
  const text = content.map(part => part.content).join("\n\n");
  return <div className={styles.message}>
    {content.map((part, index) => part.type === "markdown" ? <AgentMarkdown key={index} content={part.content} />
      : <p key={index} className={styles.plain}>{part.content}</p>)}
    <ContentActions key={text} content={text} />
  </div>;
}