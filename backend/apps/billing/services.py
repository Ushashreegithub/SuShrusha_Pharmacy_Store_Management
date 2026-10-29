import hashlib
import json
import logging
import uuid
from decimal import Decimal, ROUND_HALF_UP
from django.db import transaction
from django.utils import timezone
from django.core.exceptions import ValidationError

from apps.organizations.models import Store, StoreMembership, OrganizationMembership
from apps.products.models import Product
from apps.inventory.models import (
    Batch,
    StoreBatchStock,
    StockMovement,
    BatchInwardCostLayer,
    ProductPackagingSnapshot,
    InventoryOperation,
)
from apps.inventory.services import StockLedgerService
from apps.audit.models import AuditEvent
from apps.billing.models import (
    Customer,
    SaleDraft,
    SaleDraftItem,
    DiscountApprovalRequest,
    CheckoutAttempt,
    Invoice,
    InvoiceItem,
    InvoiceItemBatchAllocation,
    Payment,
)
from apps.billing.permissions import is_user_org_owner, is_user_assigned_store_manager

logger = logging.getLogger(__name__)


def generate_draft_number(store: Store) -> str:
    """Generate sequential draft number: DFT-<STORE>-YYYYMMDD-XXXX."""
    today_str = timezone.localdate().strftime("%Y%m%d")
    store_code = (store.code or "STR").replace("-", "").upper()[:6]
    prefix = f"DFT-{store_code}-{today_str}-"
    last_draft = SaleDraft.objects.filter(
        store=store,
        draft_number__startswith=prefix
    ).order_by("-draft_number").first()
    if last_draft and last_draft.draft_number:
        try:
            seq = int(last_draft.draft_number.split("-")[-1]) + 1
        except (ValueError, IndexError):
            seq = 1
    else:
        seq = 1
    return f"{prefix}{seq:04d}"


def generate_invoice_number(store: Store) -> str:
    """Generate sequential invoice number: INV-<STORE>-YYYYMMDD-XXXX."""
    today_str = timezone.localdate().strftime("%Y%m%d")
    store_code = (store.code or "STR").replace("-", "").upper()[:6]
    prefix = f"INV-{store_code}-{today_str}-"
    last_inv = Invoice.objects.filter(
        store=store,
        invoice_number__startswith=prefix
    ).order_by("-invoice_number").first()
    if last_inv and last_inv.invoice_number:
        try:
            seq = int(last_inv.invoice_number.split("-")[-1]) + 1
        except (ValueError, IndexError):
            seq = 1
    else:
        seq = 1
    return f"{prefix}{seq:04d}"


class BillingCalculator:
    """
    Authoritative decimal-safe pricing and GST tax engine for retail pharmacy sales.
    In Indian pharmacy retail, statutory MRP is inclusive of all taxes (GST).
    """

    @classmethod
    def calculate_line_item(
        cls,
        quantity: int,
        unit_type: str,
        conversion_factor: int,
        mrp: Decimal,
        tax_rate: Decimal,
        discount_percent: Decimal = Decimal("0.00"),
        override_unit_price: Decimal | None = None,
    ) -> dict:
        """
        Calculate single line item values:
        - unit_price (per chosen unit_type)
        - gross_amount
        - discount_amount
        - net_total
        - taxable_value
        - cgst_amount, sgst_amount, igst_amount
        """
        qty = Decimal(quantity)
        conv = Decimal(max(1, conversion_factor))

        if unit_type == "BASE_UNIT":
            # Loose unit price derived from MRP
            derived_unit_price = (mrp / conv).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
            unit_price = override_unit_price if override_unit_price is not None else derived_unit_price
        else:
            unit_price = override_unit_price if override_unit_price is not None else mrp

        # Gross line amount (tax-inclusive MRP basis)
        gross = (qty * unit_price).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

        # Line discount
        disc_pct = max(Decimal("0.00"), min(Decimal("100.00"), Decimal(discount_percent)))
        discount_amt = (gross * (disc_pct / Decimal("100.00"))).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

        # Post-discount net line total
        net_total = max(Decimal("0.00"), gross - discount_amt)

        # Back-calculate taxable value from inclusive price: net / (1 + rate/100)
        t_rate = max(Decimal("0.00"), Decimal(tax_rate))
        tax_multiplier = Decimal("1.00") + (t_rate / Decimal("100.00"))
        taxable = (net_total / tax_multiplier).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        total_tax = max(Decimal("0.00"), net_total - taxable)

        # Intra-state retail tax split: 50% CGST, 50% SGST
        cgst = (total_tax / Decimal("2.00")).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        sgst = total_tax - cgst
        igst = Decimal("0.00")

        return {
            "quantity": quantity,
            "unit_type": unit_type,
            "conversion_factor": conversion_factor,
            "unit_price": unit_price,
            "gross_amount": gross,
            "discount_percent": disc_pct,
            "discount_amount": discount_amt,
            "net_total": net_total,
            "tax_rate": t_rate,
            "taxable_value": taxable,
            "total_tax": total_tax,
            "cgst_amount": cgst,
            "sgst_amount": sgst,
            "igst_amount": igst,
        }

    @classmethod
    def calculate_draft_totals(cls, draft: SaleDraft) -> dict:
        """
        Calculates authoritative totals for a SaleDraft including all line items
        and approved bill-level discounts.
        """
        items_data = []
        gross_total = Decimal("0.00")
        item_discount_total = Decimal("0.00")
        taxable_total = Decimal("0.00")
        cgst_total = Decimal("0.00")
        sgst_total = Decimal("0.00")
        igst_total = Decimal("0.00")
        total_tax = Decimal("0.00")
        net_before_bill_disc = Decimal("0.00")

        for item in draft.items.select_related("product").all():
            line = cls.calculate_line_item(
                quantity=item.quantity,
                unit_type=item.unit_type,
                conversion_factor=item.conversion_factor,
                mrp=item.mrp,
                tax_rate=item.tax_rate,
                discount_percent=Decimal("0.00"),
                override_unit_price=item.unit_price,
            )
            line["item_id"] = str(item.id)
            line["product_id"] = str(item.product.id)
            line["product_name"] = item.product.name
            line["brand_name"] = item.product.brand_name
            line["generic_name"] = item.product.generic_name
            line["strength"] = item.product.strength
            line["dosage_form"] = item.product.dosage_form
            line["prescription_class"] = item.product.prescription_class
            line["is_prescription_required"] = item.product.prescription_class != "otc"
            items_data.append(line)

            gross_total += line["gross_amount"]
            item_discount_total += line["discount_amount"]
            net_before_bill_disc += line["net_total"]

        # Bill-level manual discount (applied only if approved!)
        bill_discount = Decimal("0.00")
        if draft.discount_status == "APPROVED" and draft.discount_value > Decimal("0.00"):
            if draft.discount_type == "PERCENTAGE":
                pct = min(Decimal("100.00"), draft.discount_value)
                bill_discount = (net_before_bill_disc * (pct / Decimal("100.00"))).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
            elif draft.discount_type == "FIXED":
                bill_discount = min(net_before_bill_disc, draft.discount_value)

        net_after_discount = max(Decimal("0.00"), net_before_bill_disc - bill_discount)

        # Recalculate tax proportion on net_after_discount if bill discount applied
        if bill_discount > Decimal("0.00") and net_before_bill_disc > Decimal("0.00"):
            ratio = net_after_discount / net_before_bill_disc
            for line in items_data:
                adjusted_line_net = (line["net_total"] * ratio).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
                t_rate = line["tax_rate"]
                tax_multiplier = Decimal("1.00") + (t_rate / Decimal("100.00"))
                adjusted_taxable = (adjusted_line_net / tax_multiplier).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
                adj_tax = max(Decimal("0.00"), adjusted_line_net - adjusted_taxable)
                adj_cgst = (adj_tax / Decimal("2.00")).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
                adj_sgst = adj_tax - adj_cgst

                taxable_total += adjusted_taxable
                cgst_total += adj_cgst
                sgst_total += adj_sgst
                total_tax += adj_tax
        else:
            for line in items_data:
                taxable_total += line["taxable_value"]
                cgst_total += line["cgst_amount"]
                sgst_total += line["sgst_amount"]
                total_tax += line["total_tax"]

        # Rounding adjustment to nearest rupee
        final_payable = net_after_discount.quantize(Decimal("1.00"), rounding=ROUND_HALF_UP)
        rounding_adjustment = final_payable - net_after_discount

        total_discount = item_discount_total + bill_discount

        return {
            "draft_id": str(draft.id),
            "draft_number": draft.draft_number,
            "status": draft.status,
            "cart_revision": draft.cart_revision,
            "items_count": len(items_data),
            "items": items_data,
            "gross_total": gross_total,
            "item_discount_total": item_discount_total,
            "bill_discount_total": bill_discount,
            "total_discount": total_discount,
            "taxable_amount": taxable_total,
            "cgst_amount": cgst_total,
            "sgst_amount": sgst_total,
            "igst_amount": igst_total,
            "total_tax": total_tax,
            "net_total": net_after_discount,
            "rounding_adjustment": rounding_adjustment,
            "final_payable": final_payable,
            "discount_status": draft.discount_status,
            "discount_type": draft.discount_type,
            "discount_value": draft.discount_value,
            "requires_prescription": any(i["is_prescription_required"] for i in items_data),
            "prescription_verified": bool(draft.pharmacist_verified_at),
        }


class BillingAllocationService:
    """
    Evaluates FEFO (First-Expired, First-Out) batch stock allocation for billing.
    Enforces expiry filtering, quarantine exclusions, and recall blocking.
    """

    @classmethod
    def get_eligible_batches_preview(cls, store: Store, product_id, quantity_base_units: int) -> dict:
        """
        Previews FEFO batch allocations for a requested quantity.
        Returns whether sufficient eligible stock exists and the allocation breakdown.
        """
        batches = StockLedgerService.get_fefo_batches_for_product(
            store=store,
            product_id=product_id,
            required_quantity=quantity_base_units
        )

        total_available = sum(b["available_quantity"] for b in batches)
        is_sufficient = total_available >= quantity_base_units

        allocated_batches = []
        needed = quantity_base_units
        for b in batches:
            if needed <= 0:
                break
            take = min(b["available_quantity"], needed)
            if take > 0:
                allocated_batches.append({
                    "batch_id": b["batch_id"],
                    "batch_number": b["batch_number"],
                    "expiry_date": b["expiry_date"],
                    "days_until_expiry": b["days_until_expiry"],
                    "expiry_status": b["expiry_status"],
                    "allocated_base_units": take,
                    "unit_mrp": b["unit_mrp"],
                    "mrp": b["mrp"],
                })
                needed -= take

        return {
            "product_id": str(product_id),
            "requested_base_units": quantity_base_units,
            "total_available_base_units": total_available,
            "is_sufficient": is_sufficient,
            "shortage": max(0, quantity_base_units - total_available),
            "allocated_batches": allocated_batches,
        }


class DraftBillingService:
    """
    Manages cashier billing sessions, cart mutations, holding/resuming,
    discount approval requests, and pharmacist prescription sign-offs.
    """

    @classmethod
    def get_or_create_draft(cls, store: Store, cashier, draft_id=None) -> SaleDraft:
        """Retrieves existing active draft or initializes a fresh draft."""
        if draft_id:
            draft = SaleDraft.objects.filter(id=draft_id, store=store).first()
            if draft and draft.status in ["DRAFT", "HELD"]:
                return draft

        # Look for existing active DRAFT for this cashier at this store
        existing = SaleDraft.objects.filter(
            store=store,
            cashier=cashier,
            status="DRAFT"
        ).order_by("-updated_at").first()

        if existing:
            return existing

        # Create new draft
        draft_num = generate_draft_number(store)
        return SaleDraft.objects.create(
            organization=store.organization,
            store=store,
            cashier=cashier,
            draft_number=draft_num,
            status="DRAFT"
        )

    @classmethod
    def add_or_update_item(
        cls,
        draft: SaleDraft,
        product: Product,
        quantity: int,
        unit_type: str = "SALE_UNIT",
        selected_batch_id=None,
    ) -> SaleDraftItem:
        """
        Adds or updates a product line item in a draft bill.
        Enforces loose dispensing rules, conversion factors, and stock availability.
        """
        if not product.is_active:
            raise ValidationError(f"Product '{product.name}' is archived/inactive and cannot be sold.")

        if quantity <= 0:
            raise ValidationError("Quantity must be greater than zero.")

        # Normalize loose unit type aliases
        if unit_type in ["BASE_UNIT", "LOOSE_UNIT"]:
            unit_type = "BASE_UNIT"

        # Loose dispensing check
        if unit_type == "BASE_UNIT" and not product.is_loose_dispensing_allowed:
            raise ValidationError(
                f"Loose dispensing is not permitted for '{product.name}'. Must be sold in full packs ({product.sale_unit})."
            )

        conv = max(1, product.conversion_factor)
        total_base = quantity if unit_type == "BASE_UNIT" else quantity * conv

        # Stock availability check via FEFO
        preview = BillingAllocationService.get_eligible_batches_preview(
            store=draft.store,
            product_id=product.id,
            quantity_base_units=total_base
        )
        if not preview["is_sufficient"]:
            avail = preview["total_available_base_units"]
            if unit_type == "SALE_UNIT":
                avail_packs = avail // conv
                raise ValidationError(
                    f"Insufficient stock for '{product.name}'. Available: {avail_packs} {product.sale_unit}(s) ({avail} {product.base_unit}s), requested: {quantity} {product.sale_unit}(s)."
                )
            else:
                raise ValidationError(
                    f"Insufficient stock for '{product.name}'. Available: {avail} {product.base_unit}(s), requested: {quantity}."
                )

        # Get latest batch MRP
        latest_batch = None
        if selected_batch_id:
            latest_batch = Batch.objects.filter(id=selected_batch_id, organization=draft.organization).first()
        if not latest_batch and preview["allocated_batches"]:
            first_b_id = preview["allocated_batches"][0]["batch_id"]
            latest_batch = Batch.objects.filter(id=first_b_id).first()

        mrp = latest_batch.mrp if latest_batch else Decimal("0.00")
        if unit_type == "BASE_UNIT":
            unit_price = (mrp / Decimal(conv)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        else:
            unit_price = mrp

        item, created = SaleDraftItem.objects.get_or_create(
            draft=draft,
            product=product,
            defaults={
                "unit_type": unit_type,
                "quantity": quantity,
                "conversion_factor": conv,
                "total_base_units": total_base,
                "unit_price": unit_price,
                "mrp": mrp,
                "tax_rate": product.gst_rate,
                "selected_batch": latest_batch,
            }
        )

        if not created:
            item.unit_type = unit_type
            item.quantity = quantity
            item.conversion_factor = conv
            item.total_base_units = total_base
            item.unit_price = unit_price
            item.mrp = mrp
            item.tax_rate = product.gst_rate
            item.selected_batch = latest_batch
            item.save()

        # Invalidate existing discount approvals because cart mutated!
        draft.cart_revision += 1
        if draft.discount_status in ["REQUESTED", "APPROVED"]:
            draft.discount_status = "NONE"
            draft.discount_type = "NONE"
            draft.discount_value = Decimal("0.00")
            draft.discount_reason = ""
            draft.discount_approved_by = None
            draft.discount_approved_at = None
        draft.save(update_fields=[
            "cart_revision", "discount_status", "discount_type", "discount_value",
            "discount_reason", "discount_approved_by", "discount_approved_at", "updated_at"
        ])

        return item

    @classmethod
    def remove_item(cls, draft: SaleDraft, item_id) -> None:
        """Removes a line item and increments cart revision."""
        item = SaleDraftItem.objects.filter(id=item_id, draft=draft).first()
        if item:
            item.delete()
            draft.cart_revision += 1
            if draft.discount_status in ["REQUESTED", "APPROVED"]:
                draft.discount_status = "NONE"
                draft.discount_type = "NONE"
                draft.discount_value = Decimal("0.00")
            draft.save(update_fields=["cart_revision", "discount_status", "discount_type", "discount_value", "updated_at"])

    @classmethod
    def hold_draft(cls, draft: SaleDraft, notes: str = "") -> SaleDraft:
        """Parks / holds an active draft bill for later resumption."""
        if draft.items.count() == 0:
            raise ValidationError("Cannot hold an empty cart.")
        draft.status = "HELD"
        if notes:
            draft.notes = notes
        draft.save(update_fields=["status", "notes", "updated_at"])

        AuditEvent.log_event(
            event_type="SALE_DRAFT_HELD",
            user=draft.cashier,
            organization=draft.organization,
            details={"draft_number": draft.draft_number, "items_count": draft.items.count()}
        )
        return draft

    @classmethod
    def resume_draft(cls, draft: SaleDraft) -> tuple[SaleDraft, list[str]]:
        """
        Resumes a held bill and revalidates all products, prices, and stock availability.
        Returns (draft, warnings).
        """
        warnings = []
        # Revalidate each item
        for item in list(draft.items.select_related("product").all()):
            if not item.product.is_active:
                warnings.append(f"Item '{item.product.name}' was removed because the product is now inactive.")
                item.delete()
                continue

            preview = BillingAllocationService.get_eligible_batches_preview(
                store=draft.store,
                product_id=item.product.id,
                quantity_base_units=item.total_base_units
            )
            if not preview["is_sufficient"]:
                warnings.append(
                    f"Stock for '{item.product.name}' changed while parked. Eligible stock is now insufficient."
                )

        draft.status = "DRAFT"
        draft.save(update_fields=["status", "updated_at"])

        AuditEvent.log_event(
            event_type="SALE_DRAFT_RESUMED",
            user=draft.cashier,
            organization=draft.organization,
            details={"draft_number": draft.draft_number, "warnings": warnings}
        )
        return draft, warnings

    @classmethod
    def request_discount(cls, draft: SaleDraft, cashier, discount_type: str, discount_value: Decimal, reason: str) -> DiscountApprovalRequest:
        """Cashier requests a manual discount requiring store manager approval."""
        if discount_type not in ["PERCENTAGE", "FIXED"]:
            raise ValidationError("Invalid discount type. Must be PERCENTAGE or FIXED.")
        if discount_value <= Decimal("0.00"):
            raise ValidationError("Discount value must be greater than zero.")
        if not reason.strip():
            raise ValidationError("A clear reason for the discount is required.")

        draft.discount_status = "REQUESTED"
        draft.discount_type = discount_type
        draft.discount_value = discount_value
        draft.discount_reason = reason.strip()
        draft.save(update_fields=["discount_status", "discount_type", "discount_value", "discount_reason", "updated_at"])

        req = DiscountApprovalRequest.objects.create(
            draft=draft,
            requested_by=cashier,
            cart_revision=draft.cart_revision,
            discount_type=discount_type,
            discount_value=discount_value,
            reason=reason.strip(),
            status="PENDING"
        )

        AuditEvent.log_event(
            event_type="DISCOUNT_REQUESTED",
            user=cashier,
            organization=draft.organization,
            details={
                "draft_number": draft.draft_number,
                "discount_type": discount_type,
                "discount_value": str(discount_value),
                "reason": reason
            }
        )
        return req

    @classmethod
    def review_discount(
        cls,
        discount_request: DiscountApprovalRequest,
        reviewer,
        approved: bool,
        rejection_reason: str = ""
    ) -> DiscountApprovalRequest:
        """
        Store Manager or Organization Owner approves or rejects a discount request.
        Cashiers cannot self-approve their own request!
        """
        draft = discount_request.draft
        store = draft.store

        # 1. Authorization check
        if not (is_user_org_owner(reviewer, store.organization) or is_user_assigned_store_manager(reviewer, store)):
            raise ValidationError("Only organization owners and assigned store managers can approve discounts.")

        # 2. Prevent cashier self-approval
        if reviewer.id == discount_request.requested_by_id:
            raise ValidationError("Cashiers are strictly forbidden from approving their own discount requests.")

        # 3. Check for stale approval (cart was modified after request)
        if draft.cart_revision != discount_request.cart_revision:
            discount_request.status = "EXPIRED"
            discount_request.save(update_fields=["status"])
            draft.discount_status = "NONE"
            draft.save(update_fields=["discount_status"])
            raise ValidationError("Cart was modified after the discount was requested. Please submit a new request.")

        now = timezone.now()
        if approved:
            discount_request.status = "APPROVED"
            discount_request.reviewed_by = reviewer
            discount_request.reviewed_at = now
            discount_request.save(update_fields=["status", "reviewed_by", "reviewed_at"])

            draft.discount_status = "APPROVED"
            draft.discount_approved_by = reviewer
            draft.discount_approved_at = now
            draft.save(update_fields=["discount_status", "discount_approved_by", "discount_approved_at", "updated_at"])

            AuditEvent.log_event(
                event_type="DISCOUNT_APPROVED",
                user=reviewer,
                organization=draft.organization,
                details={
                    "draft_number": draft.draft_number,
                    "discount_value": str(discount_request.discount_value),
                    "approved_by": reviewer.email
                }
            )
        else:
            discount_request.status = "REJECTED"
            discount_request.reviewed_by = reviewer
            discount_request.reviewed_at = now
            discount_request.rejection_reason = rejection_reason.strip()
            discount_request.save(update_fields=["status", "reviewed_by", "reviewed_at", "rejection_reason"])

            draft.discount_status = "REJECTED"
            draft.save(update_fields=["discount_status", "updated_at"])

            AuditEvent.log_event(
                event_type="DISCOUNT_REJECTED",
                user=reviewer,
                organization=draft.organization,
                details={
                    "draft_number": draft.draft_number,
                    "rejection_reason": rejection_reason
                }
            )

        return discount_request

    @classmethod
    def verify_prescription(
        cls,
        draft: SaleDraft,
        pharmacist_user,
        prescription_number: str,
        doctor_name: str
    ) -> SaleDraft:
        """
        Pharmacist verifies and signs off on dispensing prescription-required medicines.
        """
        store = draft.store
        # Verify pharmacist role or owner
        is_owner = is_user_org_owner(pharmacist_user, store.organization)
        is_pharma = StoreMembership.objects.filter(
            store=store,
            user=pharmacist_user,
            role__in=["pharmacist", "manager"],
            is_active=True
        ).exists()

        if not (is_owner or is_pharma):
            raise ValidationError("Only a registered pharmacist or authorized store manager can approve prescription dispensing.")

        if not prescription_number.strip():
            raise ValidationError("Prescription number or RX reference is mandatory for prescription medicines.")
        if not doctor_name.strip():
            raise ValidationError("Prescribing doctor or clinic name is mandatory.")

        draft.prescription_number = prescription_number.strip()
        draft.doctor_name = doctor_name.strip()
        draft.pharmacist_user = pharmacist_user
        draft.pharmacist_verified_at = timezone.now()
        draft.save(update_fields=["prescription_number", "doctor_name", "pharmacist_user", "pharmacist_verified_at", "updated_at"])

        AuditEvent.log_event(
            event_type="PRESCRIPTION_VERIFIED",
            user=pharmacist_user,
            organization=draft.organization,
            details={
                "draft_number": draft.draft_number,
                "prescription_number": draft.prescription_number,
                "doctor_name": draft.doctor_name,
                "pharmacist": pharmacist_user.email
            }
        )
        return draft


def sanitize_for_json(obj):
    """
    Recursively converts Decimals and UUIDs to string / float format
    suitable for PostgreSQL JSONField storage without serialization crashes.
    """
    if isinstance(obj, Decimal):
        return str(obj)
    if isinstance(obj, uuid.UUID):
        return str(obj)
    if isinstance(obj, dict):
        return {k: sanitize_for_json(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [sanitize_for_json(i) for i in obj]
    return obj


class CheckoutService:
    """
    Phase 2: Atomic, transaction-safe checkout engine.
    - Manages durable CheckoutAttempt lifecycle (initiation, payment recording, manual verification).
    - Uses canonical StockLedgerService.post_sale_dispense for transactional stock posting.
    - Enforces FEFO allocations, FIFO cost-layer depletion, and non-negative inventory.
    - Generates immutable Invoice, InvoiceItem, InvoiceItemBatchAllocation, and Payment records.
    - Idempotency-protected.
    """

    @classmethod
    def initiate_checkout(
        cls,
        store: Store,
        cashier,
        draft_id,
        customer_id_or_data: dict | str,
        idempotency_key: str,
    ) -> CheckoutAttempt:
        """
        Phase 2 Step 1: Initiates a durable CheckoutAttempt.
        Freezes the cart revision, snapshots financials, revalidates stock availability,
        and initializes payment requirements.
        """
        if not idempotency_key:
            raise ValidationError("Idempotency key is required to initiate checkout.")

        with transaction.atomic():
            # Idempotent replay check
            existing_attempt = CheckoutAttempt.objects.filter(
                organization=store.organization,
                store=store,
                idempotency_key=idempotency_key
            ).first()
            if existing_attempt:
                return existing_attempt

            # Lock draft
            draft = SaleDraft.objects.select_for_update().filter(
                id=draft_id,
                store=store
            ).first()
            if not draft:
                raise ValidationError("Sale draft not found.")
            if draft.status == "CONVERTED":
                raise ValidationError("Draft has already been finalized and converted to an invoice.")
            if draft.items.count() == 0:
                raise ValidationError("Cannot checkout an empty bill.")

            # Resolve customer safely without UUID parsing crashes
            customer = None
            if isinstance(customer_id_or_data, str) and customer_id_or_data.strip():
                try:
                    uuid_val = uuid.UUID(str(customer_id_or_data).strip())
                    customer = Customer.objects.filter(id=uuid_val, organization=store.organization).first()
                except (ValueError, TypeError):
                    customer = None
            elif isinstance(customer_id_or_data, dict):
                c_id = customer_id_or_data.get("id")
                if c_id and str(c_id).strip() and str(c_id).strip().lower() not in ["none", "null", "undefined"]:
                    try:
                        uuid_val = uuid.UUID(str(c_id).strip())
                        customer = Customer.objects.filter(id=uuid_val, organization=store.organization).first()
                    except (ValueError, TypeError):
                        customer = None
                if not customer:
                    c_name = str(customer_id_or_data.get("name", "")).strip()
                    c_phone = str(customer_id_or_data.get("phone_number", "")).strip()
                    if c_name and c_phone:
                        customer, _ = Customer.objects.get_or_create(
                            organization=store.organization,
                            phone_number=c_phone,
                            defaults={
                                "name": c_name,
                                "email": str(customer_id_or_data.get("email", "")).strip(),
                                "address": str(customer_id_or_data.get("address", "")).strip(),
                                "doctor_name": str(customer_id_or_data.get("doctor_name", "")).strip(),
                            }
                        )
            elif hasattr(customer_id_or_data, "id"):
                customer = customer_id_or_data

            # Fallback to existing customer attached to the draft
            if not customer and draft.customer:
                customer = draft.customer

            if not customer:
                raise ValidationError("Customer name and contact number are mandatory before checkout.")

            # Attach customer to draft if not attached
            if draft.customer_id != customer.id:
                draft.customer = customer
                draft.save(update_fields=["customer", "updated_at"])

            # Authoritative financial calculations
            calc = BillingCalculator.calculate_draft_totals(draft)

            # Prescription verification check
            if calc["requires_prescription"] and not calc["prescription_verified"]:
                raise ValidationError(
                    "This bill contains prescription medicines (Schedule H/H1/X/Rx). Pharmacist verification is mandatory before checkout."
                )

            # FEFO Batch Availability Pre-check
            allocations_preview = []
            draft_items = list(draft.items.select_related("product").order_by("product_id"))
            for d_item in draft_items:
                preview = BillingAllocationService.get_eligible_batches_preview(
                    store=store,
                    product_id=d_item.product_id,
                    quantity_base_units=d_item.total_base_units
                )
                if not preview["is_sufficient"]:
                    raise ValidationError(
                        f"Insufficient stock for '{d_item.product.name}'. Available: {preview['total_available_base_units']} base units, required: {d_item.total_base_units}."
                    )
                allocations_preview.append({
                    "item_id": str(d_item.id),
                    "product_id": str(d_item.product_id),
                    "product_name": d_item.product.name,
                    "requested_base_units": d_item.total_base_units,
                    "allocated_batches": preview["allocated_batches"],
                })

            # Freeze cart revision
            draft.status = "CHECKOUT"
            draft.save(update_fields=["status", "updated_at"])

            attempt = CheckoutAttempt.objects.create(
                organization=store.organization,
                store=store,
                draft=draft,
                cart_revision=draft.cart_revision,
                cashier=cashier,
                customer=customer,
                customer_name=customer.name,
                customer_phone=customer.phone_number,
                customer_address=customer.address,
                status="PENDING_PAYMENT",
                payable_amount=calc["final_payable"],
                idempotency_key=idempotency_key,
                financial_snapshot=sanitize_for_json(calc),
                batch_allocations_snapshot=sanitize_for_json(allocations_preview),
            )

            AuditEvent.log_event(
                event_type="CHECKOUT_INITIATED",
                user=cashier,
                organization=store.organization,
                details={
                    "attempt_id": str(attempt.id),
                    "draft_number": draft.draft_number,
                    "payable_amount": str(attempt.payable_amount),
                    "customer": customer.name,
                }
            )

            return attempt

    @classmethod
    def record_payment(
        cls,
        store: Store,
        user,
        attempt_id,
        payment_data: dict,
    ) -> tuple[Payment, CheckoutAttempt]:
        """
        Phase 2 Step 2: Records a payment against an active CheckoutAttempt.
        - Cash is marked CONFIRMED immediately.
        - UPI/Card is initialized as REQUIRES_VERIFICATION.
        """
        with transaction.atomic():
            attempt = CheckoutAttempt.objects.select_for_update().filter(
                id=attempt_id,
                store=store
            ).first()
            if not attempt:
                raise ValidationError("Checkout attempt not found.")
            if attempt.status in ["COMPLETED", "FINALIZING"]:
                raise ValidationError("Checkout attempt has already been finalized.")
            if attempt.status in ["CANCELLED", "EXPIRED"]:
                raise ValidationError(f"Checkout attempt is {attempt.status.lower()} and cannot accept payments.")

            method = str(payment_data.get("method", "")).upper()
            if method not in ["CASH", "UPI", "CARD"]:
                raise ValidationError(f"Unsupported payment method '{method}'.")

            amt = Decimal(str(payment_data.get("amount", "0.00")))
            if amt <= Decimal("0.00"):
                raise ValidationError("Payment amount must be greater than zero.")

            ref = str(payment_data.get("reference_number", "")).strip()
            cash_tend = payment_data.get("cash_tendered")
            cash_tend_dec = Decimal(str(cash_tend)) if cash_tend is not None else None
            chg_due = None

            if method == "CASH":
                if cash_tend_dec is not None:
                    if cash_tend_dec < amt:
                        raise ValidationError(f"Cash tendered (₹{cash_tend_dec}) cannot be less than payment amount (₹{amt}).")
                    chg_due = cash_tend_dec - amt
                status_val = "CONFIRMED"
            else:
                # UPI or Card requires manual verification by store manager/owner if no payment gateway
                if not ref:
                    raise ValidationError(f"Reference number (UTR / Auth code) is mandatory for {method} payment.")
                status_val = "REQUIRES_VERIFICATION"

            payment = Payment.objects.create(
                checkout_attempt=attempt,
                payment_method=method,
                amount=amt,
                status=status_val,
                reference_number=ref,
                cash_tendered=cash_tend_dec,
                change_due=chg_due,
                recorded_by=user,
                recorded_at=timezone.now(),
            )

            cls._recalculate_attempt_status(attempt)

            AuditEvent.log_event(
                event_type="PAYMENT_RECORDED",
                user=user,
                organization=store.organization,
                details={
                    "attempt_id": str(attempt.id),
                    "payment_id": str(payment.id),
                    "method": method,
                    "amount": str(amt),
                    "status": status_val,
                }
            )

            return payment, attempt

    @classmethod
    def verify_payment(
        cls,
        store: Store,
        verifier_user,
        attempt_id,
        payment_id,
        approved: bool,
        verification_notes: str = ""
    ) -> tuple[Payment, CheckoutAttempt]:
        """
        Phase 2 Step 2b: Store Manager or Owner manually verifies an external UPI/Card payment.
        Cashiers cannot self-verify!
        """
        # RBAC Check: Only assigned Store Manager or Org Owner
        if not (is_user_org_owner(verifier_user, store.organization) or is_user_assigned_store_manager(verifier_user, store)):
            raise ValidationError("Only organization owners and assigned store managers can verify external payments.")

        with transaction.atomic():
            attempt = CheckoutAttempt.objects.select_for_update().filter(id=attempt_id, store=store).first()
            if not attempt:
                raise ValidationError("Checkout attempt not found.")

            payment = Payment.objects.select_for_update().filter(id=payment_id, checkout_attempt=attempt).first()
            if not payment:
                raise ValidationError("Payment record not found.")

            # Prevent cashier self-approval
            if payment.recorded_by_id == verifier_user.id:
                raise ValidationError("Cashiers are strictly forbidden from verifying their own external payments.")

            if payment.status == "CONFIRMED":
                return payment, attempt

            now = timezone.now()
            if approved:
                payment.status = "CONFIRMED"
                payment.verified_by = verifier_user
                payment.verified_at = now
                payment.verification_notes = verification_notes.strip()
                payment.save(update_fields=["status", "verified_by", "verified_at", "verification_notes"])
            else:
                payment.status = "FAILED"
                payment.verified_by = verifier_user
                payment.verified_at = now
                payment.verification_notes = verification_notes.strip()
                payment.save(update_fields=["status", "verified_by", "verified_at", "verification_notes"])

            cls._recalculate_attempt_status(attempt)

            AuditEvent.log_event(
                event_type="PAYMENT_VERIFIED" if approved else "PAYMENT_REJECTED",
                user=verifier_user,
                organization=store.organization,
                details={
                    "attempt_id": str(attempt.id),
                    "payment_id": str(payment.id),
                    "approved": approved,
                    "verified_by": verifier_user.email,
                }
            )

            return payment, attempt

    @classmethod
    def _recalculate_attempt_status(cls, attempt: CheckoutAttempt) -> None:
        """Helper to re-evaluate attempt status based on payment states."""
        confirmed_sum = sum(
            p.amount for p in attempt.payments.filter(status="CONFIRMED")
        )
        has_pending_verification = attempt.payments.filter(status="REQUIRES_VERIFICATION").exists()

        if confirmed_sum >= attempt.payable_amount:
            attempt.status = "READY_TO_FINALIZE"
        elif has_pending_verification:
            attempt.status = "PAYMENT_PENDING_VERIFICATION"
        else:
            attempt.status = "PENDING_PAYMENT"

        attempt.save(update_fields=["status", "updated_at"])

    @classmethod
    def finalize_checkout(
        cls,
        store: Store,
        user,
        attempt_id,
        idempotency_key: str = None
    ) -> tuple[Invoice, bool]:
        """
        Phase 2 Step 3: Atomic, canonical invoice finalization and stock posting.
        - Validates complete payment settlement.
        - Calls canonical StockLedgerService.post_sale_dispense.
        - Creates Invoice, InvoiceItem, and InvoiceItemBatchAllocation records.
        - Commits atomically or rolls back completely.
        """
        with transaction.atomic():
            attempt = CheckoutAttempt.objects.select_for_update().filter(
                id=attempt_id,
                store=store
            ).first()
            if not attempt:
                raise ValidationError("Checkout attempt not found.")

            # Idempotency recovery
            if attempt.status == "COMPLETED" and attempt.invoice:
                return attempt.invoice, False

            # Verify complete payment settlement
            confirmed_sum = sum(
                p.amount for p in attempt.payments.filter(status="CONFIRMED")
            )
            if confirmed_sum < attempt.payable_amount:
                raise ValidationError(
                    f"Cannot finalize invoice. Total confirmed payment (₹{confirmed_sum}) is less than payable amount (₹{attempt.payable_amount})."
                )

            # Lock draft and verify cart has not changed
            draft = SaleDraft.objects.select_for_update().filter(id=attempt.draft_id).first()
            if not draft:
                raise ValidationError("Associated sale draft not found.")
            if draft.cart_revision != attempt.cart_revision:
                raise ValidationError("Cart was modified after checkout was initiated. Please re-initiate checkout.")

            attempt.status = "FINALIZING"
            attempt.save(update_fields=["status", "updated_at"])

            calc = attempt.financial_snapshot
            customer = attempt.customer
            inv_number = generate_invoice_number(store)

            # Prepare lines for canonical StockLedgerService.post_sale_dispense
            draft_items = list(draft.items.select_related("product").order_by("product_id"))
            all_allocations_for_ledger = []
            item_allocation_map = {}

            for d_item in draft_items:
                product = d_item.product
                needed_base = d_item.total_base_units

                # Find eligible batches via FEFO preview
                preview = BillingAllocationService.get_eligible_batches_preview(
                    store=store,
                    product_id=product.id,
                    quantity_base_units=needed_base
                )
                if not preview["is_sufficient"]:
                    attempt.status = "FAILED"
                    attempt.failure_reason = f"Stock shortage during finalization for '{product.name}'."
                    attempt.save(update_fields=["status", "failure_reason", "updated_at"])
                    raise ValidationError(
                        f"Stock verification failed during finalization for '{product.name}'. Available: {preview['total_available_base_units']} base units, required: {needed_base}."
                    )

                alloc_for_this_item = []
                for b_alloc in preview["allocated_batches"]:
                    alloc_dict = {
                        "batch_id": b_alloc["batch_id"],
                        "product_id": str(product.id),
                        "quantity": b_alloc["allocated_base_units"],
                    }
                    all_allocations_for_ledger.append(alloc_dict)
                    alloc_for_this_item.append(alloc_dict)

                item_allocation_map[str(d_item.id)] = alloc_for_this_item

            # CALL CANONICAL INVENTORY LEDGER SERVICE
            ledger_key = f"SALE-STOCK-{attempt.id}"
            dispense_output, _ = StockLedgerService.post_sale_dispense(
                store=store,
                actor=user,
                idempotency_key=ledger_key,
                invoice_number=inv_number,
                customer_name=customer.name,
                line_allocations=all_allocations_for_ledger,
                raw_payload={"attempt_id": str(attempt.id), "invoice_number": inv_number}
            )

            dispensed_allocations = dispense_output.get("allocations", [])

            # Compute change returned
            total_cash_tendered = sum(
                (p.cash_tendered or p.amount)
                for p in attempt.payments.filter(status="CONFIRMED", payment_method="CASH")
            )
            change_returned = Decimal("0.00")
            if total_cash_tendered > Decimal("0.00") and confirmed_sum > Decimal("0.00"):
                change_returned = max(Decimal("0.00"), total_cash_tendered - attempt.payable_amount)

            # Create Invoice
            invoice = Invoice.objects.create(
                organization=store.organization,
                store=store,
                invoice_number=inv_number,
                draft=draft,
                cashier=attempt.cashier,
                customer=customer,
                customer_name=attempt.customer_name,
                customer_phone=attempt.customer_phone,
                customer_address=attempt.customer_address,
                status="ISSUED",
                payment_status="PAID",
                gross_total=Decimal(str(calc["gross_total"])),
                discount_total=Decimal(str(calc["total_discount"])),
                taxable_amount=Decimal(str(calc["taxable_amount"])),
                cgst_amount=Decimal(str(calc["cgst_amount"])),
                sgst_amount=Decimal(str(calc["sgst_amount"])),
                igst_amount=Decimal(str(calc["igst_amount"])),
                total_tax=Decimal(str(calc["total_tax"])),
                rounding_adjustment=Decimal(str(calc["rounding_adjustment"])),
                net_total=attempt.payable_amount,
                paid_amount=confirmed_sum,
                change_returned=change_returned,
                prescription_number=draft.prescription_number,
                doctor_name=draft.doctor_name,
                pharmacist_user=draft.pharmacist_user,
                pharmacist_authorized_at=draft.pharmacist_verified_at,
                discount_approved_by=draft.discount_approved_by,
                discount_reason=draft.discount_reason,
                idempotency_key=str(attempt.idempotency_key),
                invoice_date=timezone.now(),
            )

            # Link Payments to Invoice
            attempt.payments.filter(status="CONFIRMED").update(invoice=invoice)

            # Create InvoiceItems and link Batch Allocations from canonical StockLedgerService
            for d_item in draft_items:
                product = d_item.product
                line_calc = next((l for l in calc["items"] if l["item_id"] == str(d_item.id)), None)
                if not line_calc:
                    line_calc = BillingCalculator.calculate_line_item(
                        d_item.quantity, d_item.unit_type, d_item.conversion_factor,
                        d_item.mrp, d_item.tax_rate
                    )

                inv_item = InvoiceItem.objects.create(
                    invoice=invoice,
                    product=product,
                    product_name=product.name,
                    brand_name=product.brand_name,
                    generic_name=product.generic_name,
                    strength=product.strength,
                    dosage_form=product.dosage_form,
                    sku=product.sku,
                    barcode=product.barcode,
                    hsn_code=product.hsn_code,
                    base_unit=product.base_unit,
                    sale_unit=product.sale_unit,
                    conversion_factor=d_item.conversion_factor,
                    pack_description=product.pack_description,
                    prescription_class=product.prescription_class,
                    is_prescription_required=product.prescription_class != "otc",
                    unit_type=d_item.unit_type,
                    quantity=d_item.quantity,
                    total_base_units=d_item.total_base_units,
                    mrp=d_item.mrp,
                    unit_price=d_item.unit_price,
                    discount_percent=Decimal(str(line_calc.get("discount_percent", "0.00"))),
                    discount_amount=Decimal(str(line_calc.get("discount_amount", "0.00"))),
                    tax_rate=d_item.tax_rate,
                    taxable_value=Decimal(str(line_calc.get("taxable_value", "0.00"))),
                    cgst_amount=Decimal(str(line_calc.get("cgst_amount", "0.00"))),
                    sgst_amount=Decimal(str(line_calc.get("sgst_amount", "0.00"))),
                    igst_amount=Decimal(str(line_calc.get("igst_amount", "0.00"))),
                    line_total=Decimal(str(line_calc.get("net_total", "0.00"))),
                )

                # Link batch allocations
                item_alloc_dicts = item_allocation_map.get(str(d_item.id), [])
                for alloc_info in item_alloc_dicts:
                    b_id = alloc_info["batch_id"]
                    matched_ledger = next((a for a in dispensed_allocations if a["batch_id"] == b_id), None)
                    if matched_ledger:
                        InvoiceItemBatchAllocation.objects.create(
                            invoice_item=inv_item,
                            batch_id=b_id,
                            batch_number=matched_ledger["batch_number"],
                            expiry_date=Batch.objects.get(id=b_id).expiry_date,
                            quantity_base_units=matched_ledger["quantity"],
                            stock_movement=matched_ledger["stock_movement"],
                            cost_layer=matched_ledger["cost_layer"],
                            unit_cost=matched_ledger["unit_cost"],
                            total_cost=matched_ledger["total_cost"],
                        )

            # Mark attempt completed and draft converted
            attempt.invoice = invoice
            attempt.status = "COMPLETED"
            attempt.save(update_fields=["invoice", "status", "updated_at"])

            draft.status = "CONVERTED"
            draft.save(update_fields=["status", "updated_at"])

            AuditEvent.log_event(
                event_type="INVOICE_ISSUED",
                user=user,
                organization=store.organization,
                details={
                    "invoice_number": invoice.invoice_number,
                    "customer": customer.name,
                    "net_total": str(invoice.net_total),
                    "items_count": len(draft_items),
                }
            )

            return invoice, True

    @classmethod
    def execute_checkout(
        cls,
        store: Store,
        cashier,
        draft_id,
        customer_id_or_data: dict | str,
        payments_data: list[dict],
        idempotency_key: str,
    ) -> tuple[Invoice, bool]:
        """
        Orchestrates full checkout (initiation + payment collection + finalization)
        for single-step requests (e.g. Cash counter transactions or automated tests).
        """
        with transaction.atomic():
            # Check for existing completed invoice
            existing_inv = Invoice.objects.filter(
                organization=store.organization,
                store=store,
                idempotency_key=idempotency_key
            ).first()
            if existing_inv:
                return existing_inv, False

            # 1. Initiate
            attempt = cls.initiate_checkout(
                store=store,
                cashier=cashier,
                draft_id=draft_id,
                customer_id_or_data=customer_id_or_data,
                idempotency_key=idempotency_key
            )

            # If already completed in previous attempt
            if attempt.status == "COMPLETED" and attempt.invoice:
                return attempt.invoice, False

            # 2. Record payments
            for p in payments_data:
                cls.record_payment(store, cashier, attempt.id, p)

            # Auto-verify external payments if cashier is Manager or Owner
            is_mgr = is_user_org_owner(cashier, store.organization) or is_user_assigned_store_manager(cashier, store)
            for payment in attempt.payments.filter(status="REQUIRES_VERIFICATION"):
                if is_mgr:
                    payment.status = "CONFIRMED"
                    payment.verified_by = cashier
                    payment.verified_at = timezone.now()
                    payment.verification_notes = "Auto-verified by Store Manager at counter."
                    payment.save(update_fields=["status", "verified_by", "verified_at", "verification_notes"])

            cls._recalculate_attempt_status(attempt)

            # 3. Finalize
            invoice, is_new = cls.finalize_checkout(store, cashier, attempt.id, idempotency_key)
            return invoice, is_new
