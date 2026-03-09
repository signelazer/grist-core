import { DataRowModel } from "app/client/models/DataRowModel";
import { ViewFieldRec } from "app/client/models/entities/ViewFieldRec";
import { NTextBox } from "app/client/widgets/NTextBox";
import { dom } from "grainjs";

/**
 * TimeTextBox - Displays a time value (HH:MM) in the cell.
 * Stored as plain text in format "HH:MM" (24h).
 */
export class TimeTextBox extends NTextBox {
  constructor(field: ViewFieldRec) {
    super(field);
  }

  public buildDom(row: DataRowModel) {
    const value = row.cells[this.field.colId.peek()];
    return dom(
      "div.field_clip",
      dom.style("text-align", this.alignment),
      dom.cls("text_wrapping", this.wrapping),
      dom.text((use) => {
        const raw = use(value);
        if (raw === null || raw === undefined || raw === "") {
          return "";
        }
        const str = String(raw);
        // Display empty for 00:00 (default/unset value)
        if (str === "00:00") {
          return "";
        }
        return str;
      }),
    );
  }
}