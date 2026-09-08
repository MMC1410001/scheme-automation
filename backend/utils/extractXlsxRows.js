const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const PYTHON_SCRIPT = String.raw`
import json
import os
import posixpath
import re
import sys
import tempfile
import zipfile
import xml.etree.ElementTree as ET

def local_name(tag):
    if "}" in tag:
        return tag.rsplit("}", 1)[1]
    return tag

def normalize(value):
    return re.sub(r"[_\s]+", " ", (value or "").strip().lower())

def resolve_sheet_path(zip_file, requested_sheet_name):
    workbook_xml = ET.fromstring(zip_file.read("xl/workbook.xml"))
    rels_xml = ET.fromstring(zip_file.read("xl/_rels/workbook.xml.rels"))

    rels = {}
    for rel in rels_xml.iter():
        if local_name(rel.tag) == "Relationship":
            rels[rel.attrib.get("Id")] = rel.attrib.get("Target")

    sheets = []
    for sheet in workbook_xml.iter():
        if local_name(sheet.tag) != "sheet":
            continue
        sheet_name = sheet.attrib.get("name", "")
        rid = sheet.attrib.get("{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id")
        target = rels.get(rid)
        if not target:
            continue
        target = posixpath.normpath(posixpath.join("xl", target.lstrip("/")))
        sheets.append({"name": sheet_name, "path": target})

    if not sheets:
        raise RuntimeError("No worksheets found in workbook.xml")

    if not requested_sheet_name:
        return sheets[0], [s["name"] for s in sheets]

    normalized_requested = normalize(requested_sheet_name)
    for sheet in sheets:
        normalized_sheet = normalize(sheet["name"])
        if normalized_sheet == normalized_requested or normalized_requested in normalized_sheet:
            return sheet, [s["name"] for s in sheets]

    # Fallback to first sheet if requested not found
    return sheets[0], [s["name"] for s in sheets]

def load_shared_strings(zip_file):
    try:
        root = ET.fromstring(zip_file.read("xl/sharedStrings.xml"))
    except KeyError:
        return []

    strings = []
    for si in root.iter():
        if local_name(si.tag) != "si":
            continue
        text_parts = []
        for node in si.iter():
            if local_name(node.tag) == "t" and node.text:
                text_parts.append(node.text)
        strings.append("".join(text_parts))
    return strings

def column_index(cell_ref):
    letters = re.match(r"([A-Z]+)", cell_ref or "", re.I)
    if not letters:
        return 0
    value = 0
    for char in letters.group(1).upper():
        value = value * 26 + (ord(char) - 64)
    return max(0, value - 1)

def extract_rows(zip_file, sheet_path, shared_strings, max_rows):
    rows = []
    with zip_file.open(sheet_path) as sheet_file:
        context = ET.iterparse(sheet_file, events=("end",))
        for _, node in context:
            if local_name(node.tag) != "row":
                continue

            values = {}
            max_index = -1
            row_number = 0
            try:
                row_number = max(0, int(node.attrib.get("r", "1")) - 1)
            except Exception:
                row_number = len(rows)

            for cell in node:
                if local_name(cell.tag) != "c":
                    continue
                cell_ref = cell.attrib.get("r", "")
                cell_index = column_index(cell_ref)
                max_index = max(max_index, cell_index)
                cell_type = cell.attrib.get("t", "")
                value = ""
                if cell_type == "s":
                    for child in cell:
                        if local_name(child.tag) == "v" and child.text:
                            try:
                                idx = int(child.text.strip())
                                value = shared_strings[idx] if idx < len(shared_strings) else ""
                            except Exception:
                                value = ""
                            break
                elif cell_type in ("inlineStr", "str"):
                    for child in cell.iter():
                        if local_name(child.tag) == "t" and child.text:
                            value += child.text
                else:
                    for child in cell:
                        if local_name(child.tag) == "v" and child.text:
                            value = child.text
                            break
                    if not value:
                        for child in cell.iter():
                            if local_name(child.tag) == "t" and child.text:
                                value += child.text

                value = (value or "").strip()
                if value:
                    values[cell_index] = value

            if values:
                row_values = ["" for _ in range(max_index + 1)]
                for index, value in values.items():
                    row_values[index] = value
                rows.append({"values": row_values, "rowNumber": row_number})
            node.clear()
            if len(rows) >= max_rows:
                break

    return rows

def extract_row_values(zip_file, sheet_path, shared_strings, max_rows):
    rows = extract_rows(zip_file, sheet_path, shared_strings, max_rows)
    return [row["values"] for row in rows]

def main():
    file_path = sys.argv[1]
    requested_sheet_name = sys.argv[2] if len(sys.argv) > 2 else ""
    max_rows = int(sys.argv[3]) if len(sys.argv) > 3 else 50

    with zipfile.ZipFile(file_path, "r") as zip_file:
        selected_sheet, available_sheets = resolve_sheet_path(zip_file, requested_sheet_name)
        shared_strings = load_shared_strings(zip_file)
        rows = extract_row_values(zip_file, selected_sheet["path"], shared_strings, max_rows)
        print(json.dumps({
            "sheetName": selected_sheet["name"],
            "sheetPath": selected_sheet["path"],
            "availableSheets": available_sheets,
            "rows": rows,
        }))

if __name__ == "__main__":
    main()
`;

const extractXlsxRows = (buffer, sheetName, maxRows = 50) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "xlsx-parse-"));
  const filePath = path.join(tempDir, "input.xlsx");
  fs.writeFileSync(filePath, buffer);

  try {
    const result = spawnSync(
      "python3",
      ["-c", PYTHON_SCRIPT, filePath, sheetName || "", String(maxRows)],
      {
        encoding: "utf8",
        maxBuffer: 10 * 1024 * 1024,
      },
    );

    if (result.status !== 0) {
      throw new Error(
        result.stderr?.trim() ||
          result.stdout?.trim() ||
          `Python parser exited with code ${result.status}`,
      );
    }

    const parsed = JSON.parse(result.stdout);
    return parsed;
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
};

module.exports = { extractXlsxRows };
