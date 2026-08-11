const express = require('express');
const router = express.Router();

const auth = require('../middleware/auth');
const authorize = require('../middleware/rbac');
const tenantContext = require('../middleware/tenantContext');

const examController = require('../controllers/examController');

// Global middleware pipeline
router.use(auth);
router.use(tenantContext);

// Candidates, Admins, and Super Admins can take/interact with exams
router.post('/start', authorize('CANDIDATE', 'SUPER_ADMIN', 'ORG_ADMIN'), examController.startExam);
router.post('/:examId/answer', authorize('CANDIDATE', 'SUPER_ADMIN', 'ORG_ADMIN'), examController.submitAnswer);
router.post('/:examId/submit', authorize('CANDIDATE', 'SUPER_ADMIN', 'ORG_ADMIN'), examController.submitExam);
router.get('/:examId', authorize('CANDIDATE', 'SUPER_ADMIN', 'ORG_ADMIN'), examController.getExamById);

module.exports = router;