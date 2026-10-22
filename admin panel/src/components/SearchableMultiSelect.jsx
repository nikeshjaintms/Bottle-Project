import React, { useState, useRef, useEffect } from 'react';

/**
 * SearchableMultiSelect - A dropdown with search and multi-checkbox selection.
 *
 * Props:
 *  - options: Array of { value, label, sublabel }
 *  - selectedValues: Array of string IDs
 *  - onChange: (selectedValues: string[]) => void
 *  - placeholder: string
 *  - disabled: boolean
 *  - style: object for trigger button
 */
export default function SearchableMultiSelect({
  options = [],
  selectedValues = [],
  onChange,
  placeholder = '-- Pick Variant(s) --',
  disabled = false,
  style = {},
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef(null);
  const searchRef = useRef(null);

  // Close on outside click
  useEffect(() => {
    const handler = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
        setSearch('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Auto-focus search input when opened
  useEffect(() => {
    if (open && searchRef.current) {
      searchRef.current.focus();
    }
  }, [open]);

  const filtered = options.filter((o) => {
    const term = search.toLowerCase();
    return (
      (o.label || '').toLowerCase().includes(term) ||
      (o.sublabel || '').toLowerCase().includes(term)
    );
  });

  const toggleOption = (val) => {
    if (selectedValues.includes(val)) {
      onChange(selectedValues.filter((v) => v !== val));
    } else {
      onChange([...selectedValues, val]);
    }
  };

  const handleSelectAll = () => {
    const allFilteredVals = filtered.map((o) => o.value);
    const combined = Array.from(new Set([...selectedValues, ...allFilteredVals]));
    onChange(combined);
  };

  const handleClearAll = () => {
    onChange([]);
  };

  // Get labels for selected
  const selectedLabels = options
    .filter((o) => selectedValues.includes(o.value))
    .map((o) => o.label);

  const displaySummary = () => {
    if (selectedValues.length === 0) return placeholder;
    if (selectedValues.length === 1) return selectedLabels[0] || '1 selected';
    return `${selectedValues.length} Variants Selected`;
  };

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%' }}>
      {/* Trigger Button */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen((prev) => !prev)}
        className="form-select custom-input-field text-start d-flex align-items-center justify-content-between"
        style={{
          borderRadius: 8,
          background: disabled ? '#f8f9fa' : '#fff',
          cursor: disabled ? 'not-allowed' : 'pointer',
          color: selectedValues.length > 0 ? '#1f2937' : '#6c757d',
          minHeight: 34,
          padding: '4px 8px',
          fontSize: 12,
          border: '1px solid #dee2e6',
          ...style,
        }}
      >
        <span
          style={{
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            flex: 1,
            fontWeight: selectedValues.length > 0 ? 600 : 400,
          }}
          title={selectedLabels.join(', ')}
        >
          {displaySummary()}
        </span>
        {selectedValues.length > 0 && (
          <span
            className="badge bg-primary text-white ms-1 me-1"
            style={{ fontSize: 10, padding: '2px 5px' }}
          >
            {selectedValues.length}
          </span>
        )}
        <i
          className={`bi bi-chevron-${open ? 'up' : 'down'} ms-1`}
          style={{ fontSize: 11, flexShrink: 0, color: '#6b7280' }}
        />
      </button>

      {/* Dropdown Panel */}
      {open && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            right: 0,
            minWidth: 260,
            maxWidth: 360,
            zIndex: 1080,
            background: '#fff',
            border: '1px solid #e5e7eb',
            borderRadius: 10,
            boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.15)',
            overflow: 'hidden',
          }}
        >
          {/* Search Box */}
          <div style={{ padding: '8px 10px', borderBottom: '1px solid #f3f4f6', background: '#f9fafb' }}>
            <div style={{ position: 'relative' }}>
              <i
                className="bi bi-search"
                style={{
                  position: 'absolute',
                  left: 10,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: '#9ca3af',
                  fontSize: 12,
                  pointerEvents: 'none',
                }}
              />
              <input
                ref={searchRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search variant..."
                style={{
                  width: '100%',
                  padding: '5px 8px 5px 28px',
                  border: '1px solid #d1d5db',
                  borderRadius: 6,
                  fontSize: 12,
                  outline: 'none',
                  background: '#fff',
                }}
              />
            </div>
            {/* Quick Actions */}
            <div className="d-flex justify-content-between align-items-center mt-2 px-1" style={{ fontSize: 11 }}>
              <span className="text-muted fw-semibold">
                {selectedValues.length} of {options.length} selected
              </span>
              <div className="d-flex gap-2">
                <button
                  type="button"
                  className="btn btn-link p-0 text-decoration-none text-primary"
                  style={{ fontSize: 11 }}
                  onClick={handleSelectAll}
                >
                  Select All
                </button>
                <span className="text-muted">|</span>
                <button
                  type="button"
                  className="btn btn-link p-0 text-decoration-none text-danger"
                  style={{ fontSize: 11 }}
                  onClick={handleClearAll}
                >
                  Clear
                </button>
              </div>
            </div>
          </div>

          {/* Options List */}
          <div style={{ maxHeight: 220, overflowY: 'auto', padding: '4px 0' }}>
            {filtered.length === 0 ? (
              <div
                style={{
                  padding: '16px 12px',
                  color: '#9ca3af',
                  fontSize: 12,
                  textAlign: 'center',
                }}
              >
                No matching variants found
              </div>
            ) : (
              filtered.map((o) => {
                const isSelected = selectedValues.includes(o.value);
                return (
                  <div
                    key={o.value}
                    onClick={() => toggleOption(o.value)}
                    style={{
                      padding: '7px 12px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 8,
                      background: isSelected ? '#eff6ff' : 'transparent',
                      borderBottom: '1px solid #f9fafb',
                    }}
                    onMouseEnter={(e) => {
                      if (!isSelected) e.currentTarget.style.background = '#f9fafb';
                    }}
                    onMouseLeave={(e) => {
                      if (!isSelected) e.currentTarget.style.background = 'transparent';
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => {}} // Controlled by row click
                      style={{ marginTop: 2, cursor: 'pointer' }}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: 12,
                          fontWeight: isSelected ? 600 : 500,
                          color: isSelected ? '#1d4ed8' : '#1f2937',
                          lineHeight: 1.3,
                        }}
                      >
                        {o.label}
                      </div>
                      {o.sublabel && (
                        <div
                          style={{
                            fontSize: 10,
                            color: '#6b7280',
                            marginTop: 1,
                          }}
                        >
                          {o.sublabel}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Footer Done Button */}
          <div
            style={{
              padding: '6px 10px',
              borderTop: '1px solid #f3f4f6',
              background: '#f9fafb',
              textAlign: 'right',
            }}
          >
            <button
              type="button"
              className="btn btn-xs btn-primary py-1 px-3"
              style={{ fontSize: 11, borderRadius: 6 }}
              onClick={() => {
                setOpen(false);
                setSearch('');
              }}
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
