import { Router } from 'express';
import { listCircles } from '../controllers/circle.controller.js';
import { listPublicSubstations } from '../controllers/substation.controller.js';

const router = Router();

router.get('/circles', listCircles);
router.get('/substations', listPublicSubstations);

export default router;