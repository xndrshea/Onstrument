import { Router } from 'express'
import { tokenController } from '../controllers/tokenController'

const router = Router()

router.post('/', tokenController.createToken)
router.get('/', tokenController.getTokens)
router.get('/:mint', tokenController.getToken)
router.patch('/:mint/stats', tokenController.updateTokenStats)

export const tokenRoutes = router 