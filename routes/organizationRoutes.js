const express = require('express');
const router = express.Router();

const auth = require('../middleware/auth');
const authorize = require('../middleware/rbac');
const tenantContext = require('../middleware/tenantContext');

const organizationController = require('../controllers/organizationController');

// All organization management routes require authentication
router.use(auth);

// 1. Super Admin Routes (Global Tenant Management)
router.post(
  '/',
  authorize('SUPER_ADMIN'),
  organizationController.createOrganization
);

router.get(
  '/',
  authorize('SUPER_ADMIN'),
  organizationController.getAllOrganizations
);

router.patch(
  '/:id/status',
  authorize('SUPER_ADMIN'),
  organizationController.toggleOrganizationStatus
);

// 2. Tenant-Scoped Routes (Organization Admin / Users)
router.use(tenantContext);

router.get(
  '/profile',
  authorize('SUPER_ADMIN', 'ORG_ADMIN', 'ORG_FINANCE'),
  organizationController.getOrganizationProfile
);

router.put(
  '/profile',
  authorize('SUPER_ADMIN', 'ORG_ADMIN'),
  organizationController.updateOrganizationProfile
);

module.exports = router;