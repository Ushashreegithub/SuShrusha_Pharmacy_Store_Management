class StockLedgerError(Exception):
    """Base exception for all stock ledger and inventory service errors."""
    default_code = "stock_ledger_error"

    def __init__(self, message, code=None, status_code=400):
        super().__init__(message)
        self.message = message
        self.code = code or self.default_code
        self.status_code = status_code


class IdempotencyConflictError(StockLedgerError):
    """Operation with this key is currently being processed by a concurrent request."""
    default_code = "idempotency_conflict"

    def __init__(self, message="Operation is currently in progress. Please retry shortly.", status_code=409):
        super().__init__(message, code="idempotency_conflict", status_code=status_code)


class IdempotencyPayloadConflictError(StockLedgerError):
    """Idempotency key was previously submitted with a different request payload."""
    default_code = "idempotency_payload_mismatch"

    def __init__(self, message="Idempotency key has already been used for a different request payload.", status_code=422):
        super().__init__(message, code="idempotency_payload_mismatch", status_code=status_code)


class InvalidQuantityError(StockLedgerError):
    """Quantity is invalid, zero, negative, or violates conversion rules."""
    default_code = "invalid_quantity"

    def __init__(self, message="Quantity must be a positive integer in valid base units.", status_code=400):
        super().__init__(message, code="invalid_quantity", status_code=status_code)


class InvalidCostError(StockLedgerError):
    """Cost information is missing, negative, or invalid for provenance."""
    default_code = "invalid_cost"

    def __init__(self, message="Cost provenance is mandatory for stock intake.", status_code=400):
        super().__init__(message, code="invalid_cost", status_code=status_code)


class DuplicateOpeningStockError(StockLedgerError):
    """Opening stock has already been established for this batch at this store."""
    default_code = "duplicate_opening_stock"

    def __init__(self, message="Opening stock has already been initialized for this batch at this store.", status_code=409):
        super().__init__(message, code="duplicate_opening_stock", status_code=status_code)


class BatchValidationError(StockLedgerError):
    """Batch is expired, recalled, or fails organization/product consistency."""
    default_code = "batch_validation_error"

    def __init__(self, message, status_code=400):
        super().__init__(message, code="batch_validation_error", status_code=status_code)


class StorePermissionDeniedError(StockLedgerError):
    """Actor lacks authorization to perform inventory operations at this store."""
    default_code = "store_permission_denied"

    def __init__(self, message="You do not have management permissions for this store.", status_code=403):
        super().__init__(message, code="store_permission_denied", status_code=status_code)


class NegativeStockError(StockLedgerError):
    """Operation would result in negative physical stock balance."""
    default_code = "negative_stock_error"

    def __init__(self, message="Operation rejected: stock balance cannot become negative.", status_code=400):
        super().__init__(message, code="negative_stock_error", status_code=status_code)

