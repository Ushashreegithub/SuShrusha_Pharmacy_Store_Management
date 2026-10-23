import json
import hashlib
from decimal import Decimal
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
            # Check for existing idempotency claim
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
            else:
                try:
                    op = InventoryOperation.objects.create(
                        idempotency_key=idempotency_key,
                        organization=store.organization,
                        store=store,
                        actor=actor,
                        operation_type="OPENING_STOCK",
                        payload_hash=payload_hash,
                        status="in_progress"
                    )
                except IntegrityError:
                    # Caught concurrent insert: lock and re-evaluate
                    op = InventoryOperation.objects.select_for_update().get(
                        idempotency_key=idempotency_key
                    )
                    if op.payload_hash != payload_hash:
                        raise IdempotencyPayloadConflictError(
                            "Idempotency key has already been used for a different request payload."
                        )
                    if op.status == "completed":
                        return op.response_data, False
                    raise IdempotencyConflictError(
                        "Operation is currently in progress. Please retry shortly."
                    )

            # 2. Validate actor authorization
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

            total_base_units = (sale_units * conversion_factor) + loose_units
            if total_base_units <= 0:
                raise InvalidQuantityError("Total intake quantity must be strictly greater than zero.")

            # 5. Cost Provenance Validation
            purchase_cost = validated_data.get("purchase_cost_per_sale_unit")
            if purchase_cost is None or purchase_cost <= Decimal("0.00"):
                raise InvalidCostError(
                    "Purchase cost per sale unit must be greater than zero to establish cost provenance."
                )

            unit_cost = (purchase_cost / Decimal(conversion_factor)).quantize(Decimal("0.0001"))
            total_cost_value = (Decimal(total_base_units) * unit_cost).quantize(Decimal("0.01"))

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

            unit_mrp = (mrp / Decimal(conversion_factor)).quantize(Decimal("0.0001"))

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

            if batch.intake_status == "quarantine_review":
                raise BatchValidationError("Batch is under quarantine review and cannot be added to active inventory.")

            # 7. Prevent Duplicate Opening Stock Initialization
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

            # 8. Deterministic Row Locking on StoreBatchStock
            stock = StoreBatchStock.objects.select_for_update().filter(
                store=store,
                batch=batch
            ).first()

            if not stock:
                stock = StoreBatchStock.objects.create(
                    organization=store.organization,
                    store=store,
                    product=product,
                    batch=batch,
                    quantity_on_hand=0,
                    quantity_quarantined=0,
                    low_stock_threshold=validated_data.get("low_stock_threshold", 10)
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

