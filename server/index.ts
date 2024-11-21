import express from 'express'
import cors from 'cors'
import { TokenData } from '../src/services/tokenService'
import dotenv from 'dotenv'
import { TokenModel } from './src/models/Token'

dotenv.config()

const app = express()
const port = process.env.PORT || 3001
const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:5173']

app.use(cors({
    origin: function (origin, callback) {
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true)
        } else {
            callback(new Error('Not allowed by CORS'))
        }
    }
}))
app.use(express.json())

// Get all tokens
app.get('/api/tokens', async (req, res) => {
    const { creator } = req.query
    try {
        const tokens = creator ?
            await TokenModel.findByCreator(creator as string) :
            await TokenModel.findAll()
        res.json(tokens)
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch tokens' })
    }
})

// Create a new token
app.post('/api/tokens', async (req, res) => {
    try {
        const newToken = await TokenModel.create(req.body)
        res.status(201).json(newToken)
    } catch (error) {
        res.status(500).json({ error: 'Failed to create token' })
    }
})

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`)
}) 