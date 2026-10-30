/**
 * Request-local cache middleware
 * Initializes caches that should be cleared per request to avoid memory leaks
 */

exports.initRequestCache = (req, res, next) => {
  // Cache for plain bottle stock computations: key = 'companyId:bottleId', value = computed stock object
  req.stockCache = {};
  
  // Cache for bottle lookups
  req.bottleCache = {};
  
  next();
};
