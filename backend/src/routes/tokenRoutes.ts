import express from 'express';
import { validateToken } from '../middleware/validation';
import { tokenController } from '../controllers/tokenController';

const router = express.Router();

router.post('/tokens', validateToken, tokenController.createToken);
router.get('/tokens', tokenController.getTokens);
router.get('/tokens/:mint', tokenController.getToken);

export { router as tokenRoutes }; 