const express = require('express');
const router = express.Router();

const auth = require('../middleware/auth');
const authorize = require('../middleware/rbac');
const tenantContext = require('../middleware/tenantContext');

const examController = require('../controllers/examController');

router.use(auth);
router.use(tenantContext);

router.get(
  '/',
  authorize('SUPER_ADMIN', 'ORG_ADMIN', 'EXAM_OFFICER', 'INSTRUCTOR', 'CANDIDATE'),
  examController.getExams
);

router.post(
  '/',
  authorize('SUPER_ADMIN', 'ORG_ADMIN', 'EXAM_OFFICER', 'INSTRUCTOR'),
  examController.createExam
);

router.get(
  '/:id',
  authorize('SUPER_ADMIN', 'ORG_ADMIN', 'EXAM_OFFICER', 'INSTRUCTOR', 'CANDIDATE'),
  examController.getExamById
);

router.put(
  '/:id',
  authorize('SUPER_ADMIN', 'ORG_ADMIN', 'EXAM_OFFICER'),
  examController.updateExam
);

router.delete(
  '/:id',
  authorize('SUPER_ADMIN', 'ORG_ADMIN'),
  examController.deleteExam
);

module.exports = router;