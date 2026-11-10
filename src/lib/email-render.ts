/**
 * Pure email rendering (unit-tested): fills `{{placeholders}}` in a Markdown email from `src/content/emails`
 * and produces a plain-text part plus a minimal HTML part. Values are escaped in the HTML part.
 */
export type EmailVars = Record<string, string>;

export interface EmailSource {
  subject: string;
  preheader: string;
  /** Raw Markdown body. */
  markdown: string;
  /** Body already rendered to HTML by the content layer. */
  html: string;
}

export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

const placeholder = /\{\{\s*(\w+)\s*\}\}/g;

export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/** Replaces known placeholders; unknown ones throw so a typo never reaches a user. */
export function fill(
  template: string,
  vars: EmailVars,
  escape: (value: string) => string = (v) => v,
): string {
  return template.replace(placeholder, (_match, name: string) => {
    const value = vars[name];
    if (value === undefined) throw new Error(`Missing email placeholder: ${name}`);
    return escape(value);
  });
}

/** Markdown → readable plain text: drops emphasis markers and keeps link URLs. */
export function markdownToText(markdown: string): string {
  return markdown
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1: $2')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function renderEmail(source: EmailSource, vars: EmailVars, lang: string): RenderedEmail {
  const subject = fill(source.subject, vars);
  const text = `${markdownToText(fill(source.markdown, vars))}\n\n— Suvaro\n`;
  const body = fill(source.html, vars, escapeHtml);
  const preheader = escapeHtml(fill(source.preheader, vars));
  const html = `<!doctype html>
<html lang="${escapeHtml(lang)}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:24px;background:#F6F3EE;color:#211F1C;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;font-size:16px;line-height:1.5">
<span style="display:none;max-height:0;overflow:hidden">${preheader}</span>
<div style="max-width:480px;margin:0 auto;padding:24px;background:#FFFFFF;border:1px solid #E6E0D5;border-radius:10px">
${body}
<p style="margin-top:24px;color:#56524C;font-size:14px">Suvaro</p>
</div>
</body>
</html>
`;
  return { subject, text, html };
}
