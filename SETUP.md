# Quick Setup Guide

Follow these steps to get your RAG Chatbot API up and running:

## Step 1: Install Dependencies

```bash
npm install
```

## Step 2: Set Up ChromaDB

### Option A: Using Docker (Recommended)

```bash
docker run -d -p 8000:8000 --name chromadb chromadb/chroma
```

### Option B: Using ChromaDB Cloud

1. Sign up at https://www.trychroma.com/
2. Get your cloud URL
3. Update `.env.local` with your cloud credentials

## Step 3: Configure Environment Variables

Create a `.env.local` file in the root directory:

```env
# Supabase Configuration
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your_anon_key_here
SUPABASE_SERVICE_KEY=your_service_role_key_here

# DeepSeek API Configuration
DEEPSEEK_TOKEN=your_deepseek_token_here
DEEPSEEK_API_URL=https://api.deepseek.com/v1/chat/completions

# Embedding Configuration (Choose one)
# Option 1: Hugging Face (Free, Recommended)
USE_HUGGINGFACE=true
HUGGINGFACE_API_KEY=your_hf_token_here

# Option 2: DeepSeek Embeddings (if available)
# EMBEDDING_API_URL=https://api.deepseek.com/v1/embeddings

# ChromaDB Configuration
CHROMA_HOST=localhost
CHROMA_PORT=8000

# Server Configuration
PORT=3000
```

### Getting API Keys:

1. **Supabase**: 
   - Go to https://supabase.com
   - Create a project
   - Go to Settings > API
   - Copy URL and keys

2. **DeepSeek**:
   - Go to https://platform.deepseek.com
   - Sign up/login
   - Get your API token

3. **Hugging Face** (for embeddings):
   - Go to https://huggingface.co/settings/tokens
   - Create a free token

## Step 4: Set Up Supabase Storage

1. Go to your Supabase project dashboard
2. Navigate to **Storage**
3. Click **New Bucket**
4. Name it: `documents`
5. Set it to **Public** or **Authenticated** based on your needs
6. Save

## Step 5: Build and Run

```bash
# Build TypeScript
npm run build

# Run in development mode (with auto-reload)
npm run dev

# Or run in production mode
npm start
```

## Step 6: Test the API

### Upload a document:
```bash
curl -X POST http://localhost:3000/api/upload \
  -F "file=@/path/to/your/document.pdf"
```

### Ask a question:
```bash
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"question": "What is this document about?", "topK": 3}'
```

## Troubleshooting

### ChromaDB Connection Issues
- Make sure ChromaDB is running: `docker ps`
- Check if port 8000 is available: `netstat -an | grep 8000`
- Try accessing ChromaDB directly: `curl http://localhost:8000/api/v1/heartbeat`

### Supabase Issues
- Verify bucket name is exactly `documents`
- Check that service key has storage permissions
- Ensure bucket policies allow uploads

### Embedding Issues
- If using Hugging Face, make sure `USE_HUGGINGFACE=true`
- The fallback embedding will work but results may be less accurate
- For best results, use Hugging Face embeddings (free)

## Next Steps

- Upload multiple documents to build your knowledge base
- Experiment with different `topK` values in chat queries
- Customize the chunk size in `src/utils/textChunker.ts` if needed

