import { describe, expect, it } from 'vitest';
import { escapeHtml, renderMarkdown } from './markdown';

describe('renderMarkdown', () => {
  it('convierte las secciones que devuelve Grok', () => {
    const html = renderMarkdown(
      '## Diagnóstico\nHay **4 críticas** en `POLICY`.\n\n## Prioridades\n1. Pólizas solapadas\n2. Correos\n\n- Revisar *hoy*\n- Archivar',
    );
    expect(html).toBe(
      '<h4>Diagnóstico</h4><p>Hay <strong>4 críticas</strong> en <code>POLICY</code>.</p>' +
        '<h4>Prioridades</h4><ol><li>Pólizas solapadas</li><li>Correos</li></ol>' +
        '<ul><li>Revisar <em>hoy</em></li><li>Archivar</li></ul>',
    );
  });

  it('escapa HTML para que la respuesta del modelo no pueda inyectar código', () => {
    const html = renderMarkdown('<img src=x onerror="alert(1)">\n- <script>alert(1)</script>');
    expect(html).not.toContain('<img');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(escapeHtml(`"a" & 'b'`)).toBe('&quot;a&quot; &amp; &#39;b&#39;');
  });

  it('une líneas consecutivas en un párrafo y cierra listas abiertas', () => {
    expect(renderMarkdown('uno\ndos')).toBe('<p>uno<br>dos</p>');
    expect(renderMarkdown('- a\ntexto')).toBe('<ul><li>a</li></ul><p>texto</p>');
  });
});
