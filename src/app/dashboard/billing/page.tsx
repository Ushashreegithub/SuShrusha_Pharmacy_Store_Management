"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import {
  Search,
  Plus,
  Trash2,
  ShoppingCart,
  User,
  Clock,
  CreditCard,
  QrCode,
  Banknote,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Printer,
  Receipt,
  ShieldCheck,
  FileText,
  ChevronRight,
  PauseCircle,
  PlayCircle,
  X,
  Percent,
  ArrowRight,
  RefreshCw,
  Building2,
  Phone,
  Mail,
  MapPin,
  Stethoscope,
  ChevronDown,
  Info,
  Camera,
  HelpCircle,
  Volume2,
  Zap,
} from "lucide-react";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { DashboardProvider, useDashboard } from "@/context/DashboardContext";
import {
  SaleDraft,
  SaleDraftItem,
  POSProduct,
  BillingCustomer,
  Invoice,
  DiscountApprovalRequest,
  getActiveSaleDraftApi,
  getHeldSaleDraftsApi,
  searchPOSProductsApi,
  getBillingCustomersApi,
  createBillingCustomerApi,
  addSaleDraftItemApi,
  removeSaleDraftItemApi,
  updateSaleDraftCustomerApi,
  holdSaleDraftApi,
  resumeSaleDraftApi,
  requestDraftDiscountApi,
  reviewDraftDiscountApi,
  verifyDraftPrescriptionApi,
  checkoutSaleDraftApi,
  CheckoutAttempt,
  initiateCheckoutApi,
  recordPaymentApi,
  verifyPaymentApi,
  finalizeCheckoutApi,
  getCheckoutAttemptStatusApi,
} from "@/lib/api";

function CashierPOSScreen() {
  const { activeStore, activeStoreId, user } = useDashboard();
  const storeId = activeStore?.id || activeStoreId;
  const role = user?.primary_role || "none";
  const isOwner = role === "owner" || Boolean(user?.organizations?.some((o) => o.is_owner));
  const isManager = role === "manager";

  // POS State
  const [draft, setDraft] = useState<SaleDraft | null>(null);
  const [heldDrafts, setHeldDrafts] = useState<SaleDraft[]>([]);
  const [isLoadingDraft, setIsLoadingDraft] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Search & Barcode
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<POSProduct[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const isSearchingRef = useRef(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Scanner States (Hardware Gun & Camera)
  const [showCameraScanner, setShowCameraScanner] = useState(false);
  const [showScannerGuide, setShowScannerGuide] = useState(false);
  const [testBarcodeQuery, setTestBarcodeQuery] = useState("");
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Customer Management
  const [customerSearchQuery, setCustomerSearchQuery] = useState("");
  const [customerResults, setCustomerResults] = useState<BillingCustomer[]>([]);
  const [isCustomerSearching, setIsCustomerSearching] = useState(false);
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [showNewCustomerModal, setShowNewCustomerModal] = useState(false);
  const [pendingCustomerAssignment, setPendingCustomerAssignment] = useState<BillingCustomer | null>(null);
  const [isAttachingPending, setIsAttachingPending] = useState(false);
  const [newCustomerForm, setNewCustomerForm] = useState({
    name: "",
    phone_number: "",
    email: "",
    address: "",
    doctor_name: "",
    doctor_registration_number: "",
  });
  const [isSavingCustomer, setIsSavingCustomer] = useState(false);

  // Modals & Panels
  const [showHeldBillsModal, setShowHeldBillsModal] = useState(false);
  const [showHoldPromptModal, setShowHoldPromptModal] = useState(false);
  const [holdNote, setHoldNote] = useState("");
  const [showPrescriptionModal, setShowPrescriptionModal] = useState(false);
  const [rxForm, setRxForm] = useState({
    prescription_number: "",
    doctor_name: "",
  });
  const [showDiscountModal, setShowDiscountModal] = useState(false);
  const [discountType, setDiscountType] = useState<"percentage" | "amount">("percentage");
  const [discountValue, setDiscountValue] = useState("");
  const [discountReason, setDiscountReason] = useState("");
  const [isSubmittingDiscount, setIsSubmittingDiscount] = useState(false);

  // Checkout Modal
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentMethodTab, setPaymentMethodTab] = useState<"CASH" | "UPI" | "CARD" | "SPLIT">("CASH");
  const [cashTendered, setCashTendered] = useState("");
  const [upiReference, setUpiReference] = useState("");
  const [cardReference, setCardReference] = useState("");
  // Split payment state
  const [splitCash, setSplitCash] = useState("");
  const [splitUpi, setSplitUpi] = useState("");
  const [splitUpiRef, setSplitUpiRef] = useState("");
  const [splitCard, setSplitCard] = useState("");
  const [splitCardRef, setSplitCardRef] = useState("");
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [activeAttempt, setActiveAttempt] = useState<CheckoutAttempt | null>(null);
  const [isVerifyingPayment, setIsVerifyingPayment] = useState(false);
  const [attemptIdempotencyKey, setAttemptIdempotencyKey] = useState<string>("");

  // Post-Checkout Success
  const [completedInvoice, setCompletedInvoice] = useState<Invoice | null>(null);
  const [showReceiptModal, setShowReceiptModal] = useState(false);

  // Auto-clear notification messages after 5 seconds
  useEffect(() => {
    if (actionSuccess || actionError) {
      const timer = setTimeout(() => {
        setActionSuccess(null);
        setActionError(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [actionSuccess, actionError]);

  // Load Active Draft & Held Drafts on Store Change
  const loadActiveDraft = useCallback(async () => {
    if (!storeId) return;
    setIsLoadingDraft(true);
    setActionError(null);
    try {
      const [draftData, heldData] = await Promise.all([
        getActiveSaleDraftApi(storeId),
        getHeldSaleDraftsApi(storeId),
      ]);
      setDraft(draftData);
      setHeldDrafts(heldData);
    } catch (err: any) {
      console.error("Failed to load active draft:", err);
      setActionError(err.message || "Failed to initialize POS counter draft.");
    } finally {
      setIsLoadingDraft(false);
    }
  }, [storeId]);

  useEffect(() => {
    loadActiveDraft();
  }, [loadActiveDraft]);

  // Medicine Catalog Search (with debouncing)
  useEffect(() => {
    if (!storeId || !searchQuery.trim() || searchQuery.trim().length < 2) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const results = await searchPOSProductsApi(storeId, searchQuery.trim());
        setSearchResults(results);
        setShowSearchResults(true);
      } catch (err) {
        console.error("Error searching medicines:", err);
      } finally {
        setIsSearching(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [searchQuery, storeId]);

  // Customer Search (with debouncing)
  useEffect(() => {
    if (!customerSearchQuery.trim() || customerSearchQuery.trim().length < 2) {
      setCustomerResults([]);
      setIsCustomerSearching(false);
      return;
    }

    const timer = setTimeout(async () => {
      setIsCustomerSearching(true);
      try {
        const results = await getBillingCustomersApi(customerSearchQuery.trim(), storeId);
        setCustomerResults(results);
        setShowCustomerDropdown(true);
      } catch (err) {
        console.error("Error searching customers:", err);
      } finally {
        setIsCustomerSearching(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [customerSearchQuery]);

  // Retail POS Audio Feedback (Web Audio API)
  const playScannerBeep = useCallback((success: boolean = true) => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      if (success) {
        osc.type = "sine";
        osc.frequency.setValueAtTime(950, ctx.currentTime);
        gain.gain.setValueAtTime(0.12, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.1);
      } else {
        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(240, ctx.currentTime);
        gain.gain.setValueAtTime(0.15, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.18);
      }
    } catch {
      // Audio not permitted or supported; silent fallback
    }
  }, []);

  // Core Barcode & Search Item Resolver (Direct API call without debounce race conditions)
  const processBarcodeOrSearch = useCallback(
    async (code: string) => {
      const trimmed = code.trim();
      if (!trimmed || !draft || !storeId) return;

      if (isSearchingRef.current) return;
      isSearchingRef.current = true;

      try {
        setIsSearching(true);
        setActionError(null);

        // Instant direct fetch from backend search API
        const results = await searchPOSProductsApi(storeId, trimmed);

        // 1. Exact match by Barcode (case-insensitive)
        let matched = results.find(
          (p) => p.barcode && p.barcode.toLowerCase() === trimmed.toLowerCase()
        );

        // 2. Exact match by SKU
        if (!matched) {
          matched = results.find(
            (p) => p.sku && p.sku.toLowerCase() === trimmed.toLowerCase()
          );
        }

        // 3. Exact match by Name or single search result
        if (!matched && results.length === 1) {
          matched = results[0];
        }

        if (matched) {
          const avail =
            matched.available_stock_base_units ??
            (matched as any).available_base_units ??
            0;
          if (avail <= 0) {
            playScannerBeep(false);
            setActionError(`Cannot dispense "${matched.name}": Out of stock.`);
            return;
          }

          // Check if item already exists in active draft cart; if so, increment quantity!
          const existing = draft.items?.find(
            (it) => it.product_id === matched.id || (it as any).product === matched.id
          );
          const targetQty = existing ? existing.quantity + 1 : 1;

          // Add or update item in draft bill
          const updated = await addSaleDraftItemApi(storeId, draft.id, {
            product_id: matched.id,
            quantity: targetQty,
            unit_type: "SALE_UNIT",
          });
          setDraft(updated);
          playScannerBeep(true);
          setSearchQuery("");
          setShowSearchResults(false);
          searchInputRef.current?.focus();
          setActionSuccess(
            `✓ Scanned & Added: ${matched.name} (Qty: ${targetQty})`
          );
        } else if (results.length > 1) {
          setSearchResults(results);
          setShowSearchResults(true);
          setActionSuccess(`Found ${results.length} medicines matching "${trimmed}". Select to add.`);
        } else {
          playScannerBeep(false);
          setActionError(`No medicine found for barcode or SKU: "${trimmed}". Please verify in Product Catalog.`);
        }
      } catch (err: any) {
        console.error("Barcode lookup error:", err);
        playScannerBeep(false);
        setActionError(err.message || "Failed to search product by barcode.");
      } finally {
        setIsSearching(false);
        isSearchingRef.current = false;
      }
    },
    [draft, storeId, playScannerBeep]
  );

  // Barcode Wedge / Enter Key Handler inside the search input
  const handleBarcodeOrDirectAdd = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      await processBarcodeOrSearch(searchQuery);
    }
  };

  // Keyboard Wedge Scanner Helper: Ensures typing while not in an input automatically transfers into the search bar
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // If user is focused on any input, select, or textarea, let that element handle typing normally
      const activeEl = document.activeElement;
      if (
        activeEl?.tagName === "INPUT" ||
        activeEl?.tagName === "TEXTAREA" ||
        activeEl?.tagName === "SELECT"
      ) {
        return;
      }

      // If user scans or types a printable character while not focused in any input,
      // redirect focus directly to the search input so scanner/typing is not lost!
      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        if (searchInputRef.current) {
          searchInputRef.current.focus();
          setSearchQuery((prev) => prev + e.key);
          e.preventDefault();
        }
      }
    };

    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, []);

  // Camera Video Stream Handler for Web/Mobile Barcode Scanning
  useEffect(() => {
    if (!showCameraScanner) {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
      setIsCameraActive(false);
      setCameraError(null);
      return;
    }

    let isCancelled = false;

    async function initCamera() {
      try {
        setCameraError(null);
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
        });

        if (isCancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
          setIsCameraActive(true);
        }

        // Check if BarcodeDetector is supported natively in the browser
        if ("BarcodeDetector" in window) {
          const barcodeDetector = new (window as any).BarcodeDetector({
            formats: ["ean_13", "ean_8", "code_128", "code_39", "upc_a", "upc_e", "qr_code"],
          });

          const detectFrame = async () => {
            if (!videoRef.current || !streamRef.current || isCancelled) return;
            try {
              if (videoRef.current.readyState === videoRef.current.HAVE_ENOUGH_DATA) {
                const barcodes = await barcodeDetector.detect(videoRef.current);
                if (barcodes.length > 0 && barcodes[0].rawValue) {
                  const scanned = barcodes[0].rawValue;
                  setShowCameraScanner(false);
                  await processBarcodeOrSearch(scanned);
                  return;
                }
              }
            } catch {
              // Frame dropped or detection error; continue loop
            }
            if (!isCancelled) {
              requestAnimationFrame(detectFrame);
            }
          };

          requestAnimationFrame(detectFrame);
        }
      } catch (err: any) {
        console.error("Camera access error:", err);
        setCameraError(
          err.name === "NotAllowedError"
            ? "Camera permission denied. Please allow camera access in browser settings to scan barcodes."
            : "Could not start camera video stream. You can still scan using any handheld USB scanner or type the barcode."
        );
        setIsCameraActive(false);
      }
    }

    initCamera();

    return () => {
      isCancelled = true;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      setIsCameraActive(false);
    };
  }, [showCameraScanner, processBarcodeOrSearch]);

  // Add Item to Draft (Increments quantity if already in cart)
  const handleAddItemToDraft = async (product: POSProduct, unitType: "SALE_UNIT" | "LOOSE_UNIT") => {
    if (!draft || !storeId) return;
    try {
      setActionError(null);
      const existing = draft.items?.find(
        (it) => (it.product_id === product.id || (it as any).product === product.id) && it.unit_type === unitType
      );
      const targetQty = existing ? existing.quantity + 1 : 1;
      const updated = await addSaleDraftItemApi(storeId, draft.id, {
        product_id: product.id,
        quantity: targetQty,
        unit_type: unitType,
      });
      setDraft(updated);
      setShowSearchResults(false);
      setSearchQuery("");
      searchInputRef.current?.focus();
      playScannerBeep(true);
      setActionSuccess(`Added ${product.name} (Qty: ${targetQty}) to bill.`);
    } catch (err: any) {
      console.error("Failed to add item:", err);
      playScannerBeep(false);
      setActionError(err.message || "Failed to add product to bill.");
    }
  };

  // Update Item Quantity in Draft (Used by + / - buttons and input)
  const handleUpdateItemQuantity = async (
    item: SaleDraftItem,
    newQty: number,
    unitType?: "SALE_UNIT" | "LOOSE_UNIT"
  ) => {
    if (!draft || !storeId) return;
    if (newQty <= 0) {
      await handleRemoveItem(item.id, item.product_name);
      return;
    }
    try {
      setActionError(null);
      const prodId = item.product_id || (item as any).product;
      const updated = await addSaleDraftItemApi(storeId, draft.id, {
        product_id: prodId,
        quantity: newQty,
        unit_type: unitType || item.unit_type || "SALE_UNIT",
      });
      setDraft(updated);
      playScannerBeep(true);
    } catch (err: any) {
      console.error("Failed to update item quantity:", err);
      playScannerBeep(false);
      setActionError(err.message || "Failed to update item quantity.");
    }
  };

  // Remove Item from Draft
  const handleRemoveItem = async (itemId: string, itemName: string) => {
    if (!draft || !storeId) return;
    try {
      setActionError(null);
      const updated = await removeSaleDraftItemApi(storeId, draft.id, itemId);
      setDraft(updated);
      setActionSuccess(`Removed ${itemName} from bill.`);
    } catch (err: any) {
      console.error("Failed to remove item:", err);
      setActionError(err.message || "Failed to remove item from draft.");
    }
  };

  // Select Customer
  const handleSelectCustomer = async (customer: BillingCustomer) => {
    if (!draft || !storeId) return;
    try {
      setActionError(null);
      const updated = await updateSaleDraftCustomerApi(storeId, draft.id, customer.id);
      setDraft(updated);
      setShowCustomerDropdown(false);
      setCustomerSearchQuery("");
      setActionSuccess(`Customer ${customer.name} linked to bill.`);
    } catch (err: any) {
      console.error("Failed to link customer:", err);
      setActionError(err.message || "Failed to link customer to bill.");
    }
  };

  // Clear Customer
  const handleClearCustomer = async () => {
    if (!draft || !storeId) return;
    try {
      setActionError(null);
      const updated = await updateSaleDraftCustomerApi(storeId, draft.id, null);
      setDraft(updated);
      setActionSuccess("Customer unlinked from bill.");
    } catch (err: any) {
      console.error("Failed to unlink customer:", err);
      setActionError(err.message || "Failed to unlink customer.");
    }
  };

  // Create New Customer Inline
  const handleCreateNewCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft || !storeId) return;
    setIsSavingCustomer(true);
    setActionError(null);

    let createdCustomer: BillingCustomer | null = null;
    try {
      createdCustomer = await createBillingCustomerApi(newCustomerForm, storeId);
    } catch (createErr: any) {
      console.error("Failed to create customer:", createErr);
      setActionError(createErr.message || "Failed to register customer profile.");
      setIsSavingCustomer(false);
      return;
    }

    // Customer created in DB successfully. Reset form and close modal to prevent duplicate submissions
    setShowNewCustomerModal(false);
    setNewCustomerForm({
      name: "",
      phone_number: "",
      email: "",
      address: "",
      doctor_name: "",
      doctor_registration_number: "",
    });

    try {
      const updated = await updateSaleDraftCustomerApi(storeId, draft.id, createdCustomer.id);
      setDraft(updated);
      setPendingCustomerAssignment(null);
      setActionSuccess(`Customer ${createdCustomer.name} registered and attached to bill.`);
    } catch (linkErr: any) {
      console.error("Failed to link customer to draft:", linkErr);
      setPendingCustomerAssignment(createdCustomer);
      setActionError(`Customer "${createdCustomer.name}" was registered, but linking to the draft failed. Click "Link to Bill" below to retry.`);
    } finally {
      setIsSavingCustomer(false);
    }
  };

  // Retry Linking a Pending Customer
  const handleRetryAttachCustomer = async (customer: BillingCustomer) => {
    if (!draft || !storeId) return;
    setIsAttachingPending(true);
    setActionError(null);
    try {
      const updated = await updateSaleDraftCustomerApi(storeId, draft.id, customer.id);
      setDraft(updated);
      setPendingCustomerAssignment(null);
      setActionSuccess(`Customer ${customer.name} attached to bill.`);
    } catch (err: any) {
      console.error("Retry customer link error:", err);
      setActionError(err.message || "Failed to link customer to bill.");
    } finally {
      setIsAttachingPending(false);
    }
  };

  // Hold Current Bill
  const handleHoldBill = async () => {
    if (!draft || !storeId) return;
    try {
      setActionError(null);
      await holdSaleDraftApi(storeId, draft.id, holdNote.trim() || undefined);
      setShowHoldPromptModal(false);
      setHoldNote("");
      await loadActiveDraft();
      setActionSuccess(`Draft bill put on HOLD. Counter ready for next customer.`);
    } catch (err: any) {
      console.error("Failed to hold bill:", err);
      setActionError(err.message || "Failed to hold bill.");
    }
  };

  // Resume Held Bill
  const handleResumeBill = async (heldDraftId: string) => {
    if (!storeId) return;
    try {
      setActionError(null);
      const resumed = await resumeSaleDraftApi(storeId, heldDraftId);
      setDraft(resumed);
      setShowHeldBillsModal(false);
      const heldList = await getHeldSaleDraftsApi(storeId);
      setHeldDrafts(heldList);
      setActionSuccess(`Resumed bill ${resumed.draft_number}.`);
    } catch (err: any) {
      console.error("Failed to resume bill:", err);
      setActionError(err.message || "Failed to resume held bill.");
    }
  };

  // Request / Apply Discount
  const handleSubmitDiscount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft || !storeId) return;
    setIsSubmittingDiscount(true);
    setActionError(null);
    try {
      const payload: any = {
        reason: discountReason.trim() || "Counter customer goodwill discount",
      };
      if (discountType === "percentage") {
        payload.discount_percentage = parseFloat(discountValue);
      } else {
        payload.discount_amount = parseFloat(discountValue);
      }

      const updated = await requestDraftDiscountApi(storeId, draft.id, payload);
      setDraft(updated);
      setShowDiscountModal(false);
      setDiscountValue("");
      setDiscountReason("");

      if (updated.pending_discount_request?.status === "APPROVED") {
        setActionSuccess("Manager discount approved and applied to bill!");
      } else {
        setActionSuccess("Discount requested. Pending Manager/Owner review.");
      }
    } catch (err: any) {
      console.error("Discount error:", err);
      setActionError(err.message || "Failed to apply discount.");
    } finally {
      setIsSubmittingDiscount(false);
    }
  };

  // Review Pending Discount (for Managers/Owners)
  const handleReviewDiscount = async (approved: boolean) => {
    if (!draft || !storeId || !draft.pending_discount_request) return;
    try {
      setActionError(null);
      const updated = await reviewDraftDiscountApi(
        storeId,
        draft.pending_discount_request.id,
        { approved }
      );
      setDraft(updated);
      setActionSuccess(approved ? "Discount approved!" : "Discount request rejected.");
    } catch (err: any) {
      console.error("Failed to review discount:", err);
      setActionError(err.message || "Failed to review discount request.");
    }
  };

  // Verify Prescription (Pharmacist Sign-Off)
  const handleVerifyPrescription = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft || !storeId) return;
    try {
      setActionError(null);
      const updated = await verifyDraftPrescriptionApi(storeId, draft.id, rxForm);
      setDraft(updated);
      setShowPrescriptionModal(false);
      setRxForm({ prescription_number: "", doctor_name: "" });
      setActionSuccess("Prescription verified and signed off for Schedule H/Rx dispensing.");
    } catch (err: any) {
      console.error("Prescription verification failed:", err);
      setActionError(err.message || "Failed to verify prescription.");
    }
  };

  // Execute Checkout (Phase 2 Two-Stage Durable Checkout Lifecycle)
  const handleExecuteCheckout = async () => {
    if (!draft || !storeId) return;
    if (!draft.customer && !draft.customer_name) {
      setActionError("Customer information is required before completing the sale.");
      return;
    }

    setIsCheckingOut(true);
    setActionError(null);

    const idempotencyKey =
      attemptIdempotencyKey ||
      `POS-CHECKOUT-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    if (!attemptIdempotencyKey) {
      setAttemptIdempotencyKey(idempotencyKey);
    }

    try {
      // If we already have a verified attempt ready to finalize, finalize directly!
      if (activeAttempt && activeAttempt.status === "READY_TO_FINALIZE") {
        const finRes = await finalizeCheckoutApi(storeId, activeAttempt.id, idempotencyKey);
        setCompletedInvoice(finRes.invoice);
        setShowPaymentModal(false);
        setActiveAttempt(null);
        setAttemptIdempotencyKey("");
        setShowReceiptModal(true);
        setCashTendered("");
        setUpiReference("");
        setCardReference("");
        setSplitCash("");
        setSplitUpi("");
        setSplitCard("");
        await loadActiveDraft();
        return;
      }

      const payable = draft
        ? parseFloat(draft.final_payable_amount || draft.totals?.final_payable || "0") || 0
        : 0;
      let paymentsPayload: any[] = [];

      if (paymentMethodTab === "CASH") {
        const tendered = parseFloat(cashTendered) || payable;
        if (tendered < payable) {
          setActionError(`Cash tendered (₹${tendered.toFixed(2)}) is less than total payable (₹${payable.toFixed(2)}).`);
          setIsCheckingOut(false);
          return;
        }
        paymentsPayload.push({
          method: "CASH",
          amount: payable,
          cash_tendered: tendered,
        });
      } else if (paymentMethodTab === "UPI") {
        paymentsPayload.push({
          method: "UPI",
          amount: payable,
          reference_number: upiReference.trim() || undefined,
        });
      } else if (paymentMethodTab === "CARD") {
        paymentsPayload.push({
          method: "CARD",
          amount: payable,
          reference_number: cardReference.trim() || undefined,
        });
      } else if (paymentMethodTab === "SPLIT") {
        const c = parseFloat(splitCash) || 0;
        const u = parseFloat(splitUpi) || 0;
        const cd = parseFloat(splitCard) || 0;
        const sum = Math.round((c + u + cd) * 100) / 100;
        if (Math.abs(sum - payable) > 0.05) {
          setActionError(`Split payment total (₹${sum.toFixed(2)}) does not match bill total (₹${payable.toFixed(2)}).`);
          setIsCheckingOut(false);
          return;
        }
        if (c > 0) paymentsPayload.push({ method: "CASH", amount: c });
        if (u > 0) paymentsPayload.push({ method: "UPI", amount: u, reference_number: splitUpiRef.trim() || undefined });
        if (cd > 0) paymentsPayload.push({ method: "CARD", amount: cd, reference_number: splitCardRef.trim() || undefined });
      }

      // 1. Initiate Checkout Attempt (with clean UUID parsing for customer)
      let currentAttempt = activeAttempt;
      if (!currentAttempt) {
        let customerId: string | undefined = undefined;
        let customerName = "Retail Walk-in";
        let customerPhone = "9999999999";

        if (draft.customer) {
          if (typeof draft.customer === "object") {
            customerId = (draft.customer as any).id;
            customerName = (draft.customer as any).name || draft.customer_name || customerName;
            customerPhone = (draft.customer as any).phone_number || draft.customer_phone || customerPhone;
          } else if (typeof draft.customer === "string" && draft.customer.trim()) {
            customerId = draft.customer.trim();
          }
        } else if (draft.customer_name) {
          customerName = draft.customer_name;
          customerPhone = draft.customer_phone || customerPhone;
        }

        currentAttempt = await initiateCheckoutApi(
          storeId,
          {
            draft_id: draft.id,
            customer: {
              id: customerId,
              name: customerName,
              phone_number: customerPhone,
            },
          },
          idempotencyKey
        );
        setActiveAttempt(currentAttempt);
      }

      // 2. Record Payment(s)
      for (const p of paymentsPayload) {
        const payRes = await recordPaymentApi(storeId, currentAttempt.id, p);
        currentAttempt = payRes.checkout_attempt;
        setActiveAttempt(currentAttempt);
      }

      // If user is manager/owner and payments require verification, auto-verify for smooth checkout
      const canManage = isOwner || isManager;
      if (canManage && currentAttempt.payments) {
        for (const p of currentAttempt.payments) {
          if (p.status === "REQUIRES_VERIFICATION") {
            const vRes = await verifyPaymentApi(storeId, currentAttempt.id, p.id, {
              approved: true,
              verification_notes: "Auto-verified by Store Manager at POS.",
            });
            currentAttempt = vRes.checkout_attempt;
            setActiveAttempt(currentAttempt);
          }
        }
      }

      // 3. Check if ready to finalize
      if (currentAttempt.status === "READY_TO_FINALIZE") {
        const finRes = await finalizeCheckoutApi(storeId, currentAttempt.id, idempotencyKey);
        setCompletedInvoice(finRes.invoice);
        setShowPaymentModal(false);
        setActiveAttempt(null);
        setAttemptIdempotencyKey("");
        setShowReceiptModal(true);
        setCashTendered("");
        setUpiReference("");
        setCardReference("");
        setSplitCash("");
        setSplitUpi("");
        setSplitCard("");
        await loadActiveDraft();
      } else if (currentAttempt.status === "PAYMENT_PENDING_VERIFICATION") {
        setActionSuccess("Electronic payment registered. Awaiting Store Manager verification before stock finalization.");
      }
    } catch (err: any) {
      console.error("Checkout failed:", err);
      setActionError(err.message || "Checkout failed. Please check stock and payment details.");
    } finally {
      setIsCheckingOut(false);
    }
  };

  // Manager Manual Verification Handler
  const handleVerifyPendingPayment = async (paymentId: string) => {
    if (!activeAttempt || !storeId) return;
    setIsVerifyingPayment(true);
    setActionError(null);
    try {
      const vRes = await verifyPaymentApi(storeId, activeAttempt.id, paymentId, {
        approved: true,
        verification_notes: "Verified and confirmed by Store Manager.",
      });
      setActiveAttempt(vRes.checkout_attempt);
      setActionSuccess("Payment verified successfully.");

      if (vRes.checkout_attempt.status === "READY_TO_FINALIZE") {
        const key = attemptIdempotencyKey || undefined;
        const finRes = await finalizeCheckoutApi(storeId, activeAttempt.id, key);
        setCompletedInvoice(finRes.invoice);
        setShowPaymentModal(false);
        setActiveAttempt(null);
        setAttemptIdempotencyKey("");
        setShowReceiptModal(true);
        setCashTendered("");
        setUpiReference("");
        setCardReference("");
        setSplitCash("");
        setSplitUpi("");
        setSplitCard("");
        await loadActiveDraft();
      }
    } catch (err: any) {
      console.error("Verification failed:", err);
      setActionError(err.message || "Payment verification failed.");
    } finally {
      setIsVerifyingPayment(false);
    }
  };

  const finalPayable = draft
    ? parseFloat(draft.final_payable_amount || draft.totals?.final_payable || "0") || 0
    : 0;
  const cashChangeDue = Math.max(0, (parseFloat(cashTendered) || 0) - finalPayable);

  // Split payment remainder calculation
  const currentSplitSum =
    (parseFloat(splitCash) || 0) + (parseFloat(splitUpi) || 0) + (parseFloat(splitCard) || 0);
  const splitRemaining = Math.max(0, finalPayable - currentSplitSum);

  return (
    <div className="flex flex-col h-[calc(100vh-4.25rem)]">
      {/* Top Banner Notifications */}
      {actionSuccess && (
        <div className="bg-emerald-600 text-white px-4 py-2 text-xs font-medium flex items-center justify-between shadow-xs">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4" />
            <span>{actionSuccess}</span>
          </div>
          <button onClick={() => setActionSuccess(null)} className="hover:opacity-80">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {actionError && (
        <div className="bg-rose-600 text-white px-4 py-2 text-xs font-medium flex items-center justify-between shadow-xs">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{actionError}</span>
          </div>
          <button onClick={() => setActionError(null)} className="hover:opacity-80">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* POS Sub-Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-2.5 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-[#0F766E]/10 text-[#0F766E] rounded-xl font-bold flex items-center gap-2 text-sm">
            <ShoppingCart className="w-4 h-4" />
            <span>Retail Billing Counter</span>
          </div>
          <div className="hidden sm:flex items-center gap-2 text-xs text-slate-500">
            <span className="font-semibold text-slate-800">{activeStore?.name || "Active Store"}</span>
            <span className="font-mono bg-slate-100 px-1.5 py-0.5 rounded text-[11px] text-slate-600">
              {activeStore?.code}
            </span>
          </div>
        </div>

        {/* Counter Info & Bill Actions */}
        <div className="flex items-center gap-2">
          {draft && (
            <div className="flex items-center gap-1.5 bg-slate-100 text-slate-700 px-2.5 py-1 rounded-lg text-xs font-mono">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>{draft.draft_number}</span>
            </div>
          )}

          {/* Held Bills Button */}
          <button
            type="button"
            onClick={() => setShowHeldBillsModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-xs font-semibold text-slate-700 transition"
          >
            <Clock className="w-3.5 h-3.5 text-amber-600" />
            <span>Held Bills</span>
            {heldDrafts.length > 0 && (
              <span className="bg-amber-100 text-amber-800 font-bold px-1.5 py-0.2 rounded-full text-[10px]">
                {heldDrafts.length}
              </span>
            )}
          </button>

          {/* Hold Current Bill */}
          {draft && draft.items.length > 0 && (
            <button
              type="button"
              onClick={() => setShowHoldPromptModal(true)}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-amber-300 bg-amber-50 hover:bg-amber-100 text-xs font-semibold text-amber-900 transition"
            >
              <PauseCircle className="w-3.5 h-3.5" />
              <span>Hold Bill</span>
            </button>
          )}

          {/* New Bill Button */}
          <button
            type="button"
            onClick={loadActiveDraft}
            disabled={isLoadingDraft}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#0F766E] hover:bg-[#115E59] text-xs font-semibold text-white shadow-2xs transition"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Bill</span>
          </button>
        </div>
      </div>

      {/* Main Split Layout: Left 65% (Search + Cart), Right 35% (Customer + Bill Summary + Checkout) */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 overflow-hidden">
        {/* LEFT COLUMN: Medicine Search & Cart Items */}
        <div className="lg:col-span-8 flex flex-col border-r border-slate-200 bg-slate-50 overflow-hidden">
          {/* Barcode & Medicine Search Box */}
          <div className="p-4 bg-white border-b border-slate-200 shadow-2xs relative">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <div className="relative flex-1">
                <Search className="w-5 h-5 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  ref={searchInputRef}
                  type="text"
                  autoFocus
                  placeholder="Scan barcode gun or type medicine brand, generic name, SKU (Press Enter to add)..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={handleBarcodeOrDirectAdd}
                  onFocus={() => {
                    setIsSearchFocused(true);
                    if (searchResults.length > 0) setShowSearchResults(true);
                  }}
                  onBlur={() => {
                    setIsSearchFocused(false);
                  }}
                  className={`w-full pl-11 pr-4 py-2.5 text-sm font-medium rounded-xl border transition shadow-inner ${
                    isSearchFocused
                      ? "bg-white border-teal-600 ring-2 ring-teal-500/20"
                      : "bg-slate-50 hover:bg-white border-slate-300"
                  }`}
                />
              </div>

              {/* Scanner Control Badges & Camera Trigger */}
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => setShowCameraScanner(true)}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-teal-50 hover:bg-teal-100 text-[#0F766E] border border-teal-200 shadow-2xs transition"
                  title="Open webcam or device camera to scan barcodes directly"
                >
                  <Camera className="w-4 h-4 text-[#0F766E]" />
                  <span className="hidden sm:inline">Camera Scanner</span>
                  <span className="sm:hidden">Camera</span>
                </button>

                {/* Focus-Aware Barcode Scanner Status Badge */}
                <button
                  type="button"
                  onClick={() => {
                    if (!isSearchFocused) {
                      searchInputRef.current?.focus();
                    } else {
                      setShowScannerGuide(true);
                    }
                  }}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border shadow-2xs transition ${
                    isSearching
                      ? "bg-blue-50 text-blue-800 border-blue-300"
                      : isSearchFocused
                      ? "bg-emerald-50 text-emerald-800 border-emerald-300 ring-1 ring-emerald-400/40"
                      : "bg-amber-50 text-amber-900 border-amber-300 hover:bg-amber-100 cursor-pointer"
                  }`}
                  title={
                    isSearchFocused
                      ? "Barcode input is focused and ready to receive scan. Click for Guide & Diagnostics."
                      : "Barcode search is not focused! Click here to focus so your scanner gun can type."
                  }
                >
                  {isSearching ? (
                    <>
                      <span className="w-2 h-2 rounded-full bg-blue-500 animate-ping" />
                      <QrCode className="w-4 h-4 text-blue-600 animate-spin" />
                      <span>Scanning...</span>
                    </>
                  ) : isSearchFocused ? (
                    <>
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                      <QrCode className="w-4 h-4 text-emerald-600" />
                      <span>Ready for Scan</span>
                      <HelpCircle
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowScannerGuide(true);
                        }}
                        className="w-3.5 h-3.5 text-emerald-600 hover:scale-125 transition"
                      />
                    </>
                  ) : (
                    <>
                      <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                      <QrCode className="w-4 h-4 text-amber-600" />
                      <span>Click to Focus Scanner</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Instant Search Dropdown */}
            {showSearchResults && searchResults.length > 0 && (
              <div className="absolute left-4 right-4 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl z-20 max-h-96 overflow-y-auto divide-y divide-slate-100">
                <div className="px-3 py-1.5 bg-slate-50 text-[11px] font-bold text-slate-500 uppercase tracking-wider flex justify-between">
                  <span>Available Medicines ({searchResults.length})</span>
                  <span>Click to add to bill</span>
                </div>
                {searchResults.map((p) => {
                  const availBase =
                    p.available_stock_base_units ??
                    (p as any).available_base_units ??
                    0;
                  const hasStock = availBase > 0;
                  const isRx = p.prescription_class !== "otc";
                  const displayMrp = p.display_mrp || (p as any).mrp || "0.00";
                  const displayUnitMrp = p.display_unit_mrp || (p as any).unit_mrp || "0.00";
                  const availPacks =
                    p.available_stock_sale_units ??
                    (p as any).available_packs ??
                    Math.floor(availBase / (p.conversion_factor || 1));

                  return (
                    <div
                      key={p.id}
                      className={`p-3 transition flex items-center justify-between gap-4 ${
                        hasStock ? "hover:bg-teal-50/60 cursor-pointer" : "opacity-60 bg-slate-50 cursor-not-allowed"
                      }`}
                      onClick={() => {
                        if (hasStock) handleAddItemToDraft(p, "SALE_UNIT");
                      }}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm text-slate-900 truncate">{p.name}</span>
                          {p.brand_name && (
                            <span className="text-xs text-slate-500 truncate">({p.brand_name})</span>
                          )}
                          <span
                            className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold uppercase ${
                              isRx ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"
                            }`}
                          >
                            {p.prescription_class ? p.prescription_class.replace("_", " ") : "OTC"}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-slate-500 mt-1">
                          <span className="font-mono text-[11px] text-slate-600">SKU: {p.sku}</span>
                          {p.barcode && (
                            <>
                              <span>•</span>
                              <span className="font-mono text-[11px] text-slate-600">Barcode: {p.barcode}</span>
                            </>
                          )}
                          <span>•</span>
                          <span>Generic: {p.generic_name || "—"}</span>
                          <span>•</span>
                          <span>
                            Pack: 1 {p.sale_unit || "pack"} ({p.conversion_factor || 1} {p.base_unit || "unit"})
                          </span>
                        </div>
                      </div>

                      {/* Stock & Price Preview */}
                      <div className="text-right flex-shrink-0 flex items-center gap-3">
                        <div>
                          <div className="font-bold text-sm text-slate-900">₹{displayMrp}</div>
                          <div className="text-[11px] text-slate-500">₹{displayUnitMrp} / {p.base_unit || "unit"}</div>
                        </div>

                        <div className="text-right min-w-[5rem]">
                          <span
                            className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${
                              hasStock ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"
                            }`}
                          >
                            {hasStock
                              ? `${availPacks} ${p.sale_unit || "pack"}s`
                              : "Out of Stock"}
                          </span>
                          {hasStock && (
                            <div className="text-[10px] text-slate-400 mt-0.5">
                              {availBase} {p.base_unit || "unit"}s
                            </div>
                          )}
                        </div>

                        {hasStock && (
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleAddItemToDraft(p, "SALE_UNIT");
                              }}
                              className="px-2 py-1 bg-[#0F766E] hover:bg-[#115E59] text-white text-xs font-semibold rounded-lg shadow-2xs"
                            >
                              + Pack
                            </button>
                            {p.is_loose_dispensing_allowed && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleAddItemToDraft(p, "LOOSE_UNIT");
                                }}
                                className="px-2 py-1 bg-teal-100 hover:bg-teal-200 text-[#0F766E] text-xs font-semibold rounded-lg"
                                title={`Dispense single ${p.base_unit}`}
                              >
                                + Loose
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Cart Items Table */}
          <div className="flex-1 overflow-y-auto p-4">
            {isLoadingDraft ? (
              <div className="flex flex-col items-center justify-center h-64 text-slate-400 gap-3">
                <RefreshCw className="w-8 h-8 animate-spin text-[#0F766E]" />
                <span className="text-sm font-medium">Loading counter bill...</span>
              </div>
            ) : !draft || draft.items.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-80 text-center p-6 border-2 border-dashed border-slate-200 rounded-2xl bg-white">
                <div className="w-16 h-16 rounded-full bg-teal-50 flex items-center justify-center text-[#0F766E] mb-3">
                  <ShoppingCart className="w-8 h-8" />
                </div>
                <h3 className="font-bold text-slate-800 text-base">Cart is Empty</h3>
                <p className="text-xs text-slate-500 max-w-sm mt-1">
                  Scan a barcode with your scanner, or use the search bar above to look up medicines by name or SKU.
                </p>
                <div className="mt-4 flex items-center gap-2 text-[11px] text-slate-400 bg-slate-100 px-3 py-1.5 rounded-lg">
                  <QrCode className="w-4 h-4 text-slate-500" />
                  <span>Tip: Scan barcode anytime — it auto-adds matching items.</span>
                </div>
              </div>
            ) : (
              <div className="bg-white border border-slate-200 rounded-2xl shadow-2xs overflow-hidden">
                <div className="px-4 py-2.5 bg-slate-50/80 border-b border-slate-200 flex items-center justify-between text-xs font-bold text-slate-600 uppercase tracking-wider">
                  <span>Bill Items ({draft.items.length})</span>
                  <span>Amounts in INR (₹)</span>
                </div>

                <div className="divide-y divide-slate-100">
                  {draft.items.map((item, idx) => {
                    const isRx = item.prescription_class !== "otc";
                    const itemUnitMrp = item.unit_mrp || (item as any).unit_price || "0.00";
                    const itemLineNet =
                      item.line_net ||
                      (parseFloat(itemUnitMrp) * item.quantity).toFixed(2);

                    return (
                      <div key={item.id} className="p-3.5 hover:bg-slate-50/50 transition">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex items-start gap-3">
                            <span className="font-mono font-bold text-slate-400 text-xs mt-0.5">
                              #{idx + 1}
                            </span>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-sm text-slate-900">
                                  {item.product_name}
                                </span>
                                <span
                                  className={`text-[9px] px-1.5 py-0.2 rounded font-bold uppercase ${
                                    isRx ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"
                                  }`}
                                >
                                  {item.prescription_class ? item.prescription_class.replace("_", " ") : "OTC"}
                                </span>
                              </div>
                              <div className="flex items-center gap-2 text-xs text-slate-500 mt-0.5 flex-wrap">
                                <span className="font-mono text-[11px]">SKU: {item.product_sku}</span>
                                {item.barcode && (
                                  <>
                                    <span>•</span>
                                    <span className="font-mono text-[11px]">Barcode: {item.barcode}</span>
                                  </>
                                )}
                                <span>•</span>
                                <span className="text-[#0F766E] font-medium">
                                  Unit: {item.unit_name || item.unit_type}
                                </span>
                                <span>•</span>
                                <span>MRP: ₹{itemUnitMrp}</span>
                                <span>•</span>
                                <span>GST: {item.tax_rate}%</span>
                              </div>

                              {/* FEFO Batch Allocation Preview */}
                              {item.fefo_preview && item.fefo_preview.length > 0 && (
                                <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
                                  <span className="text-[10px] text-slate-400 font-semibold uppercase">
                                    FEFO Batch:
                                  </span>
                                  {item.fefo_preview.map((b, i) => (
                                    <span
                                      key={i}
                                      className="text-[10px] bg-slate-100 text-slate-700 px-1.5 py-0.2 rounded font-mono"
                                    >
                                      {b.batch_number} (Exp: {b.expiry_date}) — {b.quantity_base_units} units
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Line Total & Interactive Quantity Stepper */}
                          <div className="flex items-center gap-3 text-right">
                            <div className="flex items-center border border-slate-200 rounded-lg bg-slate-50 overflow-hidden shadow-2xs">
                              <button
                                type="button"
                                onClick={() => handleUpdateItemQuantity(item, item.quantity - 1)}
                                className="w-7 h-7 flex items-center justify-center text-slate-600 hover:bg-slate-200 hover:text-slate-900 transition font-bold text-sm"
                                title="Decrease quantity"
                              >
                                -
                              </button>
                              <input
                                type="number"
                                min="1"
                                max="999"
                                value={item.quantity}
                                onChange={(e) => {
                                  const val = parseInt(e.target.value);
                                  if (!isNaN(val) && val > 0) {
                                    handleUpdateItemQuantity(item, val);
                                  }
                                }}
                                className="w-12 h-7 text-center font-bold text-xs bg-white border-x border-slate-200 text-slate-800 focus:outline-hidden focus:ring-1 focus:ring-teal-500"
                              />
                              <button
                                type="button"
                                onClick={() => handleUpdateItemQuantity(item, item.quantity + 1)}
                                className="w-7 h-7 flex items-center justify-center text-slate-600 hover:bg-slate-200 hover:text-slate-900 transition font-bold text-sm"
                                title="Increase quantity"
                              >
                                +
                              </button>
                            </div>

                            <div className="min-w-[5.5rem] text-right">
                              <div className="font-bold text-sm text-slate-900">
                                ₹{itemLineNet}
                              </div>
                              <div className="text-[10px] text-slate-400">
                                ₹{itemUnitMrp} / {item.unit_name || "unit"}
                              </div>
                              {parseFloat(item.discount_amount || "0") > 0 && (
                                <div className="text-[10px] text-emerald-600 font-semibold">
                                  -₹{item.discount_amount} disc
                                </div>
                              )}
                            </div>

                            <button
                              type="button"
                              onClick={() => handleRemoveItem(item.id, item.product_name)}
                              className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition"
                              title="Remove item"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: Customer Details + Prescription Sign-off + Bill Financials + Checkout */}
        <div className="lg:col-span-4 flex flex-col bg-white overflow-y-auto border-t lg:border-t-0 border-slate-200">
          {/* Customer Selection Card */}
          <div className="p-4 border-b border-slate-200 bg-slate-50/50">
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-[#0F766E]" />
                <span>Customer Profile *</span>
              </label>
              <button
                type="button"
                onClick={() => setShowNewCustomerModal(true)}
                className="text-xs font-semibold text-[#0F766E] hover:underline flex items-center gap-0.5"
              >
                <Plus className="w-3 h-3" /> New Customer
              </button>
            </div>

            {/* Pending Customer Assignment Card (Self-Healing Recovery) */}
            {pendingCustomerAssignment && !draft?.customer && (
              <div className="mb-2 p-2.5 bg-amber-50 border border-amber-300 rounded-xl text-xs flex items-center justify-between shadow-2xs">
                <div>
                  <span className="font-semibold text-amber-900 block">Registered: {pendingCustomerAssignment.name}</span>
                  <span className="font-mono text-[11px] text-amber-700">{pendingCustomerAssignment.phone_number} (Unlinked)</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleRetryAttachCustomer(pendingCustomerAssignment)}
                    disabled={isAttachingPending}
                    className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white rounded-lg text-[11px] font-semibold transition"
                  >
                    {isAttachingPending ? "Linking..." : "Link to Bill"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setPendingCustomerAssignment(null)}
                    className="p-1 text-amber-700 hover:text-amber-900 rounded"
                    title="Dismiss"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}

            {draft?.customer ? (
              <div className="bg-white border border-teal-200 rounded-xl p-3 flex items-center justify-between shadow-2xs">
                <div>
                  <div className="font-bold text-sm text-slate-900">{draft.customer_name}</div>
                  <div className="text-xs text-slate-500 font-mono mt-0.5 flex items-center gap-1">
                    <Phone className="w-3 h-3 text-slate-400" />
                    <span>{draft.customer_phone}</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleClearCustomer}
                  className="text-xs text-slate-400 hover:text-rose-600 p-1 rounded hover:bg-rose-50 transition"
                  title="Change customer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search customer by name or phone (10 digits)..."
                  value={customerSearchQuery}
                  onChange={(e) => setCustomerSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 bg-white text-xs rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-[#0F766E]"
                />

                {/* Customer Autocomplete Dropdown */}
                {showCustomerDropdown && customerResults.length > 0 && (
                  <div className="absolute left-0 right-0 top-11 bg-white border border-slate-200 rounded-xl shadow-lg z-20 max-h-48 overflow-y-auto divide-y divide-slate-100">
                    {customerResults.map((c) => (
                      <div
                        key={c.id}
                        onClick={() => handleSelectCustomer(c)}
                        className="p-2.5 hover:bg-teal-50 cursor-pointer text-xs transition"
                      >
                        <div className="font-semibold text-slate-900">{c.name}</div>
                        <div className="text-[11px] text-slate-500 font-mono">{c.phone_number}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Prescription Sign-off Warning / Banner */}
          {draft && draft.has_prescription_items && (
            <div className="p-4 border-b border-slate-200">
              {draft.is_prescription_verified ? (
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 flex items-start gap-2.5 text-xs text-emerald-900">
                  <ShieldCheck className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <div className="font-bold">Prescription Verified</div>
                    <div className="text-[11px] text-emerald-700 mt-0.5">
                      Rx #{draft.rx_number} • Dr. {draft.rx_doctor_name}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex flex-col gap-2 text-xs text-amber-900">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold">Schedule H / Rx Items Present</span>
                      <p className="text-[11px] text-amber-700 mt-0.5">
                        Statutory pharmacist authorization is required prior to dispensing.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowPrescriptionModal(true)}
                    className="self-end px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white font-semibold rounded-lg text-xs shadow-2xs"
                  >
                    Authorize Prescription
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Pending Discount Banner */}
          {draft && draft.pending_discount_request && (
            <div className="p-4 border-b border-slate-200 bg-teal-50/50">
              <div className="flex items-start justify-between gap-2 text-xs">
                <div>
                  <div className="font-bold text-teal-900 flex items-center gap-1.5">
                    <Percent className="w-3.5 h-3.5 text-[#0F766E]" />
                    <span>
                      Discount Request ({draft.pending_discount_request.discount_percentage}% / ₹
                      {draft.pending_discount_request.discount_amount})
                    </span>
                  </div>
                  <div className="text-[11px] text-teal-700 mt-0.5">
                    Status: <span className="font-semibold uppercase">{draft.pending_discount_request.status}</span> •
                    Requested by {draft.pending_discount_request.requested_by_name}
                  </div>
                </div>

                {/* If Manager or Owner, show Approve / Reject */}
                {(isOwner || isManager) && draft.pending_discount_request.status === "PENDING" && (
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => handleReviewDiscount(true)}
                      className="px-2 py-0.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded font-semibold text-[11px]"
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      onClick={() => handleReviewDiscount(false)}
                      className="px-2 py-0.5 bg-rose-600 hover:bg-rose-700 text-white rounded font-semibold text-[11px]"
                    >
                      Reject
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Financial Breakdown Panel */}
          <div className="flex-1 p-4 space-y-3">
            <div className="flex items-center justify-between text-xs font-bold text-slate-700 uppercase tracking-wider">
              <span>Financial Summary</span>
              {(!draft?.pending_discount_request || draft.pending_discount_request.status !== "PENDING") && (
                <button
                  type="button"
                  onClick={() => setShowDiscountModal(true)}
                  className="text-[11px] font-semibold text-[#0F766E] hover:underline flex items-center gap-0.5"
                >
                  <Percent className="w-3 h-3" /> Apply Discount
                </button>
              )}
            </div>

            <div className="space-y-2 text-xs text-slate-600 border-t border-slate-100 pt-2">
              <div className="flex justify-between">
                <span>Gross MRP Total:</span>
                <span className="font-semibold font-mono text-slate-800">
                  ₹{draft?.gross_total || "0.00"}
                </span>
              </div>

              {draft && parseFloat(draft.total_discount) > 0 && (
                <div className="flex justify-between text-emerald-600">
                  <span>Total Discount:</span>
                  <span className="font-semibold font-mono">-₹{draft.total_discount}</span>
                </div>
              )}

              <div className="flex justify-between">
                <span>Taxable Amount:</span>
                <span className="font-mono">₹{draft?.taxable_subtotal || "0.00"}</span>
              </div>

              <div className="flex justify-between text-slate-500 text-[11px]">
                <span>CGST (Central Tax):</span>
                <span className="font-mono">₹{draft?.cgst_total || "0.00"}</span>
              </div>

              <div className="flex justify-between text-slate-500 text-[11px]">
                <span>SGST (State Tax):</span>
                <span className="font-mono">₹{draft?.sgst_total || "0.00"}</span>
              </div>

              {draft && parseFloat(draft.round_off_amount) !== 0 && (
                <div className="flex justify-between text-[11px]">
                  <span>Round-off:</span>
                  <span className="font-mono">₹{draft.round_off_amount}</span>
                </div>
              )}
            </div>

            {/* Final Payable High-Contrast Box */}
            <div className="bg-[#0F766E] text-white p-4 rounded-2xl shadow-sm mt-4">
              <div className="text-xs uppercase tracking-wider opacity-90 font-semibold">
                Net Payable Amount
              </div>
              <div className="text-3xl font-extrabold font-mono mt-1">
                ₹{draft?.final_payable_amount || "0.00"}
              </div>
              <div className="text-[11px] opacity-80 mt-1">
                Tax-inclusive outer packaging MRP (Decimal-safe)
              </div>
            </div>

            {/* Proceed to Payment Button */}
            <button
              type="button"
              disabled={
                !draft ||
                draft.items.length === 0 ||
                (!draft.customer && !draft.customer_name) ||
                (draft.has_prescription_items && !draft.is_prescription_verified) ||
                draft.pending_discount_request?.status === "PENDING"
              }
              onClick={() => {
                setCashTendered(finalPayable > 0 ? finalPayable.toFixed(2) : "");
                setShowPaymentModal(true);
              }}
              className="w-full py-3.5 px-4 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-sm rounded-xl shadow-md transition flex items-center justify-center gap-2"
            >
              <CreditCard className="w-4 h-4" />
              <span>Collect Payment & Checkout</span>
              <ArrowRight className="w-4 h-4" />
            </button>

            {/* Validation Tips below checkout */}
            {draft && draft.items.length > 0 && !draft.customer && !draft.customer_name && (
              <p className="text-[11px] text-amber-700 text-center">
                * Please select or register a customer before payment.
              </p>
            )}
            {draft && draft.has_prescription_items && !draft.is_prescription_verified && (
              <p className="text-[11px] text-amber-700 text-center">
                * Schedule H/Rx drugs require pharmacist verification.
              </p>
            )}
            {draft && draft.pending_discount_request?.status === "PENDING" && (
              <p className="text-[11px] text-amber-700 text-center">
                * A discount request is pending manager review.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* ================= MODALS ================= */}

      {/* 1. Payment Modal */}
      {showPaymentModal && draft && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
            <div className="bg-[#0F766E] text-white p-4 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-base flex items-center gap-2">
                  <Banknote className="w-5 h-5" />
                  <span>Receive Payment</span>
                </h3>
                <p className="text-xs opacity-90">Invoice Bill #{draft.draft_number}</p>
              </div>
              <button
                type="button"
                onClick={() => setShowPaymentModal(false)}
                className="text-white/80 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex justify-between items-center">
                <span className="text-xs text-slate-600 font-semibold">Total Amount Due:</span>
                <span className="text-2xl font-extrabold font-mono text-slate-900">
                  ₹{finalPayable.toFixed(2)}
                </span>
              </div>

              {/* Payment Method Selector Tabs */}
              <div className="grid grid-cols-4 gap-2">
                {[
                  { id: "CASH", label: "Cash", icon: Banknote },
                  { id: "UPI", label: "UPI", icon: QrCode },
                  { id: "CARD", label: "Card", icon: CreditCard },
                  { id: "SPLIT", label: "Split", icon: Percent },
                ].map((t) => {
                  const Icon = t.icon;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setPaymentMethodTab(t.id as any)}
                      className={`p-2.5 rounded-xl text-xs font-bold flex flex-col items-center gap-1 transition ${
                        paymentMethodTab === t.id
                          ? "bg-[#0F766E] text-white shadow-sm"
                          : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      <span>{t.label}</span>
                    </button>
                  );
                })}
              </div>

              {/* CASH INPUT */}
              {paymentMethodTab === "CASH" && (
                <div className="space-y-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Cash Tendered by Customer (₹)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min={finalPayable}
                      value={cashTendered}
                      onChange={(e) => setCashTendered(e.target.value)}
                      className="w-full p-2.5 bg-white border border-slate-300 rounded-xl text-lg font-mono font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0F766E]"
                    />
                  </div>

                  <div className="flex justify-between items-center text-xs pt-2 border-t border-slate-200">
                    <span className="font-semibold text-slate-600">Change Due to Customer:</span>
                    <span
                      className={`text-base font-mono font-bold ${
                        cashChangeDue > 0 ? "text-emerald-600" : "text-slate-700"
                      }`}
                    >
                      ₹{isNaN(cashChangeDue) ? "0.00" : cashChangeDue.toFixed(2)}
                    </span>
                  </div>
                </div>
              )}

              {/* UPI INPUT */}
              {paymentMethodTab === "UPI" && (
                <div className="space-y-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      UPI Reference / UTR Number (Optional)
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. 429381029482"
                      value={upiReference}
                      onChange={(e) => setUpiReference(e.target.value)}
                      className="w-full p-2.5 bg-white border border-slate-300 rounded-xl text-xs font-mono focus:outline-none focus:ring-2 focus:ring-[#0F766E]"
                    />
                  </div>
                  <div className="text-[11px] text-slate-500">
                    Scan customer's dynamic QR code on store payment terminal. Amount: ₹
                    {finalPayable.toFixed(2)}
                  </div>
                </div>
              )}

              {/* CARD INPUT */}
              {paymentMethodTab === "CARD" && (
                <div className="space-y-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Card Auth Code / Transaction Ref (Optional)
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. TXN-CARD-9912"
                      value={cardReference}
                      onChange={(e) => setCardReference(e.target.value)}
                      className="w-full p-2.5 bg-white border border-slate-300 rounded-xl text-xs font-mono focus:outline-none focus:ring-2 focus:ring-[#0F766E]"
                    />
                  </div>
                </div>
              )}

              {/* SPLIT PAYMENT INPUT */}
              {paymentMethodTab === "SPLIT" && (
                <div className="space-y-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 mb-1">Cash (₹)</label>
                      <input
                        type="number"
                        placeholder="0.00"
                        value={splitCash}
                        onChange={(e) => setSplitCash(e.target.value)}
                        className="w-full p-2 bg-white border border-slate-300 rounded-lg text-xs font-mono font-bold"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 mb-1">UPI (₹)</label>
                      <input
                        type="number"
                        placeholder="0.00"
                        value={splitUpi}
                        onChange={(e) => setSplitUpi(e.target.value)}
                        className="w-full p-2 bg-white border border-slate-300 rounded-lg text-xs font-mono font-bold"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 mb-1">Card (₹)</label>
                      <input
                        type="number"
                        placeholder="0.00"
                        value={splitCard}
                        onChange={(e) => setSplitCard(e.target.value)}
                        className="w-full p-2 bg-white border border-slate-300 rounded-lg text-xs font-mono font-bold"
                      />
                    </div>
                  </div>

                  <div className="flex justify-between items-center text-xs pt-2 border-t border-slate-200">
                    <span className="font-semibold text-slate-600">Remaining to Allocate:</span>
                    <span
                      className={`font-mono font-bold ${
                        splitRemaining === 0 ? "text-emerald-600" : "text-rose-600"
                      }`}
                    >
                      ₹{splitRemaining.toFixed(2)}
                    </span>
                  </div>
                </div>
              )}

              {/* Phase 2 Two-Stage Payment Status & Manager Verification Banner */}
              {activeAttempt && activeAttempt.status === "PAYMENT_PENDING_VERIFICATION" && (
                <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl space-y-2.5">
                  <div className="flex items-center gap-2 text-amber-800 text-xs font-bold">
                    <Clock className="w-4 h-4 text-amber-600 animate-pulse" />
                    <span>Manager Payment Verification Required</span>
                  </div>
                  <p className="text-[11px] text-amber-700">
                    Electronic payments (UPI/Card) require verification by a store manager or owner before inventory is dispensed.
                  </p>
                  <div className="space-y-1.5 pt-1">
                    {activeAttempt.payments &&
                      activeAttempt.payments
                        .filter((p: any) => p.status === "REQUIRES_VERIFICATION")
                        .map((p: any) => (
                          <div
                            key={p.id}
                            className="flex items-center justify-between bg-white p-2.5 rounded-lg border border-amber-200 text-xs shadow-2xs"
                          >
                            <div>
                              <span className="font-bold text-slate-800">{p.payment_method}: </span>
                              <span className="font-mono text-emerald-700 font-bold">₹{p.amount}</span>
                              {p.reference_number && (
                                <span className="text-[10px] text-slate-500 font-mono block">
                                  Ref: {p.reference_number}
                                </span>
                              )}
                            </div>
                            {isOwner || isManager ? (
                              <button
                                type="button"
                                disabled={isVerifyingPayment}
                                onClick={() => handleVerifyPendingPayment(p.id)}
                                className="px-3 py-1.5 bg-[#0F766E] hover:bg-[#115E59] text-white text-xs font-bold rounded-lg shadow-xs flex items-center gap-1 transition"
                              >
                                {isVerifyingPayment ? (
                                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                )}
                                <span>Verify & Finalize</span>
                              </button>
                            ) : (
                              <span className="text-[10px] font-semibold text-amber-700 bg-amber-100 px-2 py-0.5 rounded">
                                Awaiting Manager
                              </span>
                            )}
                          </div>
                        ))}
                  </div>
                </div>
              )}

              {activeAttempt && activeAttempt.status === "READY_TO_FINALIZE" && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-2 text-xs text-emerald-800 font-bold">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>All payments verified. Ready to complete final sale!</span>
                </div>
              )}

              <button
                type="button"
                disabled={
                  isCheckingOut ||
                  (paymentMethodTab === "SPLIT" && splitRemaining !== 0) ||
                  (Boolean(activeAttempt) &&
                    activeAttempt?.status === "PAYMENT_PENDING_VERIFICATION" &&
                    !isOwner &&
                    !isManager)
                }
                onClick={handleExecuteCheckout}
                className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white font-bold text-sm rounded-xl shadow-md transition flex items-center justify-center gap-2"
              >
                {isCheckingOut ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Processing Sale & Stock Deduction...</span>
                  </>
                ) : activeAttempt && activeAttempt.status === "READY_TO_FINALIZE" ? (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Finalize Sale & Print Invoice</span>
                  </>
                ) : activeAttempt && activeAttempt.status === "PAYMENT_PENDING_VERIFICATION" ? (
                  <>
                    <Clock className="w-4 h-4" />
                    <span>Waiting for Manager Approval...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Confirm Payment & Complete Sale</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2. Success / Digital Receipt Modal (Print-Optimized) */}
      {showReceiptModal && completedInvoice && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div
            id="printable-pharmacy-receipt"
            className="bg-white rounded-2xl max-w-lg w-full shadow-2xl overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95 duration-150 max-h-[90vh] flex flex-col"
          >
            {/* Header Banner */}
            <div className="bg-emerald-600 text-white p-5 text-center shrink-0">
              <CheckCircle2 className="w-10 h-10 mx-auto mb-1.5" />
              <h3 className="font-extrabold text-lg">Sale Completed Successfully!</h3>
              <p className="text-xs opacity-90 font-mono mt-0.5">
                Tax Invoice #{completedInvoice.invoice_number}
              </p>
            </div>

            <div className="p-5 space-y-3.5 overflow-y-auto flex-1 text-xs">
              {/* Store & Customer Details */}
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-1.5 text-slate-700">
                <div className="flex justify-between items-center font-bold text-slate-900 text-sm">
                  <span>{completedInvoice.store_name}</span>
                  <span className="text-[10px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded font-mono font-semibold">
                    PAID
                  </span>
                </div>
                {completedInvoice.store_gstin && (
                  <div className="flex justify-between text-[11px]">
                    <span className="text-slate-500">GSTIN:</span>
                    <span className="font-mono">{completedInvoice.store_gstin}</span>
                  </div>
                )}
                {completedInvoice.store_dl_number && (
                  <div className="flex justify-between text-[11px]">
                    <span className="text-slate-500">Drug License:</span>
                    <span className="font-mono">{completedInvoice.store_dl_number}</span>
                  </div>
                )}
                <div className="border-t border-slate-200 pt-1.5 mt-1.5 flex justify-between">
                  <span className="text-slate-500">Customer:</span>
                  <span className="font-bold">{completedInvoice.customer_name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Phone:</span>
                  <span className="font-mono">{completedInvoice.customer_phone}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Cashier:</span>
                  <span>{completedInvoice.cashier_name}</span>
                </div>
              </div>

              {/* Itemized Medicine Lines */}
              {completedInvoice.items && completedInvoice.items.length > 0 && (
                <div className="border border-slate-200 rounded-xl p-3 space-y-2 bg-white">
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex justify-between pb-1 border-b border-slate-100">
                    <span>Medicine / Item</span>
                    <span>Qty × MRP = Total</span>
                  </div>
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {completedInvoice.items.map((item: any) => (
                      <div key={item.id} className="flex justify-between items-start text-[11px] text-slate-700">
                        <div className="pr-2">
                          <div className="font-semibold text-slate-800">{item.product_name}</div>
                          <div className="text-[10px] text-slate-500 font-mono">
                            {item.batch_allocations && item.batch_allocations.length > 0
                              ? `Batch: ${item.batch_allocations.map((b: any) => b.batch_number).join(", ")}`
                              : item.barcode ? `Barcode: ${item.barcode}` : ""}
                          </div>
                        </div>
                        <div className="font-mono text-right shrink-0">
                          <span className="text-slate-500 text-[10px]">{item.quantity} × ₹{item.mrp} = </span>
                          <span className="font-bold text-slate-900">₹{item.line_total}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Financial & Tax Summary */}
              <div className="space-y-1.5 text-xs text-slate-700 bg-slate-50 p-3 rounded-xl border border-slate-200">
                <div className="flex justify-between text-slate-600">
                  <span>Gross Total:</span>
                  <span className="font-mono">₹{completedInvoice.subtotal_gross}</span>
                </div>
                {parseFloat(completedInvoice.total_discount || "0") > 0 && (
                  <div className="flex justify-between text-amber-700 font-semibold">
                    <span>Discount Applied:</span>
                    <span className="font-mono">-₹{completedInvoice.total_discount}</span>
                  </div>
                )}
                {(parseFloat(completedInvoice.cgst_total || "0") + parseFloat(completedInvoice.sgst_total || "0")) > 0 && (
                  <div className="flex justify-between text-slate-500 text-[11px]">
                    <span>GST (CGST + SGST):</span>
                    <span className="font-mono">
                      ₹{(parseFloat(completedInvoice.cgst_total || "0") + parseFloat(completedInvoice.sgst_total || "0")).toFixed(2)}
                    </span>
                  </div>
                )}
                <div className="flex justify-between text-base font-bold pt-2 border-t border-slate-300 text-slate-900">
                  <span>Net Payable / Paid:</span>
                  <span className="font-mono text-[#0F766E]">₹{completedInvoice.net_total}</span>
                </div>
                {parseFloat(completedInvoice.change_returned || "0") > 0 && (
                  <div className="flex justify-between text-xs text-emerald-700 font-semibold pt-1">
                    <span>Change Returned:</span>
                    <span className="font-mono">₹{completedInvoice.change_returned}</span>
                  </div>
                )}
              </div>

              {/* Action Buttons (Hidden when printing) */}
              <div className="no-print space-y-2 pt-2">
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => window.print()}
                    className="py-2.5 px-3 rounded-xl border border-slate-300 hover:bg-slate-100 text-xs font-semibold text-slate-700 flex items-center justify-center gap-1.5 transition"
                  >
                    <Printer className="w-4 h-4 text-slate-500" />
                    <span>Print Receipt</span>
                  </button>
                  <Link
                    href={`/dashboard/invoices`}
                    className="py-2.5 px-3 rounded-xl bg-[#0F766E] hover:bg-[#115E59] text-xs font-semibold text-white flex items-center justify-center gap-1.5 shadow-2xs transition"
                  >
                    <FileText className="w-4 h-4" />
                    <span>All Invoices</span>
                  </Link>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setShowReceiptModal(false);
                    setCompletedInvoice(null);
                    setActiveAttempt(null);
                  }}
                  className="w-full py-2.5 bg-slate-900 hover:bg-black text-white text-xs font-bold rounded-xl transition"
                >
                  + Start Next Customer Bill
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 3. New Customer Modal */}
      {showNewCustomerModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl overflow-hidden border border-slate-200">
            <div className="bg-[#0F766E] text-white p-4 flex items-center justify-between">
              <h3 className="font-bold text-sm flex items-center gap-2">
                <User className="w-4 h-4" />
                <span>Register New Customer</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowNewCustomerModal(false)}
                className="text-white/80 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateNewCustomer} className="p-5 space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Full Customer Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Ramesh Chandra"
                  value={newCustomerForm.name}
                  onChange={(e) =>
                    setNewCustomerForm({ ...newCustomerForm, name: e.target.value })
                  }
                  className="w-full p-2.5 bg-white border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-[#0F766E]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Mobile Number (10 digits) *
                </label>
                <input
                  type="tel"
                  required
                  pattern="[0-9]{10}"
                  placeholder="e.g. 9876543210"
                  value={newCustomerForm.phone_number}
                  onChange={(e) =>
                    setNewCustomerForm({ ...newCustomerForm, phone_number: e.target.value })
                  }
                  className="w-full p-2.5 bg-white border border-slate-300 rounded-xl text-xs font-mono focus:ring-2 focus:ring-[#0F766E]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Email Address (Optional)
                </label>
                <input
                  type="email"
                  placeholder="e.g. ramesh@example.com"
                  value={newCustomerForm.email}
                  onChange={(e) =>
                    setNewCustomerForm({ ...newCustomerForm, email: e.target.value })
                  }
                  className="w-full p-2.5 bg-white border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-[#0F766E]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Doctor / Prescriber Name (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Dr. P. K. Mishra"
                  value={newCustomerForm.doctor_name}
                  onChange={(e) =>
                    setNewCustomerForm({ ...newCustomerForm, doctor_name: e.target.value })
                  }
                  className="w-full p-2.5 bg-white border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-[#0F766E]"
                />
              </div>

              <button
                type="submit"
                disabled={isSavingCustomer}
                className="w-full py-2.5 bg-[#0F766E] hover:bg-[#115E59] text-white text-xs font-bold rounded-xl transition shadow-2xs mt-2"
              >
                {isSavingCustomer ? "Saving..." : "Save & Attach to Bill"}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* 4. Prescription Sign-Off Modal */}
      {showPrescriptionModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl overflow-hidden border border-slate-200">
            <div className="bg-amber-600 text-white p-4 flex items-center justify-between">
              <h3 className="font-bold text-sm flex items-center gap-2">
                <ShieldCheck className="w-4 h-4" />
                <span>Pharmacist Prescription Sign-Off</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowPrescriptionModal(false)}
                className="text-white/80 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleVerifyPrescription} className="p-5 space-y-3">
              <div className="text-xs text-amber-900 bg-amber-50 p-3 rounded-xl border border-amber-200">
                You are verifying a prescription for Schedule H / Rx drugs. Provide the prescription reference and doctor name.
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Prescription / Rx Number *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. RX-2026-991"
                  value={rxForm.prescription_number}
                  onChange={(e) => setRxForm({ ...rxForm, prescription_number: e.target.value })}
                  className="w-full p-2.5 bg-white border border-slate-300 rounded-xl text-xs font-mono focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Prescribing Doctor Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Dr. S. K. Roy (MBBS)"
                  value={rxForm.doctor_name}
                  onChange={(e) => setRxForm({ ...rxForm, doctor_name: e.target.value })}
                  className="w-full p-2.5 bg-white border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <button
                type="submit"
                className="w-full py-2.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-xl transition shadow-2xs mt-2"
              >
                Sign Off & Authorize Dispensing
              </button>
            </form>
          </div>
        </div>
      )}

      {/* 5. Discount Modal */}
      {showDiscountModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl overflow-hidden border border-slate-200">
            <div className="bg-[#0F766E] text-white p-4 flex items-center justify-between">
              <h3 className="font-bold text-sm flex items-center gap-2">
                <Percent className="w-4 h-4" />
                <span>Manual Bill Discount</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowDiscountModal(false)}
                className="text-white/80 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmitDiscount} className="p-5 space-y-3">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setDiscountType("percentage")}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-bold ${
                    discountType === "percentage"
                      ? "bg-[#0F766E] text-white"
                      : "bg-slate-100 text-slate-600"
                  }`}
                >
                  Percentage (%)
                </button>
                <button
                  type="button"
                  onClick={() => setDiscountType("amount")}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-bold ${
                    discountType === "amount"
                      ? "bg-[#0F766E] text-white"
                      : "bg-slate-100 text-slate-600"
                  }`}
                >
                  Fixed Amount (₹)
                </button>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Discount Value {discountType === "percentage" ? "(%)" : "(₹)"} *
                </label>
                <input
                  type="number"
                  step="0.01"
                  required
                  min="0.01"
                  placeholder={discountType === "percentage" ? "e.g. 5.0" : "e.g. 50.00"}
                  value={discountValue}
                  onChange={(e) => setDiscountValue(e.target.value)}
                  className="w-full p-2.5 bg-white border border-slate-300 rounded-xl text-xs font-mono font-bold focus:ring-2 focus:ring-[#0F766E]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Reason for Discount *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Regular patient goodwill / volume purchase"
                  value={discountReason}
                  onChange={(e) => setDiscountReason(e.target.value)}
                  className="w-full p-2.5 bg-white border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-[#0F766E]"
                />
              </div>

              <div className="text-[11px] text-slate-500 bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                {isOwner || isManager
                  ? "✓ As Store Manager/Owner, this discount will be automatically approved."
                  : "ℹ This request will be submitted for Store Manager or Owner approval."}
              </div>

              <button
                type="submit"
                disabled={isSubmittingDiscount}
                className="w-full py-2.5 bg-[#0F766E] hover:bg-[#115E59] text-white text-xs font-bold rounded-xl transition shadow-2xs mt-2"
              >
                {isSubmittingDiscount ? "Submitting..." : isOwner || isManager ? "Apply Discount" : "Request Approval"}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* 6. Hold Bill Modal Prompt */}
      {showHoldPromptModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full shadow-2xl overflow-hidden border border-slate-200">
            <div className="bg-amber-600 text-white p-4 flex items-center justify-between">
              <h3 className="font-bold text-sm flex items-center gap-2">
                <PauseCircle className="w-4 h-4" />
                <span>Hold Current Bill</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowHoldPromptModal(false)}
                className="text-white/80 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-3">
              <p className="text-xs text-slate-600">
                Holding this bill frees up the counter immediately for the next customer in queue. You can resume it anytime from the Held Bills list.
              </p>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Optional Note (e.g. customer gone to bring prescription/cash)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Waiting for doctor's slip"
                  value={holdNote}
                  onChange={(e) => setHoldNote(e.target.value)}
                  className="w-full p-2.5 bg-white border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <button
                type="button"
                onClick={handleHoldBill}
                className="w-full py-2.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-xl transition shadow-2xs"
              >
                Confirm Hold Bill
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 7. Held Bills Drawer / Modal */}
      {showHeldBillsModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl overflow-hidden border border-slate-200">
            <div className="bg-slate-900 text-white p-4 flex items-center justify-between">
              <h3 className="font-bold text-sm flex items-center gap-2">
                <Clock className="w-4 h-4 text-amber-400" />
                <span>Held Bills Queue ({heldDrafts.length})</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowHeldBillsModal(false)}
                className="text-white/80 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 max-h-96 overflow-y-auto divide-y divide-slate-100">
              {heldDrafts.length === 0 ? (
                <div className="text-center py-8 text-xs text-slate-400">
                  No bills are currently on hold.
                </div>
              ) : (
                heldDrafts.map((hd) => (
                  <div key={hd.id} className="py-3 flex items-center justify-between gap-3">
                    <div>
                      <div className="font-bold text-xs text-slate-900">{hd.draft_number}</div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        Customer: {hd.customer_name || "Unassigned"} • {hd.items.length} items
                      </div>
                      {hd.notes && (
                        <div className="text-[10px] text-amber-700 italic mt-0.5">"{hd.notes}"</div>
                      )}
                    </div>

                    <div className="text-right flex items-center gap-3">
                      <div className="font-mono font-bold text-xs text-slate-800">
                        ₹{hd.final_payable_amount}
                      </div>
                      <button
                        type="button"
                        onClick={() => handleResumeBill(hd.id)}
                        className="px-2.5 py-1 bg-[#0F766E] hover:bg-[#115E59] text-white text-xs font-semibold rounded-lg shadow-2xs flex items-center gap-1"
                      >
                        <PlayCircle className="w-3.5 h-3.5" />
                        <span>Resume</span>
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
      {/* 8. Camera Barcode Scanner Modal */}
      {showCameraScanner && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl overflow-hidden border border-slate-200">
            <div className="bg-[#0F766E] text-white p-4 flex items-center justify-between">
              <h3 className="font-bold text-sm flex items-center gap-2">
                <Camera className="w-4 h-4" />
                <span>Live Camera Barcode Scanner</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowCameraScanner(false)}
                className="text-white/80 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="text-xs text-slate-600 bg-slate-50 p-3 rounded-xl border border-slate-200">
                Position the barcode on the medicine package inside the camera viewfinder. If your browser does not support native barcode detection, you can enter the barcode number below or click a product pill to add it instantly to the bill.
              </div>

              {cameraError ? (
                <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 space-y-2">
                  <div className="font-bold flex items-center gap-1.5">
                    <AlertCircle className="w-4 h-4" />
                    <span>Camera Unavailable</span>
                  </div>
                  <p>{cameraError}</p>
                </div>
              ) : (
                <div className="relative bg-black rounded-xl overflow-hidden aspect-video flex items-center justify-center shadow-inner">
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-full object-cover"
                  />

                  {/* Aiming Reticle / Laser Guide */}
                  <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                    <div className="w-3/4 h-32 border-2 border-emerald-400/80 rounded-xl relative">
                      <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-0.5 bg-rose-500/80 shadow-[0_0_8px_rgba(239,68,68,0.9)] animate-pulse" />
                    </div>
                  </div>

                  {!isCameraActive && (
                    <div className="absolute inset-0 bg-slate-900/80 flex flex-col items-center justify-center text-white text-xs gap-2">
                      <RefreshCw className="w-6 h-6 animate-spin text-emerald-400" />
                      <span>Starting device camera...</span>
                    </div>
                  )}
                </div>
              )}

              {/* Manual Barcode fallback inside camera dialog */}
              <div className="pt-2 border-t border-slate-200">
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Or enter / paste barcode number manually:
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="e.g. 8901234567890"
                    value={testBarcodeQuery}
                    onChange={(e) => setTestBarcodeQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        if (testBarcodeQuery.trim()) {
                          const code = testBarcodeQuery.trim();
                          setTestBarcodeQuery("");
                          setShowCameraScanner(false);
                          processBarcodeOrSearch(code);
                        }
                      }
                    }}
                    className="flex-1 p-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (testBarcodeQuery.trim()) {
                        const code = testBarcodeQuery.trim();
                        setTestBarcodeQuery("");
                        setShowCameraScanner(false);
                        processBarcodeOrSearch(code);
                      }
                    }}
                    className="px-3 py-2 bg-[#0F766E] hover:bg-[#115E59] text-white text-xs font-semibold rounded-xl"
                  >
                    Lookup
                  </button>
                </div>

                {/* Quick Store Product Pills in Camera Scanner */}
                <div className="pt-2 flex items-center gap-1.5 flex-wrap">
                  <span className="text-[10px] text-slate-500 font-bold uppercase">Store Products:</span>
                  <button
                    type="button"
                    onClick={() => {
                      setShowCameraScanner(false);
                      processBarcodeOrSearch("92126419405150");
                    }}
                    className="px-2.5 py-1 bg-white border border-teal-400 hover:bg-teal-50 text-[#0F766E] rounded-lg text-[11px] font-mono font-bold shadow-2xs"
                    title="Levera 500 (Barcode in DB: 92126419405150) - 150 units in stock"
                  >
                    Levera 500 (92126419405150) — ₹195.00
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowCameraScanner(false);
                      processBarcodeOrSearch("MED-PARA-500");
                    }}
                    className="px-2.5 py-1 bg-white border border-teal-400 hover:bg-teal-50 text-[#0F766E] rounded-lg text-[11px] font-mono font-bold shadow-2xs"
                    title="Zodo 500 (SKU: MED-PARA-500) - 26 units in stock"
                  >
                    Zodo 500 (MED-PARA-500) — ₹200.00
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 9. Scanner Guide & Hardware Diagnostics Modal */}
      {showScannerGuide && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl overflow-hidden border border-slate-200">
            <div className="bg-slate-900 text-white p-4 flex items-center justify-between">
              <h3 className="font-bold text-sm flex items-center gap-2">
                <QrCode className="w-4 h-4 text-emerald-400" />
                <span>Barcode Scanner Guide & Diagnostics</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowScannerGuide(false)}
                className="text-white/80 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 max-h-[80vh] overflow-y-auto text-xs text-slate-700">
              {/* How it works banner */}
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3.5 space-y-2 text-emerald-950">
                <div className="font-bold flex items-center gap-1.5 text-emerald-900">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                  <span>How Barcode Scanners Work in DiracPharma</span>
                </div>
                <p className="text-[11px] text-emerald-800 leading-relaxed">
                  Physical barcode scanners (USB or Bluetooth guns) act as <strong>high-speed keyboards (HID)</strong>. When you scan a medicine barcode, the scanner types the digits into the search box and presses <strong>Enter</strong> automatically. No special device drivers or browser plugins are required!
                </p>
              </div>

              {/* 3 Steps */}
              <div className="space-y-3">
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                  <span className="font-bold text-slate-900">1. Focus & Trigger Scan</span>
                  <p className="text-[11px] text-slate-600 leading-relaxed">
                    Ensure the search box is active (the top badge shows <strong>🟢 Ready for Scan</strong>). Point your barcode scanner gun at the package barcode and pull the trigger. The item is searched and added immediately to the bill.
                  </p>
                </div>

                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                  <span className="font-bold text-slate-900">2. Registering Barcodes for Existing Medicines</span>
                  <p className="text-[11px] text-slate-600 leading-relaxed">
                    If scanning a medicine returns <em>&quot;No medicine found&quot;</em>, the product may not have its barcode saved yet in the catalog. Open <strong>Product Catalog</strong>, edit the medicine, and scan the physical barcode into the <strong>Barcode</strong> field.
                  </p>
                </div>

                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                  <span className="font-bold text-slate-900">3. Camera & SKU Search Fallbacks</span>
                  <p className="text-[11px] text-slate-600 leading-relaxed">
                    You can also use your device webcam via <strong>Camera Scanner</strong>, or type any SKU / medicine name directly into the search bar and press <strong>Enter</strong>.
                  </p>
                </div>
              </div>

              {/* Interactive Test Sandbox */}
              <div className="p-4 bg-teal-50/50 border border-teal-200 rounded-xl space-y-2">
                <span className="font-bold text-teal-900 block">
                  Interactive Scanner Test & Real Catalog Barcodes
                </span>
                <p className="text-[11px] text-teal-800">
                  Scan any package barcode right now to test your scanner gun, or click a verified product from your store:
                </p>

                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Scan barcode gun or type code here..."
                    value={testBarcodeQuery}
                    onChange={(e) => setTestBarcodeQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && testBarcodeQuery.trim()) {
                        e.preventDefault();
                        const code = testBarcodeQuery.trim();
                        setTestBarcodeQuery("");
                        setShowScannerGuide(false);
                        processBarcodeOrSearch(code);
                      }
                    }}
                    className="flex-1 p-2 bg-white border border-teal-300 rounded-xl text-xs font-mono font-bold"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (testBarcodeQuery.trim()) {
                        const code = testBarcodeQuery.trim();
                        setTestBarcodeQuery("");
                        setShowScannerGuide(false);
                        processBarcodeOrSearch(code);
                      }
                    }}
                    className="px-3 py-2 bg-[#0F766E] hover:bg-[#115E59] text-white text-xs font-semibold rounded-xl"
                  >
                    Test Scan
                  </button>
                </div>

                {/* Real Verified Store Barcode Pills */}
                <div className="pt-2 flex items-center gap-1.5 flex-wrap">
                  <span className="text-[10px] text-teal-900 font-bold uppercase">Real Store Products:</span>
                  <button
                    type="button"
                    onClick={() => {
                      setShowScannerGuide(false);
                      processBarcodeOrSearch("92126419405150");
                    }}
                    className="px-2.5 py-1 bg-white border border-teal-400 hover:bg-teal-100 text-[#0F766E] rounded-lg text-[11px] font-mono font-bold shadow-2xs"
                    title="Levera 500 (Barcode in DB: 92126419405150) - 150 units in stock"
                  >
                    92126419405150 (Levera 500)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowScannerGuide(false);
                      processBarcodeOrSearch("MED-PARA-500");
                    }}
                    className="px-2.5 py-1 bg-white border border-teal-400 hover:bg-teal-100 text-[#0F766E] rounded-lg text-[11px] font-mono font-bold shadow-2xs"
                    title="Zodo 500 (SKU: MED-PARA-500) - 26 units in stock"
                  >
                    MED-PARA-500 (Zodo 500 SKU)
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function BillingPOSPage() {
  return (
    <DashboardProvider>
      <DashboardLayout
        title="Point of Sale (POS)"
        subtitle="Fast, accurate counter billing with automatic stock deduction and digital invoices"
      >
        <CashierPOSScreen />
      </DashboardLayout>
    </DashboardProvider>
  );
}
