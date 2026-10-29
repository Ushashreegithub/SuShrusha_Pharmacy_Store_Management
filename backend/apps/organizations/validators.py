import os
import logging
from PIL import Image
from rest_framework.exceptions import ValidationError

logger = logging.getLogger(__name__)

ALLOWED_FORMATS = {"PNG", "JPEG", "WEBP"}
ALLOWED_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp"}
MAX_FILE_SIZE = 2 * 1024 * 1024  # 2MB


def validate_org_logo(uploaded_file):
    """
    Validate uploaded organization logo:
    - Maximum size: 2MB
    - Allowed extensions: .png, .jpg, .jpeg, .webp
    - Actual file content validated using Pillow (PNG, JPEG, WEBP)
    - Strictly rejects SVG, XML, HTML, executables, or corrupt binary data
    """
    if not uploaded_file:
        raise ValidationError("No logo file was provided.")

    if uploaded_file.size > MAX_FILE_SIZE:
        size_mb = uploaded_file.size / (1024 * 1024)
        raise ValidationError(
            f"Logo image file size ({size_mb:.2f}MB) exceeds the 2MB limit. Please choose a smaller image."
        )

    ext = os.path.splitext(uploaded_file.name)[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise ValidationError(
            f"Unsupported file extension '{ext}'. Only PNG, JPG/JPEG, and WebP images are allowed."
        )

    # Inspect initial bytes to reject vector SVG/HTML/XML content disguised as images
    try:
        header = uploaded_file.read(512)
        uploaded_file.seek(0)
        header_lower = header.lower()
        if (
            b"<svg" in header_lower
            or b"<?xml" in header_lower
            or b"<!doctype" in header_lower
            or b"<html" in header_lower
            or b"<script" in header_lower
        ):
            raise ValidationError(
                "SVG and XML vector files are not permitted for security reasons. Please upload a standard PNG, JPEG, or WebP image."
            )

        # Inspect using Pillow
        image = Image.open(uploaded_file)
        image_format = (image.format or "").upper()
        if image_format not in ALLOWED_FORMATS:
            raise ValidationError(
                f"Unsupported image format '{image_format}'. Allowed formats: PNG, JPEG, WebP."
            )

        # Verify image integrity
        image.verify()

        # Reset file stream position for subsequent storage save
        uploaded_file.seek(0)
    except ValidationError:
        raise
    except Exception as exc:
        logger.warning(f"Invalid image file upload attempt: {exc}")
        raise ValidationError("The uploaded file is not a valid or readable image file.")


def safe_delete_logo_file(logo_field):
    """
    Safely delete an existing logo file from disk.
    Ensures storage exceptions do not break database transactions.
    """
    if not logo_field:
        return
    try:
        storage = logo_field.storage
        if storage and logo_field.name and storage.exists(logo_field.name):
            storage.delete(logo_field.name)
    except Exception as exc:
        logger.warning(f"Could not delete old logo file '{getattr(logo_field, 'name', '')}': {exc}")

