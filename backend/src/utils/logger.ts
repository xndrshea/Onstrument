import winston from 'winston'
import WinstonCloudWatch from 'winston-cloudwatch'

export const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
    ),
    transports: [
        new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
        new winston.transports.File({ filename: 'logs/combined.log' }),
    ],
})

if (process.env.NODE_ENV === 'production') {
    logger.add(new WinstonCloudWatch({
        logGroupName: '/ecs/onstrument-prod-backend',
        logStreamName: `ecs-${Date.now()}`,
        awsRegion: process.env.AWS_REGION || 'us-east-1',
        messageFormatter: ({ level, message, ...meta }) => `[${level}] ${message} ${JSON.stringify(meta)}`,
    }))
} else {
    logger.add(new winston.transports.Console({
        format: winston.format.simple(),
    }))
} 