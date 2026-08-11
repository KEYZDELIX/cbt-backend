const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const tenantContext = require('../middleware/tenantContext');
const examController = require('../controllers/examController');

router.use(auth);
router.use(tenantContext);

router.post('/start', examController.startExam);
router.post('/:examId/answer', examController.submitAnswer);
router.post('/:examId/submit', examController.submitExam);

module.exports = router;