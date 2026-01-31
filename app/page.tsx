"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";

export default function Home() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [useDemo, setUseDemo] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    // Demo mode - bypass file/text requirement
    if (useDemo) {
      setLoading(true);
      try {
        const response = await fetch("/api/scan/demo", {
          method: "POST",
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "Failed to create demo scan");
        }

        router.push(`/scan/${data.scanId}`);
      } catch (err) {
        setError(err instanceof Error ? err.message : "An error occurred");
        setLoading(false);
      }
      return;
    }

    if (!file && !text.trim()) {
      setError("Please upload a CSV file or paste text (at least one is required)");
      return;
    }

    setLoading(true);

    try {
      const formData = new FormData();
      if (file) {
        formData.append("file", file);
      }
      if (text.trim()) {
        formData.append("text", text.trim());
      }

      const response = await fetch("/api/scan", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to create scan");
      }

      router.push(`/scan/${data.scanId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
      setLoading(false);
    }
  };

  return (
    <div className="container">
      <h1>Revenue & Billing Chaos Scan</h1>
      <p className="subtitle">Extract atomic financial facts from your data</p>

      <div className="card">
        <form onSubmit={handleSubmit}>
          {error && <div className="error">{error}</div>}

          {/* Demo Mode Toggle */}
          <div className="demo-toggle">
            <label className="demo-toggle-label">
              <input
                type="checkbox"
                checked={useDemo}
                onChange={(e) => setUseDemo(e.target.checked)}
                disabled={loading}
              />
              <span className="demo-toggle-text">
                Use demo dataset
                <span className="demo-badge">Try it out</span>
              </span>
            </label>
            {useDemo && (
              <p className="demo-description">
                Load a sample dataset from &ldquo;Spark Creative Agency&rdquo; with realistic issues:
                aging invoices, payment gaps, amount drift, and potential duplicates.
              </p>
            )}
          </div>

          {!useDemo && (
            <>
              <div className="form-group">
                <label htmlFor="file">Upload CSV File</label>
                <input
                  type="file"
                  id="file"
                  accept=".csv,text/csv"
                  onChange={(e) => setFile(e.target.files?.[0] || null)}
                  disabled={loading}
                />
              </div>

              <div className="divider">
                <span>AND / OR</span>
              </div>

              <div className="form-group">
                <label htmlFor="text">Paste Text</label>
                <textarea
                  id="text"
                  placeholder="Paste your financial data here (invoices, payments, subscriptions, etc.)"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  disabled={loading}
                />
              </div>
            </>
          )}

          <button type="submit" disabled={loading}>
            {loading ? "Processing..." : useDemo ? "Run Demo Scan" : "Extract Facts"}
          </button>
        </form>
      </div>

      <div className="card">
        <h2>What This Tool Does</h2>
        <ul style={{ marginLeft: "1.5rem", marginBottom: "1rem" }}>
          <li>Extracts individual financial facts from your data</li>
          <li>Identifies invoices, payments, subscriptions, and discounts</li>
          <li>Outputs structured data with confidence scores</li>
        </ul>

        <h2>What This Tool Does NOT Do</h2>
        <ul style={{ marginLeft: "1.5rem" }}>
          <li>No totals or aggregations</li>
          <li>No recommendations or analysis</li>
          <li>No dashboards or visualizations</li>
          <li>No inference of missing data</li>
        </ul>
      </div>
    </div>
  );
}
