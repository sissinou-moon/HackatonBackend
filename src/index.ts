import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import uploadRouter from './routes/upload';
import chatRouter from './routes/chat';
import downloadRouter from './routes/download';
import roomRouter from './routes/room';

dotenv.config({ path: '.env.local' });

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/api/upload', uploadRouter);
app.use('/api/chat', chatRouter);
app.use('/api/download', downloadRouter);
app.use('/api/room', roomRouter);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'RAG Chatbot API is running' });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'RAG Chatbot API',
    endpoints: {
      upload: 'POST /api/upload',
      chat: 'POST /api/chat',
      download: 'GET /api/download/:fileName',
      listFiles: 'GET /api/download',
      health: 'GET /health',
      rooms: {
        getAll: 'GET /api/room',
        getOne: 'GET /api/room/:id',
        create: 'POST /api/room',
        update: 'PUT /api/room/:id',
        delete: 'DELETE /api/room/:id',
      },
    },
  });
});

app.listen(PORT, () => {
  console.log(`🚀 Server is running on http://localhost:${PORT}`);
  console.log(`📁 Upload endpoint: POST http://localhost:${PORT}/api/upload`);
  console.log(`💬 Chat endpoint: POST http://localhost:${PORT}/api/chat`);
});

