import express from 'express'
import cors from 'cors'
import { TokenData } from '../src/services/tokenService'
import dotenv from 'dotenv'

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

// In-memory storage (replace with a database in production)
let tokens: TokenData[] = []

// Get all tokens
app.get('/api/tokens', (req, res) => {
    const { creator } = req.query
    if (creator) {
        res.json(tokens.filter(token => token.creator === creator))
    } else {
        res.json(tokens)
    }
})

// Create a new token
app.post('/api/tokens', (req, res) => {
    const newToken = req.body as TokenData
    tokens.push(newToken)
    res.status(201).json(newToken)
})

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`)
}) 