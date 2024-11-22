import express from 'express';
import { tokenController } from '../controllers/tokenController';
import { validateToken } from '../middleware/validation';

const router = express.Router();

router.post('/tokens', validateToken, tokenController.createToken);
router.get('/tokens', tokenController.getTokens);
router.get('/tokens/:mint', tokenController.getToken);

export { router as tokenRoutes }; 