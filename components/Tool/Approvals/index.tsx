"use client";

import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { 
  Shield, 
  Loader2, 
  CheckCircle, 
  XCircle, 
  Clock,
  Terminal,
  FileText,
  Settings,
  AlertTriangle,
  Eye
} from "lucide-react";
import { InteractApp } from "@OS/InteractApp";
import type { AppSchema } from "@OS/Layout/types";
import { hubFetch } from "$/lib/hub-direct";

const appSchema: AppSchema = {};

interface Approval {
  id: string;
  deviceId: string;
  deviceName: string;
  type: "exec" | "file_write" | "config_patch";
  action: string;
  payload: Record<string, any>;
  requestedBy: string;
  requestedAt: string;
  status: "pending" | "approved" | "denied" | "expired";
}

function ApprovalTypeIcon({ type }: { type: Approval["type"] }) {
  const icons = {
    exec: Terminal,
    file_write: FileText,
    config_patch: Settings,
  };
  const Icon = icons[type];
  return <Icon className="w-5 h-5" />;
}

function ApprovalTypeBadge({ type }: { type: Approval["type"] }) {
  const config = {
    exec: { bg: "bg-red-500/10", text: "text-red-500", label: "Execute Command" },
    file_write: { bg: "bg-yellow-500/10", text: "text-yellow-500", label: "Write File" },
    config_patch: { bg: "bg-blue-500/10", text: "text-blue-500", label: "Config Patch" },
  };
  const { bg, text, label } = config[type];

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded ${bg} ${text} text-xs font-medium`}>
      <ApprovalTypeIcon type={type} />
      {label}
    </span>
  );
}

function ApprovalCard({ 
  approval, 
  onApprove, 
  onDeny 
}: { 
  approval: Approval; 
  onApprove: (id: string) => void; 
  onDeny: (id: string) => void;
}) {
  const [showDetails, setShowDetails] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-card border border-border rounded-lg p-4"
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/10 rounded-lg">
            <ApprovalTypeIcon type={approval.type} />
          </div>
          <div>
            <h3 className="font-medium">{approval.action}</h3>
            <p className="text-sm text-muted-foreground">
              on {approval.deviceName || approval.deviceId || "unknown device"}
            </p>
          </div>
        </div>

        <ApprovalTypeBadge type={approval.type} />
      </div>

      <div className="mt-3 text-sm text-muted-foreground">
        Requested by {approval.requestedBy} • {new Date(approval.requestedAt).toLocaleString()}
      </div>

      {approval.payload && Object.keys(approval.payload).length > 0 && (
        <div className="mt-3">
          <button
            onClick={() => setShowDetails(!showDetails)}
            className="text-sm text-primary hover:underline flex items-center gap-1"
          >
            <Eye className="w-3 h-3" />
            {showDetails ? "Hide" : "View"} Details
          </button>

          {showDetails && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              className="mt-2 p-3 bg-secondary rounded-lg overflow-auto max-h-48"
            >
              <pre className="text-xs font-mono">
                {JSON.stringify(approval.payload, null, 2)}
              </pre>
            </motion.div>
          )}
        </div>
      )}

      {approval.status === "pending" && (
        <div className="mt-4 flex gap-2">
          <button
            onClick={() => onApprove(approval.id)}
            className="flex-1 px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 flex items-center justify-center gap-2"
          >
            <CheckCircle className="w-4 h-4" />
            Approve
          </button>
          <button
            onClick={() => onDeny(approval.id)}
            className="flex-1 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 flex items-center justify-center gap-2"
          >
            <XCircle className="w-4 h-4" />
            Deny
          </button>
        </div>
      )}

      {approval.status === "approved" && (
        <div className="mt-4 flex items-center gap-2 text-green-500">
          <CheckCircle className="w-4 h-4" />
          <span className="text-sm">Approved</span>
        </div>
      )}

      {approval.status === "denied" && (
        <div className="mt-4 flex items-center gap-2 text-red-500">
          <XCircle className="w-4 h-4" />
          <span className="text-sm">Denied</span>
        </div>
      )}
    </motion.div>
  );
}

export function VirtualApprovals() {
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"pending" | "all">("pending");

  const fetchApprovals = async () => {
    setLoading(true);
    setError(null);
    try {
      const path = filter === "pending"
        ? "/api/approvals?status=pending"
        : "/api/approvals";

      const response = await hubFetch(path);
      if (!response.ok) throw new Error("Failed to fetch approvals");
      const data = await response.json();
      setApprovals(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (id: string) => {
    try {
      const response = await hubFetch(`/api/approvals/${id}/resolve`, {
        method: "POST",
        body: JSON.stringify({ approved: true }),
      });
      if (!response.ok) throw new Error("Failed to approve");
      await fetchApprovals();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to approve");
    }
  };

  const handleDeny = async (id: string) => {
    const reason = prompt("Reason for denial (optional):");
    try {
      const response = await hubFetch(`/api/approvals/${id}/resolve`, {
        method: "POST",
        body: JSON.stringify({ approved: false, reason: reason || "" }),
      });
      if (!response.ok) throw new Error("Failed to deny");
      await fetchApprovals();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to deny");
    }
  };

  useEffect(() => {
    fetchApprovals();
  }, [filter]);

  const pendingCount = approvals.filter(a => a.status === "pending").length;

  return (
    <InteractApp appSchema={appSchema}>
      <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold flex items-center gap-2">
              <Shield className="w-6 h-6" />
              Approvals
            </h2>
            <p className="text-sm text-muted-foreground">
              Review and approve dangerous operations
            </p>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => setFilter("pending")}
              className={`px-4 py-2 rounded-lg flex items-center gap-2 ${
                filter === "pending" 
                  ? "bg-primary text-primary-foreground" 
                  : "bg-secondary text-secondary-foreground"
              }`}
            >
              <Clock className="w-4 h-4" />
              Pending
              {pendingCount > 0 && (
                <span className="bg-red-500 text-white text-xs px-1.5 py-0.5 rounded-full">
                  {pendingCount}
                </span>
              )}
            </button>
            <button
              onClick={() => setFilter("all")}
              className={`px-4 py-2 rounded-lg ${
                filter === "all" 
                  ? "bg-primary text-primary-foreground" 
                  : "bg-secondary text-secondary-foreground"
              }`}
            >
              All
            </button>
          </div>
        </div>

        {loading && (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        )}

        {error && (
          <div className="bg-red-500/10 border border-red-500 rounded-lg p-4 text-red-500">
            {error}
          </div>
        )}

        {!loading && !error && approvals.length === 0 && (
          <div className="text-center py-12">
            <Shield className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No pending approvals</h3>
            <p className="text-sm text-muted-foreground">
              {filter === "pending" 
                ? "All caught up! Check back later."
                : "No approval history yet."}
            </p>
          </div>
        )}

        {!loading && !error && approvals.length > 0 && (
          <div className="grid gap-4">
            {approvals.map((approval) => (
              <ApprovalCard
                key={approval.id}
                approval={approval}
                onApprove={handleApprove}
                onDeny={handleDeny}
              />
            ))}
          </div>
        )}
      </div>
    </InteractApp>
  );
}
