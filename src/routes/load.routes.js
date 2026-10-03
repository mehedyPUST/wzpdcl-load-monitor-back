import { Router } from 'express';
import {
    listSlots,
    getForm,
    submitLoad,
    submitBulk,
    circleTotal,
    currentStatus,
    history,
    reports,
    daySummary,
} from '../controllers/load.controller.js';
import { requireAuth, requireAdminOrOperator, requireAnyRole } from '../middleware/auth.js';

const router = Router();

router.use(requireAuth);

router.get('/slots', requireAnyRole, listSlots);
router.get('/form', requireAnyRole, getForm);
router.post('/submit', requireAdminOrOperator, submitLoad);
router.post('/submit-bulk', requireAdminOrOperator, submitBulk);
router.get('/circle-total', requireAnyRole, circleTotal);
router.get('/current-status', requireAnyRole, currentStatus);
router.get('/history', requireAnyRole, history);
router.get('/reports', requireAnyRole, reports);
router.get('/day-summary', requireAnyRole, daySummary);

export default router;
