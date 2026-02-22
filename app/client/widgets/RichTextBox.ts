import {DataRowModel} from 'app/client/models/DataRowModel';
import {ViewFieldRec} from 'app/client/models/entities/ViewFieldRec';
import {NTextBox} from 'app/client/widgets/NTextBox';
import {dom, styled} from 'grainjs';

/**
 * RichTextBox - Renders HTML content in cells with formatting
 * (bold, italic, superscript, subscript).
 * Used as the cell display widget for the "RichText" widget type.
 */
export class RichTextBox extends NTextBox {
  constructor(field: ViewFieldRec) {
    super(field);
  }

  public buildDom(row: DataRowModel) {
    const valueObs = row.cells[this.field.colId()];

    return dom(
      'div.field_clip',
      cssRichText(
        cssRichText.cls('-text-wrap', this.wrapping),
        dom.style('text-align', this.alignment),
        dom.domComputed(valueObs, (value) => {
          if (value == null || value === '') {
            return null;
          }
          const html = String(value);
          const sanitized = sanitizeHtml(html);
          const el = dom('span');
          el.innerHTML = sanitized;
          return el;
        }),
      ),
    );
  }
}

/**
 * Basic HTML sanitizer — only allows safe inline formatting tags.
 * For production, consider using DOMPurify:
 *   yarn add dompurify && yarn add -D @types/dompurify
 */
function sanitizeHtml(html: string): string {
  const temp = document.createElement('div');
  temp.innerHTML = html;

  const allowedTags = new Set([
    'B', 'STRONG', 'I', 'EM', 'SUP', 'SUB', 'U', 'S',
    'P', 'BR', 'SPAN',
  ]);

  function clean(node: Node): void {
    const children = Array.from(node.childNodes);
    for (const child of children) {
      if (child.nodeType === Node.ELEMENT_NODE) {
        const el = child as Element;
        if (!allowedTags.has(el.tagName)) {
          const text = document.createTextNode(el.textContent || '');
          node.replaceChild(text, child);
        } else {
          const attrs = Array.from(el.attributes);
          for (const attr of attrs) {
            if (attr.name !== 'class') {
              el.removeAttribute(attr.name);
            }
          }
          clean(child);
        }
      }
    }
  }

  clean(temp);
  return temp.innerHTML;
}

const cssRichText = styled('div', `
  white-space: nowrap;
  &-text-wrap {
    white-space: normal;
    word-break: break-word;
  }
  & p {
    margin: 0;
  }
  & sup {
    vertical-align: super;
    font-size: 0.8em;
  }
  & sub {
    vertical-align: sub;
    font-size: 0.8em;
  }
`);