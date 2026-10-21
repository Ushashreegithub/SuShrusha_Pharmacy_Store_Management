import uuid
import hashlib
import secrets
from datetime import timedelta
from django.db import models
from django.utils import timezone
from django.contrib.auth.models import (
    AbstractBaseUser,
    PermissionsMixin,
    BaseUserManager,
)


class UserManager(BaseUserManager):
    def create_user(self, email, password=None, **extra_fields):
        if not email:
            raise ValueError("An email address is required for user accounts.")
        email = self.normalize_email(email).lower()
        extra_fields.setdefault("is_active", True)
        user = self.model(email=email, **extra_fields)
        if password:
            user.set_password(password)
        else:
            user.set_unusable_password()
        user.save(using=self._db)
        return user

    def create_superuser(self, email, password=None, **extra_fields):
        extra_fields.setdefault("is_staff", True)
        extra_fields.setdefault("is_superuser", True)
        extra_fields.setdefault("is_email_verified", True)

        if extra_fields.get("is_staff") is not True:
            raise ValueError("Superuser must have is_staff=True.")
        if extra_fields.get("is_superuser") is not True:
            raise ValueError("Superuser must have is_superuser=True.")

        return self.create_user(email, password, **extra_fields)


class User(AbstractBaseUser, PermissionsMixin):
    """
    Core User model for Sushrusha Pharmacy Store Management.
    Public registration creates unverified Owner accounts.
    Staff and Managers are onboarded through explicit invitation links.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    email = models.EmailField(unique=True, db_index=True, max_length=255)
    full_name = models.CharField(max_length=255)
    phone_number = models.CharField(max_length=30, blank=True)
    is_email_verified = models.BooleanField(default=False, db_index=True)
    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    objects = UserManager()

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = ["full_name"]

    class Meta:
        db_table = "users"
        verbose_name = "User Account"
        verbose_name_plural = "User Accounts"
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.email} ({self.full_name})"


def hash_token(raw_token: str) -> str:
    """Return SHA-256 hash string for a raw secret token."""
    return hashlib.sha256(raw_token.encode("utf-8")).hexdigest()


class EmailVerificationToken(models.Model):
    """
    Cryptographically secure single-use email verification tokens.
    Raw tokens are never persisted in the database; only the SHA-256 hash is stored.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        User, on_delete=models.CASCADE, related_name="verification_tokens"
    )
    token_hash = models.CharField(max_length=64, db_index=True)
    expires_at = models.DateTimeField()
    is_used = models.BooleanField(default=False)
    used_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "email_verification_tokens"
        ordering = ["-created_at"]

    @classmethod
    def create_for_user(cls, user: User, expiry_hours: int = 24):
        # Invalidate any pending active tokens for this user
        cls.objects.filter(user=user, is_used=False).update(is_used=True, used_at=timezone.now())

        raw_token = secrets.token_urlsafe(32)
        token_hash = hash_token(raw_token)
        expires_at = timezone.now() + timedelta(hours=expiry_hours)

        token_instance = cls.objects.create(
            user=user,
            token_hash=token_hash,
            expires_at=expires_at,
        )
        return token_instance, raw_token

    def is_valid(self) -> bool:
        return not self.is_used and timezone.now() < self.expires_at


class PasswordResetToken(models.Model):
    """
    Cryptographically secure single-use password reset tokens.
    Raw tokens are never persisted in the database; only the SHA-256 hash is stored.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        User, on_delete=models.CASCADE, related_name="password_reset_tokens"
    )
    token_hash = models.CharField(max_length=64, db_index=True)
    expires_at = models.DateTimeField()
    is_used = models.BooleanField(default=False)
    used_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "password_reset_tokens"
        ordering = ["-created_at"]

    @classmethod
    def create_for_user(cls, user: User, expiry_hours: int = 2):
        # Invalidate any prior unused reset tokens for this user
        cls.objects.filter(user=user, is_used=False).update(is_used=True, used_at=timezone.now())

        raw_token = secrets.token_urlsafe(32)
        token_hash = hash_token(raw_token)
        expires_at = timezone.now() + timedelta(hours=expiry_hours)

        token_instance = cls.objects.create(
            user=user,
            token_hash=token_hash,
            expires_at=expires_at,
        )
        return token_instance, raw_token

    def is_valid(self) -> bool:
        return not self.is_used and timezone.now() < self.expires_at

