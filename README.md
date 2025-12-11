# RAG Chatbot API

A Node.js TypeScript API for building a RAG (Retrieval Augmented Generation) chatbot that can answer questions from uploaded PDF and Word documents. The system uses Supabase for file storage, ChromaDB for vector storage, and DeepSeek for generating answers.

## Features

- 📄 **Document Upload**: Upload PDF and Word (.docx) files
- 🗄️ **Supabase Storage**: Files are stored in Supabase storage bucket
- 🔍 **Vector Search**: Documents are chunked and embedded for semantic search
- 💬 **RAG Chatbot**: Ask questions and get answers with source citations
- 📍 **Source Citations**: Answers include file name and line number references

## Prerequisites

- Node.js (v18 or higher)
- npm or yarn
- Supabase account and project
- DeepSeek API token
- ChromaDB (can run locally or use cloud)

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Set Up ChromaDB

You can run ChromaDB locally using Docker:

```bash
docker run -d -p 8000:8000 chromadb/chroma
```

Or use ChromaDB cloud (sign up at https://www.trychroma.com/)

### 3. Configure Environment Variables

Create a `.env.local` file in the root directory:

```env
# Supabase Configuration
SUPABASE_URL=your_supabase_project_url
SUPABASE_KEY=your_supabase_anon_key
SUPABASE_SERVICE_KEY=your_supabase_service_role_key

# DeepSeek API Configuration
DEEPSEEK_TOKEN=your_deepseek_api_token
DEEPSEEK_API_URL=https://api.deepseek.com/v1/chat/completions

# Embedding Configuration (optional)
# Option 1: Use Hugging Face (free, recommended)
USE_HUGGINGFACE=true
HUGGINGFACE_API_KEY=your_huggingface_token  # Get free token at https://huggingface.co/settings/tokens

# Option 2: Use DeepSeek embeddings (if available)
# EMBEDDING_API_URL=https://api.deepseek.com/v1/embeddings

# ChromaDB Configuration (optional - defaults to local)
CHROMA_HOST=localhost
CHROMA_PORT=8000

# Server Configuration
PORT=3000
```

### 4. Set Up Supabase Storage

1. Go to your Supabase project dashboard
2. Navigate to Storage
3. Create a new bucket named `documents`
4. Make sure the bucket is configured for public or authenticated access as needed

### 5. Build and Run

```bash
# Build TypeScript
npm run build

# Run in development mode
npm run dev

# Run in production mode
npm start
```

The API will be available at `http://localhost:3000`

## API Endpoints

### Upload Document

**POST** `/api/upload`

Upload a PDF or Word document for processing.

**Request:**
- Content-Type: `multipart/form-data`
- Body: `file` (PDF or Word document, max 10MB)

**Response:**
```json
{
  "success": true,
  "message": "Successfully uploaded and processed document.pdf",
  "fileName": "document.pdf",
  "chunksCount": 15
}
```

**Example using curl:**
```bash
curl -X POST http://localhost:3000/api/upload \
  -F "file=@/path/to/document.pdf"
```

### Chat with Documents

**POST** `/api/chat`

Ask a question about the uploaded documents.

**Request:**
```json
{
  "question": "What is the main topic discussed in the documents?",
  "topK": 3
}
```

**Response:**
```json
{
  "success": true,
  "answer": "Based on the documents, the main topic is... [File: document.pdf, Line 42]",
  "sources": [
    {
      "fileName": "document.pdf",
      "lineNumber": 42,
      "text": "The main topic discussed here is..."
    }
  ]
}
```

**Example using curl:**
```bash
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"question": "What is discussed in the documents?", "topK": 3}'
```

### Download Document

**GET** `/api/download/:fileName`

Download a file from Supabase storage.

**Example using curl:**
```bash
curl -O http://localhost:3000/api/download/document.pdf
```

### List Documents

**GET** `/api/download`

List all files in the storage bucket.

**Response:**
```json
{
  "success": true,
  "files": [
    {
      "name": "1234567890-document.pdf",
      "size": 102400,
      "createdAt": "2024-01-01T00:00:00Z"
    }
  ]
}
```

### Health Check

**GET** `/health`

Check if the API is running.

**Response:**
```json
{
  "status": "ok",
  "message": "RAG Chatbot API is running"
}
```

## Project Structure

```
├── src/
│   ├── config/
│   │   ├── supabase.ts      # Supabase client configuration
│   │   ├── deepseek.ts      # DeepSeek API client
│   │   └── chroma.ts         # ChromaDB client configuration
│   ├── services/
│   │   ├── uploadService.ts # Document upload and processing logic
│   │   └── chatService.ts   # RAG chat logic
│   ├── utils/
│   │   ├── documentParser.ts # PDF/Word parsing utilities
│   │   ├── textChunker.ts   # Text chunking utilities
│   │   └── embeddings.ts    # Embedding generation
│   ├── routes/
│   │   ├── upload.ts        # Upload endpoint
│   │   └── chat.ts          # Chat endpoint
│   └── index.ts             # Main server file
├── .env.local               # Environment variables (not in git)
├── package.json
├── tsconfig.json
└── README.md
```

## How It Works

1. **Document Upload**:
   - User uploads a PDF or Word document
   - Document is parsed to extract text
   - Text is chunked into smaller pieces
   - Each chunk is embedded into a vector
   - Vectors are stored in ChromaDB with metadata (file name, line number)
   - Original file is uploaded to Supabase storage

2. **Question Answering**:
   - User asks a question
   - Question is embedded into a vector
   - Similar document chunks are retrieved from ChromaDB
   - Relevant context is sent to DeepSeek API
   - DeepSeek generates an answer with source citations
   - Response includes answer and source references

## Notes on Embeddings

DeepSeek may not have a dedicated embeddings API. The code includes a fallback embedding function, but for better results, consider:

1. Using OpenAI's embeddings API (if you have access)
2. Using Hugging Face's inference API for embeddings
3. Using a local embedding model
4. Using Supabase's pgvector extension

To use a different embedding service, modify `src/utils/embeddings.ts`.

## Troubleshooting

### ChromaDB Connection Issues
- Make sure ChromaDB is running: `docker ps` should show the container
- Check `CHROMA_HOST` and `CHROMA_PORT` in `.env.local`

### Supabase Upload Issues
- Verify bucket name is `documents`
- Check that `SUPABASE_SERVICE_KEY` has storage permissions
- Ensure bucket policies allow uploads

### DeepSeek API Issues
- Verify `DEEPSEEK_TOKEN` is correct
- Check API rate limits
- Ensure network connectivity

## License

MIT

