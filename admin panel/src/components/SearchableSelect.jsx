import { useState, useRef, useEffect } from 'react';

/**
 * SearchableSelect - A dropdown with an inline search box.
 *
 * Props:
 *  - options:       Array of { value, label }
 *  - value:         Currently selected value (id string)
 *  - onChange:      (value: string) => void
 *  - placeholder:   Placeholder text when nothing is selected
 *  - disabled:      boolean
 *  - isInvalid:     boolean  (adds red border)
 *  - style:         inline style object for the trigger button
 */
export default function SearchableSelect({
  options = [],
  value = '',
  onChange,
  placeholder = '-- Select --',
  disabled = false,
  isInvalid = false,
  style = {},
  displayValue = '',
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

  // Auto-focus search when opened
  useEffect(() => {
    if (open && searchRef.current) {
      searchRef.current.focus();
    }
  }, [open]);

  const selectedOption = options.find((o) => String(o?.value) === String(value));
  const selectedLabel = selectedOption?.label || displayValue || '';

  const filtered = options.filter((o) =>
    o.label.toLowerCase().includes(search.toLowerCase())
  );

  const handleSelect = (val) => {
    onChange(val);
    setOpen(false);
    setSearch('');
  };

  return (
    <div
      ref={containerRef}
      style={{ position: 'relative', width: '100%' }}
    >
      {/* Trigger */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen((prev) => !prev)}
        className={`form-select custom-input-field text-start d-flex align-items-center justify-content-between ${isInvalid ? 'is-invalid' : ''}`}
        style={{
          borderRadius: 12,
          backgroundColor: disabled ? '#e9ecef' : '#fff',
          borderColor: disabled ? '#ced4da' : undefined,
          cursor: disabled ? 'not-allowed' : 'pointer',
          color: disabled ? '#495057' : (selectedLabel ? '#212529' : '#6c757d'),
          fontWeight: disabled ? 600 : 'normal',
          opacity: disabled ? 0.95 : 1,
          ...style,
        }}
      >
        <span
          style={{
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            flex: 1,
          }}
        >
          {selectedLabel || placeholder}
        </span>
        {disabled ? (
          <i
            className="bi bi-lock-fill text-muted ms-2"
            style={{ fontSize: 13, flexShrink: 0 }}
            title="Locked / Disabled"
          />
        ) : (
          <i
            className={`bi bi-chevron-${open ? 'up' : 'down'} ms-2`}
            style={{ fontSize: 12, flexShrink: 0 }}
          />
        )}
      </button>

      {/* Dropdown panel */}
      {open && (
        <div
          className="searchable-select-dropdown"
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            right: 0,
            zIndex: 1050,
            background: '#fff',
            border: '1px solid #dee2e6',
            borderRadius: 12,
            boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
            overflow: 'hidden',
          }}
        >
          {/* Search input */}
          <div style={{ padding: '8px 10px', borderBottom: '1px solid #f0f0f0' }}>
            <div style={{ position: 'relative' }}>
              <i
                className="bi bi-search"
                style={{
                  position: 'absolute',
                  left: 10,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: '#aaa',
                  fontSize: 13,
                  pointerEvents: 'none',
                }}
              />
              <input
                ref={searchRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search..."
                style={{
                  width: '100%',
                  padding: '7px 10px 7px 32px',
                  border: '1px solid #e5e7eb',
                  borderRadius: 8,
                  fontSize: 13,
                  outline: 'none',
                  background: '#f8fafc',
                }}
              />
            </div>
          </div>

          {/* Options list */}
          <div style={{ maxHeight: 220, overflowY: 'auto' }}>
            {/* Clear / placeholder row */}
            <div
              onClick={() => handleSelect('')}
              style={{
                padding: '9px 14px',
                cursor: 'pointer',
                fontSize: 13,
                color: '#9ca3af',
                borderBottom: '1px solid #f5f5f5',
                background: value === '' ? '#f0f4ff' : 'transparent',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = '#f8fafc')}
              onMouseLeave={(e) =>
                (e.currentTarget.style.background =
                  value === '' ? '#f0f4ff' : 'transparent')
              }
            >
              {placeholder}
            </div>

            {filtered.length === 0 ? (
              <div
                style={{
                  padding: '12px 14px',
                  color: '#9ca3af',
                  fontSize: 13,
                  textAlign: 'center',
                }}
              >
                No results found
              </div>
            ) : (
              filtered.map((o) => (
                <div
                  key={o.value}
                  onClick={() => handleSelect(o.value)}
                  style={{
                    padding: '9px 14px',
                    cursor: 'pointer',
                    fontSize: 13,
                    color: '#212529',
                    background: o.value === value ? '#f0f4ff' : 'transparent',
                    fontWeight: o.value === value ? 600 : 400,
                    borderBottom: '1px solid #fafafa',
                  }}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.background =
                      o.value === value ? '#e8eeff' : '#f8fafc')
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.background =
                      o.value === value ? '#f0f4ff' : 'transparent')
                  }
                >
                  {o.label}
                </div>
              ))
            )}
            
            {onAddOption && (
              <div
                onClick={() => {
                  setOpen(false);
                  onAddOption(search);
                  setSearch('');
                }}
                style={{
                  padding: '9px 14px',
                  cursor: 'pointer',
                  fontSize: 13,
                  color: '#0d6efd',
                  fontWeight: 600,
                  borderTop: '1px solid #f5f5f5',
                  background: 'transparent',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = '#f8fafc')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <i className="bi bi-plus-circle me-2" /> Add New {search ? `"${search}"` : ''}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
