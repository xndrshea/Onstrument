import { logger } from './logger'

export function verifyEnvironmentVariables() {
    const requiredVars = [
        'DB_USER',
        'DB_HOST',
        'DB_NAME',
        'DB_PORT',
        'ALLOWED_ORIGINS',
        'NODE_ENV'
    ]

    const productionOnlyVars = [
        'FRONTEND_URL',
        'DATABASE_URL'
    ]

    if (process.env.NODE_ENV === 'production') {
        requiredVars.push(...productionOnlyVars)
    }

    const missing = requiredVars.filter(varName => !process.env[varName])

    if (missing.length > 0) {
        logger.error(`Missing required environment variables: ${missing.join(', ')}`)
        return false
    }

    logger.info(`All required environment variables are present for ${process.env.NODE_ENV} environment`)
    return true
} 