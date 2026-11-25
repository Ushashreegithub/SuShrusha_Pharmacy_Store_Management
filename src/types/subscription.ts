export type SubscriptionStatus =
  | "not_started"
  | "trialing"
  | "active"
  | "expired"
  | "grandfathered";

export interface SubscriptionPaymentItem {
  id: number;
  subscription_id: number;
  amount: string;
  currency: string;
  payment_reference: string;
  confirmed_at: string;
  confirmed_by_id: string;
  confirmed_by_name: string;
  confirmed_by_email: string;
  period_start: string;
  period_end: string;
  notes: string;
  created_at: string;
}

export interface PartnerSubscriptionItem {
  id: number;
  organization_id: string;
  organization_name: string;
  organization_slug: string;
  owner_name: string;
  owner_email: string;
  owner_phone: string;
  status: SubscriptionStatus;
  effective_status: SubscriptionStatus;
  trial_started_at: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  days_remaining: number | null;
  is_valid: boolean;
  is_expired: boolean;
  payments_count: number;
  latest_payment_at: string | null;
  created_at: string;
  updated_at: string;
  payments?: SubscriptionPaymentItem[];
}

export interface SubscriptionMetrics {
  total: number;
  active: number;
  trialing: number;
  expired: number;
  not_started: number;
  grandfathered: number;
}

export interface ConfirmManualPaymentPayload {
  amount: string | number;
  currency?: string;
  payment_reference?: string;
  notes?: string;
}

export interface RenewSubscriptionPayload {
  notes?: string;
  payment_reference?: string;
  amount?: string | number;
  currency?: string;
}

export interface PartnerContactInfo {
  partner_id: string;
  partner_name: string;
  contact_email: string;
  contact_phone: string;
  website: string;
  address: string;
  city: string;
  state: string;
}

export interface CustomerSubscriptionResponse {
  has_subscription: boolean;
  is_managed_by_partner: boolean;
  id?: number;
  organization_id: string;
  organization_name: string;
  organization_slug?: string;
  plan_name?: string;
  status?: SubscriptionStatus;
  effective_status?: SubscriptionStatus;
  is_valid?: boolean;
  is_expired?: boolean;
  is_grandfathered?: boolean;
  trial_started_at?: string | null;
  current_period_start?: string | null;
  current_period_end?: string | null;
  days_remaining?: number | null;
  created_at?: string;
  updated_at?: string;
  renewal_instructions?: string;
  partner?: PartnerContactInfo;
  payments?: SubscriptionPaymentItem[];
  message?: string;
}
