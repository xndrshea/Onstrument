import { logger } from './logger'

export function verifyEnvironmentVariables() {
    const requiredVars = [
        'DB_USER',
        'DB_HOST',
        'DB_NAME',
        'DB_PORT',
        'ALLOWED_ORIGINS'
    ]

    const missing = requiredVars.filter(varName => !process.env[varName])

    if (missing.length > 0) {
        logger.error(`Missing required environment variables: ${missing.join(', ')}`)
        return false
    }

    logger.info('All required environment variables are present')
    return true
} 