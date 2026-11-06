import { lazy, Suspense } from 'react';

/**
 * Lazy load component with suspense fallback
 * Reduces initial bundle size by code-splitting heavy pages
 */
export const lazyLoad = (component) => ({
  Component: lazy(component),
  fallback: null // Will be handled by Error Boundary and Suspense in App
});

/**
 * Generic loading fallback component
 */
export const LazyLoadFallback = () => (
  <div className="d-flex justify-content-center align-items-center" style={{ height: '100vh' }}>
    <div className="spinner-border" role="status">
      <span className="visually-hidden">Loading...</span>
    </div>
  </div>
);

/**
 * Suspense wrapper for route components
 */
export const withSuspense = (Component) => (props) => (
  <Suspense fallback={<LazyLoadFallback />}>
    <Component {...props} />
  </Suspense>
);
