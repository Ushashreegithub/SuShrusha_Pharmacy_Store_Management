"use client";

import React from "react";
import Link from "next/link";
import {
  ShieldCheck,
  Shield,
  Users,
  Store,
  Lock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
} from "lucide-react";
import { DashboardProvider, useDashboard } from "@/context/DashboardContext";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";

function RolesPermissionsContent() {
  const { user } = useDashboard();

  const roleDefinitions = [
    {
      title: "Organization Owner",
      code: "owner",
      badge: "Executive",
      badgeColor: "bg-teal-50 text-[#0F766E] border-teal-200",
      description:
        "Full executive control across all stores within the organization. Authorized to create branches, invite managers, configure settings, and inspect audit logs.",
      permissions: [
        "Create, edit, and configure store branches",
        "Assign and change store managers",
        "Invite store managers, pharmacists, and staff across all branches",
        "Manage organization settings and billing",
        "Inspect organization-wide security audit logs",
        "Restricted strictly to own organization (zero cross-tenant data access)",
      ],
      restrictions: [
        "Cannot access records or stores belonging to other pharmacy organizations",
      ],
    },
    {
      title: "Store Branch Manager",
      code: "manager",
      badge: "Management",
      badgeColor: "bg-sky-50 text-sky-700 border-sky-200",
      description:
        "Branch-level operational management. Authorized to manage assigned store team members, issue staff invitations, and review branch-level records.",
      permissions: [
        "Manage staff memberships within assigned store branches",
        "Issue invitation links for pharmacists, cashiers, and staff for assigned branches",
        "Deactivate branch memberships (affects only that specific branch)",
        "Oversee daily branch dispensing, counter shifts, and local stock",
      ],
      restrictions: [
        "Cannot access or view store branches not assigned to this manager",
        "Cannot grant owner or administrator privileges to anyone",
        "Cannot create new store branches or change organization settings",
      ],
    },
    {
      title: "Pharmacist / Staff Member",
      code: "pharmacist / cashier / staff",
      badge: "Operations",
      badgeColor: "bg-emerald-50 text-emerald-700 border-emerald-200",
      description:
        "Operational store staff responsible for prescription dispensing, customer billing, and inventory receiving within authorized active branches.",
      permissions: [
        "Access active assigned store branches",
        "Switch between assigned branches via store selector",
        "Dispense medications and process sales orders (when POS active)",
        "View branch inventory and shelf locations",
      ],
      restrictions: [
        "Cannot access branches where membership is inactive or unassigned",
        "Cannot view administrative audit logs or organization settings",
        "Cannot issue team invitations or modify member permissions",
      ],
    },
    {
      title: "Platform Administrator",
      code: "admin (system)",
      badge: "Restricted Support",
      badgeColor: "bg-purple-50 text-purple-700 border-purple-200",
      description:
        "Restricted technical support and maintenance role strictly audited for infrastructure operations. Never receives unrestricted business or patient data access.",
      permissions: [
        "System health verification, database migrations, and diagnostic monitoring",
        "Audited technical assistance for account lockout and email delivery diagnostics",
      ],
      restrictions: [
        "Not available for public registration or organization self-assignment",
        "Strictly prevented from accessing customer medical or business data without authorization",
      ],
    },
  ];

  return (
    <DashboardLayout
      title="Roles & Authorization Policies"
      subtitle="Overview of role boundaries, permissions, and security enforcements enforced by the Django backend."
    >
      <div className="space-y-6">
        <div className="p-4 bg-teal-50 border border-teal-200 rounded-2xl text-xs flex items-start gap-3">
          <ShieldCheck className="w-5 h-5 text-[#0F766E] flex-shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h3 className="font-bold text-teal-950">Backend-Enforced Role Security</h3>
            <p className="text-teal-900 leading-relaxed">
              Role permissions are strictly validated in the Django backend on every protected
              API endpoint, not merely in the frontend UI. Cross-tenant access is prohibited
              at the database query layer.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {roleDefinitions.map((role) => (
            <div
              key={role.title}
              className="bg-white rounded-2xl border border-[#E2E8F0] p-6 shadow-2xs space-y-4 flex flex-col justify-between"
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-base text-slate-900">{role.title}</h3>
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${role.badgeColor}`}
                  >
                    {role.badge}
                  </span>
                </div>

                <p className="text-xs text-slate-600 leading-relaxed">
                  {role.description}
                </p>

                <div className="space-y-2 pt-2">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">
                    Granted Permissions
                  </span>
                  <ul className="space-y-1 text-xs text-slate-700">
                    {role.permissions.map((p, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 mt-0.5 flex-shrink-0" />
                        <span>{p}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="space-y-2 pt-2">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">
                    Enforced Security Restrictions
                  </span>
                  <ul className="space-y-1 text-xs text-slate-600">
                    {role.restrictions.map((r, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <XCircle className="w-3.5 h-3.5 text-rose-500 mt-0.5 flex-shrink-0" />
                        <span>{r}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </DashboardLayout>
  );
}

export default function RolesPage() {
  return (
    <DashboardProvider>
      <RolesPermissionsContent />
    </DashboardProvider>
  );
}

