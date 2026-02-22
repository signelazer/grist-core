/**
 * RichTextEditor — TinyMCE WYSIWYG editor for Grist cells (CDN version).
 *
 * WHY TINYMCE:
 * TinyMCE runs inside an iframe. Keyboard events are completely isolated
 * from Mousetrap (Grist's shortcut library). No conflicts, text input just works.
 *
 * WHY CDN:
 * TinyMCE needs skins/themes/icons assets. Loading from CDN avoids having to
 * copy files to static/ and configure base_url. No API key needed with jsDelivr.
 *
 * Enter saves, Shift+Enter for newline, Escape cancels, Tab navigates.
 */

import {createGroup} from 'app/client/components/commands';
import {testId} from 'app/client/ui2018/cssVars';
import {getButtonMargins} from 'app/client/widgets/EditorButtons';
import {EditorPlacement} from 'app/client/widgets/EditorPlacement';
import {FieldOptions, NewBaseEditor} from 'app/client/widgets/NewBaseEditor';
import {CellValue} from 'app/common/DocActions';
import {undef} from 'app/common/gutil';
import {dom, Observable, styled} from 'grainjs';

// ─── Load TinyMCE from CDN (once) ─────────────────────────────────────────
const TINYMCE_CDN = 'https://cdn.jsdelivr.net/npm/tinymce@7/tinymce.min.js';

let _tinymceReady: Promise<any> | null = null;

function loadTinyMCE(): Promise<any> {
  if (_tinymceReady) { return _tinymceReady; }

  _tinymceReady = new Promise((resolve, reject) => {
    // Already loaded?
    if ((window as any).tinymce) {
      resolve((window as any).tinymce);
      return;
    }
    const script = document.createElement('script');
    script.src = TINYMCE_CDN;
    script.referrerPolicy = 'origin';
    script.onload = () => resolve((window as any).tinymce);
    script.onerror = () => reject(new Error('Failed to load TinyMCE from CDN'));
    document.head.appendChild(script);
  });

  return _tinymceReady;
}


export class RichTextEditor extends NewBaseEditor {
  public readonly editorState: Observable<string>;

  private _editorId: string;
  private _editorPlacement!: EditorPlacement;
  private _dom: HTMLElement;
  private _textArea: HTMLTextAreaElement;
  private _tinyEditor: any = null;

  constructor(options: FieldOptions) {
    super(options);

    const initialValue: string = undef(
      options.state as string | undefined,
      options.editValue,
      String(options.cellValue ?? '')
    );

    this.editorState = Observable.create<string>(this, initialValue);

    // Register commands (fieldEditSave, fieldEditCancel, etc.)
    this.autoDispose(createGroup(options.commands, this, true));

    this._editorId = 'grist-richtext-' + Date.now();

    this._textArea = dom('textarea', {
      id: this._editorId,
      style: 'visibility: hidden; height: 0;',
    }) as HTMLTextAreaElement;
    this._textArea.value = initialValue;

    this._dom = cssRichEditorWrap(
      testId('widget-richtext-editor'),
      dom.on('mousedown', (e: MouseEvent) => e.stopPropagation()),
      this._textArea,
    );
  }

  public attach(cellElem: Element): void {
    this._editorPlacement = EditorPlacement.create(this, this._dom, cellElem, {
      margins: getButtonMargins(),
    });
    this.autoDispose(
      this._editorPlacement.onReposition.addListener(() => this._resize(), this)
    );

    // Load TinyMCE then initialize
    loadTinyMCE().then((tinymce) => {
      if (this.isDisposed()) { return; }
      this._initTinyMCE(tinymce);
    }).catch((err) => {
      console.error('RichTextEditor: failed to load TinyMCE', err);
    });
  }

  public getDom(): HTMLElement {
    return this._dom;
  }

  public getCellValue(): CellValue {
    if (!this._tinyEditor) { return this._textArea.value || ''; }
    const html = this._tinyEditor.getContent();
    if (!html || html === '<p>&nbsp;</p>' || html === '<p><br></p>' ||
        html === '<p><br data-mce-bogus="1"></p>') {
      return '';
    }
    return html;
  }

  public getTextValue(): string {
    if (!this._tinyEditor) { return ''; }
    return this._tinyEditor.getContent({format: 'text'});
  }

  public getCursorPos(): number {
    return 0;
  }

  // ── Private ──────────────────────────────────────────────────────────

  private _initTinyMCE(tinymce: any) {
    tinymce.init({
      target: this._textArea,
      license_key: 'gpl',

      // Minimal UI
      menubar: false,
      statusbar: false,
      toolbar: 'bold italic | superscript subscript | removeformat',
      plugins: '',

      // Sizing
      min_height: 80,
      max_height: 300,
      width: '100%',

      // Content styling inside the iframe
      content_style: `
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          font-size: 13px;
          color: #333;
          margin: 6px 10px;
          line-height: 1.4;
        }
        p { margin: 0 0 4px 0; }
      `,

      // Disable TinyMCE's promotion/upgrade nag
      promotion: false,
      branding: false,

      setup: (editor: any) => {
        editor.on('init', () => {
          if (this.isDisposed()) { return; }
          this._tinyEditor = editor;
          this._resize();
          editor.focus();
          // Place cursor at end
          editor.selection.select(editor.getBody(), true);
          editor.selection.collapse(false);
        });

        // Keyboard: Enter/Escape/Tab are handled HERE, inside the iframe.
        // No Mousetrap conflict because iframe events don't bubble to parent.
        editor.on('keydown', (e: KeyboardEvent) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            this.options.commands.fieldEditSaveHere();
            return;
          }
          if (e.key === 'Escape') {
            e.preventDefault();
            this.options.commands.fieldEditCancel();
            return;
          }
          if (e.key === 'Tab') {
            e.preventDefault();
            if (e.shiftKey) {
              this.options.commands.prevField?.();
            } else {
              this.options.commands.nextField?.();
            }
            return;
          }
        });

        // Track changes for draft system
        editor.on('input change', () => {
          if (!this.isDisposed()) {
            this.editorState.set(editor.getContent());
            this._resize();
          }
        });
      },
    });

    // Cleanup on dispose
    this.onDispose(() => {
      if (this._tinyEditor) {
        tinymce.remove(this._tinyEditor);
        this._tinyEditor = null;
      }
    });
  }

  private _resize() {
    if (!this._editorPlacement) { return; }
    const container = this._dom.querySelector('.tox-tinymce') as HTMLElement;
    if (container) {
      this._editorPlacement.calcSize({
        width: Math.max(300, container.scrollWidth),
        height: Math.max(100, container.scrollHeight),
      });
    } else {
      this._editorPlacement.calcSize({width: 300, height: 120});
    }
  }
}

const cssRichEditorWrap = styled('div', `
  display: flex;
  flex-direction: column;
  background: white;
  border: 1px solid #a9a9a9;
  border-radius: 3px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  min-width: 300px;
  overflow: visible;
  z-index: 100;
`);