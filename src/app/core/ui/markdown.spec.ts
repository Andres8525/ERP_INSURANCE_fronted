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

  it('convierte tablas Markdown en tablas HTML con cabecera', () => {
    const html = renderMarkdown('| Severidad | Cantidad |\n|---|:---:|\n| **Crítica** | 4 |\n| Revisión | 3 |\n\nFin');
    expect(html).toBe(
      '<div class="md-table"><table><thead><tr><th>Severidad</th><th>Cantidad</th></tr></thead>' +
        '<tbody><tr><td><strong>Crítica</strong></td><td>4</td></tr><tr><td>Revisión</td><td>3</td></tr></tbody></table></div>' +
        '<p>Fin</p>',
    );
    expect(renderMarkdown('| a | <b>x</b> |')).toContain('<td>&lt;b&gt;x&lt;/b&gt;</td>');
  });

  it('convierte separadores en <hr> y los <br> literales del modelo en saltos de línea', () => {
    expect(renderMarkdown('Antes\n---\nDespués')).toBe('<p>Antes</p><hr><p>Después</p>');
    expect(renderMarkdown('• uno <br>• dos<br/>• tres')).toBe('<ul><li>uno</li><li>dos</li><li>tres</li></ul>');
    expect(renderMarkdown('texto<BR>más')).toBe('<p>texto<br>más</p>');
    expect(renderMarkdown('| 4 | • a <br>• b |')).toContain('<td>• a<br>• b</td>');
  });

  it('une líneas consecutivas en un párrafo y cierra listas abiertas', () => {
    expect(renderMarkdown('uno\ndos')).toBe('<p>uno<br>dos</p>');
    expect(renderMarkdown('- a\ntexto')).toBe('<ul><li>a</li></ul><p>texto</p>');
  });
});
