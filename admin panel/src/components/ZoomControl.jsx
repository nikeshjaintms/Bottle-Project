import React from 'react';

export default function ZoomControl({ value = 100, onChange }) {
  const minZoom = 10;
  const maxZoom = 400;

  const handleDecrease = () => {
    if (value > minZoom) {
      onChange(Math.max(minZoom, value - 1));
    }
  };

  const handleIncrease = () => {
    if (value < maxZoom) {
      onChange(Math.min(maxZoom, value + 1));
    }
  };

  const handleSliderChange = (e) => {
    const nextZoom = parseInt(e.target.value, 10);
    onChange(nextZoom);
  };

  return (
    <div className="d-flex align-items-center bg-white border border-light-subtle rounded-3 px-3 py-1 shadow-sm" style={{ width: 'fit-content' }}>
      <span className="text-muted fw-bold small me-3" style={{ minWidth: '40px', textAlign: 'right' }}>
        {value}%
      </span>
      <button 
        type="button" 
        className="btn btn-sm btn-link text-decoration-none text-secondary p-0" 
        onClick={handleDecrease}
        disabled={value <= minZoom}
        aria-label="Zoom out"
      >
        <i className="bi bi-dash-lg"></i>
      </button>
      <input 
        type="range" 
        className="form-range mx-2" 
        min={minZoom} 
        max={maxZoom} 
        step={1}
        value={value}
        onChange={handleSliderChange}
        style={{ width: '130px' }}
        aria-label="Zoom"
      />
      <button 
        type="button" 
        className="btn btn-sm btn-link text-decoration-none text-secondary p-0" 
        onClick={handleIncrease}
        disabled={value >= maxZoom}
        aria-label="Zoom in"
      >
        <i className="bi bi-plus-lg"></i>
      </button>
    </div>
  );
}
