const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => ESCAPES[char]);
}

function inline(text: string): string {
  return escapeHtml(text)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>');
}

type ListKind = 'ul' | 'ol';

const TABLE_ROW = /^\|.*\|$/;
const TABLE_SEPARATOR = /^:?-{2,}:?$/;

function cells(row: string): string[] {
  return row.slice(1, -1).split('|').map((cell) => cell.trim());
}

function renderTable(rows: string[]): string {
  const parsed = rows.map(cells);
  const hasHeader = parsed.length > 1 && parsed[1].every((cell) => TABLE_SEPARATOR.test(cell));
  const header = hasHeader ? parsed[0] : null;
  const body = hasHeader ? parsed.slice(2) : parsed;
  const head = header ? `<thead><tr>${header.map((cell) => `<th>${inline(cell)}</th>`).join('')}</tr></thead>` : '';
  const rowsHtml = body.map((row) => `<tr>${row.map((cell) => `<td>${inline(cell)}</td>`).join('')}</tr>`).join('');
  return `<div class="md-table"><table>${head}<tbody>${rowsHtml}</tbody></table></div>`;
}

export function renderMarkdown(markdown: string): string {
  const html: string[] = [];
  let list: ListKind | null = null;
  let paragraph: string[] = [];
  let table: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length) html.push(`<p>${paragraph.map(inline).join('<br>')}</p>`);
    paragraph = [];
  };
  const flushTable = () => {
    if (table.length) html.push(renderTable(table));
    table = [];
  };
  const closeList = () => {
    if (list) html.push(`</${list}>`);
    list = null;
  };
  const openList = (kind: ListKind) => {
    if (list === kind) return;
    closeList();
    html.push(`<${kind}>`);
    list = kind;
  };
  const closeBlocks = () => {
    flushParagraph();
    flushTable();
    closeList();
  };

  for (const raw of markdown.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trim();
    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    const bullet = /^[-*•]\s+(.*)$/.exec(line);
    const numbered = /^\d+[.)]\s+(.*)$/.exec(line);

    if (TABLE_ROW.test(line) && line.length > 2) {
      flushParagraph();
      closeList();
      table.push(line);
      continue;
    }
    flushTable();

    if (!line) {
      closeBlocks();
    } else if (heading) {
      closeBlocks();
      const level = Math.min(heading[1].length + 2, 6);
      html.push(`<h${level}>${inline(heading[2])}</h${level}>`);
    } else if (bullet || numbered) {
      flushParagraph();
      openList(bullet ? 'ul' : 'ol');
      html.push(`<li>${inline((bullet ?? numbered)![1])}</li>`);
    } else {
      closeList();
      paragraph.push(line);
    }
  }
  closeBlocks();
  return html.join('');
}
