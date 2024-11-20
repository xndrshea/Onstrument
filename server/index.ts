import express from 'express'
import cors from 'cors'
import { TokenData } from '../src/services/tokenService'

const app = express()
const port = 3001

// In-memory storage (replace with a database in production)
let tokens: TokenData[] = []

app.use(cors())
app.use(express.json())

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