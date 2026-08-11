const express = require('express');
const router = express.Router();

const auth = require('../middleware/auth');
const authorize = require('../middleware/rbac');
const tenantContext = require('../middleware/tenantContext');

router.use(auth);
router.use(tenantContext);

// List all cohorts/groups in organization
router.get('/', authorize('SUPER_ADMIN', 'ORG_ADMIN', 'EXAM_OFFICER', 'INSTRUCTOR'), (req, res) => {
  res.status(200).json({ message: 'Get cohorts endpoint active' });
});

// Create new cohort
router.post('/', authorize('SUPER_ADMIN', 'ORG_ADMIN', 'EXAM_OFFICER'), (req, res) => {
  res.status(200).json({ message: 'Create cohort endpoint active' });
});

// Get cohort by ID
router.get('/:id', authorize('SUPER_ADMIN', 'ORG_ADMIN', 'EXAM_OFFICER', 'INSTRUCTOR'), (req, res) => {
  res.status(200).json({ message: 'Get cohort details endpoint active' });
});

// Delete cohort
router.delete('/:id', authorize('SUPER_ADMIN', 'ORG_ADMIN'), (req, res) => {
  res.status(200).json({ message: 'Delete cohort endpoint active' });
});

module.exports = router;