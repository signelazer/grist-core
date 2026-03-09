import { createGroup } from "app/client/components/commands";
import { testId } from "app/client/ui2018/cssVars";
import { createMobileButtons, getButtonMargins } from "app/client/widgets/EditorButtons";
import { EditorPlacement } from "app/client/widgets/EditorPlacement";
import { FieldOptions, NewBaseEditor } from "app/client/widgets/NewBaseEditor";
import { CellValue } from "app/common/DocActions";
import { dom, Observable } from "grainjs";

/**
 * TimeEditor - An editor for time values in HH:MM (24h) format.
 * Uses the exact same sizing pattern as NTextEditor so that
 * EditorPlacement can properly position and show the editor.
 */
export class TimeEditor extends NewBaseEditor {
  public readonly editorState: Observable<string>;

  private _dom: HTMLElement;
  private _editorPlacement!: EditorPlacement;
  private _hourSelect: HTMLSelectElement;
  private _minuteSelect: HTMLSelectElement;
  private _commandGroup: any;
  private _contentSizer: HTMLElement;
  private _textInput: HTMLTextAreaElement;

  constructor(protected options: FieldOptions) {
    super(options);

    const cellValue = String(options.editValue ?? options.cellValue ?? "");
    let hour = "00";
    let minute = "00";

    if (/^\d{2}:\d{2}$/.test(cellValue)) {
      [hour, minute] = cellValue.split(":");
    } else if (options.editValue && /^\d$/.test(options.editValue)) {
      hour = "0" + options.editValue;
    }

    const initialValue = `${hour}:${minute}`;
    this.editorState = Observable.create<string>(this, initialValue);
    this._commandGroup = this.autoDispose(createGroup(options.commands, this, true));

    const alignment = options.field.widgetOptionsJson.peek().alignment || "left";

    this._hourSelect = this._buildSelect(24, hour);
    this._minuteSelect = this._buildSelect(60, minute);

    // Exact same DOM structure as NTextEditor.
    // The textarea is real and sized, but visually hidden behind the selects.
    this._dom = dom(
      "div.default_editor",
      dom.cls("readonly_editor", options.readonly),
      dom(
        "div.celleditor_cursor_editor",
        testId("widget-time-editor"),
        // Content sizer — used by EditorPlacement to measure
        this._contentSizer = dom(
          "div.celleditor_content_measure",
        ),
        // Real textarea — same class as NTextEditor, visible to layout engine
        // but hidden visually. Must NOT have width:0/height:0.
        this._textInput = dom(
          "textarea.celleditor_text_editor",
          dom.style("text-align", alignment),
          dom.style("position", "absolute"),
          dom.style("top", "0"),
          dom.style("left", "0"),
          dom.style("opacity", "0"),
          dom.style("z-index", "-1"),
          dom.prop("value", initialValue),
          dom.boolAttr("readonly", true),
          this._commandGroup.attach(),
        ) as unknown as HTMLTextAreaElement,
        // Visible time picker
        dom(
          "div",
          dom.style("display", "flex"),
          dom.style("align-items", "center"),
          dom.style("gap", "4px"),
          dom.style("padding", "4px 6px"),
          dom.style("white-space", "nowrap"),
          dom(
            "span",
            dom.style("font-size", "10px"),
            dom.style("color", "#999"),
            dom.style("font-weight", "600"),
            "H",
          ),
          this._hourSelect,
          dom(
            "span",
            dom.style("font-size", "16px"),
            dom.style("font-weight", "700"),
            dom.style("color", "#555"),
            ":",
          ),
          dom(
            "span",
            dom.style("font-size", "10px"),
            dom.style("color", "#999"),
            dom.style("font-weight", "600"),
            "M",
          ),
          this._minuteSelect,
        ),
      ),
      createMobileButtons(options.commands),
    );
  }

  public attach(cellElem: Element): void {
    this._editorPlacement = EditorPlacement.create(
      this,
      this._dom,
      cellElem,
      { margins: getButtonMargins() },
    );

    // Do the same sizing dance as NTextEditor.resizeInput()
    // so EditorPlacement calculates position and sets visibility: visible
    this._contentSizer.textContent = "00:00\u200B";
    const domRect = this._contentSizer.getBoundingClientRect();
    const rect = { width: Math.max(domRect.width, 160), height: Math.max(domRect.height, 24) };
    const size = this._editorPlacement.calcSizeWithPadding(this._textInput, rect);
    this._textInput.style.width = size.width + "px";
    this._textInput.style.height = size.height + "px";

    this._hourSelect.focus();
  }

  public getDom(): HTMLElement {
    return this._dom;
  }

  public getCellValue(): CellValue {
    const val = this._getValueStr();
    // Treat 00:00 as empty (no value set)
    return val === "00:00" ? "" : val;
  }

  public getTextValue(): string {
    return this._getValueStr();
  }

  public getCursorPos(): number {
    return 0;
  }

  private _buildSelect(count: number, initialValue: string): HTMLSelectElement {
    const select = dom(
      "select",
      dom.style("font-size", "13px"),
      dom.style("padding", "3px 2px"),
      dom.style("border", "1px solid #d0d0d0"),
      dom.style("border-radius", "4px"),
      dom.style("outline", "none"),
      dom.style("background", "#fff"),
      dom.style("cursor", "pointer"),
      dom.style("min-width", "48px"),
      dom.style("text-align", "center"),
      dom.on("change", () => this._onValueChange()),
      dom.on("keydown", (e: KeyboardEvent) => this._handleKeyDown(e)),
      dom.on("focus", (e: FocusEvent) => {
        const el = e.target as HTMLSelectElement;
        el.style.borderColor = "#16b378";
        el.style.boxShadow = "0 0 0 2px rgba(22,179,120,0.15)";
      }),
      dom.on("blur", (e: FocusEvent) => {
        const el = e.target as HTMLSelectElement;
        el.style.borderColor = "#d0d0d0";
        el.style.boxShadow = "none";
      }),
    ) as HTMLSelectElement;

    for (let i = 0; i < count; i++) {
      const val = String(i).padStart(2, "0");
      const opt = document.createElement("option");
      opt.value = val;
      opt.textContent = val;
      if (val === initialValue) {
        opt.selected = true;
      }
      select.appendChild(opt);
    }
    return select;
  }

  private _getValueStr(): string {
    return `${this._hourSelect.value}:${this._minuteSelect.value}`;
  }

  private _onValueChange(): void {
    this.editorState.set(this._getValueStr());
    this._textInput.value = this._getValueStr();
  }

  private _handleKeyDown(e: KeyboardEvent): void {
    if (e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      this.options.commands.fieldEditSaveHere();
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      this.options.commands.fieldEditCancel();
    } else if (e.key === "Tab" && !e.shiftKey) {
      if (e.target === this._hourSelect) {
        e.preventDefault();
        this._minuteSelect.focus();
      }
    } else if (e.key === "Tab" && e.shiftKey) {
      if (e.target === this._minuteSelect) {
        e.preventDefault();
        this._hourSelect.focus();
      }
    }
  }
}