const Organization = require('../models/Organization');

const tenantContext = async (req, res, next) => {
  try {
    // 1. Check for header, fallback to authenticated user's organizationId
    let tenantId = req.headers['x-organization-id'];

    if (!tenantId && req.user && req.user.organizationId) {
      tenantId = req.user.organizationId.toString();
    }

    // 2. Super admins can bypass mandatory tenant headers for global administrative routes
    if (!tenantId && req.user && req.user.role === 'SUPER_ADMIN') {
      return next();
    }

    if (!tenantId) {
      return res.status(400).json({ error: "Missing x-organization-id header or tenant context." });
    }

    // 3. Verify organization status
    const org = await Organization.findById(tenantId);
    if (!org || !org.isActive) {
      return res.status(404).json({ error: "Target organization does not exist or is inactive." });
    }

    req.organizationId = org._id;
    req.organization = org;
    next();
  } catch (error) {
    return res.status(500).json({ error: "Tenant context verification failed.", details: error.message });
  }
};

module.exports = tenantContext;