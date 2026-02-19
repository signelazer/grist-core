import {createGroup} from 'app/client/components/commands';
import {testId} from 'app/client/ui2018/cssVars';
import {getButtonMargins} from 'app/client/widgets/EditorButtons';
import {EditorPlacement} from 'app/client/widgets/EditorPlacement';
import {FieldOptions, NewBaseEditor} from 'app/client/widgets/NewBaseEditor';
import {CellValue} from 'app/common/DocActions';
import {undef} from 'app/common/gutil';
import {dom, Observable, styled} from 'grainjs';

// Quill import — requires: yarn add quill@1.3.7
// If TypeScript complains, add `declare module 'quill';` in declarations.d.ts
const QuillModule = require('quill');
const Quill = QuillModule.default || QuillModule;

// ─── Quill CSS injection (once) ────────────────────────────────────────────
let _quillCssInjected = false;
function ensureQuillCss() {
  if (_quillCssInjected) { return; }
  _quillCssInjected = true;
  const style = document.createElement('style');
  style.id = 'grist-quill-css';
  style.textContent = QUILL_INLINE_CSS;
  document.head.appendChild(style);
}

/**
 * RichTextEditor — Inline Quill WYSIWYG editor for Grist cells.
 *
 * Opens as a popup over the cell. Supports bold, italic, superscript, subscript.
 * Enter saves, Shift+Enter for newline, Escape cancels.
 */
export class RichTextEditor extends NewBaseEditor {
  // Required by Grist's draft/undo system
  public readonly editorState: Observable<string>;

  private _quill: any;
  private _container: HTMLElement;
  private _editorPlacement!: EditorPlacement;
  private _dom: HTMLElement;
  private _commandGroup: any;

  constructor(options: FieldOptions) {
    super(options);
    ensureQuillCss();

    const initialValue: string = undef(
      options.state as string | undefined,
      options.editValue,
      String(options.cellValue ?? '')
    );

    this.editorState = Observable.create<string>(this, initialValue);

    // Register commands the Grist way (handles Enter→save, Escape→cancel, Tab, etc.)
    this._commandGroup = this.autoDispose(createGroup(options.commands, this, true));

    this._dom = cssRichEditorWrap(
      testId('widget-richtext-editor'),
      // Prevent mousedown from propagating to Grist grid
      dom.on('mousedown', (e: MouseEvent) => e.stopPropagation()),
      this._container = cssQuillContainer(),
    );
  }

  public attach(cellElem: Element): void {
    // Position the editor over the cell
    this._editorPlacement = EditorPlacement.create(this, this._dom, cellElem, {
      margins: getButtonMargins(),
    });
    this.autoDispose(
      this._editorPlacement.onReposition.addListener(() => this._resize(), this)
    );

    // Initialize Quill
    this._quill = new Quill(this._container, {
      theme: 'snow',
      modules: {
        toolbar: [
          ['bold', 'italic'],
          [{'script': 'super'}, {'script': 'sub'}],
          ['clean'],
        ],
        keyboard: {
          bindings: {
            // Override Enter: don't insert newline, let Grist commandGroup handle save
            enter: {
              key: 'Enter',
              handler: () => false, // returning false prevents default Quill behavior
            },
            // Shift+Enter: insert newline in editor
            shiftEnter: {
              key: 'Enter',
              shiftKey: true,
              handler: (_range: any, _context: any) => true,
            },
          },
        },
      },
    });

    // Attach Grist command group to the editable area
    const qlEditor = this._container.querySelector('.ql-editor') as HTMLElement;
    if (qlEditor) {
      this._commandGroup.attach(qlEditor);

      // Additional keydown handler for edge cases
      qlEditor.addEventListener('keydown', (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          // Ensure Escape always reaches Grist's cancel handler
          e.preventDefault();
          e.stopImmediatePropagation();
          this.options.commands.fieldEditCancel();
          return;
        }
        // Stop regular typing from propagating to Grist (grid navigation, etc.)
        if (!e.ctrlKey && !e.metaKey && !e.altKey &&
            e.key !== 'Tab' && e.key !== 'Enter') {
          e.stopPropagation();
        }
      }, true);
    }

    // Track content changes for draft system
    this._quill.on('text-change', (_delta: any, _oldDelta: any, source: string) => {
      if (source === 'user') {
        this.editorState.set(this._getHtml());
        this._resize();
      }
    });

    // Load existing value
    const value = String(this.options.editValue ?? this.options.cellValue ?? '');
    if (value) {
      this._quill.clipboard.dangerouslyPasteHTML(value);
    }

    this._resize();

    // Focus and place cursor at end
    this._quill.focus();
    const length = this._quill.getLength();
    this._quill.setSelection(Math.max(0, length - 1), 0);
  }

  public getDom(): HTMLElement {
    return this._dom;
  }

  public getCellValue(): CellValue {
    return this._getHtml();
  }

  public getTextValue(): string {
    return this._quill?.getText() || '';
  }

  public getCursorPos(): number {
    const sel = this._quill?.getSelection();
    return sel ? sel.index : 0;
  }

  private _getHtml(): string {
    if (!this._quill) { return ''; }
    const html = this._container.querySelector('.ql-editor')?.innerHTML || '';
    // Quill's empty state is `<p><br></p>`
    return html === '<p><br></p>' ? '' : html;
  }

  private _resize() {
    if (!this._editorPlacement) { return; }
    const toolbar = this._container.querySelector('.ql-toolbar') as HTMLElement;
    const editor = this._container.querySelector('.ql-editor') as HTMLElement;
    const toolbarH = toolbar?.offsetHeight || 36;
    const editorH = editor?.scrollHeight || 40;
    this._editorPlacement.calcSize({
      width: Math.max(250, this._container.scrollWidth),
      height: Math.max(100, toolbarH + editorH + 8),
    });
  }
}

// ─── Styled components ─────────────────────────────────────────────────────

const cssRichEditorWrap = styled('div', `
  display: flex;
  flex-direction: column;
  background: white;
  border: 1px solid #a9a9a9;
  border-radius: 3px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  min-width: 250px;
  overflow: hidden;
  z-index: 100;
`);

const cssQuillContainer = styled('div', `
  min-height: 60px;
`);

// ─── Inline Quill Snow theme CSS (minimal) ─────────────────────────────────
// This avoids CDN dependency. For full theme, copy quill.snow.css to static/.

const QUILL_INLINE_CSS = `
/* Quill Snow — minimal inline for Grist RichTextEditor */
.ql-toolbar.ql-snow {
  border: none;
  border-bottom: 1px solid #e0e0e0;
  padding: 4px 8px;
  background: #fafafa;
  font-family: inherit;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
}
.ql-container.ql-snow {
  border: none;
  font-family: inherit;
  font-size: 13px;
}
.ql-editor {
  padding: 6px 10px;
  min-height: 40px;
  max-height: 300px;
  overflow-y: auto;
  outline: none;
  line-height: 1.4;
}
.ql-editor p { margin: 0; }
.ql-snow .ql-toolbar button {
  width: 26px;
  height: 24px;
  padding: 3px 5px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  border: none;
  background: transparent;
  border-radius: 3px;
}
.ql-snow .ql-toolbar button:hover {
  background: #e8e8e8;
}
.ql-snow .ql-toolbar button.ql-active {
  background: #d4edda;
}
.ql-snow .ql-formats {
  margin-right: 8px;
  display: inline-flex;
  gap: 2px;
}
.ql-snow .ql-stroke {
  stroke: #555;
  fill: none;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.ql-snow .ql-fill {
  fill: #555;
  stroke: none;
}
.ql-snow .ql-active .ql-stroke { stroke: #16b378; }
.ql-snow .ql-active .ql-fill { fill: #16b378; }
.ql-snow .ql-picker {
  display: inline-flex;
  position: relative;
}
.ql-snow .ql-picker-label {
  cursor: pointer;
  padding: 2px 4px;
  font-size: 12px;
}
.ql-snow .ql-picker-options {
  display: none;
  position: absolute;
  background: white;
  border: 1px solid #ccc;
  border-radius: 3px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
  z-index: 10;
  min-width: 80px;
}
.ql-snow .ql-picker.ql-expanded .ql-picker-options {
  display: block;
}
.ql-snow .ql-hidden { display: none; }
.ql-clipboard {
  position: fixed;
  left: -100000px;
  height: 1px;
  overflow-y: hidden;
}
`;