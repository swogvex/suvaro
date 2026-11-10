/**
 * Wraps every <table> of rendered Markdown in a focusable scroll box, so wide tables scroll inside the
 * column on phones instead of squeezing words or scrolling the page. tabindex="0" lets keyboard users
 * scroll it (axe: scrollable-region-focusable). Only for our own trusted Markdown content.
 */
export function wrapTables(html: string): string {
  return html
    .replace(/<table(\s|>)/g, '<div class="table-scroll" tabindex="0"><table$1')
    .replace(/<\/table>/g, '</table></div>');
}
