import hashlib
import io
import re
import uuid
import zipfile
from decimal import Decimal, InvalidOperation

from django.conf import settings
from django.db import IntegrityError, transaction
from django.utils import timezone
import openpyxl
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter

from apps.audit.models import AuditEvent
from apps.organizations.models import Organization
from apps.products.models import Product, ProductImportBatch
from apps.products.serializers import generate_unique_org_sku, get_allowed_gst_rates


TEMPLATE_COLUMNS = [
    {"key": "name", "header": "Medicine Name *", "required": True, "width": 30, "example": "Paracetamol 500mg Tablets", "notes": "Required. Commercial medicine name (max 255 chars)."},
    {"key": "conversion_factor", "header": "Units Per Pack *", "required": True, "width": 16, "example": 10, "notes": "Required. Whole number >= 1 showing how many base units are in one sale pack (e.g. 10 tablets per strip)."},
    {"key": "base_unit", "header": "Base Unit *", "required": True, "width": 14, "example": "tablet", "notes": "Required. Smallest stock unit (tablet, capsule, strip, bottle, box, vial, ampoule, tube, piece, pack, sachet, can, jar, kit, ml, gm, unit)."},
    {"key": "gst_rate", "header": "GST Rate (%) *", "required": True, "width": 15, "example": 12, "notes": "Required. Valid GST slab: 0, 5, 12, 18, or 28."},
    {"key": "generic_name", "header": "Generic Name", "required": False, "width": 24, "example": "Paracetamol", "notes": "Optional. Active pharmaceutical ingredient / molecule."},
    {"key": "brand_name", "header": "Brand Name", "required": False, "width": 20, "example": "Crocin Advance", "notes": "Optional. Commercial brand label."},
    {"key": "strength", "header": "Strength", "required": False, "width": 14, "example": "500 mg", "notes": "Optional. Strength or concentration (e.g. 500 mg, 100 mg/5 ml)."},
    {"key": "dosage_form", "header": "Dosage Form", "required": False, "width": 15, "example": "tablet", "notes": "Optional. tablet, capsule, syrup, suspension, injection, ointment, drops, inhaler, powder, lotion, spray, suppository, patch, device, na."},
    {"key": "composition", "header": "Composition", "required": False, "width": 28, "example": "Paracetamol IP 500mg", "notes": "Optional. Full salt composition or active ingredients."},
    {"key": "manufacturer", "header": "Manufacturer", "required": False, "width": 22, "example": "GlaxoSmithKline", "notes": "Optional. Pharma manufacturer or marketer."},
    {"key": "category", "header": "Category", "required": False, "width": 24, "example": "otc_medicines", "notes": "Optional. e.g. prescription_medicines, otc_medicines, supplements_nutrition, healthcare_devices, surgical_supplies, personal_care, baby_care, ayurvedic_herbal, diagnostic_kits, other."},
    {"key": "sku", "header": "SKU / Product Code", "required": False, "width": 20, "example": "MED-PARA-500", "notes": "Optional. Unique organization product code. Leave blank to auto-generate cleanly."},
    {"key": "barcode", "header": "Barcode / EAN", "required": False, "width": 18, "example": "8901030000001", "notes": "Optional. Unique organization barcode / EAN / UPC."},
    {"key": "hsn_code", "header": "HSN Code", "required": False, "width": 14, "example": "30049099", "notes": "Optional. 4 to 8 digit HSN tax code."},
    {"key": "packing_type", "header": "Packing Type", "required": False, "width": 22, "example": "strip", "notes": "Optional. Sale unit or description (e.g. strip, bottle, box, Strip of 10 tablets)."},
    {"key": "prescription_required", "header": "Prescription Required", "required": False, "width": 20, "example": "No", "notes": "Optional. Yes or No."},
    {"key": "schedule_category", "header": "Schedule Category", "required": False, "width": 18, "example": "OTC", "notes": "Optional. OTC, Rx, Schedule H, Schedule H1, Schedule X, or Narcotic."},
    {"key": "minimum_stock_level", "header": "Minimum Stock Level", "required": False, "width": 19, "example": 50, "notes": "Optional. Whole number >= 0 (in base units)."},
    {"key": "reorder_level", "header": "Reorder Level", "required": False, "width": 15, "example": 100, "notes": "Optional. Whole number >= 0 (in base units)."},
    {"key": "description", "header": "Description", "required": False, "width": 30, "example": "Analgesic and antipyretic tablets.", "notes": "Optional. Storage or handling notes."},
]

SAMPLE_ROWS = [
    [
        "Paracetamol 500mg Tablets", 15, "tablet", 12, "Paracetamol", "Crocin Advance", "500 mg",
        "tablet", "Paracetamol IP 500mg", "GlaxoSmithKline", "otc_medicines",
        "MED-PARA-500", "8901030000001", "30049099", "strip", "No", "OTC", 30, 100,
        "Store in a cool dry place below 25C.",
    ],
    [
        "Amoxicillin 500mg Capsules", 10, "capsule", 12, "Amoxicillin Trihydrate", "Mox 500", "500 mg",
        "capsule", "Amoxicillin Trihydrate 500mg", "Sun Pharma", "prescription_medicines",
        "MED-AMOX-500", "8901030000002", "30041010", "strip", "Yes", "Schedule H1", 20, 60,
        "Dispense only against valid prescription; record Schedule H1 register.",
    ],
    [
        "Dextromethorphan Cough Syrup 100ml", 1, "bottle", 12, "Dextromethorphan Hydrobromide", "Benadryl DR", "10mg/5ml",
        "syrup", "Dextromethorphan 10mg + Chlorpheniramine 2mg", "Johnson & Johnson", "otc_medicines",
        "", "", "30049099", "bottle", "No", "OTC", 10, 25,
        "Shake well before use.",
    ],
]


def _normalize_header_token(text):
    if text is None:
        return ""
    s = str(text).strip().lower()
    s = s.replace("*", "").replace("(%)", "").replace("%", "")
    s = re.sub(r"[/&_\-\(\)\[\]]+", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s


HEADER_ALIASES = {
    "medicine name": "name",
    "product name": "name",
    "commercial name": "name",
    "name": "name",
    "units per pack": "conversion_factor",
    "unit per pack": "conversion_factor",
    "conversion factor": "conversion_factor",
    "pack size": "conversion_factor",
    "qty per pack": "conversion_factor",
    "base unit": "base_unit",
    "atomic unit": "base_unit",
    "stock unit": "base_unit",
    "gst rate": "gst_rate",
    "gst": "gst_rate",
    "gst percent": "gst_rate",
    "tax rate": "gst_rate",
    "generic name": "generic_name",
    "api": "generic_name",
    "brand name": "brand_name",
    "brand": "brand_name",
    "strength": "strength",
    "potency": "strength",
    "dosage form": "dosage_form",
    "form": "dosage_form",
    "composition": "composition",
    "salt composition": "composition",
    "manufacturer": "manufacturer",
    "company": "manufacturer",
    "pharma company": "manufacturer",
    "category": "category",
    "product category": "category",
    "sku product code": "sku",
    "sku": "sku",
    "product code": "sku",
    "item code": "sku",
    "barcode ean": "barcode",
    "barcode": "barcode",
    "ean": "barcode",
    "upc": "barcode",
    "gtin": "barcode",
    "hsn code": "hsn_code",
    "hsn": "hsn_code",
    "packing type": "packing_type",
    "pack type": "packing_type",
    "pack description": "packing_type",
    "sale unit": "packing_type",
    "prescription required": "prescription_required",
    "rx required": "prescription_required",
    "is rx": "prescription_required",
    "schedule category": "schedule_category",
    "schedule": "schedule_category",
    "prescription class": "schedule_category",
    "minimum stock level": "minimum_stock_level",
    "min stock level": "minimum_stock_level",
    "min stock": "minimum_stock_level",
    "reorder level": "reorder_level",
    "reorder qty": "reorder_level",
    "description": "description",
    "notes": "description",
}

MANDATORY_FIELDS = [
    ("name", "Medicine Name"),
    ("conversion_factor", "Units Per Pack"),
    ("base_unit", "Base Unit"),
    ("gst_rate", "GST Rate"),
]

UNIT_SYNONYMS = {
    "tab": "tablet", "tabs": "tablet", "tablets": "tablet", "tablet": "tablet",
    "cap": "capsule", "caps": "capsule", "capsules": "capsule", "capsule": "capsule",
    "strips": "strip", "strip": "strip",
    "bottles": "bottle", "btl": "bottle", "bottle": "bottle",
    "boxes": "box", "box": "box",
    "vials": "vial", "vial": "vial",
    "ampoules": "ampoule", "ampoule": "ampoule", "amp": "ampoule",
    "tubes": "tube", "tube": "tube",
    "pieces": "piece", "pcs": "piece", "pc": "piece", "piece": "piece",
    "packs": "pack", "pkt": "pack", "packet": "pack", "pack": "pack",
    "sachets": "sachet", "sachet": "sachet",
    "cans": "can", "can": "can",
    "jars": "jar", "jar": "jar",
    "kits": "kit", "kit": "kit",
    "ml": "ml", "milliliter": "ml", "milliliters": "ml",
    "gm": "gm", "g": "gm", "gram": "gm", "grams": "gm",
    "unit": "unit", "units": "unit", "nos": "unit", "no": "unit",
}

DOSAGE_FORM_SYNONYMS = {
    "tab": "tablet", "tabs": "tablet", "tablet": "tablet", "tablets": "tablet",
    "cap": "capsule", "caps": "capsule", "capsule": "capsule", "capsules": "capsule",
    "syrup": "syrup", "syrups": "syrup", "liquid": "syrup", "oral liquid": "syrup", "syrup liquid oral": "syrup",
    "suspension": "suspension", "susp": "suspension",
    "injection": "injection", "inj": "injection", "injectable": "injection",
    "ointment": "ointment", "cream": "ointment", "gel": "ointment", "ointment cream gel": "ointment",
    "drops": "drops", "drop": "drops", "eye drops": "drops", "ear drops": "drops", "nasal drops": "drops",
    "inhaler": "inhaler", "respules": "inhaler", "inhaler respules": "inhaler",
    "powder": "powder", "granules": "powder", "powder granules": "powder",
    "lotion": "lotion", "solution": "lotion", "lotion solution": "lotion",
    "spray": "spray",
    "suppository": "suppository",
    "patch": "patch", "transdermal patch": "patch",
    "device": "device", "sundry": "device", "device sundry": "device",
    "na": "na", "not applicable": "na", "n a": "na",
}

CATEGORY_SYNONYMS = {
    "prescription medicines": "prescription_medicines",
    "prescription": "prescription_medicines",
    "rx": "prescription_medicines",
    "otc medicines": "otc_medicines",
    "otc": "otc_medicines",
    "medical supplies devices": "healthcare_devices",
    "medical supplies & devices": "healthcare_devices",
    "healthcare devices": "healthcare_devices",
    "devices": "healthcare_devices",
    "personal care hygiene": "personal_care",
    "personal care & hygiene": "personal_care",
    "personal care": "personal_care",
    "baby mother care": "baby_care",
    "baby & mother care": "baby_care",
    "baby care": "baby_care",
    "vitamins supplements": "supplements_nutrition",
    "vitamins & supplements": "supplements_nutrition",
    "supplements": "supplements_nutrition",
    "supplements nutrition": "supplements_nutrition",
    "ayurvedic herbal": "ayurvedic_herbal",
    "ayurvedic & herbal": "ayurvedic_herbal",
    "ayurvedic": "ayurvedic_herbal",
    "surgical wound care": "surgical_supplies",
    "surgical & wound care": "surgical_supplies",
    "surgical supplies": "surgical_supplies",
    "surgical": "surgical_supplies",
    "diagnostic testing": "diagnostic_kits",
    "diagnostic & testing": "diagnostic_kits",
    "diagnostic kits": "diagnostic_kits",
    "general other": "other",
    "general": "other",
    "other": "other",
}
for k, v in Product.CATEGORY_CHOICES:
    CATEGORY_SYNONYMS[k.lower()] = k
    CATEGORY_SYNONYMS[_normalize_header_token(v)] = k

PRESCRIPTION_SYNONYMS = {
    "otc": "otc",
    "over the counter": "otc",
    "over the counter otc": "otc",
    "non rx": "otc",
    "rx": "rx_general",
    "rx general": "rx_general",
    "prescription": "rx_general",
    "prescription only": "rx_general",
    "prescription only rx": "rx_general",
    "schedule h": "schedule_h",
    "sch h": "schedule_h",
    "h": "schedule_h",
    "schedule h prescription required": "schedule_h",
    "schedule h1": "schedule_h1",
    "sch h1": "schedule_h1",
    "h1": "schedule_h1",
    "schedule x": "schedule_x",
    "sch x": "schedule_x",
    "x": "schedule_x",
    "narcotic": "narcotic",
    "ndps": "narcotic",
    "ndps controlled substance": "narcotic",
}
for k, v in Product.PRESCRIPTION_CLASS_CHOICES:
    PRESCRIPTION_SYNONYMS[k.lower()] = k
    PRESCRIPTION_SYNONYMS[_normalize_header_token(v)] = k


class ExcelValidationError(Exception):
    """Raised when the uploaded Excel file fails structural or size checks."""

    def __init__(self, message, details=None):
        super().__init__(message)
        self.message = message
        self.details = details or {}


def _clean_cell(value):
    if value is None:
        return ""
    if isinstance(value, bool):
        return "Yes" if value else "No"
    if isinstance(value, int):
        return str(value)
    if isinstance(value, float):
        if value.is_integer():
            return str(int(value))
        return str(value).strip()
    return str(value).strip()


def _parse_positive_int(raw_val, field_label, min_val=1, max_val=100000):
    if isinstance(raw_val, bool):
        return None, f"{field_label} must be a whole number."
    if isinstance(raw_val, int):
        num = raw_val
    elif isinstance(raw_val, float):
        if not raw_val.is_integer():
            return None, f"{field_label} must be a whole number (received '{raw_val}')."
        num = int(raw_val)
    else:
        txt = _clean_cell(raw_val)
        if not txt:
            return None, f"{field_label} is required." if min_val >= 1 else None
        if not re.match(r"^-?\d+$", txt):
            return None, f"{field_label} must be a whole number (received '{txt}')."
        num = int(txt)

    if num < min_val:
        return None, f"{field_label} must be at least {min_val}."
    if num > max_val:
        return None, f"{field_label} cannot exceed {max_val}."
    return num, None


def _parse_gst_rate(raw_val):
    if raw_val is None or _clean_cell(raw_val) == "":
        return None, "GST rate is required."
    if isinstance(raw_val, bool):
        return None, "GST rate must be a number (0, 5, 12, 18, or 28)."

    txt = _clean_cell(raw_val).replace("%", "").strip()
    try:
        dec = Decimal(txt).quantize(Decimal("0.01"))
    except (InvalidOperation, ValueError):
        return None, f"Invalid GST rate '{_clean_cell(raw_val)}'. Allowed values are 0%, 5%, 12%, 18%, or 28%."

    allowed = get_allowed_gst_rates()
    if dec not in allowed:
        allowed_str = ", ".join(f"{int(r) if r == int(r) else r}%" for r in sorted(allowed))
        return None, f"Invalid GST rate '{_clean_cell(raw_val)}'. Allowed values are: {allowed_str}."
    return dec, None


def _infer_packing(packing_raw, dosage_form, base_unit, conversion_factor):
    sale_unit = None
    pack_desc = _clean_cell(packing_raw)
    if pack_desc:
        token = _normalize_header_token(pack_desc)
        if token in UNIT_SYNONYMS:
            sale_unit = UNIT_SYNONYMS[token]
        else:
            for word, unit_key in UNIT_SYNONYMS.items():
                if re.search(rf"\b{re.escape(word)}\b", token):
                    sale_unit = unit_key
                    break
            if not sale_unit:
                sale_unit = "pack"
    else:
        if dosage_form in ("tablet", "capsule"):
            sale_unit = "strip"
        elif dosage_form in ("syrup", "suspension", "drops", "lotion"):
            sale_unit = "bottle"
        elif dosage_form in ("ointment",):
            sale_unit = "tube"
        elif base_unit in dict(Product.UNIT_CHOICES):
            sale_unit = base_unit
        else:
            sale_unit = "pack"
        pack_desc = f"{sale_unit.title()} of {conversion_factor} {base_unit}" if conversion_factor > 1 else sale_unit.title()

    return sale_unit, pack_desc[:255]


def _infer_item_type(category):
    if category == "healthcare_devices":
        return "device_equipment"
    if category == "supplements_nutrition":
        return "wellness_supplement"
    if category == "personal_care":
        return "personal_care"
    if category == "surgical_supplies":
        return "consumable"
    return "medicine"


def _medicine_identity_signature(name, strength, dosage_form, manufacturer):
    return (
        re.sub(r"\s+", " ", (name or "").strip().lower()),
        re.sub(r"\s+", "", (strength or "").strip().lower()),
        (dosage_form or "").strip().lower(),
        re.sub(r"\s+", " ", (manufacturer or "").strip().lower()),
    )


def build_medicine_template_workbook():
    """
    Build the standardized downloadable .xlsx template with sample rows and instructions.
    """
    wb = openpyxl.Workbook()

    # Sheet 1: Medicine Catalogue
    ws = wb.active
    ws.title = "Medicine Catalogue"
    ws.freeze_panes = "A2"

    header_fill = PatternFill(start_color="0F766E", end_color="0F766E", fill_type="solid")
    required_fill = PatternFill(start_color="115E59", end_color="115E59", fill_type="solid")
    header_font = Font(color="FFFFFF", bold=True, size=11)
    sample_fill = PatternFill(start_color="F8FAFC", end_color="F8FAFC", fill_type="solid")

    for col_idx, col_def in enumerate(TEMPLATE_COLUMNS, start=1):
        cell = ws.cell(row=1, column=col_idx, value=col_def["header"])
        cell.font = header_font
        cell.fill = required_fill if col_def["required"] else header_fill
        cell.alignment = Alignment(horizontal="left", vertical="center", wrap_text=True)
        ws.column_dimensions[get_column_letter(col_idx)].width = col_def["width"]
    ws.row_dimensions[1].height = 28

    for row_idx, sample_row in enumerate(SAMPLE_ROWS, start=2):
        for col_idx, val in enumerate(sample_row, start=1):
            cell = ws.cell(row=row_idx, column=col_idx, value=val)
            cell.fill = sample_fill
            cell.alignment = Alignment(vertical="center")

    # Sheet 2: Instructions & Allowed Values
    ws_info = wb.create_sheet(title="Instructions & Values")
    ws_info.freeze_panes = "A2"
    info_headers = ["Column Name", "Required?", "Example Value", "Rules & Allowed Values"]
    for col_idx, h in enumerate(info_headers, start=1):
        c = ws_info.cell(row=1, column=col_idx, value=h)
        c.font = header_font
        c.fill = header_fill
        c.alignment = Alignment(horizontal="left", vertical="center")
    ws_info.column_dimensions["A"].width = 24
    ws_info.column_dimensions["B"].width = 14
    ws_info.column_dimensions["C"].width = 28
    ws_info.column_dimensions["D"].width = 78

    for idx, col_def in enumerate(TEMPLATE_COLUMNS, start=2):
        ws_info.cell(row=idx, column=1, value=col_def["header"])
        ws_info.cell(row=idx, column=2, value="Required" if col_def["required"] else "Optional")
        ws_info.cell(row=idx, column=3, value=str(col_def["example"]))
        c4 = ws_info.cell(row=idx, column=4, value=col_def["notes"])
        c4.alignment = Alignment(wrap_text=True)

    output = io.BytesIO()
    wb.save(output)
    output.seek(0)
    return output.getvalue()


def build_import_error_report_workbook(import_batch):
    """
    Generate a downloadable .xlsx report containing original row numbers, explanations,
    and all uploaded columns for rows that failed validation or matched duplicates.
    """
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Rows to Review"
    ws.freeze_panes = "A2"

    payload = import_batch.preview_payload or {}
    issue_rows = payload.get("issue_rows") or []

    header_fill = PatternFill(start_color="BE123C", end_color="BE123C", fill_type="solid")
    header_font = Font(color="FFFFFF", bold=True, size=11)

    report_headers = ["Original Excel Row #", "Issue Type", "Reason / Fix Instructions"] + [
        col["header"] for col in TEMPLATE_COLUMNS
    ]

    for col_idx, h in enumerate(report_headers, start=1):
        cell = ws.cell(row=1, column=col_idx, value=h)
        cell.font = header_font
        cell.fill = header_fill
        cell.alignment = Alignment(horizontal="left", vertical="center", wrap_text=True)
        ws.column_dimensions[get_column_letter(col_idx)].width = 26 if col_idx <= 3 else 18
    ws.column_dimensions["C"].width = 48

    for row_idx, item in enumerate(issue_rows, start=2):
        ws.cell(row=row_idx, column=1, value=item.get("row_number"))
        ws.cell(row=row_idx, column=2, value=item.get("issue_type"))
        reason_cell = ws.cell(row=row_idx, column=3, value=item.get("reason"))
        reason_cell.alignment = Alignment(wrap_text=True)

        raw = item.get("raw_fields") or {}
        for offset, col in enumerate(TEMPLATE_COLUMNS, start=4):
            ws.cell(row=row_idx, column=offset, value=raw.get(col["key"], ""))

    output = io.BytesIO()
    wb.save(output)
    output.seek(0)
    return output.getvalue()


def _validate_and_load_workbook(uploaded_file):
    file_name = (getattr(uploaded_file, "name", "") or "catalogue.xlsx").strip()
    lower_name = file_name.lower()

    if lower_name.endswith(".xls"):
        raise ExcelValidationError(
            "Legacy .xls spreadsheets are not supported. Please save the file as .xlsx (Excel Workbook) and upload it again."
        )
    if not lower_name.endswith(".xlsx"):
        raise ExcelValidationError("Unsupported file format. Please upload an Excel .xlsx file.")

    max_bytes = getattr(settings, "PRODUCT_IMPORT_MAX_FILE_SIZE_BYTES", 5 * 1024 * 1024)
    declared_size = getattr(uploaded_file, "size", None)
    if declared_size is not None and declared_size > max_bytes:
        max_mb = round(max_bytes / (1024 * 1024), 1)
        raise ExcelValidationError(f"File is too large. Maximum allowed file size is {max_mb} MB.")

    raw_bytes = uploaded_file.read()
    if len(raw_bytes) == 0:
        raise ExcelValidationError("The uploaded Excel file is empty.")
    if len(raw_bytes) > max_bytes:
        max_mb = round(max_bytes / (1024 * 1024), 1)
        raise ExcelValidationError(f"File is too large. Maximum allowed file size is {max_mb} MB.")

    if raw_bytes.startswith(b"\xd0\xcf\x11\xe0"):
        raise ExcelValidationError(
            "Legacy .xls spreadsheets are not supported. Please save the file as .xlsx (Excel Workbook) and upload it again."
        )

    buf = io.BytesIO(raw_bytes)
    if not raw_bytes.startswith(b"PK\x03\x04") or not zipfile.is_zipfile(buf):
        raise ExcelValidationError(
            "The uploaded file is not a valid .xlsx Excel workbook."
        )

    try:
        buf.seek(0)
        with zipfile.ZipFile(buf, "r") as zf:
            names = set(zf.namelist())
            if "[Content_Types].xml" not in names or "xl/workbook.xml" not in names:
                raise ExcelValidationError(
                    "The uploaded file is not a valid .xlsx Excel workbook."
                )
    except ExcelValidationError:
        raise
    except Exception:
        raise ExcelValidationError(
            "The uploaded file is not a valid .xlsx Excel workbook."
        )

    file_hash = hashlib.sha256(raw_bytes).hexdigest()

    try:
        buf.seek(0)
        wb = openpyxl.load_workbook(buf, read_only=True, data_only=True)
    except Exception:
        raise ExcelValidationError("Unable to read this .xlsx file. Ensure it is a valid, uncorrupted Excel workbook.")

    return file_name, file_hash, wb


def _parse_header_row(ws):
    rows_iter = ws.iter_rows(values_only=True)
    try:
        raw_header = next(rows_iter)
    except StopIteration:
        raise ExcelValidationError("The Excel worksheet is empty. Download the sample Excel file to see the expected format.")

    col_index_to_field = {}
    seen_fields = {}
    duplicate_columns = []

    for idx, cell_val in enumerate(raw_header):
        header_text = _clean_cell(cell_val)
        if not header_text:
            continue
        token = _normalize_header_token(header_text)
        canonical = HEADER_ALIASES.get(token)
        if not canonical:
            continue
        if canonical in seen_fields:
            duplicate_columns.append(header_text)
        else:
            seen_fields[canonical] = header_text
            col_index_to_field[idx] = canonical

    if duplicate_columns:
        cols_str = ", ".join(duplicate_columns)
        raise ExcelValidationError(
            f"Duplicate columns found in Excel header: {cols_str}. Keep only one column for each medicine field.",
            details={"duplicate_columns": duplicate_columns},
        )

    missing = [label for field, label in MANDATORY_FIELDS if field not in seen_fields]
    if missing:
        raise ExcelValidationError(
            f"Missing required column(s): {', '.join(missing)}.",
            details={"missing_columns": missing},
        )

    return col_index_to_field, rows_iter


def _parse_single_row(raw_fields):
    errors = []

    name = _clean_cell(raw_fields.get("name"))
    if not name:
        errors.append("Medicine name is required.")
    elif len(name) > 255:
        errors.append("Medicine name cannot exceed 255 characters.")

    conv_factor, conv_err = _parse_positive_int(
        raw_fields.get("conversion_factor"), "Units per pack", min_val=1, max_val=100000
    )
    if conv_err:
        errors.append(conv_err)

    base_unit_raw = _clean_cell(raw_fields.get("base_unit"))
    if not base_unit_raw:
        errors.append("Base unit is required.")
        base_unit = ""
    else:
        base_unit = UNIT_SYNONYMS.get(_normalize_header_token(base_unit_raw))
        if not base_unit:
            errors.append(f"Invalid base unit '{base_unit_raw}'. Use values like tablet, capsule, strip, bottle, box, ml, or gm.")

    gst_dec, gst_err = _parse_gst_rate(raw_fields.get("gst_rate"))
    if gst_err:
        errors.append(gst_err)

    generic_name = _clean_cell(raw_fields.get("generic_name"))[:255]
    brand_name = _clean_cell(raw_fields.get("brand_name"))[:255]
    strength = _clean_cell(raw_fields.get("strength"))[:100]
    composition = _clean_cell(raw_fields.get("composition"))[:500]
    manufacturer = _clean_cell(raw_fields.get("manufacturer"))[:255]
    description = _clean_cell(raw_fields.get("description"))

    dosage_raw = _clean_cell(raw_fields.get("dosage_form"))
    if not dosage_raw:
        dosage_form = "tablet"
    else:
        dosage_form = DOSAGE_FORM_SYNONYMS.get(_normalize_header_token(dosage_raw))
        if not dosage_form:
            errors.append(f"Invalid dosage form '{dosage_raw}'.")
            dosage_form = "tablet"

    category_raw = _clean_cell(raw_fields.get("category"))
    if not category_raw:
        category = "prescription_medicines"
    else:
        category = CATEGORY_SYNONYMS.get(_normalize_header_token(category_raw))
        if not category:
            errors.append(f"Invalid category '{category_raw}'.")
            category = "prescription_medicines"

    sku = _clean_cell(raw_fields.get("sku")).upper()
    if sku:
        if len(sku) > 100 or not re.match(r"^[A-Z0-9][A-Z0-9\-_/.]*$", sku):
            errors.append(f"Invalid SKU '{sku}'. Use letters, numbers, '-', '_', '.', or '/' without spaces.")

    barcode = _clean_cell(raw_fields.get("barcode"))
    if barcode:
        if len(barcode) < 3 or len(barcode) > 100 or not re.match(r"^[A-Za-z0-9\-_]+$", barcode):
            errors.append(f"Invalid barcode '{barcode}'. Must be 3-100 characters without spaces.")

    hsn_code = _clean_cell(raw_fields.get("hsn_code"))
    if hsn_code:
        if len(hsn_code) > 50 or not re.match(r"^[0-9]{4,8}$", hsn_code):
            errors.append(f"Invalid HSN code '{hsn_code}'. Enter a 4 to 8 digit numeric HSN code.")

    rx_raw = _clean_cell(raw_fields.get("prescription_required"))
    rx_bool = None
    if rx_raw:
        rx_tok = _normalize_header_token(rx_raw)
        if rx_tok in ("yes", "y", "true", "1", "rx", "required"):
            rx_bool = True
        elif rx_tok in ("no", "n", "false", "0", "otc"):
            rx_bool = False
        else:
            errors.append(f"Invalid 'Prescription Required' value '{rx_raw}'. Use Yes or No.")

    sched_raw = _clean_cell(raw_fields.get("schedule_category"))
    prescription_class = None
    if sched_raw:
        prescription_class = PRESCRIPTION_SYNONYMS.get(_normalize_header_token(sched_raw))
        if not prescription_class:
            errors.append(f"Invalid schedule category '{sched_raw}'. Use OTC, Rx, Schedule H, Schedule H1, Schedule X, or Narcotic.")

    if prescription_class is None:
        prescription_class = "rx_general" if rx_bool is True else "otc"
    else:
        if rx_bool is False and prescription_class != "otc":
            errors.append("Schedule category requires a prescription, which conflicts with 'Prescription Required = No'.")
        elif rx_bool is True and prescription_class == "otc":
            errors.append("OTC schedule conflicts with 'Prescription Required = Yes'.")

    min_stock = None
    if _clean_cell(raw_fields.get("minimum_stock_level")) != "":
        min_stock, min_err = _parse_positive_int(
            raw_fields.get("minimum_stock_level"), "Minimum stock level", min_val=0, max_val=10000000
        )
        if min_err:
            errors.append(min_err)

    reorder_lvl = None
    if _clean_cell(raw_fields.get("reorder_level")) != "":
        reorder_lvl, re_err = _parse_positive_int(
            raw_fields.get("reorder_level"), "Reorder level", min_val=0, max_val=10000000
        )
        if re_err:
            errors.append(re_err)

    sale_unit, pack_description = _infer_packing(
        raw_fields.get("packing_type"), dosage_form, base_unit or "unit", conv_factor or 1
    )

    item_type = _infer_item_type(category)
    if item_type != "medicine" and not dosage_raw:
        dosage_form = "na"

    normalized = {
        "name": name,
        "brand_name": brand_name,
        "generic_name": generic_name,
        "composition": composition,
        "sku": sku,
        "barcode": barcode,
        "hsn_code": hsn_code,
        "item_type": item_type,
        "category": category,
        "manufacturer": manufacturer,
        "strength": strength,
        "dosage_form": dosage_form,
        "prescription_class": prescription_class,
        "is_narcotic": prescription_class == "narcotic",
        "pack_description": pack_description,
        "base_unit": base_unit or "tablet",
        "sale_unit": sale_unit,
        "conversion_factor": conv_factor or 1,
        "is_loose_dispensing_allowed": (conv_factor or 1) > 1,
        "gst_rate": str(gst_dec) if gst_dec is not None else "12.00",
        "minimum_stock_level": min_stock,
        "reorder_level": reorder_lvl,
        "description": description,
    }
    return normalized, errors


def parse_and_preview_catalogue_excel(organization, user, uploaded_file):
    """
    Validate and preview an uploaded .xlsx medicine catalogue for an organization.
    Returns the persisted ProductImportBatch and serialized preview payload.
    """
    file_name, file_hash, wb = _validate_and_load_workbook(uploaded_file)

    try:
        ws = wb["Medicine Catalogue"] if "Medicine Catalogue" in wb.sheetnames else wb.active
        col_map, rows_iter = _parse_header_row(ws)

        max_rows = getattr(settings, "PRODUCT_IMPORT_MAX_ROWS", 5000)

        # Snapshot existing org medicines once in memory for fast O(1) duplicate checks
        existing_products = Product.objects.filter(organization=organization).only(
            "id", "name", "sku", "barcode", "strength", "dosage_form", "manufacturer"
        )
        db_skus = {}
        db_barcodes = {}
        db_identities = {}
        for p in existing_products:
            db_skus[p.sku.upper()] = {"id": str(p.id), "name": p.name, "sku": p.sku}
            if p.barcode:
                db_barcodes[p.barcode] = {"id": str(p.id), "name": p.name, "sku": p.sku}
            sig = _medicine_identity_signature(p.name, p.strength, p.dosage_form, p.manufacturer)
            db_identities.setdefault(sig, {"id": str(p.id), "name": p.name, "sku": p.sku})

        file_skus = {}
        file_barcodes = {}
        file_identities = {}

        valid_ready_rows = []
        preview_rows = []
        issue_rows = []
        valid_count = 0
        invalid_count = 0
        duplicate_count = 0
        non_empty_row_count = 0

        for excel_row_num, row_tuple in enumerate(rows_iter, start=2):
            raw_fields = {}
            has_any_value = False
            for col_idx, field_key in col_map.items():
                val = row_tuple[col_idx] if col_idx < len(row_tuple) else None
                cleaned = _clean_cell(val)
                if cleaned != "":
                    has_any_value = True
                raw_fields[field_key] = val if val is not None else ""

            if not has_any_value:
                continue

            non_empty_row_count += 1
            if non_empty_row_count > max_rows:
                raise ExcelValidationError(
                    f"Too many rows in Excel file ({non_empty_row_count}+). Maximum allowed per upload is {max_rows} medicines."
                )

            normalized, row_errors = _validate_row_and_capture(raw_fields, excel_row_num)
            raw_serializable = {k: _clean_cell(v) for k, v in raw_fields.items()}

            if row_errors:
                invalid_count += 1
                reason_text = "; ".join(row_errors)
                row_entry = {
                    "row_number": excel_row_num,
                    "status": "INVALID",
                    "issue_type": "Validation Error",
                    "reason": reason_text,
                    "errors": row_errors,
                    **normalized,
                }
                preview_rows.append(row_entry)
                issue_rows.append(
                    {
                        "row_number": excel_row_num,
                        "issue_type": "Validation Error",
                        "reason": reason_text,
                        "raw_fields": raw_serializable,
                    }
                )
                continue

            valid_count += 1

            # Duplicate Detection (Organization DB + within uploaded Excel file)
            dup_reasons = []
            sku = normalized["sku"]
            barcode = normalized["barcode"]
            sig = _medicine_identity_signature(
                normalized["name"],
                normalized["strength"],
                normalized["dosage_form"],
                normalized["manufacturer"],
            )

            if sku:
                if sku in db_skus:
                    existing = db_skus[sku]
                    dup_reasons.append(f"SKU '{sku}' already exists for '{existing['name']}'.")
                elif sku in file_skus:
                    dup_reasons.append(f"Duplicate SKU '{sku}' already appears on row {file_skus[sku]} of this file.")

            if barcode:
                if barcode in db_barcodes:
                    existing = db_barcodes[barcode]
                    dup_reasons.append(f"Barcode '{barcode}' already belongs to '{existing['name']}' ({existing['sku']}).")
                elif barcode in file_barcodes:
                    dup_reasons.append(f"Duplicate barcode '{barcode}' already appears on row {file_barcodes[barcode]} of this file.")

            if sig in db_identities:
                existing = db_identities[sig]
                dup_reasons.append(
                    f"Possible duplicate: '{existing['name']}' ({existing['sku']}) with the same name, strength, form, and manufacturer is already in your catalogue."
                )
            elif sig in file_identities:
                dup_reasons.append(
                    f"Possible duplicate: matches row {file_identities[sig]} in this uploaded file."
                )

            if dup_reasons:
                duplicate_count += 1
                reason_text = " ".join(dup_reasons)
                preview_rows.append(
                    {
                        "row_number": excel_row_num,
                        "status": "DUPLICATE",
                        "issue_type": "Possible Duplicate",
                        "reason": reason_text,
                        "errors": [],
                        **normalized,
                    }
                )
                issue_rows.append(
                    {
                        "row_number": excel_row_num,
                        "issue_type": "Possible Duplicate",
                        "reason": reason_text,
                        "raw_fields": raw_serializable,
                    }
                )
                continue

            if sku:
                file_skus[sku] = excel_row_num
            if barcode:
                file_barcodes[barcode] = excel_row_num
            file_identities[sig] = excel_row_num

            valid_ready_rows.append({"row_number": excel_row_num, **normalized})
            preview_rows.append(
                {
                    "row_number": excel_row_num,
                    "status": "READY",
                    "issue_type": "",
                    "reason": "",
                    "errors": [],
                    **normalized,
                }
            )
    finally:
        wb.close()

    if non_empty_row_count == 0:
        raise ExcelValidationError("The uploaded Excel file contains headers only and no medicine rows.")

    ready_count = len(valid_ready_rows)

    batch = ProductImportBatch.objects.create(
        organization=organization,
        uploaded_by=user,
        file_name=file_name[:255],
        file_hash=file_hash,
        status="PREVIEWED",
        total_rows=non_empty_row_count,
        valid_rows=valid_count,
        invalid_rows=invalid_count,
        duplicate_rows=duplicate_count,
        ready_rows=ready_count,
        preview_payload={
            "valid_ready_rows": valid_ready_rows,
            "issue_rows": issue_rows,
        },
    )

    return batch, {
        "batch_id": str(batch.id),
        "file_name": batch.file_name,
        "summary": {
            "total_rows": non_empty_row_count,
            "valid_rows": valid_count,
            "invalid_rows": invalid_count,
            "duplicate_rows": duplicate_count,
            "ready_to_import": ready_count,
        },
        "rows": preview_rows,
    }


def _validate_row_and_capture(raw_fields, excel_row_num):
    return _parse_single_row(raw_fields)


def execute_catalogue_import(organization, user, batch_id, idempotency_key=None, request=None, batch_size=None):
    """
    Commit validated medicine rows for a previewed ProductImportBatch.
    - Serializes concurrent imports per organization via Organization row lock.
    - Enforces idempotent retries with Idempotency-Key.
    - Re-checks duplicates inside atomic transaction; never overwrites existing records.
    - Uses bounded batch inserts and creates NO inventory stock/batch/movement rows.
    """
    clean_key = (idempotency_key or "").strip()[:128] or None
    chunk_size = int(batch_size or getattr(settings, "PRODUCT_IMPORT_BATCH_SIZE", 250))

    if clean_key:
        prior = ProductImportBatch.objects.filter(
            organization=organization,
            idempotency_key=clean_key,
            status="COMPLETED",
        ).first()
        if prior:
            return prior, prior.result_summary, True

    batch = ProductImportBatch.objects.filter(id=batch_id, organization=organization).first()
    if not batch:
        raise ExcelValidationError("Import session not found for your pharmacy organization.")

    try:
        with transaction.atomic():
            # Lock the organization row to serialize concurrent imports for the same tenant
            Organization.objects.select_for_update().get(pk=organization.pk)
            locked_batch = ProductImportBatch.objects.select_for_update().get(pk=batch.pk)

            if locked_batch.status == "COMPLETED":
                return locked_batch, locked_batch.result_summary, True

            if clean_key:
                locked_batch.idempotency_key = clean_key

            ready_rows = (locked_batch.preview_payload or {}).get("valid_ready_rows") or []

            # Re-check current database state inside lock against concurrent commits
            live_products = Product.objects.filter(organization=organization).only(
                "sku", "barcode", "name", "strength", "dosage_form", "manufacturer"
            )
            live_skus = {p.sku.upper() for p in live_products}
            live_barcodes = {p.barcode for p in live_products if p.barcode}
            live_sigs = {
                _medicine_identity_signature(p.name, p.strength, p.dosage_form, p.manufacturer)
                for p in live_products
            }

            to_create = []
            concurrent_skipped = []

            for row in ready_rows:
                sku = (row.get("sku") or "").strip().upper()
                barcode = (row.get("barcode") or "").strip()
                sig = _medicine_identity_signature(
                    row.get("name"), row.get("strength"), row.get("dosage_form"), row.get("manufacturer")
                )

                if (sku and sku in live_skus) or (barcode and barcode in live_barcodes) or (sig in live_sigs):
                    concurrent_skipped.append(
                        {
                            "row_number": row.get("row_number"),
                            "name": row.get("name"),
                            "reason": "Skipped because a matching medicine was added while this import was prepared.",
                        }
                    )
                    continue

                if not sku:
                    sku = generate_unique_org_sku(organization, row.get("name", "MED"), reserved_skus=live_skus)
                else:
                    live_skus.add(sku)

                if barcode:
                    live_barcodes.add(barcode)
                live_sigs.add(sig)

                to_create.append(
                    Product(
                        id=uuid.uuid4(),
                        organization=organization,
                        name=row["name"],
                        brand_name=row.get("brand_name", ""),
                        generic_name=row.get("generic_name", ""),
                        composition=row.get("composition", ""),
                        sku=sku,
                        barcode=barcode,
                        hsn_code=row.get("hsn_code", ""),
                        item_type=row.get("item_type", "medicine"),
                        category=row.get("category", "prescription_medicines"),
                        manufacturer=row.get("manufacturer", ""),
                        strength=row.get("strength", ""),
                        dosage_form=row.get("dosage_form", "tablet"),
                        prescription_class=row.get("prescription_class", "otc"),
                        is_narcotic=bool(row.get("is_narcotic", False)),
                        pack_description=row.get("pack_description", ""),
                        base_unit=row.get("base_unit", "tablet"),
                        sale_unit=row.get("sale_unit", "strip"),
                        conversion_factor=int(row.get("conversion_factor") or 1),
                        is_loose_dispensing_allowed=bool(row.get("is_loose_dispensing_allowed", True)),
                        gst_rate=Decimal(str(row.get("gst_rate", "12.00"))),
                        minimum_stock_level=row.get("minimum_stock_level"),
                        reorder_level=row.get("reorder_level"),
                        description=row.get("description", ""),
                        is_active=True,
                        created_by=user,
                        updated_by=user,
                    )
                )

            if not to_create:
                locked_batch.status = "COMPLETED"
                locked_batch.imported_count = 0
                locked_batch.skipped_duplicate_count = locked_batch.duplicate_rows + len(concurrent_skipped)
                locked_batch.failed_count = locked_batch.invalid_rows
                locked_batch.completed_at = timezone.now()
                summary = {
                    "batch_id": str(locked_batch.id),
                    "file_name": locked_batch.file_name,
                    "imported_count": 0,
                    "skipped_duplicate_count": locked_batch.skipped_duplicate_count,
                    "failed_count": locked_batch.invalid_rows,
                    "concurrent_skipped": concurrent_skipped,
                }
                locked_batch.result_summary = summary
                locked_batch.save()
                return locked_batch, summary, False

            # Bounded batch insert inside single atomic transaction
            for start in range(0, len(to_create), chunk_size):
                chunk = to_create[start : start + chunk_size]
                Product.objects.bulk_create(chunk)

            total_skipped_dups = locked_batch.duplicate_rows + len(concurrent_skipped)
            summary = {
                "batch_id": str(locked_batch.id),
                "file_name": locked_batch.file_name,
                "imported_count": len(to_create),
                "skipped_duplicate_count": total_skipped_dups,
                "failed_count": locked_batch.invalid_rows,
                "concurrent_skipped": concurrent_skipped,
                "batches_processed": (len(to_create) + chunk_size - 1) // chunk_size,
            }

            locked_batch.status = "COMPLETED"
            locked_batch.imported_count = len(to_create)
            locked_batch.skipped_duplicate_count = total_skipped_dups
            locked_batch.failed_count = locked_batch.invalid_rows
            locked_batch.result_summary = summary
            locked_batch.completed_at = timezone.now()
            locked_batch.save()

            AuditEvent.log_event(
                event_type="PRODUCT_BULK_IMPORTED",
                request=request,
                user=user,
                organization=organization,
                details={
                    "batch_id": str(locked_batch.id),
                    "file_name": locked_batch.file_name,
                    "imported_count": len(to_create),
                    "skipped_duplicate_count": total_skipped_dups,
                    "invalid_rows": locked_batch.invalid_rows,
                },
            )
            return locked_batch, summary, False
    except IntegrityError as exc:
        # Handle idempotency race or DB constraint unexpectedly tripping after atomic rollback
        if clean_key:
            prior = ProductImportBatch.objects.filter(
                organization=organization,
                idempotency_key=clean_key,
                status="COMPLETED",
            ).first()
            if prior:
                return prior, prior.result_summary, True
        ProductImportBatch.objects.filter(pk=batch.pk).exclude(status="COMPLETED").update(
            status="FAILED",
            error_message=str(exc),
        )
        raise ExcelValidationError("Import could not be completed due to conflicting data. No medicines were partially added.")
    except Exception as exc:
        ProductImportBatch.objects.filter(pk=batch.pk).exclude(status="COMPLETED").update(
            status="FAILED",
            error_message=str(exc),
        )
        raise
