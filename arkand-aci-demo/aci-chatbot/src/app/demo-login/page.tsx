"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function DemoLoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/demologin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        router.replace("/demo");
      } else {
        setError("Invalid password.");
      }
    } catch (err) {
      setError("Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-neutral-50">
      <div className="w-full max-w-sm bg-white border border-neutral-200 rounded-xl shadow-sm p-6">
        <h1 className="text-base font-semibold text-neutral-800 mb-2">Demo Access</h1>
        <p className="text-sm text-neutral-500 mb-4">Enter the demo password to continue.</p>
        <form onSubmit={submit} className="space-y-3">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg border border-neutral-300 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-600"
            placeholder="Password"
            autoFocus
          />
          {error && <div className="text-sm text-red-600">{error}</div>}
          <button
            type="submit"
            disabled={loading || password.trim().length === 0}
            className="w-full rounded-lg bg-blue-600 text-white text-sm font-medium h-10 disabled:opacity-50"
          >
            {loading ? "Signing in..." : "Continue"}
          </button>
        </form>
      </div>
    </div>
  );
}
