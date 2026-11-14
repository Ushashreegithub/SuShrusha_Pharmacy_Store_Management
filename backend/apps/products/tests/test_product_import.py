import io
import uuid
import zipfile
from decimal import Decimal
from unittest.mock import patch

import openpyxl
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient

from apps.audit.models import AuditEvent
from apps.authentication.models import User
from apps.billing.models import Invoice, Payment
from apps.inventory.models import (
    Batch,
    BatchInwardCostLayer,
    GoodsReceipt,
    StockMovement,
    StoreBatchStock,
)
from apps.organizations.models import (
    Organization,
    OrganizationMembership,
    Store,
    StoreMembership,
)
from apps.products.models import Product, ProductImportBatch


def _build_xlsx_bytes(headers, rows, sheet_name="Medicine Catalogue"):
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = sheet_name
    ws.append(headers)
    for r in rows:
        ws.append(r)
    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return buf.getvalue()


class ProductExcelImportTestCase(TestCase):
    def setUp(self):
        self.client = APIClient()

        # Organization A
        self.owner_a = User.objects.create_user(
            email="owner.import.a@pharmapro.com",
            password="StrongPassword@2026",
            full_name="Owner Alpha",
            phone_number="+91 98000 00001",
            is_email_verified=True,
        )
        self.org_a = Organization.objects.create(name="Alpha Pharmacy", owner=self.owner_a)
        OrganizationMembership.objects.create(
            organization=self.org_a, user=self.owner_a, role="owner", is_active=True
        )
        self.store_a = Store.objects.create(
            organization=self.org_a, name="Alpha Main Store", code="ALP-01", status="active"
        )

        self.manager_a = User.objects.create_user(
            email="manager.import.a@pharmapro.com",
            password="StrongPassword@2026",
            full_name="Manager Alpha",
            phone_number="+91 98000 00002",
            is_email_verified=True,
        )
        StoreMembership.objects.create(
            store=self.store_a, user=self.manager_a, role="manager", is_active=True
        )

        self.pharmacist_a = User.objects.create_user(
            email="pharmacist.import.a@pharmapro.com",
            password="StrongPassword@2026",
            full_name="Pharmacist Alpha",
            phone_number="+91 98000 00003",
            is_email_verified=True,
        )
        StoreMembership.objects.create(
            store=self.store_a, user=self.pharmacist_a, role="pharmacist", is_active=True
        )

        self.cashier_a = User.objects.create_user(
            email="cashier.import.a@pharmapro.com",
            password="StrongPassword@2026",
            full_name="Cashier Alpha",
            phone_number="+91 98000 00004",
            is_email_verified=True,
        )
        StoreMembership.objects.create(
            store=self.store_a, user=self.cashier_a, role="cashier", is_active=True
        )

        # Organization B
        self.owner_b = User.objects.create_user(
            email="owner.import.b@pharmapro.com",
            password="StrongPassword@2026",
            full_name="Owner Beta",
            phone_number="+91 98000 00005",
            is_email_verified=True,
        )
        self.org_b = Organization.objects.create(name="Beta Pharmacy", owner=self.owner_b)
        OrganizationMembership.objects.create(
            organization=self.org_b, user=self.owner_b, role="owner", is_active=True
        )

        # Existing medicine in Org A
        self.existing_med = Product.objects.create(
            organization=self.org_a,
            name="Paracetamol 500mg Tablets",
            brand_name="Crocin Advance",
            generic_name="Paracetamol",
            composition="Paracetamol IP 500mg",
            sku="MED-PARA-EXIST",
            barcode="8901111111111",
            hsn_code="30049099",
            category="otc_medicines",
            item_type="medicine",
            manufacturer="GlaxoSmithKline",
            strength="500 mg",
            dosage_form="tablet",
            prescription_class="otc",
            pack_description="Strip of 15 tablets",
            base_unit="tablet",
            sale_unit="strip",
            conversion_factor=15,
            gst_rate=Decimal("12.00"),
            is_active=True,
            created_by=self.owner_a,
        )

        self.template_url = reverse("product-import-template")
        self.preview_url = reverse("product-import-preview")
        self.confirm_url = reverse("product-import-confirm")
        self.list_url = reverse("product-list-create")

    def _upload_file(self, content, filename="medicines.xlsx", content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"):
        f = SimpleUploadedFile(filename, content, content_type=content_type)
        return self.client.post(self.preview_url, {"file": f}, format="multipart")

    def test_download_template_returns_valid_xlsx_with_samples(self):
        self.client.force_authenticate(user=self.owner_a)
        res = self.client.get(self.template_url)
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertIn("spreadsheetml.sheet", res["Content-Type"])

        wb = openpyxl.load_workbook(io.BytesIO(res.content))
        self.assertIn("Medicine Catalogue", wb.sheetnames)
        self.assertIn("Instructions & Values", wb.sheetnames)
        ws = wb["Medicine Catalogue"]
        headers = [ws.cell(1, c).value for c in range(1, 21)]
        self.assertIn("Medicine Name *", headers)
        self.assertIn("Units Per Pack *", headers)
        self.assertIn("Base Unit *", headers)
        self.assertIn("GST Rate (%) *", headers)
        self.assertGreaterEqual(ws.max_row, 4)

    def test_unauthorized_roles_rejected_for_import_endpoints(self):
        xlsx = _build_xlsx_bytes(
            ["Medicine Name", "Units Per Pack", "Base Unit", "GST Rate"],
            [["Cetirizine 10mg", 10, "tablet", 12]],
        )
        for denied_user in (self.pharmacist_a, self.cashier_a):
            self.client.force_authenticate(user=denied_user)
            self.assertEqual(self.client.get(self.template_url).status_code, status.HTTP_403_FORBIDDEN)
            self.assertEqual(self._upload_file(xlsx).status_code, status.HTTP_403_FORBIDDEN)
            self.assertEqual(
                self.client.post(self.confirm_url, {"batch_id": str(uuid.uuid4())}, format="json").status_code,
                status.HTTP_403_FORBIDDEN,
            )

    def test_successful_excel_import_and_zero_stock_boundary(self):
        self.client.force_authenticate(user=self.manager_a)
        xlsx = _build_xlsx_bytes(
            [
                "Medicine Name *",
                "Units Per Pack *",
                "Base Unit *",
                "GST Rate (%) *",
                "Generic Name",
                "Brand Name",
                "Strength",
                "Dosage Form",
                "Composition",
                "Manufacturer",
                "Category",
                "SKU / Product Code",
                "Barcode / EAN",
                "HSN Code",
                "Packing Type",
                "Prescription Required",
                "Schedule Category",
                "Minimum Stock Level",
                "Reorder Level",
                "Description",
            ],
            [
                [
                    "Azithromycin 500mg Tablets", 5, "tablet", 12,
                    "Azithromycin", "Azithral 500", "500 mg", "tablet",
                    "Azithromycin Dihydrate IP 500mg", "Alembic", "prescription_medicines",
                    "MED-AZI-500", 8901234567890, 30042099, "strip", "Yes", "Schedule H1",
                    25, 60, "Course of 5 tablets.",
                ],
                [
                    "Zinc Vitamin Syrup 200ml", 1, "bottle", "5%",
                    "Multivitamin", "Zincovit", "200ml", "syrup",
                    "Zinc + Multivitamins", "Apex Labs", "Supplements & Nutrition",
                    "", "", "", "bottle", "No", "OTC",
                    10, 20, "",
                ],
            ],
        )

        preview_res = self._upload_file(xlsx)
        self.assertEqual(preview_res.status_code, status.HTTP_200_OK)
        self.assertEqual(preview_res.data["summary"]["total_rows"], 2)
        self.assertEqual(preview_res.data["summary"]["ready_to_import"], 2)
        self.assertEqual(preview_res.data["summary"]["invalid_rows"], 0)
        self.assertEqual(preview_res.data["summary"]["duplicate_rows"], 0)

        confirm_res = self.client.post(
            self.confirm_url,
            {"batch_id": preview_res.data["batch_id"]},
            format="json",
            HTTP_IDEMPOTENCY_KEY=str(uuid.uuid4()),
        )
        self.assertEqual(confirm_res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(confirm_res.data["imported_count"], 2)
        self.assertFalse(confirm_res.data["idempotent_replay"])

        azi = Product.objects.get(organization=self.org_a, sku="MED-AZI-500")
        self.assertEqual(azi.barcode, "8901234567890")
        self.assertEqual(azi.composition, "Azithromycin Dihydrate IP 500mg")
        self.assertEqual(azi.minimum_stock_level, 25)
        self.assertEqual(azi.reorder_level, 60)
        self.assertEqual(azi.prescription_class, "schedule_h1")
        self.assertEqual(azi.created_by, self.manager_a)

        zinc = Product.objects.get(organization=self.org_a, name="Zinc Vitamin Syrup 200ml")
        self.assertTrue(zinc.sku.startswith("MED-"))
        self.assertEqual(zinc.gst_rate, Decimal("5.00"))
        self.assertEqual(zinc.item_type, "wellness_supplement")

        # Immediately searchable in product catalog API
        list_res = self.client.get(f"{self.list_url}?search=Azithromycin+Dihydrate")
        self.assertEqual(list_res.status_code, status.HTTP_200_OK)
        self.assertEqual(list_res.data["count"], 1)

        # Audit event logged
        audit = AuditEvent.objects.filter(
            organization=self.org_a, event_type="PRODUCT_BULK_IMPORTED"
        ).first()
        self.assertIsNotNone(audit)
        self.assertEqual(audit.details["imported_count"], 2)

        # Strictly Catalogue Only — ZERO inventory or billing records created
        self.assertEqual(Batch.objects.count(), 0)
        self.assertEqual(StoreBatchStock.objects.count(), 0)
        self.assertEqual(StockMovement.objects.count(), 0)
        self.assertEqual(GoodsReceipt.objects.count(), 0)
        self.assertEqual(BatchInwardCostLayer.objects.count(), 0)
        self.assertEqual(Invoice.objects.count(), 0)
        self.assertEqual(Payment.objects.count(), 0)

    def test_large_catalogue_import_550_rows_bounded_batches(self):
        self.client.force_authenticate(user=self.owner_a)
        rows = [
            [f"Bulk Medicine {i}", 10, "tablet", 12, f"API {i}", f"SKU-BULK-{i:04d}"]
            for i in range(1, 551)
        ]
        xlsx = _build_xlsx_bytes(
            ["Medicine Name", "Units Per Pack", "Base Unit", "GST Rate", "Generic Name", "SKU"],
            rows,
        )
        preview_res = self._upload_file(xlsx)
        self.assertEqual(preview_res.status_code, status.HTTP_200_OK)
        self.assertEqual(preview_res.data["summary"]["total_rows"], 550)
        self.assertEqual(preview_res.data["summary"]["ready_to_import"], 550)

        confirm_res = self.client.post(
            self.confirm_url,
            {"batch_id": preview_res.data["batch_id"]},
            format="json",
            HTTP_IDEMPOTENCY_KEY=str(uuid.uuid4()),
        )
        self.assertEqual(confirm_res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(confirm_res.data["imported_count"], 550)
        self.assertEqual(confirm_res.data["batches_processed"], 3)
        self.assertEqual(Product.objects.filter(organization=self.org_a, sku__startswith="SKU-BULK-").count(), 550)
        self.assertEqual(Batch.objects.count(), 0)
        self.assertEqual(StockMovement.objects.count(), 0)

    def test_missing_mandatory_column_and_duplicate_column_rejected(self):
        self.client.force_authenticate(user=self.owner_a)

        # Missing GST Rate column
        missing_col_xlsx = _build_xlsx_bytes(
            ["Medicine Name", "Units Per Pack", "Base Unit"],
            [["Test Med", 10, "tablet"]],
        )
        res_missing = self._upload_file(missing_col_xlsx)
        self.assertEqual(res_missing.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("GST Rate", res_missing.data["detail"])

        # Duplicate SKU columns
        dup_col_xlsx = _build_xlsx_bytes(
            ["Medicine Name", "Units Per Pack", "Base Unit", "GST Rate", "SKU", "Product Code"],
            [["Test Med", 10, "tablet", 12, "A1", "A2"]],
        )
        res_dup_col = self._upload_file(dup_col_xlsx)
        self.assertEqual(res_dup_col.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("Duplicate columns", res_dup_col.data["detail"])

    def test_legacy_xls_spoofed_xlsx_and_configurable_limits_rejected(self):
        self.client.force_authenticate(user=self.owner_a)

        res_xls = self._upload_file(b"\xd0\xcf\x11\xe0dummy", filename="old_catalog.xls")
        self.assertEqual(res_xls.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn(".xlsx", res_xls.data["detail"])

        # Spoofed CSV/plain text renamed to .xlsx must be rejected by real format check
        res_fake_csv = self._upload_file(b"Medicine Name,Units Per Pack\nMed,10\n", filename="fake.xlsx")
        self.assertEqual(res_fake_csv.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("valid .xlsx", res_fake_csv.data["detail"])

        # Binary .xls renamed to .xlsx must be rejected cleanly
        res_fake_xls = self._upload_file(b"\xd0\xcf\x11\xe0dummy_binary_xls", filename="renamed_xls.xlsx")
        self.assertEqual(res_fake_xls.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn(".xlsx", res_fake_xls.data["detail"])

        # Plain ZIP archive without xl/workbook.xml renamed to .xlsx must be rejected
        plain_zip_buf = io.BytesIO()
        with zipfile.ZipFile(plain_zip_buf, "w") as zf:
            zf.writestr("hello.txt", "not a workbook")
        res_plain_zip = self._upload_file(plain_zip_buf.getvalue(), filename="archive.xlsx")
        self.assertEqual(res_plain_zip.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("valid .xlsx", res_plain_zip.data["detail"])

        with override_settings(PRODUCT_IMPORT_MAX_ROWS=2):
            xlsx = _build_xlsx_bytes(
                ["Medicine Name", "Units Per Pack", "Base Unit", "GST Rate"],
                [
                    ["Med 1", 10, "tablet", 12],
                    ["Med 2", 10, "tablet", 12],
                    ["Med 3", 10, "tablet", 12],
                ],
            )
            res_limit = self._upload_file(xlsx)
            self.assertEqual(res_limit.status_code, status.HTTP_400_BAD_REQUEST)
            self.assertIn("Maximum allowed", res_limit.data["detail"])

    def test_invalid_gst_invalid_packaging_and_duplicate_detection_and_error_report(self):
        self.client.force_authenticate(user=self.owner_a)

        xlsx = _build_xlsx_bytes(
            [
                "Medicine Name",
                "Units Per Pack",
                "Base Unit",
                "GST Rate",
                "Strength",
                "Dosage Form",
                "Manufacturer",
                "SKU",
                "Barcode",
            ],
            [
                # Row 2: Valid ready row
                ["Metformin 500mg Tablets", 10, "tablet", 12, "500 mg", "tablet", "USV", "MED-MET-500", "8909990001111"],
                # Row 3: Invalid GST rate (15%)
                ["Invalid GST Med", 10, "tablet", 15, "100 mg", "tablet", "Cipla", "MED-BAD-GST", ""],
                # Row 4: Invalid Units per pack (0 and non-integer)
                ["Invalid Pack Med", 0, "tablet", 12, "50 mg", "tablet", "Cipla", "MED-BAD-PACK", ""],
                # Row 5: Duplicate SKU against existing DB
                ["Different Name Same SKU", 10, "tablet", 12, "10 mg", "tablet", "Lupin", "MED-PARA-EXIST", ""],
                # Row 6: Duplicate Barcode against existing DB
                ["Different Name Same Barcode", 10, "tablet", 12, "10 mg", "tablet", "Lupin", "MED-UNIQ-SKU", "8901111111111"],
                # Row 7: Duplicate Medicine identity (name+strength+form+manufacturer matches existing_med)
                ["Paracetamol 500mg Tablets", 10, "tablet", 12, "500 mg", "tablet", "GlaxoSmithKline", "MED-NEW-SKU-2", ""],
                # Row 8: In-file duplicate SKU matching Row 2
                ["Another Metformin", 10, "tablet", 12, "500 mg", "tablet", "Other", "MED-MET-500", ""],
            ],
        )

        preview_res = self._upload_file(xlsx)
        self.assertEqual(preview_res.status_code, status.HTTP_200_OK)
        summary = preview_res.data["summary"]
        self.assertEqual(summary["total_rows"], 7)
        self.assertEqual(summary["invalid_rows"], 2)
        self.assertEqual(summary["duplicate_rows"], 4)
        self.assertEqual(summary["ready_to_import"], 1)

        # Download error report workbook and verify original Excel row numbers + explanations
        err_url = reverse("product-import-error-report", kwargs={"batch_id": preview_res.data["batch_id"]})
        err_res = self.client.get(err_url)
        self.assertEqual(err_res.status_code, status.HTTP_200_OK)
        wb_err = openpyxl.load_workbook(io.BytesIO(err_res.content))
        ws_err = wb_err["Rows to Review"]
        reported_rows = [ws_err.cell(r, 1).value for r in range(2, ws_err.max_row + 1)]
        self.assertEqual(reported_rows, [3, 4, 5, 6, 7, 8])
        self.assertIn("GST", str(ws_err.cell(2, 3).value))
        self.assertIn("Units per pack", str(ws_err.cell(3, 3).value))

        # Confirm partial valid import: ONLY row 2 is created, existing Paracetamol is NEVER overwritten
        confirm_res = self.client.post(
            self.confirm_url,
            {"batch_id": preview_res.data["batch_id"]},
            format="json",
            HTTP_IDEMPOTENCY_KEY=str(uuid.uuid4()),
        )
        self.assertEqual(confirm_res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(confirm_res.data["imported_count"], 1)
        self.assertEqual(confirm_res.data["skipped_duplicate_count"], 4)
        self.assertEqual(confirm_res.data["failed_count"], 2)

        self.assertTrue(Product.objects.filter(organization=self.org_a, sku="MED-MET-500").exists())
        self.existing_med.refresh_from_db()
        self.assertEqual(self.existing_med.name, "Paracetamol 500mg Tablets")
        self.assertFalse(Product.objects.filter(organization=self.org_a, sku="MED-BAD-GST").exists())

    def test_cross_organization_isolation_allows_same_sku_and_blocks_cross_batch_access(self):
        # Org B imports the exact same SKU and barcode as Org A's existing medicine
        self.client.force_authenticate(user=self.owner_b)
        xlsx_b = _build_xlsx_bytes(
            ["Medicine Name", "Units Per Pack", "Base Unit", "GST Rate", "SKU", "Barcode"],
            [["Org B Paracetamol", 15, "tablet", 12, "MED-PARA-EXIST", "8901111111111"]],
        )
        preview_b = self._upload_file(xlsx_b)
        self.assertEqual(preview_b.status_code, status.HTTP_200_OK)
        self.assertEqual(preview_b.data["summary"]["ready_to_import"], 1)

        confirm_b = self.client.post(
            self.confirm_url,
            {"batch_id": preview_b.data["batch_id"]},
            format="json",
            HTTP_IDEMPOTENCY_KEY=str(uuid.uuid4()),
        )
        self.assertEqual(confirm_b.status_code, status.HTTP_201_CREATED)
        self.assertEqual(Product.objects.filter(sku="MED-PARA-EXIST").count(), 2)

        # Org A cannot confirm or download Org B's import batch
        self.client.force_authenticate(user=self.owner_a)
        cross_err_url = reverse("product-import-error-report", kwargs={"batch_id": preview_b.data["batch_id"]})
        self.assertEqual(self.client.get(cross_err_url).status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(
            self.client.post(self.confirm_url, {"batch_id": preview_b.data["batch_id"]}, format="json").status_code,
            status.HTTP_400_BAD_REQUEST,
        )

    def test_repeated_import_idempotency_and_concurrent_batch_protection(self):
        self.client.force_authenticate(user=self.owner_a)
        xlsx1 = _build_xlsx_bytes(
            ["Medicine Name", "Units Per Pack", "Base Unit", "GST Rate", "SKU"],
            [["Atorvastatin 10mg", 10, "tablet", 12, "MED-ATOR-10"]],
        )
        xlsx2 = _build_xlsx_bytes(
            ["Medicine Name", "Units Per Pack", "Base Unit", "GST Rate", "SKU"],
            [["Atorvastatin 10mg", 10, "tablet", 12, "MED-ATOR-10"], ["Pantoprazole 40mg", 10, "tablet", 12, "MED-PANT-40"]],
        )

        # Two overlapping previews prepared concurrently
        p1 = self._upload_file(xlsx1)
        p2 = self._upload_file(xlsx2)
        self.assertEqual(p1.data["summary"]["ready_to_import"], 1)
        self.assertEqual(p2.data["summary"]["ready_to_import"], 2)

        idem_key = f"import-{uuid.uuid4()}"
        c1 = self.client.post(self.confirm_url, {"batch_id": p1.data["batch_id"]}, format="json", HTTP_IDEMPOTENCY_KEY=idem_key)
        self.assertEqual(c1.status_code, status.HTTP_201_CREATED)
        self.assertEqual(c1.data["imported_count"], 1)

        # Replay exact same idempotency key -> no duplicate created
        c1_replay = self.client.post(self.confirm_url, {"batch_id": p1.data["batch_id"]}, format="json", HTTP_IDEMPOTENCY_KEY=idem_key)
        self.assertEqual(c1_replay.status_code, status.HTTP_200_OK)
        self.assertTrue(c1_replay.data["idempotent_replay"])
        self.assertEqual(Product.objects.filter(organization=self.org_a, sku="MED-ATOR-10").count(), 1)

        # Re-posting the same completed batch even with a new key -> no duplicate created
        c1_repeat_batch = self.client.post(self.confirm_url, {"batch_id": p1.data["batch_id"]}, format="json", HTTP_IDEMPOTENCY_KEY=f"import-{uuid.uuid4()}")
        self.assertEqual(c1_repeat_batch.status_code, status.HTTP_200_OK)
        self.assertTrue(c1_repeat_batch.data["idempotent_replay"])
        self.assertEqual(Product.objects.filter(organization=self.org_a, sku="MED-ATOR-10").count(), 1)

        # Second concurrent batch commits next -> re-checks DB under org lock, skips Atorvastatin, imports Pantoprazole only
        c2 = self.client.post(self.confirm_url, {"batch_id": p2.data["batch_id"]}, format="json", HTTP_IDEMPOTENCY_KEY=f"import-{uuid.uuid4()}")
        self.assertEqual(c2.status_code, status.HTTP_201_CREATED)
        self.assertEqual(c2.data["imported_count"], 1)
        self.assertEqual(len(c2.data["concurrent_skipped"]), 1)
        self.assertEqual(Product.objects.filter(organization=self.org_a, sku="MED-ATOR-10").count(), 1)
        self.assertEqual(Product.objects.filter(organization=self.org_a, sku="MED-PANT-40").count(), 1)

    def test_mid_import_failure_rolls_back_atomically(self):
        self.client.force_authenticate(user=self.owner_a)
        xlsx = _build_xlsx_bytes(
            ["Medicine Name", "Units Per Pack", "Base Unit", "GST Rate", "SKU"],
            [
                ["Rollback Med 1", 10, "tablet", 12, "MED-RB-01"],
                ["Rollback Med 2", 10, "tablet", 12, "MED-RB-02"],
            ],
        )
        p = self._upload_file(xlsx)
        batch_id = p.data["batch_id"]
        before_count = Product.objects.filter(organization=self.org_a).count()

        with patch("apps.products.import_service.Product.objects.bulk_create", side_effect=RuntimeError("Simulated DB failure")):
            res = self.client.post(
                self.confirm_url,
                {"batch_id": batch_id},
                format="json",
                HTTP_IDEMPOTENCY_KEY=str(uuid.uuid4()),
            )
        self.assertEqual(res.status_code, status.HTTP_500_INTERNAL_SERVER_ERROR)
        self.assertEqual(Product.objects.filter(organization=self.org_a).count(), before_count)
        batch = ProductImportBatch.objects.get(id=batch_id)
        self.assertEqual(batch.status, "FAILED")
