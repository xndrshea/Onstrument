import { Router } from 'express'
import { tokenController } from '../controllers/tokenController'
import { validateToken } from '../middleware/validation'

const router = Router()

router.post('/', validateToken, tokenController.createToken)
router.get('/', tokenController.getTokens)
router.get('/:mint', tokenController.getToken)

export const tokenRoutes = router 