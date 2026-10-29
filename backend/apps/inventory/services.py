import json
import hashlib
from decimal import Decimal, ROUND_HALF_UP
from django.db import transaction, IntegrityError
from django.utils import timezone

from apps.organizations.models import Store
from apps.products.models import Product
from apps.audit.models import AuditEvent
from apps.inventory.models import (
    ProductPackagingSnapshot,
    Batch,
    BatchInwardCostLayer,
    StoreBatchStock,
    StockMovement,
    InventoryOperation,
    Supplier,
    GoodsReceipt,
    GoodsReceiptItem,
    StockTransfer,
    StockTransferItem,
    TransferDiscrepancy,
    AdjustmentApprovalPolicy,
    PhysicalStockCount,
    PhysicalStockCountItem,
    StockAdjustment,
    StoreExpiryPolicy,
    StockQuarantineRecord,
    BatchRecall,
)
from apps.inventory.exceptions import (
    StockLedgerError,
    IdempotencyConflictError,
    IdempotencyPayloadConflictError,
    InvalidQuantityError,
    InvalidCostError,
    DuplicateOpeningStockError,
    BatchValidationError,
    StorePermissionDeniedError,
)
from apps.inventory.permissions import is_user_org_owner, is_user_assigned_store_manager


def canonical_payload_hash(payload: dict) -> str:
    """
    Computes a deterministic SHA-256 hex digest of a JSON-serializable payload
    with sorted keys and compact separators.
    """
    compact_json = json.dumps(payload, sort_keys=True, separators=(',', ':'), default=str)
    return hashlib.sha256(compact_json.encode('utf-8')).hexdigest()


def generate_quarantine_number(organization) -> str:
    """Generates sequential quarantine identifier: QRN-YYYYMMDD-XXXX."""
    today_str = timezone.localdate().strftime("%Y%m%d")
    prefix = f"QRN-{today_str}-"
    last_rec = StockQuarantineRecord.objects.filter(
        organization=organization,
        quarantine_number__startswith=prefix
    ).order_by("-quarantine_number").first()
    if last_rec and last_rec.quarantine_number:
        try:
            seq = int(last_rec.quarantine_number.split("-")[-1]) + 1
        except (ValueError, IndexError):
            seq = 1
    else:
        seq = 1
    return f"{prefix}{seq:04d}"


def generate_recall_number(organization) -> str:
    """Generates sequential recall identifier: RCL-YYYYMMDD-XXXX."""
    today_str = timezone.localdate().strftime("%Y%m%d")
    prefix = f"RCL-{today_str}-"
    last_rec = BatchRecall.objects.filter(
        organization=organization,
        recall_number__startswith=prefix
    ).order_by("-recall_number").first()
    if last_rec and last_rec.recall_number:
        try:
            seq = int(last_rec.recall_number.split("-")[-1]) + 1
        except (ValueError, IndexError):
            seq = 1
    else:
        seq = 1
    return f"{prefix}{seq:04d}"


class StockLedgerService:
    """
    Dedicated transactional service as the exclusive approved mutation path for stock operations.
    Enforces deterministic locking, atomicity, idempotency, and audit trail consistency.
    """

    @classmethod
    def post_opening_stock(
        cls,
        store: Store,
        actor,
        idempotency_key,
        raw_payload: dict,
        validated_data: dict
    ) -> tuple[dict, bool]:
        """
        Atomically establishes initial opening stock for a batch at a store.
        Returns (response_data, is_newly_created).
        """
        payload_hash = canonical_payload_hash(raw_payload)

        # 1. Enforce atomic transaction on default database
        with transaction.atomic():
            # Acquire or create idempotency claim with savepoint isolation
            while True:
                op = InventoryOperation.objects.select_for_update().filter(
                    idempotency_key=idempotency_key
                ).first()

                if op:
                    if op.payload_hash != payload_hash:
                        raise IdempotencyPayloadConflictError(
                            "Idempotency key has already been used for a different request payload."
                        )
                    if op.status == "completed":
                        # Exact replay of previously committed response
                        return op.response_data, False
                    elif op.status == "in_progress":
                        raise IdempotencyConflictError(
                            "Operation is currently in progress. Please retry shortly."
                        )
                    elif op.status == "failed":
                        raise StockLedgerError(
                            f"Previous attempt with this key failed: {op.error_message}"
                        )
                    break

                try:
                    with transaction.atomic():
                        op = InventoryOperation.objects.create(
                            idempotency_key=idempotency_key,
                            organization=store.organization,
                            store=store,
                            actor=actor,
                            operation_type="OPENING_STOCK",
                            payload_hash=payload_hash,
                            status="in_progress"
                        )
                    break
                except IntegrityError:
                    # Concurrent worker inserted between first() and create()
                    # Re-loop to lock and await/evaluate the other worker's committed state
                    continue

            # 2. Validate actor authorization and entity active state
            if not store.organization.is_active:
                op.status = "failed"
                op.error_message = "Store's organization is inactive."
                op.save(update_fields=["status", "error_message"])
                raise StorePermissionDeniedError("Store's organization is inactive.")

            if not is_user_org_owner(actor, store.organization) and not is_user_assigned_store_manager(actor, store):
                op.status = "failed"
                op.error_message = "You do not have management permissions for this store."
                op.save(update_fields=["status", "error_message"])
                raise StorePermissionDeniedError(
                    "Only organization owners and assigned store managers can initialize opening stock."
                )

            # 3. Extract and validate entities
            product = validated_data["product"]
            if product.organization_id != store.organization_id:
                raise BatchValidationError("Product does not belong to the store's organization.")

            if not product.is_active:
                raise BatchValidationError("Cannot intake stock for an inactive product.")

            packaging_snapshot = validated_data.get("packaging_snapshot")
            if not packaging_snapshot:
                packaging_snapshot, _ = ProductPackagingSnapshot.get_or_create_current_snapshot(product)
            elif packaging_snapshot.product_id != product.id:
                raise BatchValidationError("Packaging snapshot does not belong to the specified product.")

            # 4. Quantity Validation
            conversion_factor = packaging_snapshot.conversion_factor
            sale_units = validated_data.get("quantity_sale_units") or 0
            loose_units = validated_data.get("quantity_loose_base_units") or 0

            if sale_units < 0 or loose_units < 0:
                raise InvalidQuantityError("Stock quantities cannot be negative.")

            if loose_units > 0 and not packaging_snapshot.is_loose_dispensing_allowed:
                raise InvalidQuantityError(
                    "Loose base units are not permitted when loose dispensing is disabled for this packaging."
                )

            if packaging_snapshot.conversion_factor > 1 and loose_units >= packaging_snapshot.conversion_factor:
                raise InvalidQuantityError(
                    f"Loose units must be strictly less than the conversion factor ({packaging_snapshot.conversion_factor}). Convert full packs to sale units."
                )

            total_base_units = (sale_units * conversion_factor) + loose_units
            if total_base_units <= 0:
                raise InvalidQuantityError("Total intake quantity must be strictly greater than zero.")

            # 5. Cost Provenance Validation
            purchase_cost = validated_data.get("purchase_cost_per_sale_unit")
            if purchase_cost is None or purchase_cost <= Decimal("0.00"):
                raise InvalidCostError(
                    "Purchase cost per sale unit must be greater than zero to establish cost provenance."
                )

            unit_cost = (purchase_cost / Decimal(conversion_factor)).quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)
            total_cost_value = (Decimal(total_base_units) * unit_cost).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

            # 6. Batch Normalization & Consistency
            batch_number = validated_data["batch_number"].strip().upper()
            if not batch_number:
                raise BatchValidationError("Batch number cannot be empty.")

            expiry_date = validated_data["expiry_date"]
            if expiry_date <= timezone.localdate():
                raise BatchValidationError("Opening stock cannot be established for an expired batch.")

            mrp = validated_data["mrp"]
            if mrp < Decimal("0.00"):
                raise BatchValidationError("MRP cannot be negative.")

            unit_mrp = (mrp / Decimal(conversion_factor)).quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)

            # Obtain or create physical Batch under row lock
            batch, _ = Batch.objects.select_for_update().get_or_create(
                organization=store.organization,
                product=product,
                batch_number=batch_number,
                expiry_date=expiry_date,
                packaging_snapshot=packaging_snapshot,
                defaults={
                    "mrp": mrp,
                    "unit_mrp": unit_mrp,
                    "manufacturer_name": validated_data.get("manufacturer_name", "").strip() or "UNKNOWN_UNSPECIFIED",
                    "manufacturing_date": validated_data.get("manufacturing_date"),
                    "created_by": actor,
                }
            )

            if batch.is_recalled:
                raise BatchValidationError("Cannot intake stock for a recalled batch.")

            if batch.expiry_date <= timezone.localdate():
                raise BatchValidationError(f"Batch {batch.batch_number} has expired ({batch.expiry_date}). Cannot initialize opening stock into active inventory.")

            if batch.intake_status == "quarantine_review":
                raise BatchValidationError("Batch is under quarantine review and cannot be added to active inventory.")

            # 7. Deterministic Row Locking on StoreBatchStock
            try:
                with transaction.atomic():
                    stock, _ = StoreBatchStock.objects.get_or_create(
                        store=store,
                        batch=batch,
                        defaults={
                            "organization": store.organization,
                            "product": product,
                            "quantity_on_hand": 0,
                            "quantity_quarantined": 0,
                            "low_stock_threshold": validated_data.get("low_stock_threshold", 10)
                        }
                    )
            except IntegrityError:
                pass

            stock = StoreBatchStock.objects.select_for_update().get(store=store, batch=batch)

            # 8. Prevent Duplicate Opening Stock Initialization (evaluated under StoreBatchStock lock)
            existing_opening = StockMovement.objects.filter(
                store=store,
                batch=batch,
                movement_type="OPENING_STOCK"
            ).exists()
            if existing_opening:
                raise DuplicateOpeningStockError(
                    f"Opening stock has already been initialized for batch {batch.batch_number} at {store.name}. "
                    "Subsequent stock additions must be recorded via purchase receipts."
                )

            balance_before = stock.quantity_on_hand
            balance_after = balance_before + total_base_units

            stock.quantity_on_hand = balance_after
            stock.save(update_fields=["quantity_on_hand", "updated_at"])

            receipt_ref = validated_data.get("receipt_reference", "").strip() or f"OP-{timezone.now():%Y%m%d}-{str(idempotency_key)[:8]}"

            # 9. Create BatchInwardCostLayer for provenance
            BatchInwardCostLayer.objects.create(
                organization=store.organization,
                store=store,
                batch=batch,
                receipt_type="OPENING_STOCK",
                receipt_reference=receipt_ref,
                original_quantity=total_base_units,
                remaining_quantity=total_base_units,
                purchase_cost_per_sale_unit=purchase_cost,
                unit_cost=unit_cost
            )

            # 10. Record in immutable StockMovement ledger
            movement = StockMovement.objects.create(
                organization=store.organization,
                store=store,
                batch=batch,
                product=product,
                movement_type="OPENING_STOCK",
                direction="IN",
                quantity=total_base_units,
                balance_before=balance_before,
                balance_after=balance_after,
                quarantine_before=stock.quantity_quarantined,
                quarantine_after=stock.quantity_quarantined,
                unit_cost=unit_cost,
                unit_mrp=unit_mrp,
                total_cost_value=total_cost_value,
                reference_type="OPENING_STOCK",
                reference_id=receipt_ref,
                actor=actor,
                reason=validated_data.get("reason", "").strip() or "Initial Opening Stock Establishment"
            )

            # 11. Complete operation and cache replayable response
            response_data = {
                "status": "success",
                "message": "Opening stock successfully established.",
                "movement_id": str(movement.id),
                "batch_id": str(batch.id),
                "batch_number": batch.batch_number,
                "store_id": str(store.id),
                "store_name": store.name,
                "product_id": str(product.id),
                "product_name": product.name,
                "quantity_on_hand": stock.quantity_on_hand,
                "available_quantity": stock.available_quantity,
                "quantity_added_base_units": total_base_units,
                "unit_cost": str(unit_cost),
                "total_cost_value": str(total_cost_value),
                "receipt_reference": receipt_ref,
                "created_at": movement.created_at.isoformat(),
            }

            op.status = "completed"
            op.response_code = 201
            op.response_data = response_data
            op.completed_at = timezone.now()
            op.save(update_fields=["status", "response_code", "response_data", "completed_at"])

            # 12. Record AuditEvent
            AuditEvent.log_event(
                event_type="INVENTORY_OPENING_STOCK_POSTED",
                user=actor,
                organization=store.organization,
                details={
                    "store_id": str(store.id),
                    "store_name": store.name,
                    "batch_id": str(batch.id),
                    "batch_number": batch.batch_number,
                    "product_id": str(product.id),
                    "product_name": product.name,
                    "quantity_base_units": total_base_units,
                    "unit_cost": str(unit_cost),
                    "total_cost_value": str(total_cost_value),
                    "receipt_reference": receipt_ref,
                    "movement_id": str(movement.id),
                    "idempotency_key": str(idempotency_key),
                }
            )

            return response_data, True


    @classmethod
    def post_goods_receipt(
        cls,
        goods_receipt: GoodsReceipt,
        actor,
        idempotency_key,
        raw_payload: dict
    ) -> tuple[dict, bool]:
        """
        Atomically posts an approved Purchase Inward / Goods Receipt Note (GRN) to inventory.
        Validates line items, packaging conversion, batch expiry, quarantine status,
        and posts to StoreBatchStock, StockMovement, and BatchInwardCostLayer.
        """
        payload_hash = canonical_payload_hash(raw_payload)
        store = goods_receipt.store
        organization = goods_receipt.organization

        with transaction.atomic():
            # 1. Acquire or create idempotency claim with savepoint isolation
            while True:
                op = InventoryOperation.objects.select_for_update().filter(
                    idempotency_key=idempotency_key
                ).first()

                if op:
                    if op.payload_hash != payload_hash:
                        raise IdempotencyPayloadConflictError(
                            "Idempotency key has already been used for a different request payload."
                        )
                    if op.status == "completed":
                        return op.response_data, False
                    elif op.status == "in_progress":
                        raise IdempotencyConflictError(
                            "Operation is currently in progress. Please retry shortly."
                        )
                    elif op.status == "failed":
                        raise StockLedgerError(
                            f"Previous attempt with this key failed: {op.error_message}"
                        )
                    break

                try:
                    with transaction.atomic():
                        op = InventoryOperation.objects.create(
                            idempotency_key=idempotency_key,
                            organization=organization,
                            store=store,
                            actor=actor,
                            operation_type="GOODS_RECEIPT_POST",
                            payload_hash=payload_hash,
                            status="in_progress"
                        )
                    break
                except IntegrityError:
                    continue

            # 2. Lock GoodsReceipt header and validate status
            grn = GoodsReceipt.objects.select_for_update().select_related(
                "store", "organization", "supplier"
            ).get(id=goods_receipt.id)

            if grn.status == "POSTED":
                return op.response_data or {"status": "success", "message": "Already posted."}, False

            if grn.status == "CANCELLED":
                raise StockLedgerError("Cancelled goods receipts cannot be posted to inventory.")

            # Validate actor authorization
            if not is_user_org_owner(actor, organization) and not is_user_assigned_store_manager(actor, store):
                op.status = "failed"
                op.error_message = "Only organization owners and assigned store managers can post goods receipts."
                op.save(update_fields=["status", "error_message"])
                raise StorePermissionDeniedError("Only organization owners and assigned store managers can post goods receipts.")

            if not organization.is_active or not store.organization.is_active:
                raise StorePermissionDeniedError("Organization is inactive.")

            if not grn.supplier.is_active:
                raise BatchValidationError(f"Supplier {grn.supplier.name} is deactivated. Cannot intake inventory.")

            items = list(grn.items.select_for_update().select_related("product", "packaging_snapshot"))
            if not items:
                raise StockLedgerError("Goods receipt has no line items to post.")

            # 3. Validate and process line items
            # Sort items deterministically by product_id and batch_number to avoid deadlocks
            items.sort(key=lambda it: (str(it.product_id), it.batch_number))

            total_taxable = Decimal("0.00")
            total_tax = Decimal("0.00")
            total_amt = Decimal("0.00")
            posted_item_summaries = []

            for item in items:
                product = item.product
                if not product.is_active:
                    raise BatchValidationError(f"Product {product.name} is inactive and cannot be intaken.")
                if product.organization_id != organization.id:
                    raise BatchValidationError(f"Product {product.name} does not belong to the organization.")

                snapshot = item.packaging_snapshot
                if snapshot.product_id != product.id:
                    raise BatchValidationError(f"Packaging snapshot does not match product {product.name}.")

                # Quantity rules
                conversion_factor = snapshot.conversion_factor
                sale_units = item.quantity_sale_units or 0
                loose_units = item.quantity_loose_base_units or 0

                if sale_units < 0 or loose_units < 0:
                    raise InvalidQuantityError(f"Quantities cannot be negative for product {product.name}.")

                if loose_units > 0 and not snapshot.is_loose_dispensing_allowed:
                    raise InvalidQuantityError(
                        f"Loose base units are prohibited for {product.name} under current packaging snapshot."
                    )

                if conversion_factor > 1 and loose_units >= conversion_factor:
                    raise InvalidQuantityError(
                        f"Loose units ({loose_units}) must be strictly less than conversion factor ({conversion_factor}) for {product.name}."
                    )

                total_base_units = (sale_units * conversion_factor) + loose_units
                if total_base_units <= 0:
                    raise InvalidQuantityError(f"Total base units must be strictly positive for product {product.name}.")

                # Expiry check (Asia/Kolkata timezone safe)
                if item.expiry_date <= timezone.localdate():
                    raise BatchValidationError(f"Batch {item.batch_number} is expired ({item.expiry_date}) and cannot be intaken.")

                # Cost calculations
                purchase_cost = item.purchase_cost_per_sale_unit
                if purchase_cost <= Decimal("0.00"):
                    raise InvalidCostError(f"Purchase cost must be strictly positive for product {product.name}.")

                unit_cost = (purchase_cost / Decimal(conversion_factor)).quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)
                unit_mrp = (item.mrp / Decimal(conversion_factor)).quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)

                line_taxable = (Decimal(sale_units) * purchase_cost).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
                tax_amt = (line_taxable * (item.tax_rate / Decimal("100.00"))).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
                line_total = line_taxable + tax_amt

                total_taxable += line_taxable
                total_tax += tax_amt
                total_amt += line_total

                item.total_base_units = total_base_units
                item.unit_cost = unit_cost
                item.unit_mrp = unit_mrp
                item.tax_amount = tax_amt
                item.total_cost = line_total

                # 4. Batch creation or lock
                batch_number = item.batch_number.strip().upper()
                batch, _ = Batch.objects.select_for_update().get_or_create(
                    organization=organization,
                    product=product,
                    batch_number=batch_number,
                    expiry_date=item.expiry_date,
                    packaging_snapshot=snapshot,
                    defaults={
                        "mrp": item.mrp,
                        "unit_mrp": unit_mrp,
                        "manufacturer_name": grn.supplier.name,
                        "manufacturing_date": item.manufacturing_date,
                        "created_by": actor,
                        "intake_status": "quarantine_review" if item.intake_status == "QUARANTINE_REVIEW" else "verified"
                    }
                )

                if batch.is_recalled:
                    raise BatchValidationError(f"Batch {batch_number} is recalled and cannot be intaken.")

                if batch.expiry_date <= timezone.localdate() and item.intake_status != "QUARANTINE_REVIEW":
                    raise BatchValidationError(f"Batch {batch_number} has expired ({item.expiry_date}). Direct intake into active stock is prohibited. Must be routed to quarantine review.")

                # 5. Deterministic row locking on StoreBatchStock
                try:
                    with transaction.atomic():
                        stock, _ = StoreBatchStock.objects.get_or_create(
                            store=store,
                            batch=batch,
                            defaults={
                                "organization": organization,
                                "product": product,
                                "quantity_on_hand": 0,
                                "quantity_quarantined": 0,
                                "low_stock_threshold": 10
                            }
                        )
                except IntegrityError:
                    pass

                stock = StoreBatchStock.objects.select_for_update().get(store=store, batch=batch)

                balance_before = stock.quantity_on_hand
                quarantine_before = stock.quantity_quarantined
                balance_after = balance_before + total_base_units
                quarantine_after = quarantine_before + (total_base_units if item.intake_status == "QUARANTINE_REVIEW" else 0)

                stock.quantity_on_hand = balance_after
                stock.quantity_quarantined = quarantine_after
                stock.save(update_fields=["quantity_on_hand", "quantity_quarantined", "updated_at"])

                # 6. Create BatchInwardCostLayer for perpetual FIFO tracking
                cost_layer = BatchInwardCostLayer.objects.create(
                    organization=organization,
                    store=store,
                    batch=batch,
                    receipt_type="PURCHASE_GRN",
                    receipt_reference=grn.grn_number,
                    original_quantity=total_base_units,
                    remaining_quantity=total_base_units,
                    purchase_cost_per_sale_unit=purchase_cost,
                    unit_cost=unit_cost
                )

                # 7. Record in immutable StockMovement ledger
                movement = StockMovement.objects.create(
                    organization=organization,
                    store=store,
                    batch=batch,
                    product=product,
                    movement_type="PURCHASE_RECEIPT",
                    direction="IN",
                    quantity=total_base_units,
                    balance_before=balance_before,
                    balance_after=balance_after,
                    quarantine_before=quarantine_before,
                    quarantine_after=quarantine_after,
                    unit_cost=unit_cost,
                    unit_mrp=unit_mrp,
                    total_cost_value=line_total,
                    reference_type="GOODS_RECEIPT",
                    reference_id=grn.grn_number,
                    actor=actor,
                    reason=f"Purchase Inward from {grn.supplier.name} (Inv: {grn.supplier_invoice_number})"
                )

                item.batch = batch
                item.cost_layer = cost_layer
                item.stock_movement = movement
                item.save(update_fields=[
                    "total_base_units", "unit_cost", "unit_mrp", "tax_amount",
                    "total_cost", "batch", "cost_layer", "stock_movement"
                ])

                posted_item_summaries.append({
                    "item_id": str(item.id),
                    "product_id": str(product.id),
                    "product_name": product.name,
                    "batch_id": str(batch.id),
                    "batch_number": batch.batch_number,
                    "quantity_base_units": total_base_units,
                    "unit_cost": str(unit_cost),
                    "total_cost": str(line_total),
                    "intake_status": item.intake_status,
                })

            # 8. Finalize GoodsReceipt header
            grn.status = "POSTED"
            grn.posted_by = actor
            grn.posted_at = timezone.now()
            grn.total_taxable_amount = total_taxable
            grn.total_tax_amount = total_tax
            grn.total_amount = total_amt
            grn.save(update_fields=[
                "status", "posted_by", "posted_at",
                "total_taxable_amount", "total_tax_amount", "total_amount", "updated_at"
            ])

            # 9. Complete operation and cache replay response
            response_data = {
                "status": "success",
                "message": f"Goods receipt {grn.grn_number} successfully posted to inventory.",
                "grn_id": str(grn.id),
                "grn_number": grn.grn_number,
                "store_id": str(store.id),
                "store_name": store.name,
                "supplier_id": str(grn.supplier.id),
                "supplier_name": grn.supplier.name,
                "supplier_invoice_number": grn.supplier_invoice_number,
                "items_count": len(posted_item_summaries),
                "total_taxable_amount": str(total_taxable),
                "total_tax_amount": str(total_tax),
                "total_amount": str(total_amt),
                "posted_at": grn.posted_at.isoformat(),
                "items": posted_item_summaries,
            }

            op.status = "completed"
            op.response_code = 200
            op.response_data = response_data
            op.completed_at = timezone.now()
            op.save(update_fields=["status", "response_code", "response_data", "completed_at"])

            # 10. Audit event
            AuditEvent.log_event(
                event_type="INVENTORY_GOODS_RECEIPT_POSTED",
                user=actor,
                organization=organization,
                details={
                    "store_id": str(store.id),
                    "store_name": store.name,
                    "grn_id": str(grn.id),
                    "grn_number": grn.grn_number,
                    "supplier_id": str(grn.supplier.id),
                    "supplier_name": grn.supplier.name,
                    "supplier_invoice_number": grn.supplier_invoice_number,
                    "items_count": len(posted_item_summaries),
                    "total_amount": str(total_amt),
                    "idempotency_key": str(idempotency_key),
                }
            )

            return response_data, True

    @classmethod
    def dispatch_stock_transfer(
        cls,
        transfer: StockTransfer,
        actor,
        idempotency_key,
        raw_payload: dict
    ) -> tuple[dict, bool]:
        """
        Atomically dispatches an approved inter-store transfer from the source store.
        Revalidates availability, locks source store inventory rows deterministically,
        deducts physical on-hand stock, records outward StockMovement, and marks transfer as DISPATCHED.
        """
        payload_hash = canonical_payload_hash(raw_payload)
        source_store = transfer.source_store
        organization = transfer.organization

        with transaction.atomic():
            # 1. Idempotency claim with savepoint
            while True:
                op = InventoryOperation.objects.select_for_update().filter(
                    idempotency_key=idempotency_key
                ).first()

                if op:
                    if op.payload_hash != payload_hash:
                        raise IdempotencyPayloadConflictError("Idempotency key has already been used for a different payload.")
                    if op.status == "completed":
                        return op.response_data, False
                    elif op.status == "in_progress":
                        raise IdempotencyConflictError("Dispatch operation is currently in progress. Please retry.")
                    elif op.status == "failed":
                        raise StockLedgerError(f"Previous dispatch attempt failed: {op.error_message}")
                    break

                try:
                    with transaction.atomic():
                        op = InventoryOperation.objects.create(
                            idempotency_key=idempotency_key,
                            organization=organization,
                            store=source_store,
                            actor=actor,
                            operation_type="TRANSFER_DISPATCH",
                            payload_hash=payload_hash,
                            status="in_progress"
                        )
                    break
                except IntegrityError:
                    continue

            # 2. Lock StockTransfer and validate state
            trf = StockTransfer.objects.select_for_update().select_related(
                "source_store", "destination_store", "organization"
            ).get(id=transfer.id)

            if trf.status != "SUBMITTED" and trf.status != "APPROVED" and trf.status != "DRAFT":
                raise StockLedgerError(f"Cannot dispatch transfer with status '{trf.status}'.")

            # Validate actor authorization (Org Owner or Manager assigned to source store)
            if not is_user_org_owner(actor, organization) and not is_user_assigned_store_manager(actor, source_store):
                op.status = "failed"
                op.error_message = "Only organization owners and assigned source store managers can dispatch transfers."
                op.save(update_fields=["status", "error_message"])
                raise StorePermissionDeniedError("Only organization owners and assigned source store managers can dispatch transfers.")

            items = list(trf.items.select_for_update().select_related("product", "batch", "packaging_snapshot"))
            if not items:
                raise StockLedgerError("Cannot dispatch a transfer with no line items.")

            # Sort items deterministically by batch_id to prevent deadlocks
            items.sort(key=lambda it: str(it.batch_id))

            dispatched_summaries = []

            for item in items:
                batch = item.batch
                product = item.product

                if not product.is_active:
                    raise BatchValidationError(f"Product '{product.name}' is inactive and cannot be transferred.")

                # Expiry check (Asia/Kolkata timezone safe)
                if batch.expiry_date <= timezone.localdate():
                    raise BatchValidationError(f"Batch {batch.batch_number} is expired ({batch.expiry_date}) and cannot be dispatched.")

                if batch.is_recalled:
                    raise BatchValidationError(f"Batch {batch.batch_number} is recalled and cannot be dispatched.")

                if batch.intake_status == "quarantine_review":
                    raise BatchValidationError(f"Batch {batch.batch_number} is in quarantine review and cannot be dispatched.")

                # Acquire row lock on source store batch stock
                stock = StoreBatchStock.objects.select_for_update().filter(
                    store=source_store,
                    batch=batch
                ).first()

                if not stock or stock.available_quantity < item.quantity_requested:
                    avail = stock.available_quantity if stock else 0
                    raise InvalidQuantityError(
                        f"Insufficient available stock for batch {batch.batch_number} at {source_store.name}. "
                        f"Requested: {item.quantity_requested}, Available: {avail} base units."
                    )

                # Deduct stock at source
                balance_before = stock.quantity_on_hand
                balance_after = balance_before - item.quantity_requested
                stock.quantity_on_hand = balance_after
                stock.save(update_fields=["quantity_on_hand", "updated_at"])

                # Determine cost basis from latest cost layer at source
                source_cost_layer = BatchInwardCostLayer.objects.filter(
                    store=source_store,
                    batch=batch
                ).order_by("-created_at").first()
                unit_cost = source_cost_layer.unit_cost if source_cost_layer else Decimal("0.0000")
                unit_mrp = batch.unit_mrp

                # Record outward StockMovement
                mvt = StockMovement.objects.create(
                    organization=organization,
                    store=source_store,
                    batch=batch,
                    product=product,
                    movement_type="TRANSFER_DISPATCH",
                    direction="OUT",
                    quantity=item.quantity_requested,
                    balance_before=balance_before,
                    balance_after=balance_after,
                    quarantine_before=stock.quantity_quarantined,
                    quarantine_after=stock.quantity_quarantined,
                    unit_cost=unit_cost,
                    unit_mrp=unit_mrp,
                    total_cost_value=(Decimal(item.quantity_requested) * unit_cost).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP),
                    reference_type="STOCK_TRANSFER",
                    reference_id=trf.transfer_number,
                    actor=actor,
                    reason=f"Inter-store transfer dispatch to {trf.destination_store.name} ({trf.transfer_number})"
                )

                item.quantity_dispatched = item.quantity_requested
                item.unit_cost = unit_cost
                item.unit_mrp = unit_mrp
                item.dispatch_movement = mvt
                item.status = "DISPATCHED"
                item.save(update_fields=[
                    "quantity_dispatched", "unit_cost", "unit_mrp", "dispatch_movement", "status"
                ])

                dispatched_summaries.append({
                    "item_id": str(item.id),
                    "product_id": str(product.id),
                    "product_name": product.name,
                    "batch_id": str(batch.id),
                    "batch_number": batch.batch_number,
                    "quantity_dispatched": item.quantity_dispatched,
                    "unit_cost": str(unit_cost),
                })

            # Update transfer header status
            trf.status = "DISPATCHED"
            trf.dispatched_by = actor
            trf.dispatched_at = timezone.now()
            trf.save(update_fields=["status", "dispatched_by", "dispatched_at", "updated_at"])

            response_data = {
                "status": "success",
                "message": f"Transfer {trf.transfer_number} successfully dispatched.",
                "transfer_id": str(trf.id),
                "transfer_number": trf.transfer_number,
                "source_store_id": str(source_store.id),
                "source_store_name": source_store.name,
                "destination_store_id": str(trf.destination_store.id),
                "destination_store_name": trf.destination_store.name,
                "dispatched_at": trf.dispatched_at.isoformat(),
                "items_count": len(dispatched_summaries),
                "items": dispatched_summaries,
            }

            op.status = "completed"
            op.response_code = 200
            op.response_data = response_data
            op.completed_at = timezone.now()
            op.save(update_fields=["status", "response_code", "response_data", "completed_at"])

            AuditEvent.log_event(
                event_type="INVENTORY_TRANSFER_DISPATCHED",
                user=actor,
                organization=organization,
                details={
                    "transfer_id": str(trf.id),
                    "transfer_number": trf.transfer_number,
                    "source_store_id": str(source_store.id),
                    "destination_store_id": str(trf.destination_store.id),
                    "items_count": len(dispatched_summaries),
                    "idempotency_key": str(idempotency_key),
                }
            )

            return response_data, True

    @classmethod
    def receive_stock_transfer(
        cls,
        transfer: StockTransfer,
        actor,
        idempotency_key,
        receipt_lines: list[dict],
        raw_payload: dict
    ) -> tuple[dict, bool]:
        """
        Atomically records destination receipt for an in-transit transfer.
        Supports full receipt, partial receipt, and discrepancy holds (damaged, missing, excess).
        Credits verified stock to destination StoreBatchStock, records inward StockMovement,
        and creates FIFO BatchInwardCostLayer referencing original source valuation.
        """
        payload_hash = canonical_payload_hash(raw_payload)
        dest_store = transfer.destination_store
        organization = transfer.organization

        with transaction.atomic():
            # 1. Idempotency claim with savepoint
            while True:
                op = InventoryOperation.objects.select_for_update().filter(
                    idempotency_key=idempotency_key
                ).first()

                if op:
                    if op.payload_hash != payload_hash:
                        raise IdempotencyPayloadConflictError("Idempotency key has already been used for a different payload.")
                    if op.status == "completed":
                        return op.response_data, False
                    elif op.status == "in_progress":
                        raise IdempotencyConflictError("Receipt operation is currently in progress. Please retry.")
                    elif op.status == "failed":
                        raise StockLedgerError(f"Previous receipt attempt failed: {op.error_message}")
                    break

                try:
                    with transaction.atomic():
                        op = InventoryOperation.objects.create(
                            idempotency_key=idempotency_key,
                            organization=organization,
                            store=dest_store,
                            actor=actor,
                            operation_type="TRANSFER_RECEIPT",
                            payload_hash=payload_hash,
                            status="in_progress"
                        )
                    break
                except IntegrityError:
                    continue

            # 2. Lock StockTransfer and validate state
            trf = StockTransfer.objects.select_for_update().select_related(
                "source_store", "destination_store", "organization"
            ).get(id=transfer.id)

            if trf.status in ["COMPLETED", "CANCELLED"]:
                raise StockLedgerError(f"Cannot receive transfer with status '{trf.status}'.")

            if trf.status not in ["DISPATCHED", "PARTIALLY_RECEIVED", "DISCREPANCY_HOLD"]:
                raise StockLedgerError(f"Transfer must be dispatched before it can be received (current status: {trf.status}).")

            # Validate actor authorization (Org Owner or Manager assigned to destination store)
            if not is_user_org_owner(actor, organization) and not is_user_assigned_store_manager(actor, dest_store):
                op.status = "failed"
                op.error_message = "Only organization owners and assigned destination store managers can receive transfers."
                op.save(update_fields=["status", "error_message"])
                raise StorePermissionDeniedError("Only organization owners and assigned destination store managers can receive transfers.")

            items_by_id = {str(it.id): it for it in trf.items.select_for_update().select_related("product", "batch", "packaging_snapshot")}

            receipt_summaries = []
            has_new_discrepancy = False

            for line in receipt_lines:
                item_id = str(line.get("item_id", ""))
                item = items_by_id.get(item_id)
                if not item:
                    raise StockLedgerError(f"Line item '{item_id}' does not belong to transfer {trf.transfer_number}.")

                qty_rec = int(line.get("quantity_received", 0) or 0)
                qty_dam = int(line.get("quantity_damaged", 0) or 0)
                qty_mis = int(line.get("quantity_missing", 0) or 0)
                qty_exc = int(line.get("quantity_excess", 0) or 0)

                if qty_rec < 0 or qty_dam < 0 or qty_mis < 0 or qty_exc < 0:
                    raise InvalidQuantityError("Receipt quantities cannot be negative.")

                if qty_rec == 0 and qty_dam == 0 and qty_mis == 0 and qty_exc == 0:
                    continue

                remaining_in_transit = item.in_transit_quantity
                # Over-receipt check
                accounted_dispatch = qty_rec + qty_dam + qty_mis
                if accounted_dispatch > remaining_in_transit + qty_exc:
                    raise InvalidQuantityError(
                        f"Accounted quantity ({accounted_dispatch}) exceeds remaining in-transit stock ({remaining_in_transit}) for {item.product.name}."
                    )

                batch = item.batch
                product = item.product

                # Credit good stock to destination store batch balance
                if qty_rec > 0:
                    try:
                        with transaction.atomic():
                            dest_stock, _ = StoreBatchStock.objects.get_or_create(
                                store=dest_store,
                                batch=batch,
                                defaults={
                                    "organization": organization,
                                    "product": product,
                                    "quantity_on_hand": 0,
                                    "quantity_quarantined": 0,
                                    "low_stock_threshold": 10
                                }
                            )
                    except IntegrityError:
                        pass

                    dest_stock = StoreBatchStock.objects.select_for_update().get(store=dest_store, batch=batch)
                    bal_before = dest_stock.quantity_on_hand
                    bal_after = bal_before + qty_rec
                    dest_stock.quantity_on_hand = bal_after

                    # Phase 2C.4: If batch was recalled or expired while in-transit, auto-quarantine arriving stock immediately
                    is_compromised = batch.is_recalled or batch.expiry_date <= timezone.localdate()
                    if is_compromised:
                        dest_stock.quantity_quarantined += qty_rec
                        dest_stock.save(update_fields=["quantity_on_hand", "quantity_quarantined", "updated_at"])
                        StockQuarantineRecord.objects.create(
                            organization=organization,
                            store=dest_store,
                            batch=batch,
                            product=product,
                            quarantine_number=generate_quarantine_number(organization),
                            quantity_quarantined=qty_rec,
                            reason_code="RECALL" if batch.is_recalled else "OTHER",
                            notes=f"Auto-quarantined upon transfer arrival: batch is {'under active recall' if batch.is_recalled else 'expired'} during transit.",
                            quarantined_by=actor
                        )
                    else:
                        dest_stock.save(update_fields=["quantity_on_hand", "updated_at"])

                    # Create FIFO inward cost layer at destination
                    BatchInwardCostLayer.objects.create(
                        organization=organization,
                        store=dest_store,
                        batch=batch,
                        receipt_type="TRANSFER_IN",
                        receipt_reference=trf.transfer_number,
                        original_quantity=qty_rec,
                        remaining_quantity=qty_rec,
                        purchase_cost_per_sale_unit=(item.unit_cost * Decimal(item.packaging_snapshot.conversion_factor)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP),
                        unit_cost=item.unit_cost
                    )

                    # Record inward StockMovement
                    mvt = StockMovement.objects.create(
                        organization=organization,
                        store=dest_store,
                        batch=batch,
                        product=product,
                        movement_type="TRANSFER_IN",
                        direction="IN",
                        quantity=qty_rec,
                        balance_before=bal_before,
                        balance_after=bal_after,
                        quarantine_before=dest_stock.quantity_quarantined,
                        quarantine_after=dest_stock.quantity_quarantined,
                        unit_cost=item.unit_cost,
                        unit_mrp=item.unit_mrp,
                        total_cost_value=(Decimal(qty_rec) * item.unit_cost).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP),
                        reference_type="STOCK_TRANSFER",
                        reference_id=trf.transfer_number,
                        actor=actor,
                        reason=f"Inter-store transfer receipt from {trf.source_store.name} ({trf.transfer_number})"
                    )
                    item.receipt_movement = mvt

                # Update line item tallies
                item.quantity_received += qty_rec
                item.quantity_damaged += qty_dam
                item.quantity_missing += qty_mis
                item.quantity_excess += qty_exc

                # Record discrepancies if any damaged, missing, or excess units exist
                evidence = line.get("evidence_notes", "").strip()

                if qty_mis > 0:
                    TransferDiscrepancy.objects.create(
                        transfer=trf,
                        transfer_item=item,
                        discrepancy_type="SHORTAGE",
                        expected_quantity=remaining_in_transit,
                        actual_quantity=qty_rec,
                        discrepancy_quantity=qty_mis,
                        evidence_notes=evidence or "In-transit shortage reported upon arrival.",
                        status="PENDING_INVESTIGATION",
                        reported_by=actor
                    )
                    has_new_discrepancy = True

                if qty_dam > 0:
                    TransferDiscrepancy.objects.create(
                        transfer=trf,
                        transfer_item=item,
                        discrepancy_type="DAMAGE",
                        expected_quantity=remaining_in_transit,
                        actual_quantity=qty_rec,
                        discrepancy_quantity=qty_dam,
                        evidence_notes=evidence or "Damaged stock identified upon receipt inspection.",
                        status="PENDING_INVESTIGATION",
                        reported_by=actor
                    )
                    has_new_discrepancy = True

                if qty_exc > 0:
                    TransferDiscrepancy.objects.create(
                        transfer=trf,
                        transfer_item=item,
                        discrepancy_type="EXCESS",
                        expected_quantity=remaining_in_transit,
                        actual_quantity=qty_rec + qty_exc,
                        discrepancy_quantity=qty_exc,
                        evidence_notes=evidence or "Unaccounted excess units delivered.",
                        status="PENDING_INVESTIGATION",
                        reported_by=actor
                    )
                    has_new_discrepancy = True

                # Update line item status
                if qty_dam > 0 or qty_mis > 0 or qty_exc > 0:
                    item.status = "DISCREPANCY"
                elif item.in_transit_quantity == 0:
                    item.status = "RECEIVED"
                else:
                    item.status = "PARTIAL"

                item.save(update_fields=[
                    "quantity_received", "quantity_damaged", "quantity_missing",
                    "quantity_excess", "receipt_movement", "status"
                ])

                receipt_summaries.append({
                    "item_id": str(item.id),
                    "product_name": product.name,
                    "batch_number": batch.batch_number,
                    "received": qty_rec,
                    "damaged": qty_dam,
                    "missing": qty_mis,
                    "excess": qty_exc,
                    "remaining_in_transit": item.in_transit_quantity,
                    "line_status": item.status,
                })

            # Check if any unresolved discrepancies exist across the entire transfer
            unresolved_discrepancies = trf.discrepancies.filter(status__in=["PENDING_INVESTIGATION", "INVESTIGATING"]).exists()

            if unresolved_discrepancies or has_new_discrepancy:
                trf.status = "DISCREPANCY_HOLD"
            elif all(it.in_transit_quantity == 0 for it in trf.items.all()):
                trf.status = "COMPLETED"
            else:
                trf.status = "PARTIALLY_RECEIVED"

            trf.received_by = actor
            trf.received_at = timezone.now()
            trf.save(update_fields=["status", "received_by", "received_at", "updated_at"])

            response_data = {
                "status": "success",
                "message": f"Transfer {trf.transfer_number} receipt recorded. Status: {trf.status}",
                "transfer_id": str(trf.id),
                "transfer_number": trf.transfer_number,
                "transfer_status": trf.status,
                "destination_store_id": str(dest_store.id),
                "destination_store_name": dest_store.name,
                "received_at": trf.received_at.isoformat(),
                "items": receipt_summaries,
            }

            op.status = "completed"
            op.response_code = 200
            op.response_data = response_data
            op.completed_at = timezone.now()
            op.save(update_fields=["status", "response_code", "response_data", "completed_at"])

            AuditEvent.log_event(
                event_type="INVENTORY_TRANSFER_RECEIVED",
                user=actor,
                organization=organization,
                details={
                    "transfer_id": str(trf.id),
                    "transfer_number": trf.transfer_number,
                    "transfer_status": trf.status,
                    "source_store_id": str(trf.source_store.id),
                    "destination_store_id": str(dest_store.id),
                    "idempotency_key": str(idempotency_key),
                }
            )

            return response_data, True

    @classmethod
    def resolve_transfer_discrepancy(
        cls,
        discrepancy: TransferDiscrepancy,
        actor,
        resolution_decision: str,
        resolution_notes: str
    ) -> dict:
        """
        Records an authorized investigation review on an in-transit transfer discrepancy.
        Enforces separation of duties and holds final financial liability pending approved policy.
        """
        transfer = discrepancy.transfer
        organization = transfer.organization

        with transaction.atomic():
            disc = TransferDiscrepancy.objects.select_for_update().select_related("transfer").get(id=discrepancy.id)
            if disc.status == "RESOLVED":
                raise StockLedgerError("This discrepancy has already been resolved and closed.")

            # Validate actor authorization (Org Owner or assigned Store Manager)
            if not is_user_org_owner(actor, organization) and not is_user_assigned_store_manager(actor, transfer.destination_store):
                raise StorePermissionDeniedError("Only organization owners and assigned store managers can resolve discrepancies.")

            disc.resolution_decision = resolution_decision
            disc.resolution_notes = resolution_notes.strip()
            disc.reviewed_by = actor
            disc.status = "RESOLVED"
            disc.resolved_at = timezone.now()
            disc.save(update_fields=["resolution_decision", "resolution_notes", "reviewed_by", "status", "resolved_at"])

            # Check if all discrepancies on the transfer are now resolved
            trf = StockTransfer.objects.select_for_update().get(id=transfer.id)
            has_unresolved = trf.discrepancies.filter(status__in=["PENDING_INVESTIGATION", "INVESTIGATING"]).exists()

            if not has_unresolved:
                if all(it.in_transit_quantity == 0 for it in trf.items.all()):
                    trf.status = "COMPLETED"
                    trf.save(update_fields=["status", "updated_at"])

            AuditEvent.log_event(
                event_type="INVENTORY_TRANSFER_DISCREPANCY_RESOLVED",
                user=actor,
                organization=organization,
                details={
                    "discrepancy_id": str(disc.id),
                    "transfer_id": str(trf.id),
                    "transfer_number": trf.transfer_number,
                    "resolution_decision": resolution_decision,
                    "resolution_notes": resolution_notes,
                }
            )

            return {
                "status": "success",
                "message": f"Discrepancy {disc.id} successfully resolved.",
                "discrepancy_id": str(disc.id),
                "resolution_decision": disc.resolution_decision,
                "transfer_status": trf.status,
            }

    # =========================================================================
    # Milestone 2C.3: Stock Adjustments & Physical Stock Count Service Methods
    # =========================================================================

    @classmethod
    def calculate_batch_unit_cost(cls, store: Store, batch: Batch) -> Decimal:
        """
        Resolves the unit cost basis for valuation from the latest inward cost layer at this store.
        If no cost layer exists at store, falls back to batch unit MRP as a conservative upper bound.
        """
        layer = BatchInwardCostLayer.objects.filter(store=store, batch=batch).order_by("-created_at").first()
        if layer and layer.unit_cost > Decimal("0.0000"):
            return layer.unit_cost
        if batch.unit_mrp > Decimal("0.0000"):
            return batch.unit_mrp
        return Decimal("0.0000")

    @classmethod
    def review_stock_adjustment(
        cls,
        adjustment: StockAdjustment,
        actor,
        decision: str,
        review_notes: str
    ) -> dict:
        """
        Records an authorized review decision (APPROVE or REJECT) on a submitted StockAdjustment.
        Enforces separation of duties (requester cannot self-approve) and owner-only escalation rules.
        """
        organization = adjustment.organization
        store = adjustment.store

        # 1. Separation of duties: requester cannot approve their own adjustment
        if adjustment.requested_by_id == actor.id:
            raise StorePermissionDeniedError(
                "Separation of duties violation: An inventory adjustment cannot be approved by the requester."
            )

        # 2. Check user role and approval policy
        is_owner = is_user_org_owner(actor, organization)
        is_mgr = is_user_assigned_store_manager(actor, store)

        if not is_owner and not is_mgr:
            raise StorePermissionDeniedError("Only organization owners and assigned store managers can review adjustments.")

        # 3. Check configurable policy thresholds
        policy = AdjustmentApprovalPolicy.objects.filter(
            organization=organization,
            store=store
        ).first() or AdjustmentApprovalPolicy.objects.filter(
            organization=organization,
            store__isnull=True
        ).first()

        decision = decision.strip().upper()
        if decision not in ["APPROVE", "REJECT"]:
            raise StockLedgerError("Review decision must be 'APPROVE' or 'REJECT'.")

        with transaction.atomic():
            adj = StockAdjustment.objects.select_for_update().select_related("store", "organization").get(id=adjustment.id)
            if adj.status != "SUBMITTED":
                raise StockLedgerError(f"Cannot review adjustment {adj.adjustment_number}: status is '{adj.status}', must be 'SUBMITTED'.")

            if decision == "APPROVE":
                # Evaluate escalation requirements
                if not is_owner:
                    if not policy or not policy.is_configured:
                        if adj.reason_code in ["DAMAGE", "EXPIRY_WRITEOFF", "PHYSICAL_SHORTAGE"]:
                            raise StorePermissionDeniedError(
                                "Pending policy configuration: write-off and shortage adjustments strictly require Organization Owner approval."
                            )
                    else:
                        if policy.require_owner_for_writeoff and adj.reason_code in ["DAMAGE", "EXPIRY_WRITEOFF", "PHYSICAL_SHORTAGE"]:
                            raise StorePermissionDeniedError(
                                "Active policy control: write-off and shortage adjustments strictly require Organization Owner approval."
                            )
                        if policy.max_manager_adjustment_value and adj.calculated_valuation > policy.max_manager_adjustment_value:
                            raise StorePermissionDeniedError(
                                f"Adjustment valuation (₹{adj.calculated_valuation}) exceeds Store Manager threshold (₹{policy.max_manager_adjustment_value}). Owner approval required."
                            )
                        if policy.max_manager_adjustment_quantity and abs(adj.adjustment_quantity) > policy.max_manager_adjustment_quantity:
                            raise StorePermissionDeniedError(
                                f"Adjustment quantity ({abs(adj.adjustment_quantity)}) exceeds Store Manager threshold ({policy.max_manager_adjustment_quantity}). Owner approval required."
                            )

                adj.status = "APPROVED"
                event_name = "INVENTORY_ADJUSTMENT_APPROVED"
            else:
                adj.status = "REJECTED"
                event_name = "INVENTORY_ADJUSTMENT_REJECTED"
                if adj.count_item:
                    adj.count_item.status = "REJECTED"
                    adj.count_item.save(update_fields=["status", "updated_at"])

            adj.reviewed_by = actor
            adj.reviewed_at = timezone.now()
            adj.review_notes = review_notes.strip()
            adj.save(update_fields=["status", "reviewed_by", "reviewed_at", "review_notes", "updated_at"])

            AuditEvent.log_event(
                event_type=event_name,
                user=actor,
                organization=organization,
                details={
                    "adjustment_id": str(adj.id),
                    "adjustment_number": adj.adjustment_number,
                    "store_id": str(store.id),
                    "status": adj.status,
                    "decision": decision,
                    "review_notes": review_notes,
                }
            )

            return {
                "status": "success",
                "message": f"Adjustment {adj.adjustment_number} marked as {adj.status}.",
                "adjustment_id": str(adj.id),
                "adjustment_number": adj.adjustment_number,
                "adjustment_status": adj.status,
            }

    @classmethod
    def post_stock_adjustment(
        cls,
        adjustment: StockAdjustment,
        actor,
        idempotency_key,
        raw_payload: dict
    ) -> tuple[dict, bool]:
        """
        Atomically posts an approved StockAdjustment to physical stock balances and append-only ledger.
        Handles negative write-offs (consuming FIFO cost layers) and positive surplus (creating cost layers).
        Guarantees non-negative inventory conservation and idempotency replay safety.
        """
        payload_hash = canonical_payload_hash(raw_payload)
        organization = adjustment.organization
        store = adjustment.store

        # 1. Enforce RBAC (Org Owner or assigned Store Manager)
        if not is_user_org_owner(actor, organization) and not is_user_assigned_store_manager(actor, store):
            raise StorePermissionDeniedError("Only organization owners and assigned store managers can post adjustments.")

        with transaction.atomic():
            # 2. Idempotency claim
            while True:
                op = InventoryOperation.objects.select_for_update().filter(
                    idempotency_key=idempotency_key
                ).first()

                if op:
                    if op.payload_hash != payload_hash:
                        raise IdempotencyPayloadConflictError("Idempotency key has already been used for a different payload.")
                    if op.status == "completed":
                        return op.response_data, False
                    elif op.status == "in_progress":
                        raise IdempotencyConflictError("Adjustment posting is currently in progress. Please retry.")
                    elif op.status == "failed":
                        raise StockLedgerError(f"Previous adjustment posting attempt failed: {op.error_message}")
                    break

                try:
                    with transaction.atomic():
                        op = InventoryOperation.objects.create(
                            idempotency_key=idempotency_key,
                            organization=organization,
                            store=store,
                            actor=actor,
                            operation_type="STOCK_ADJUSTMENT",
                            payload_hash=payload_hash,
                            status="in_progress"
                        )
                    break
                except IntegrityError:
                    continue

            # 3. Lock StockAdjustment and validate approval status
            adj = StockAdjustment.objects.select_for_update().select_related(
                "store", "batch", "product", "packaging_snapshot", "organization"
            ).get(id=adjustment.id)

            if adj.status == "POSTED":
                return op.response_data or {"status": "success", "message": "Already posted."}, False

            if adj.status != "APPROVED":
                op.status = "failed"
                op.error_message = f"Adjustment cannot be posted with status '{adj.status}'. Approval is required before posting."
                op.save(update_fields=["status", "error_message"])
                raise StockLedgerError(f"Adjustment cannot be posted with status '{adj.status}'. Approval is required before posting.")

            # 4. Lock StoreBatchStock
            batch = adj.batch
            product = adj.product

            stock, _ = StoreBatchStock.objects.select_for_update().get_or_create(
                store=store,
                batch=batch,
                defaults={
                    "organization": organization,
                    "product": product,
                    "quantity_on_hand": 0,
                    "quantity_quarantined": 0,
                    "low_stock_threshold": 10
                }
            )

            if adj.adjustment_quantity > 0:
                if batch.is_recalled:
                    raise BatchValidationError(f"Cannot increase stock for batch {batch.batch_number}: batch is under active recall.")
                if batch.expiry_date <= timezone.localdate():
                    raise BatchValidationError(f"Cannot increase active stock for batch {batch.batch_number}: batch has expired ({batch.expiry_date}).")

            current_balance = stock.quantity_on_hand
            resulting_balance = current_balance + adj.adjustment_quantity

            if resulting_balance < 0:
                op.status = "failed"
                op.error_message = f"Adjustment of {adj.adjustment_quantity:+d} units would cause negative stock balance ({resulting_balance}) at {store.name}."
                op.save(update_fields=["status", "error_message"])
                raise InvalidQuantityError(
                    f"Adjustment of {adj.adjustment_quantity:+d} units would cause negative stock balance ({resulting_balance}) at {store.name}."
                )

            # 5. Apply balance mutation and ledger movement
            if adj.adjustment_quantity < 0:
                # Stock Reduction / Write-off
                needed = abs(adj.adjustment_quantity)
                stock.quantity_on_hand = resulting_balance

                # If writing off damaged stock that was previously in quarantine, adjust quarantine counter
                quar_before = stock.quantity_quarantined
                if adj.reason_code == "DAMAGE" and stock.quantity_quarantined >= needed:
                    stock.quantity_quarantined -= needed
                quar_after = stock.quantity_quarantined
                stock.save(update_fields=["quantity_on_hand", "quantity_quarantined", "updated_at"])

                # FIFO cost layer depletion
                cost_layers = BatchInwardCostLayer.objects.select_for_update().filter(
                    store=store,
                    batch=batch,
                    remaining_quantity__gt=0
                ).order_by("created_at")

                total_cost_consumed = Decimal("0.00")
                depleted_units = 0

                for layer in cost_layers:
                    if needed <= 0:
                        break
                    deduct = min(layer.remaining_quantity, needed)
                    layer.remaining_quantity -= deduct
                    layer.save(update_fields=["remaining_quantity"])
                    total_cost_consumed += (Decimal(deduct) * layer.unit_cost).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
                    depleted_units += deduct
                    needed -= deduct

                if needed > 0:
                    # Fallback unit cost for unlayered stock
                    total_cost_consumed += (Decimal(needed) * adj.unit_cost_basis).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
                    depleted_units += needed

                avg_unit_cost = (total_cost_consumed / Decimal(abs(adj.adjustment_quantity))).quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP) if adj.adjustment_quantity != 0 else Decimal("0.0000")

                if adj.reason_code == "DAMAGE":
                    mvt_type = "DAMAGE_WRITEOFF"
                elif adj.reason_code == "EXPIRY_WRITEOFF":
                    mvt_type = "EXPIRY_WRITEOFF"
                else:
                    mvt_type = "ADJUSTMENT_SUB"

                mvt = StockMovement.objects.create(
                    organization=organization,
                    store=store,
                    batch=batch,
                    product=product,
                    movement_type=mvt_type,
                    direction="OUT",
                    quantity=abs(adj.adjustment_quantity),
                    balance_before=current_balance,
                    balance_after=resulting_balance,
                    quarantine_before=quar_before,
                    quarantine_after=quar_after,
                    unit_cost=avg_unit_cost,
                    unit_mrp=batch.unit_mrp,
                    total_cost_value=total_cost_consumed,
                    reference_type="STOCK_ADJUSTMENT",
                    reference_id=adj.adjustment_number,
                    actor=actor,
                    reason=f"Stock adjustment {adj.adjustment_number} [{adj.reason_code}]: {adj.explanation}"
                )

            else:
                # Stock Increase / Verified Surplus
                stock.quantity_on_hand = resulting_balance
                stock.save(update_fields=["quantity_on_hand", "updated_at"])

                unit_cost = adj.unit_cost_basis
                total_cost = (Decimal(adj.adjustment_quantity) * unit_cost).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

                # Create FIFO cost layer for surplus stock
                BatchInwardCostLayer.objects.create(
                    organization=organization,
                    store=store,
                    batch=batch,
                    receipt_type="ADJUSTMENT_ADD",
                    receipt_reference=adj.adjustment_number,
                    original_quantity=adj.adjustment_quantity,
                    remaining_quantity=adj.adjustment_quantity,
                    purchase_cost_per_sale_unit=(unit_cost * Decimal(adj.packaging_snapshot.conversion_factor)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP),
                    unit_cost=unit_cost
                )

                mvt = StockMovement.objects.create(
                    organization=organization,
                    store=store,
                    batch=batch,
                    product=product,
                    movement_type="ADJUSTMENT_ADD",
                    direction="IN",
                    quantity=adj.adjustment_quantity,
                    balance_before=current_balance,
                    balance_after=resulting_balance,
                    quarantine_before=stock.quantity_quarantined,
                    quarantine_after=stock.quantity_quarantined,
                    unit_cost=unit_cost,
                    unit_mrp=batch.unit_mrp,
                    total_cost_value=total_cost,
                    reference_type="STOCK_ADJUSTMENT",
                    reference_id=adj.adjustment_number,
                    actor=actor,
                    reason=f"Stock adjustment {adj.adjustment_number} [{adj.reason_code}]: {adj.explanation}"
                )

            # 6. Update adjustment header
            adj.status = "POSTED"
            adj.posted_by = actor
            adj.posted_at = timezone.now()
            adj.stock_movement = mvt
            adj.resulting_quantity = resulting_balance
            adj.save(update_fields=["status", "posted_by", "posted_at", "stock_movement", "resulting_quantity", "updated_at"])

            # 7. If spawned from PhysicalStockCountItem, update item status
            if adj.count_item:
                count_item = adj.count_item
                count_item.status = "ADJUSTED"
                count_item.save(update_fields=["status", "updated_at"])

                # Check if entire count session can transition to COMPLETED
                count_session = count_item.stock_count
                unadjusted = count_session.items.exclude(status__in=["ADJUSTED", "APPROVED"]).exists()
                if not unadjusted:
                    count_session.status = "COMPLETED"
                    count_session.save(update_fields=["status", "updated_at"])

            response_data = {
                "status": "success",
                "message": f"Adjustment {adj.adjustment_number} successfully posted to inventory ledger.",
                "adjustment_id": str(adj.id),
                "adjustment_number": adj.adjustment_number,
                "store_id": str(store.id),
                "batch_number": batch.batch_number,
                "adjustment_quantity": adj.adjustment_quantity,
                "previous_balance": current_balance,
                "resulting_balance": resulting_balance,
                "movement_id": str(mvt.id),
                "posted_at": adj.posted_at.isoformat(),
            }

            op.status = "completed"
            op.response_code = 200
            op.response_data = response_data
            op.completed_at = timezone.now()
            op.save(update_fields=["status", "response_code", "response_data", "completed_at"])

            AuditEvent.log_event(
                event_type="INVENTORY_ADJUSTMENT_POSTED",
                user=actor,
                organization=organization,
                details={
                    "adjustment_id": str(adj.id),
                    "adjustment_number": adj.adjustment_number,
                    "store_id": str(store.id),
                    "batch_id": str(batch.id),
                    "adjustment_quantity": adj.adjustment_quantity,
                    "resulting_balance": resulting_balance,
                    "movement_id": str(mvt.id),
                    "idempotency_key": str(idempotency_key),
                }
            )

            return response_data, True

    # -------------------------------------------------------------------------
    # Physical Stock Count Methods
    # -------------------------------------------------------------------------

    @classmethod
    def start_physical_stock_count(
        cls,
        store: Store,
        actor,
        count_number: str,
        count_type: str = "CYCLE_COUNT",
        batch_ids: list = None,
        notes: str = ""
    ) -> PhysicalStockCount:
        """
        Initiates a physical inventory count session.
        Locks an instantaneous snapshot of system on-hand balances for selected batches (or all store batches).
        """
        organization = store.organization

        with transaction.atomic():
            snapshot_time = timezone.now()
            count_session = PhysicalStockCount.objects.create(
                organization=organization,
                store=store,
                count_number=count_number,
                count_type=count_type,
                status="IN_PROGRESS",
                snapshot_at=snapshot_time,
                initiated_by=actor,
                notes=notes.strip()
            )

            stock_qs = StoreBatchStock.objects.select_related(
                "batch", "product", "batch__packaging_snapshot"
            ).filter(store=store)

            if batch_ids:
                stock_qs = stock_qs.filter(batch_id__in=batch_ids)

            items_to_create = []
            for stock in stock_qs:
                items_to_create.append(
                    PhysicalStockCountItem(
                        stock_count=count_session,
                        product=stock.product,
                        batch=stock.batch,
                        packaging_snapshot=stock.batch.packaging_snapshot,
                        snapshot_system_quantity=stock.quantity_on_hand,
                        status="PENDING_COUNT"
                    )
                )

            if items_to_create:
                PhysicalStockCountItem.objects.bulk_create(items_to_create)

            AuditEvent.log_event(
                event_type="PHYSICAL_COUNT_STARTED",
                user=actor,
                organization=organization,
                details={
                    "count_id": str(count_session.id),
                    "count_number": count_session.count_number,
                    "store_id": str(store.id),
                    "items_count": len(items_to_create),
                    "snapshot_at": snapshot_time.isoformat(),
                }
            )

            return count_session

    @classmethod
    def record_count_quantities(
        cls,
        stock_count: PhysicalStockCount,
        actor,
        items_data: list[dict]
    ) -> dict:
        """
        Records physical count tallies from floor inspection.
        Updates counted_quantity and transitions items to 'COUNTED'.
        """
        if stock_count.status not in ["IN_PROGRESS", "RECOUNT_REQUIRED"]:
            raise StockLedgerError(f"Cannot record counts on session with status '{stock_count.status}'.")

        with transaction.atomic():
            items_by_id = {
                str(it.id): it for it in stock_count.items.select_for_update().select_related("product", "batch")
            }

            recorded_summaries = []
            for entry in items_data:
                item_id = str(entry.get("item_id", ""))
                item = items_by_id.get(item_id)
                if not item:
                    raise StockLedgerError(f"Count line item '{item_id}' does not belong to session {stock_count.count_number}.")

                qty = entry.get("counted_quantity")
                if qty is None or int(qty) < 0:
                    raise InvalidQuantityError("Counted quantity must be a non-negative integer.")

                item.counted_quantity = int(qty)
                item.counted_by = actor
                item.counted_at = timezone.now()
                item.notes = entry.get("notes", "").strip()
                item.status = "COUNTED"
                item.save(update_fields=["counted_quantity", "counted_by", "counted_at", "notes", "status", "updated_at"])

                recorded_summaries.append({
                    "item_id": str(item.id),
                    "product_name": item.product.name,
                    "batch_number": item.batch.batch_number,
                    "counted_quantity": item.counted_quantity,
                })

            # Check if all items in session are counted
            all_counted = not stock_count.items.filter(status="PENDING_COUNT").exists()
            if all_counted:
                stock_count.status = "SUBMITTED"
                stock_count.submitted_by = actor
                stock_count.submitted_at = timezone.now()
                stock_count.save(update_fields=["status", "submitted_by", "submitted_at", "updated_at"])

            return {
                "status": "success",
                "message": f"Recorded count tallies for {len(recorded_summaries)} items.",
                "count_id": str(stock_count.id),
                "count_status": stock_count.status,
                "items": recorded_summaries,
            }

    @classmethod
    def reconcile_physical_stock_count(
        cls,
        stock_count: PhysicalStockCount,
        actor
    ) -> dict:
        """
        Reconciles physical count against intervening stock movements occurred since snapshot_at.
        Computes accurate variance = counted_quantity - (snapshot_quantity + intervening_net_movement).
        Flags volatile or negative-balance lines for RECOUNT_REQUIRED.
        """
        if stock_count.status not in ["SUBMITTED", "IN_PROGRESS", "RECOUNT_REQUIRED"]:
            raise StockLedgerError(f"Cannot reconcile count session with status '{stock_count.status}'.")

        snapshot_at = stock_count.snapshot_at
        store = stock_count.store
        organization = stock_count.organization

        with transaction.atomic():
            items = list(stock_count.items.select_for_update().select_related("product", "batch"))
            if not items:
                raise StockLedgerError("Cannot reconcile a count session with no line items.")

            reconciled_items = []
            has_recount_flag = False

            for item in items:
                if item.counted_quantity is None:
                    continue

                # Query all movements for this batch at this store since snapshot_at
                movements = StockMovement.objects.filter(
                    store=store,
                    batch=item.batch,
                    created_at__gte=snapshot_at
                )

                inflow = 0
                outflow = 0
                for mvt in movements:
                    if mvt.direction == "IN":
                        inflow += mvt.quantity
                    elif mvt.direction == "OUT":
                        outflow += mvt.quantity

                intervening_net = inflow - outflow
                reconciled_benchmark = item.snapshot_system_quantity + intervening_net
                variance = item.counted_quantity - reconciled_benchmark

                # Current actual physical stock on hand
                curr_stock = StoreBatchStock.objects.filter(store=store, batch=item.batch).first()
                curr_on_hand = curr_stock.quantity_on_hand if curr_stock else 0

                # Validate variance feasibility: current on-hand + variance cannot become negative
                if curr_on_hand + variance < 0 or item.batch.is_recalled:
                    item.status = "REJECTED"
                    has_recount_flag = True
                else:
                    item.status = "RECONCILED"

                item.intervening_movement_quantity = intervening_net
                item.reconciled_system_quantity = reconciled_benchmark
                item.variance_quantity = variance
                item.save(update_fields=[
                    "intervening_movement_quantity", "reconciled_system_quantity",
                    "variance_quantity", "status", "updated_at"
                ])

                reconciled_items.append({
                    "item_id": str(item.id),
                    "product_name": item.product.name,
                    "batch_number": item.batch.batch_number,
                    "snapshot_qty": item.snapshot_system_quantity,
                    "counted_qty": item.counted_quantity,
                    "intervening_net": intervening_net,
                    "reconciled_benchmark": reconciled_benchmark,
                    "variance": variance,
                    "item_status": item.status,
                })

            if has_recount_flag:
                stock_count.status = "RECOUNT_REQUIRED"
            else:
                stock_count.status = "RECONCILED"

            stock_count.reviewed_by = actor
            stock_count.reviewed_at = timezone.now()
            stock_count.save(update_fields=["status", "reviewed_by", "reviewed_at", "updated_at"])

            AuditEvent.log_event(
                event_type="PHYSICAL_COUNT_RECONCILED",
                user=actor,
                organization=organization,
                details={
                    "count_id": str(stock_count.id),
                    "count_number": stock_count.count_number,
                    "store_id": str(store.id),
                    "status": stock_count.status,
                    "has_recount_flag": has_recount_flag,
                }
            )

            return {
                "status": "success",
                "message": f"Reconciliation completed. Session status: {stock_count.status}",
                "count_id": str(stock_count.id),
                "count_status": stock_count.status,
                "items": reconciled_items,
            }

    @classmethod
    def generate_adjustments_from_count(
        cls,
        stock_count: PhysicalStockCount,
        actor
    ) -> list[StockAdjustment]:
        """
        Generates individual StockAdjustment records for all reconciled count items with non-zero variance.
        Requires Org Owner or Store Manager privileges.
        """
        organization = stock_count.organization
        store = stock_count.store

        if not is_user_org_owner(actor, organization) and not is_user_assigned_store_manager(actor, store):
            raise StorePermissionDeniedError("Only organization owners and assigned store managers can generate adjustments from counts.")

        if stock_count.status not in ["RECONCILED", "SUBMITTED"]:
            raise StockLedgerError(f"Cannot generate adjustments from session with status '{stock_count.status}'.")

        created_adjustments = []

        with transaction.atomic():
            variance_items = stock_count.items.select_for_update().filter(
                status="RECONCILED"
            ).exclude(variance_quantity=0)

            today_str = timezone.localdate().strftime("%Y%m%d")

            for item in variance_items:
                # Resolve unit cost basis for valuation
                unit_cost = cls.calculate_batch_unit_cost(store, item.batch)
                val = (Decimal(abs(item.variance_quantity)) * unit_cost).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

                prefix = f"ADJ-{today_str}-"
                last_adj = StockAdjustment.objects.filter(
                    organization=organization,
                    adjustment_number__startswith=prefix
                ).order_by("-adjustment_number").first()

                if last_adj and last_adj.adjustment_number:
                    try:
                        seq = int(last_adj.adjustment_number.split("-")[-1]) + 1
                    except (ValueError, IndexError):
                        seq = 1
                else:
                    seq = 1

                adj_num = f"{prefix}{seq:04d}"
                reason = "VERIFIED_SURPLUS" if item.variance_quantity > 0 else "PHYSICAL_SHORTAGE"

                adj = StockAdjustment.objects.create(
                    organization=organization,
                    store=store,
                    adjustment_number=adj_num,
                    product=item.product,
                    batch=item.batch,
                    packaging_snapshot=item.packaging_snapshot,
                    system_quantity_at_request=item.reconciled_system_quantity or item.snapshot_system_quantity,
                    adjustment_quantity=item.variance_quantity,
                    resulting_quantity=(item.reconciled_system_quantity or item.snapshot_system_quantity) + item.variance_quantity,
                    reason_code=reason,
                    explanation=f"Generated from Physical Stock Count {stock_count.count_number}. Counted: {item.counted_quantity}, Benchmark: {item.reconciled_system_quantity}.",
                    status="SUBMITTED",
                    unit_cost_basis=unit_cost,
                    calculated_valuation=val,
                    requested_by=actor,
                    count_item=item
                )
                item.status = "APPROVED"
                item.save(update_fields=["status", "updated_at"])
                created_adjustments.append(adj)

            AuditEvent.log_event(
                event_type="COUNT_ADJUSTMENTS_GENERATED",
                user=actor,
                organization=organization,
                details={
                    "count_id": str(stock_count.id),
                    "count_number": stock_count.count_number,
                    "adjustments_count": len(created_adjustments),
                }
            )

        return created_adjustments

    # =========================================================================
    # Milestone 2C.4: Quarantine, Expiry & Batch Recall Controls
    # =========================================================================

    @classmethod
    def get_store_expiry_policy(cls, store=None, organization=None) -> StoreExpiryPolicy:
        """
        Retrieves store-level expiry policy, falls back to organization-default,
        or creates default policy (warning: 90 days, critical: 30 days).
        """
        if store:
            policy = StoreExpiryPolicy.objects.filter(store=store).first()
            if policy:
                return policy
            org = store.organization
        else:
            org = organization

        if org:
            policy = StoreExpiryPolicy.objects.filter(organization=org, store__isnull=True).first()
            if policy:
                return policy
            policy, _ = StoreExpiryPolicy.objects.get_or_create(
                organization=org,
                store=None,
                defaults={
                    "warning_threshold_days": 90,
                    "critical_threshold_days": 30
                }
            )
            return policy

        # Unpersisted fallback instance
        return StoreExpiryPolicy(warning_threshold_days=90, critical_threshold_days=30)

    @classmethod
    def get_fefo_batches_for_product(cls, store, product_id, required_quantity=None) -> list[dict]:
        """
        Evaluates active eligible batches for a product at a store sorted by FEFO (First-Expired, First-Out).
        Excludes recalled, expired, or quarantine_review batches.
        """
        policy = cls.get_store_expiry_policy(store=store)
        today = timezone.localdate()

        stocks = StoreBatchStock.objects.filter(
            store=store,
            product_id=product_id,
            batch__is_recalled=False,
            batch__expiry_date__gt=today
        ).exclude(
            batch__intake_status="quarantine_review"
        ).select_related(
            "batch", "batch__packaging_snapshot", "product"
        ).order_by("batch__expiry_date", "batch__created_at")

        candidates = []
        remaining_needed = int(required_quantity) if required_quantity else None

        for st in stocks:
            avail = max(0, st.quantity_on_hand - st.quantity_quarantined)
            if avail <= 0:
                continue

            status_code, days_left = st.batch.get_expiry_status(
                warning_days=policy.warning_threshold_days,
                critical_days=policy.critical_threshold_days,
                today=today
            )

            allocated = 0
            if remaining_needed is not None and remaining_needed > 0:
                allocated = min(avail, remaining_needed)
                remaining_needed -= allocated

            candidates.append({
                "batch_id": str(st.batch.id),
                "batch_number": st.batch.batch_number,
                "expiry_date": st.batch.expiry_date.isoformat(),
                "days_until_expiry": days_left,
                "expiry_status": status_code,
                "quantity_on_hand": st.quantity_on_hand,
                "quantity_quarantined": st.quantity_quarantined,
                "available_quantity": avail,
                "allocated_quantity": allocated,
                "mrp": st.batch.mrp,
                "unit_mrp": st.batch.unit_mrp,
                "conversion_factor": st.batch.packaging_snapshot.conversion_factor,
                "base_unit": st.batch.packaging_snapshot.base_unit,
                "sale_unit": st.batch.packaging_snapshot.sale_unit,
            })

        return candidates

    @classmethod
    def quarantine_stock(
        cls,
        store: Store,
        batch: Batch,
        quantity: int,
        reason_code: str,
        notes: str,
        evidence_metadata: dict,
        actor,
        idempotency_key: str = None,
        raw_payload: dict = None
    ) -> tuple[dict, bool]:
        """
        Quarantines on-hand stock for a batch at a store branch.
        Deducts from available stock by adding to quantity_quarantined.
        Appends append-only StockMovement and StockQuarantineRecord.
        """
        if quantity <= 0:
            raise InvalidQuantityError("Quarantine quantity must be strictly positive.")

        valid_reasons = [r[0] for r in StockQuarantineRecord.REASON_CHOICES]
        if reason_code not in valid_reasons:
            raise StockLedgerError(f"Invalid quarantine reason code '{reason_code}'. Must be one of {valid_reasons}.")

        organization = store.organization

        with transaction.atomic():
            op = None
            if idempotency_key:
                payload_hash = canonical_payload_hash(raw_payload or {})
                op, is_new = InventoryOperation.objects.select_for_update().get_or_create(
                    idempotency_key=idempotency_key,
                    defaults={
                        "organization": organization,
                        "store": store,
                        "operation_type": "QUARANTINE_HOLD",
                        "payload_hash": payload_hash,
                        "status": "processing",
                    }
                )
                if not is_new:
                    if op.payload_hash != payload_hash:
                        raise IdempotencyPayloadConflictError(
                            "Idempotency key re-used with differing quarantine payload."
                        )
                    if op.status == "completed":
                        return op.response_data, False
                    if op.status == "processing":
                        raise IdempotencyConflictError("Quarantine operation already in progress.")

            # Row lock StoreBatchStock & Batch
            b = Batch.objects.select_for_update().get(id=batch.id)
            stock = StoreBatchStock.objects.select_for_update().filter(store=store, batch=b).first()

            if not stock:
                raise StockLedgerError(f"No stock record found for batch {b.batch_number} at {store.name}.")

            available = max(0, stock.quantity_on_hand - stock.quantity_quarantined)
            if quantity > available:
                if op:
                    op.status = "failed"
                    op.error_message = f"Cannot quarantine {quantity} units: only {available} units available to hold on-hand."
                    op.save(update_fields=["status", "error_message"])
                raise InvalidQuantityError(
                    f"Cannot quarantine {quantity} units: only {available} units available to hold on-hand."
                )

            old_quar = stock.quantity_quarantined
            new_quar = old_quar + quantity
            stock.quantity_quarantined = new_quar
            stock.save(update_fields=["quantity_quarantined", "updated_at"])

            quarantine_number = generate_quarantine_number(organization)
            quar_record = StockQuarantineRecord.objects.create(
                organization=organization,
                store=store,
                batch=b,
                product=b.product,
                quarantine_number=quarantine_number,
                quantity_quarantined=quantity,
                reason_code=reason_code,
                notes=notes or "",
                evidence_metadata=evidence_metadata or {},
                status="ACTIVE",
                quarantined_by=actor
            )

            # Append StockMovement (HOLD)
            unit_cost = cls.calculate_batch_unit_cost(store, b)
            mvt = StockMovement.objects.create(
                organization=organization,
                store=store,
                batch=b,
                product=b.product,
                movement_type="QUARANTINE_HOLD",
                direction="HOLD",
                quantity=quantity,
                balance_before=stock.quantity_on_hand,
                balance_after=stock.quantity_on_hand,
                quarantine_before=old_quar,
                quarantine_after=new_quar,
                unit_cost=unit_cost,
                unit_mrp=b.unit_mrp,
                total_cost_value=(Decimal(quantity) * unit_cost).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP),
                reference_type="QUARANTINE_RECORD",
                reference_id=quarantine_number,
                actor=actor,
                reason=f"Quarantined {quantity} units [{reason_code}]: {notes}"
            )

            quar_record.movement = mvt
            quar_record.save(update_fields=["movement"])

            AuditEvent.log_event(
                event_type="STOCK_QUARANTINED",
                user=actor,
                organization=organization,
                details={
                    "quarantine_id": str(quar_record.id),
                    "quarantine_number": quarantine_number,
                    "store_id": str(store.id),
                    "batch_id": str(b.id),
                    "quantity": quantity,
                    "reason_code": reason_code,
                }
            )

            result_data = {
                "status": "success",
                "message": f"Quarantined {quantity} units of batch {b.batch_number} at {store.name}.",
                "quarantine_id": str(quar_record.id),
                "quarantine_number": quarantine_number,
                "quantity_quarantined": quantity,
                "current_on_hand": stock.quantity_on_hand,
                "current_quarantined": stock.quantity_quarantined,
                "current_available": max(0, stock.quantity_on_hand - stock.quantity_quarantined),
            }

            if op:
                op.status = "completed"
                op.response_data = result_data
                op.save(update_fields=["status", "response_data"])

            return result_data, True

    @classmethod
    def release_quarantine(
        cls,
        quarantine_record: StockQuarantineRecord,
        release_quantity: int,
        release_reason: str,
        actor
    ) -> dict:
        """
        Releases quarantined stock back to active saleable inventory.
        Validates that batch is not recalled and not expired.
        Updates StoreBatchStock.quantity_quarantined and appends StockMovement.
        """
        if release_quantity <= 0:
            raise InvalidQuantityError("Release quantity must be strictly positive.")

        if not release_reason or not release_reason.strip():
            raise StockLedgerError("Documented release reason is required.")

        with transaction.atomic():
            quar = StockQuarantineRecord.objects.select_for_update().get(id=quarantine_record.id)
            if quar.status != "ACTIVE":
                raise StockLedgerError(f"Cannot release quarantine record with status '{quar.status}'.")

            if release_quantity > quar.quantity_quarantined:
                raise InvalidQuantityError(
                    f"Release quantity ({release_quantity}) exceeds record's quarantined quantity ({quar.quantity_quarantined})."
                )

            b = Batch.objects.select_for_update().get(id=quar.batch_id)
            if b.is_recalled:
                raise BatchValidationError(f"Cannot release stock for batch {b.batch_number}: batch is under active recall.")

            if b.expiry_date <= timezone.localdate():
                raise BatchValidationError(
                    f"Cannot release stock for batch {b.batch_number}: batch has expired ({b.expiry_date}). Must be written off."
                )

            stock = StoreBatchStock.objects.select_for_update().get(store=quar.store, batch=b)
            if release_quantity > stock.quantity_quarantined:
                raise InvalidQuantityError(
                    f"Release quantity ({release_quantity}) exceeds store quarantine balance ({stock.quantity_quarantined})."
                )

            old_quar = stock.quantity_quarantined
            new_quar = old_quar - release_quantity
            stock.quantity_quarantined = new_quar
            stock.save(update_fields=["quantity_quarantined", "updated_at"])

            is_full = (release_quantity == quar.quantity_quarantined)
            if is_full:
                quar.status = "RELEASED"
                quar.released_by = actor
                quar.released_at = timezone.now()
                quar.release_reason = release_reason.strip()
            else:
                quar.quantity_quarantined -= release_quantity
                quar.notes += f"\n[Partial Release: {release_quantity} units on {timezone.now().strftime('%Y-%m-%d %H:%M')}: {release_reason.strip()}]"

            quar.save(update_fields=[
                "status", "released_by", "released_at", "release_reason",
                "quantity_quarantined", "notes", "updated_at"
            ])

            unit_cost = cls.calculate_batch_unit_cost(quar.store, b)
            StockMovement.objects.create(
                organization=quar.organization,
                store=quar.store,
                batch=b,
                product=b.product,
                movement_type="QUARANTINE_RELEASE",
                direction="HOLD",
                quantity=release_quantity,
                balance_before=stock.quantity_on_hand,
                balance_after=stock.quantity_on_hand,
                quarantine_before=old_quar,
                quarantine_after=new_quar,
                unit_cost=unit_cost,
                unit_mrp=b.unit_mrp,
                total_cost_value=(Decimal(release_quantity) * unit_cost).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP),
                reference_type="QUARANTINE_RECORD",
                reference_id=quar.quarantine_number,
                actor=actor,
                reason=f"Released {release_quantity} units from quarantine: {release_reason.strip()}"
            )

            AuditEvent.log_event(
                event_type="QUARANTINE_RELEASED",
                user=actor,
                organization=quar.organization,
                details={
                    "quarantine_id": str(quar.id),
                    "quarantine_number": quar.quarantine_number,
                    "release_quantity": release_quantity,
                    "is_full_release": is_full,
                    "release_reason": release_reason.strip(),
                }
            )

            return {
                "status": "success",
                "message": f"Released {release_quantity} units of batch {b.batch_number} from quarantine.",
                "quarantine_id": str(quar.id),
                "quarantine_status": quar.status,
                "current_on_hand": stock.quantity_on_hand,
                "current_quarantined": stock.quantity_quarantined,
                "current_available": max(0, stock.quantity_on_hand - stock.quantity_quarantined),
            }

    @classmethod
    def dispose_quarantine(
        cls,
        quarantine_record: StockQuarantineRecord,
        disposition_type: str,
        notes: str,
        actor
    ) -> dict:
        """
        Disposes quarantined stock by writing it off or returning to supplier.
        Deducts both quantity_on_hand and quantity_quarantined.
        Depletes FIFO cost layers and appends outward StockMovement.
        """
        if disposition_type not in ["WRITTEN_OFF", "RETURNED_TO_SUPPLIER"]:
            raise StockLedgerError(f"Invalid disposition type '{disposition_type}'. Must be 'WRITTEN_OFF' or 'RETURNED_TO_SUPPLIER'.")

        with transaction.atomic():
            quar = StockQuarantineRecord.objects.select_for_update().get(id=quarantine_record.id)
            if quar.status != "ACTIVE":
                raise StockLedgerError(f"Cannot dispose quarantine record with status '{quar.status}'.")

            qty = quar.quantity_quarantined
            b = Batch.objects.select_for_update().get(id=quar.batch_id)
            stock = StoreBatchStock.objects.select_for_update().get(store=quar.store, batch=b)

            if stock.quantity_on_hand < qty or stock.quantity_quarantined < qty:
                raise InvalidQuantityError(
                    f"Insufficient stock balance to dispose: on-hand {stock.quantity_on_hand}, quarantined {stock.quantity_quarantined}, needed {qty}."
                )

            old_bal = stock.quantity_on_hand
            old_quar = stock.quantity_quarantined
            new_bal = old_bal - qty
            new_quar = old_quar - qty

            stock.quantity_on_hand = new_bal
            stock.quantity_quarantined = new_quar
            stock.save(update_fields=["quantity_on_hand", "quantity_quarantined", "updated_at"])

            # FIFO cost layer depletion
            cost_layers = BatchInwardCostLayer.objects.select_for_update().filter(
                store=quar.store,
                batch=b,
                remaining_quantity__gt=0
            ).order_by("created_at")

            rem = qty
            total_cost = Decimal("0.00")
            for cl in cost_layers:
                if rem <= 0:
                    break
                deplete = min(rem, cl.remaining_quantity)
                cl.remaining_quantity -= deplete
                cl.save(update_fields=["remaining_quantity"])
                total_cost += (Decimal(deplete) * cl.unit_cost)
                rem -= deplete

            avg_unit_cost = (total_cost / Decimal(qty)).quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP) if qty > 0 else b.unit_mrp

            mvt_type = "DAMAGE_WRITEOFF" if disposition_type == "WRITTEN_OFF" else "SUPPLIER_RETURN"
            StockMovement.objects.create(
                organization=quar.organization,
                store=quar.store,
                batch=b,
                product=b.product,
                movement_type=mvt_type,
                direction="OUT",
                quantity=qty,
                balance_before=old_bal,
                balance_after=new_bal,
                quarantine_before=old_quar,
                quarantine_after=new_quar,
                unit_cost=avg_unit_cost,
                unit_mrp=b.unit_mrp,
                total_cost_value=total_cost,
                reference_type="QUARANTINE_RECORD",
                reference_id=quar.quarantine_number,
                actor=actor,
                reason=f"Quarantine disposition [{disposition_type}]: {notes}"
            )

            quar.status = disposition_type
            quar.disposition_notes = notes or ""
            quar.save(update_fields=["status", "disposition_notes", "updated_at"])

            AuditEvent.log_event(
                event_type="QUARANTINE_DISPOSED",
                user=actor,
                organization=quar.organization,
                details={
                    "quarantine_id": str(quar.id),
                    "quarantine_number": quar.quarantine_number,
                    "disposition_type": disposition_type,
                    "quantity": qty,
                }
            )

            return {
                "status": "success",
                "message": f"Quarantined stock disposed as {disposition_type}.",
                "quarantine_id": str(quar.id),
                "quarantine_status": quar.status,
                "quantity_disposed": qty,
                "current_on_hand": stock.quantity_on_hand,
                "current_quarantined": stock.quantity_quarantined,
                "current_available": max(0, stock.quantity_on_hand - stock.quantity_quarantined),
            }

    @classmethod
    def initiate_batch_recall(
        cls,
        organization,
        batch: Batch,
        source: str,
        severity: str,
        reason: str,
        evidence_references: dict,
        actor,
        auto_quarantine_stock: bool = True
    ) -> BatchRecall:
        """
        Initiates a formal multi-store batch recall across the organization.
        Marks batch.is_recalled = True immediately halting all normal dispensing and dispatch.
        Optionally auto-quarantines all available stock across affected branches.
        """
        valid_sources = [s[0] for s in BatchRecall.SOURCE_CHOICES]
        if source not in valid_sources:
            raise StockLedgerError(f"Invalid recall source '{source}'. Must be one of {valid_sources}.")

        valid_severities = [s[0] for s in BatchRecall.SEVERITY_CHOICES]
        if severity not in valid_severities:
            raise StockLedgerError(f"Invalid recall severity '{severity}'. Must be one of {valid_severities}.")

        if not reason or not reason.strip():
            raise StockLedgerError("Recall reason is required.")

        with transaction.atomic():
            b = Batch.objects.select_for_update().get(id=batch.id)
            if b.is_recalled:
                raise BatchValidationError(f"Batch {b.batch_number} is already under active recall.")

            b.is_recalled = True
            b.recall_reason = reason.strip()
            b.recalled_at = timezone.now()
            b.recalled_by = actor
            b.status = "recalled"
            b.save(update_fields=["is_recalled", "recall_reason", "recalled_at", "recalled_by", "status", "updated_at"])

            recall_number = generate_recall_number(organization)

            # Quantify affected stock across all stores
            affected_stocks = StoreBatchStock.objects.select_for_update().filter(
                organization=organization,
                batch=b,
                quantity_on_hand__gt=0
            )

            total_on_hand = sum(s.quantity_on_hand for s in affected_stocks)
            affected_store_ids = set(s.store_id for s in affected_stocks)

            # In-transit items for this batch
            in_transit_items = StockTransferItem.objects.filter(
                batch=b,
                transfer__organization=organization,
                transfer__status__in=["DISPATCHED", "IN_TRANSIT"]
            )
            total_in_transit = sum(it.quantity_dispatched for it in in_transit_items)

            # Auto-quarantine on-hand available stock
            if auto_quarantine_stock:
                for st in affected_stocks:
                    avail = max(0, st.quantity_on_hand - st.quantity_quarantined)
                    if avail > 0:
                        old_quar = st.quantity_quarantined
                        st.quantity_quarantined += avail
                        st.save(update_fields=["quantity_quarantined", "updated_at"])

                        qr_num = generate_quarantine_number(organization)
                        qr = StockQuarantineRecord.objects.create(
                            organization=organization,
                            store=st.store,
                            batch=b,
                            product=b.product,
                            quarantine_number=qr_num,
                            quantity_quarantined=avail,
                            reason_code="RECALL",
                            notes=f"Auto-quarantined under Batch Recall {recall_number} ({severity}): {reason.strip()}",
                            evidence_metadata=evidence_references or {},
                            status="ACTIVE",
                            quarantined_by=actor
                        )

                        unit_cost = cls.calculate_batch_unit_cost(st.store, b)
                        mvt = StockMovement.objects.create(
                            organization=organization,
                            store=st.store,
                            batch=b,
                            product=b.product,
                            movement_type="QUARANTINE_HOLD",
                            direction="HOLD",
                            quantity=avail,
                            balance_before=st.quantity_on_hand,
                            balance_after=st.quantity_on_hand,
                            quarantine_before=old_quar,
                            quarantine_after=st.quantity_quarantined,
                            unit_cost=unit_cost,
                            unit_mrp=b.unit_mrp,
                            total_cost_value=(Decimal(avail) * unit_cost).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP),
                            reference_type="BATCH_RECALL",
                            reference_id=recall_number,
                            actor=actor,
                            reason=f"Auto-quarantined under Recall {recall_number}"
                        )
                        qr.movement = mvt
                        qr.save(update_fields=["movement"])

            recall = BatchRecall.objects.create(
                organization=organization,
                recall_number=recall_number,
                batch=b,
                product=b.product,
                source=source,
                severity=severity,
                reason=reason.strip(),
                evidence_references=evidence_references or {},
                affected_stores_count=len(affected_store_ids),
                affected_quantity_on_hand=total_on_hand,
                affected_quantity_in_transit=total_in_transit,
                status="QUARANTINED_ALL" if auto_quarantine_stock else "INITIATED",
                initiated_by=actor
            )

            AuditEvent.log_event(
                event_type="BATCH_RECALL_INITIATED",
                user=actor,
                organization=organization,
                details={
                    "recall_id": str(recall.id),
                    "recall_number": recall_number,
                    "batch_id": str(b.id),
                    "severity": severity,
                    "affected_stores": len(affected_store_ids),
                    "affected_quantity_on_hand": total_on_hand,
                    "affected_quantity_in_transit": total_in_transit,
                }
            )

            return recall

    @classmethod
    def release_batch_recall(
        cls,
        recall: BatchRecall,
        resolution_notes: str,
        actor
    ) -> dict:
        """
        Releases a batch recall following official clearance.
        Requires Organization Owner authorization.
        Clears batch.is_recalled flag, but leaves individual quarantined lots
        in quarantine until explicit qualified safety release.
        """
        if not is_user_org_owner(actor, recall.organization):
            raise StorePermissionDeniedError("Only organization owners can release a batch recall.")

        if not resolution_notes or not resolution_notes.strip():
            raise StockLedgerError("Official clearance and resolution notes are required to release recall.")

        with transaction.atomic():
            rec = BatchRecall.objects.select_for_update().get(id=recall.id)
            if rec.status in ["RELEASED", "COMPLETED_DISPOSED"]:
                raise StockLedgerError(f"Cannot release recall with status '{rec.status}'.")

            b = Batch.objects.select_for_update().get(id=rec.batch_id)
            b.is_recalled = False
            if not b.is_expired:
                b.status = "active"
            b.save(update_fields=["is_recalled", "status", "updated_at"])

            rec.status = "RELEASED"
            rec.closed_by = actor
            rec.closed_at = timezone.now()
            rec.resolution_notes = resolution_notes.strip()
            rec.disposition_type = "RELEASED_AFTER_CLEARANCE"
            rec.save(update_fields=[
                "status", "closed_by", "closed_at", "resolution_notes",
                "disposition_type", "updated_at"
            ])

            AuditEvent.log_event(
                event_type="BATCH_RECALL_RELEASED",
                user=actor,
                organization=rec.organization,
                details={
                    "recall_id": str(rec.id),
                    "recall_number": rec.recall_number,
                    "batch_id": str(b.id),
                    "resolution_notes": resolution_notes.strip(),
                }
            )

            return {
                "status": "success",
                "message": f"Recall {rec.recall_number} for batch {b.batch_number} released successfully.",
                "recall_id": str(rec.id),
                "recall_status": rec.status,
            }

    @classmethod
    def dispose_batch_recall(
        cls,
        recall: BatchRecall,
        disposition_type: str,
        notes: str,
        actor
    ) -> dict:
        """
        Disposes all quarantined stocks associated with a recall across all stores.
        Routes to Supplier Return or Destruction Write-off.
        """
        if disposition_type not in ["SUPPLIER_RETURN", "DESTRUCTION_WRITEOFF"]:
            raise StockLedgerError(f"Invalid disposition type '{disposition_type}'. Must be 'SUPPLIER_RETURN' or 'DESTRUCTION_WRITEOFF'.")

        with transaction.atomic():
            rec = BatchRecall.objects.select_for_update().get(id=recall.id)
            if rec.status == "COMPLETED_DISPOSED":
                raise StockLedgerError("Recall has already been disposed.")

            # Find all active quarantine records for this batch
            quar_records = list(StockQuarantineRecord.objects.select_for_update().filter(
                batch_id=rec.batch_id,
                reason_code="RECALL",
                status="ACTIVE"
            ))

            target_disp = "RETURNED_TO_SUPPLIER" if disposition_type == "SUPPLIER_RETURN" else "WRITTEN_OFF"
            disposed_count = 0
            for qr in quar_records:
                cls.dispose_quarantine(
                    quarantine_record=qr,
                    disposition_type=target_disp,
                    notes=f"Disposed via Recall {rec.recall_number}: {notes}",
                    actor=actor
                )
                disposed_count += 1

            rec.status = "COMPLETED_DISPOSED"
            rec.disposition_type = disposition_type
            rec.closed_by = actor
            rec.closed_at = timezone.now()
            rec.resolution_notes = notes or ""
            rec.save(update_fields=[
                "status", "disposition_type", "closed_by", "closed_at",
                "resolution_notes", "updated_at"
            ])

            AuditEvent.log_event(
                event_type="BATCH_RECALL_DISPOSED",
                user=actor,
                organization=rec.organization,
                details={
                    "recall_id": str(rec.id),
                    "recall_number": rec.recall_number,
                    "disposition_type": disposition_type,
                    "disposed_quarantine_records_count": disposed_count,
                }
            )

            return {
                "status": "success",
                "message": f"Recall {rec.recall_number} stock disposed across {disposed_count} records.",
                "recall_id": str(rec.id),
                "recall_status": rec.status,
                "disposition_type": rec.disposition_type,
            }

    @classmethod
    def post_sale_dispense(
        cls,
        store: Store,
        actor,
        idempotency_key,
        invoice_number: str,
        customer_name: str,
        line_allocations: list[dict],
        raw_payload: dict = None
    ) -> tuple[dict, bool]:
        """
        Atomically executes dispensing stock deduction for an invoice sale.
        Deducts on-hand stock from StoreBatchStock, consumes FIFO BatchInwardCostLayer,
        and appends immutable StockMovement records (movement_type='SALE', direction='OUT').
        Protected by InventoryOperation idempotency claim and deterministic row locking.
        Participates in caller's atomic transaction.
        """
        import uuid as _uuid
        if isinstance(idempotency_key, _uuid.UUID):
            op_key = idempotency_key
        else:
            try:
                op_key = _uuid.UUID(str(idempotency_key))
            except (ValueError, TypeError):
                op_key = _uuid.uuid5(_uuid.NAMESPACE_DNS, str(idempotency_key))

        payload_hash = canonical_payload_hash(raw_payload or {
            "invoice_number": invoice_number,
            "customer_name": customer_name,
            "lines": [
                {
                    "product_id": str(l.get("product_id")),
                    "batch_id": str(l.get("batch_id")),
                    "quantity": int(l.get("quantity", 0))
                } for l in line_allocations
            ]
        })
        organization = store.organization

        with transaction.atomic():
            op = None
            if op_key:
                while True:
                    op = InventoryOperation.objects.select_for_update().filter(
                        idempotency_key=op_key
                    ).first()

                    if op:
                        if op.payload_hash != payload_hash:
                            raise IdempotencyPayloadConflictError(
                                "Idempotency key has already been used for a different sale dispense request."
                            )
                        if op.status == "completed":
                            return op.response_data, False
                        elif op.status in ["in_progress", "processing"]:
                            raise IdempotencyConflictError(
                                "Sale dispensing operation is currently in progress. Please retry."
                            )
                        elif op.status == "failed":
                            raise StockLedgerError(
                                f"Previous sale dispensing attempt failed: {op.error_message}"
                            )
                        break

                    try:
                        with transaction.atomic():
                            op = InventoryOperation.objects.create(
                                idempotency_key=op_key,
                                organization=organization,
                                store=store,
                                actor=actor,
                                operation_type="SALE_DISPENSE",
                                payload_hash=payload_hash,
                                status="in_progress"
                            )
                        break
                    except IntegrityError:
                        continue

            # Deterministic batch sorting by batch_id to prevent database deadlocks
            sorted_allocations = sorted(line_allocations, key=lambda x: str(x.get("batch_id", "")))
            created_allocations = []
            today = timezone.localdate()

            for alloc in sorted_allocations:
                batch_id = alloc.get("batch_id")
                qty = int(alloc.get("quantity", 0))
                if qty <= 0:
                    raise InvalidQuantityError(f"Dispense quantity must be strictly positive, got {qty}.")

                # Deterministic lock on Batch and StoreBatchStock
                b = Batch.objects.select_for_update().get(id=batch_id, organization=organization)

                # Eligibility check: Exclude expired, recalled, or quarantine_review batches
                if b.is_recalled:
                    raise BatchValidationError(f"Batch {b.batch_number} is recalled and cannot be dispensed.")
                if b.expiry_date <= today:
                    raise BatchValidationError(f"Batch {b.batch_number} expired on {b.expiry_date} and cannot be dispensed.")
                if b.intake_status == "quarantine_review":
                    raise BatchValidationError(f"Batch {b.batch_number} is pending quarantine review and cannot be dispensed.")

                st = StoreBatchStock.objects.select_for_update().filter(store=store, batch=b).first()
                if not st:
                    raise StockLedgerError(f"No stock record found for batch {b.batch_number} at {store.name}.")

                avail = max(0, st.quantity_on_hand - st.quantity_quarantined)
                if avail < qty:
                    raise StockLedgerError(
                        f"Insufficient available stock for batch {b.batch_number}. Available: {avail}, requested: {qty}."
                    )

                # 1. Deduct StoreBatchStock
                balance_before = st.quantity_on_hand
                balance_after = balance_before - qty
                st.quantity_on_hand = balance_after
                st.save(update_fields=["quantity_on_hand", "updated_at"])

                # 2. FIFO Cost Layer Depletion
                cost_layer = None
                unit_cost = Decimal("0.0000")
                cost_layers = BatchInwardCostLayer.objects.select_for_update().filter(
                    store=store,
                    batch=b,
                    remaining_quantity__gt=0
                ).order_by("created_at")

                rem_qty_to_deplete = qty
                depleted_layers = []

                for cl in cost_layers:
                    if rem_qty_to_deplete <= 0:
                        break
                    take = min(cl.remaining_quantity, rem_qty_to_deplete)
                    cl.remaining_quantity -= take
                    cl.save(update_fields=["remaining_quantity"])
                    rem_qty_to_deplete -= take
                    cost_layer = cl
                    unit_cost = cl.unit_cost
                    depleted_layers.append({"layer_id": str(cl.id), "depleted": take, "unit_cost": str(cl.unit_cost)})

                total_cost = (unit_cost * Decimal(qty)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

                # 3. Create immutable StockMovement
                movement = StockMovement.objects.create(
                    organization=organization,
                    store=store,
                    batch=b,
                    product=b.product,
                    movement_type="SALE",
                    direction="OUT",
                    quantity=qty,
                    balance_before=balance_before,
                    balance_after=balance_after,
                    quarantine_before=st.quantity_quarantined,
                    quarantine_after=st.quantity_quarantined,
                    unit_cost=unit_cost,
                    unit_mrp=b.unit_mrp,
                    total_cost_value=total_cost,
                    reference_type="INVOICE",
                    reference_id=invoice_number,
                    actor=actor,
                    reason=f"Dispensed to {customer_name} (Invoice {invoice_number})",
                )

                created_allocations.append({
                    "batch_id": str(b.id),
                    "batch_number": b.batch_number,
                    "product_id": str(b.product_id),
                    "quantity": qty,
                    "stock_movement_id": str(movement.id),
                    "stock_movement": movement,
                    "cost_layer_id": str(cost_layer.id) if cost_layer else None,
                    "cost_layer": cost_layer,
                    "unit_cost": unit_cost,
                    "total_cost": total_cost,
                    "depleted_layers": depleted_layers,
                })

            result_data = {
                "status": "success",
                "invoice_number": invoice_number,
                "dispensed_allocations": [
                    {
                        "batch_id": str(a.get("batch_id")),
                        "batch_number": a.get("batch_number"),
                        "product_id": str(a.get("product_id")),
                        "quantity": a.get("quantity"),
                        "stock_movement_id": str(a.get("stock_movement_id")),
                        "cost_layer_id": str(a.get("cost_layer_id")) if a.get("cost_layer_id") else None,
                        "unit_cost": str(a.get("unit_cost")),
                        "total_cost": str(a.get("total_cost")),
                        "depleted_layers": [
                            {
                                "layer_id": str(dl.get("layer_id")),
                                "quantity": dl.get("quantity"),
                                "unit_cost": str(dl.get("unit_cost")),
                            }
                            for dl in a.get("depleted_layers", [])
                        ]
                    }
                    for a in created_allocations
                ],
            }

            if op:
                op.status = "completed"
                op.response_data = result_data
                op.completed_at = timezone.now()
                op.save(update_fields=["status", "response_data", "completed_at"])

            AuditEvent.log_event(
                event_type="STOCK_SALE_DISPENSED",
                user=actor,
                organization=organization,
                details={
                    "invoice_number": invoice_number,
                    "customer_name": customer_name,
                    "allocations_count": len(created_allocations),
                }
            )

            return {
                "result_data": result_data,
                "allocations": created_allocations,
            }, True




