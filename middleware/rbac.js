/**
 * Role-Based Access Control Middleware
 * @param {...string} allowedRoles - List of allowed roles from User schema enum
 */
const authorize = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: "Unauthorized access. Authentication required." });
    }

    // SUPER_ADMIN has global access across all endpoints
    if (req.user.role === 'SUPER_ADMIN') {
      return next();
    }

    // Check if user's role is permitted
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ 
        error: "Forbidden. You do not have permission to access this resource.",
        requiredRoles: allowedRoles,
        yourRole: req.user.role
      });
    }

    next();
  };
};

module.exports = authorize;