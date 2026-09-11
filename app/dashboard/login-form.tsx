"use client";

import { useState, useTransition } from "react";
import { loginDashboardAction } from "./actions";

export function LoginForm() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    startTransition(async () => {
      const res = await loginDashboardAction(password);
      if (!res.ok) {
        setError(res.error || "Authentication failed");
      }
    });
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-[#07080f] text-ink">
      <div className="w-full max-w-md p-6 sm:p-8 rounded-2xl bg-card border border-line shadow-2xl space-y-6">
        <div className="space-y-2 text-center">
          <div className="inline-flex p-2.5 rounded-xl bg-accent/10 border border-accent/20 text-accent mb-1">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
              />
            </svg>
          </div>
          <h1 className="text-xl font-bold tracking-tight text-ink">
            Survey Analytics Dashboard
          </h1>
          <p className="text-xs text-muted leading-relaxed">
            This dashboard contains academic research submissions and requires authorization.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted block" htmlFor="dashboard-key">
              Access Key
            </label>
            <input
              id="dashboard-key"
              type="password"
              placeholder="Enter access key..."
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-[#07080f] border border-line text-ink text-sm placeholder:text-muted/40 focus:outline-none focus:border-accent"
              autoFocus
              required
            />
          </div>

          {error && (
            <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-center gap-2">
              <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={isPending}
            className="w-full py-2.5 rounded-xl bg-accent hover:bg-accent/90 text-white font-medium text-sm transition-colors shadow disabled:opacity-50"
          >
            {isPending ? "Verifying..." : "Unlock Dashboard"}
          </button>
        </form>
      </div>
    </div>
  );
}
