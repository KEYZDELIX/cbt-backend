const express = require('express');
const router = express.Router();

const auth = require('../middleware/auth');
const authorize = require('../middleware/rbac');
const tenantContext = require('../middleware/tenantContext');

router.use(auth);
router.use(tenantContext);

// Fetch candidate allocations for centers/halls
router.get('/', authorize('SUPER_ADMIN', 'ORG_ADMIN', 'EXAM_OFFICER'), (req, res) => {
  res.status(200).json({ message: 'Fetch allocations endpoint active' });
});

// Assign candidate or seat to center/hall
router.post('/', authorize('SUPER_ADMIN', 'ORG_ADMIN', 'EXAM_OFFICER'), (req, res) => {
  res.status(200).json({ message: 'Create candidate allocation endpoint active' });
});

// Revoke/Delete allocation
router.delete('/:id', authorize('SUPER_ADMIN', 'ORG_ADMIN', 'EXAM_OFFICER'), (req, res) => {
  res.status(200).json({ message: 'Remove allocation endpoint active' });
});

module.exports = router;