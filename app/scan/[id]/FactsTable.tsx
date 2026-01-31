"use client";

import { useState, useMemo } from "react";

interface Fact {
  id: string;
  factType: string;
  entityName: string | null;
  amountValue: number | null;
  amountCurrency: string | null;
  dateValue: string | null;
  dateType: string | null;
  status: string;
  recurrence: string;
  sourceType: string;
  sourceReference: string;
  confidence: number;
  notes: string | null;
}

interface FactsTableProps {
  facts: Fact[];
}

function formatAmount(value: number | null, currency: string | null): string {
  if (value === null) return "-";
  const curr = currency || "USD";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: curr,
  }).format(value);
}

export function FactsTable({ facts }: FactsTableProps) {
  const [entityFilter, setEntityFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [confidenceThreshold, setConfidenceThreshold] = useState<number>(0.6);
  const [groupByEntity, setGroupByEntity] = useState<boolean>(false);

  // Get unique values for filters
  const entities = useMemo(() => {
    const set = new Set(facts.map((f) => f.entityName).filter(Boolean) as string[]);
    return Array.from(set).sort();
  }, [facts]);

  const statuses = useMemo(() => {
    const set = new Set(facts.map((f) => f.status));
    return Array.from(set).sort();
  }, [facts]);

  const types = useMemo(() => {
    const set = new Set(facts.map((f) => f.factType));
    return Array.from(set).sort();
  }, [facts]);

  // Apply filters
  const filteredFacts = useMemo(() => {
    return facts.filter((fact) => {
      if (entityFilter !== "all" && fact.entityName !== entityFilter) return false;
      if (statusFilter !== "all" && fact.status !== statusFilter) return false;
      if (typeFilter !== "all" && fact.factType !== typeFilter) return false;
      if (fact.confidence < confidenceThreshold) return false;
      return true;
    });
  }, [facts, entityFilter, statusFilter, typeFilter, confidenceThreshold]);

  // Group by entity if enabled
  const groupedFacts = useMemo(() => {
    if (!groupByEntity) return null;

    const groups = new Map<string, Fact[]>();
    for (const fact of filteredFacts) {
      const key = fact.entityName || "(No Entity)";
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(fact);
    }

    return Array.from(groups.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [filteredFacts, groupByEntity]);

  const renderFactRow = (fact: Fact) => (
    <tr key={fact.id}>
      <td>
        <span className="type-badge">{fact.factType}</span>
      </td>
      <td>{fact.entityName || "-"}</td>
      <td>{formatAmount(fact.amountValue, fact.amountCurrency)}</td>
      <td>
        {fact.dateValue ? (
          <>
            {fact.dateValue}
            {fact.dateType && (
              <span className="date-type-hint"> ({fact.dateType})</span>
            )}
          </>
        ) : (
          "-"
        )}
      </td>
      <td>{fact.status}</td>
      <td>{fact.recurrence}</td>
      <td>
        <span className="source-info">
          {fact.sourceType}
          {fact.sourceReference && (
            <span className="source-ref"> / {fact.sourceReference}</span>
          )}
        </span>
      </td>
      <td>
        <span
          className={`confidence-badge ${
            fact.confidence >= 0.8
              ? "confidence-high"
              : fact.confidence >= 0.6
              ? "confidence-medium"
              : "confidence-low"
          }`}
        >
          {(fact.confidence * 100).toFixed(0)}%
        </span>
      </td>
      <td className="notes-cell">{fact.notes || "-"}</td>
    </tr>
  );

  return (
    <div className="card facts-section">
      <h2>Extracted Facts</h2>

      {/* Filters */}
      <div className="filters">
        <div className="filter-group">
          <label htmlFor="entity-filter">Entity:</label>
          <select
            id="entity-filter"
            value={entityFilter}
            onChange={(e) => setEntityFilter(e.target.value)}
          >
            <option value="all">All Entities</option>
            {entities.map((entity) => (
              <option key={entity} value={entity}>
                {entity}
              </option>
            ))}
          </select>
        </div>

        <div className="filter-group">
          <label htmlFor="status-filter">Status:</label>
          <select
            id="status-filter"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="all">All Statuses</option>
            {statuses.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </div>

        <div className="filter-group">
          <label htmlFor="type-filter">Type:</label>
          <select
            id="type-filter"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
          >
            <option value="all">All Types</option>
            {types.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </div>

        <div className="filter-group">
          <label htmlFor="confidence-filter">Min Confidence:</label>
          <select
            id="confidence-filter"
            value={confidenceThreshold}
            onChange={(e) => setConfidenceThreshold(parseFloat(e.target.value))}
          >
            <option value={0}>0%</option>
            <option value={0.5}>50%</option>
            <option value={0.6}>60%</option>
            <option value={0.7}>70%</option>
            <option value={0.8}>80%</option>
            <option value={0.9}>90%</option>
          </select>
        </div>

        <div className="filter-group toggle-group">
          <label>
            <input
              type="checkbox"
              checked={groupByEntity}
              onChange={(e) => setGroupByEntity(e.target.checked)}
            />
            Group by Entity
          </label>
        </div>
      </div>

      <div className="filter-summary">
        Showing {filteredFacts.length} of {facts.length} facts
      </div>

      {filteredFacts.length === 0 ? (
        <div className="empty-state">
          <p>No facts match the current filters.</p>
        </div>
      ) : groupByEntity && groupedFacts ? (
        <div className="grouped-facts">
          {groupedFacts.map(([entityName, entityFacts]) => (
            <div key={entityName} className="entity-group">
              <h4 className="entity-group-header">
                {entityName} ({entityFacts.length} fact{entityFacts.length !== 1 ? "s" : ""})
              </h4>
              <div className="table-wrapper">
                <table>
                  <thead>
                    <tr>
                      <th>Type</th>
                      <th>Entity</th>
                      <th>Amount</th>
                      <th>Date</th>
                      <th>Status</th>
                      <th>Recurrence</th>
                      <th>Source</th>
                      <th>Confidence</th>
                      <th>Notes</th>
                    </tr>
                  </thead>
                  <tbody>{entityFacts.map(renderFactRow)}</tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Type</th>
                <th>Entity</th>
                <th>Amount</th>
                <th>Date</th>
                <th>Status</th>
                <th>Recurrence</th>
                <th>Source</th>
                <th>Confidence</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>{filteredFacts.map(renderFactRow)}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}
