import React, { useState, useEffect, useRef } from 'react';

// Premium Custom Select Dropdown to eliminate standard browser blue highlight
export default function CustomSelect({ value, onChange, options, placeholder = "-- Choose --", disabled, style, compact, placement = "bottom" }) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const containerRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  useEffect(() => {
    if (!isOpen) {
      setSearchQuery('');
    }
  }, [isOpen]);

  const selectedOption = options.find(
    opt => opt.value === value || String(opt.value) === String(value)
  );

  const filteredOptions = options.filter(opt =>
    String(opt.label || opt.value || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className={`custom-select-container ${isOpen ? 'is-open' : ''}`} ref={containerRef} style={style}>
      <button
        type="button"
        className={`custom-select-trigger ${compact ? 'compact' : ''}`}
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
      >
        <span>{selectedOption ? selectedOption.label : placeholder}</span>
        <span className="arrow" style={{ transform: isOpen ? 'rotate(180deg)' : 'none' }}>▼</span>
      </button>
      {isOpen && (
        <ul 
          className={`custom-select-options ${compact ? 'compact' : ''} ${placement === 'top' ? 'placement-top' : ''}`}
          style={{ paddingTop: 0 }}
        >
          <div className="custom-select-search-wrapper" onClick={(e) => e.stopPropagation()}>
            <input
              type="text"
              placeholder="Search..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="custom-select-search-input"
              autoFocus
            />
          </div>
          {filteredOptions.length > 0 ? (
            filteredOptions.map((opt) => (
              <li
                key={opt.value}
                className={`custom-select-option ${compact ? 'compact' : ''} ${
                  value === opt.value || String(value) === String(opt.value) ? 'selected' : ''
                } ${opt.disabled ? 'disabled-option' : ''}`}
                onClick={() => {
                  if (!opt.disabled) {
                    onChange({ target: { value: opt.value } });
                    setIsOpen(false);
                  }
                }}
              >
                {opt.label}
              </li>
            ))
          ) : (
            <li className="no-options-found">No results found</li>
          )}
        </ul>
      )}
    </div>
  );
}
