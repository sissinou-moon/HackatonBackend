# Test script for RAG Chatbot API

Write-Host "Testing RAG Chatbot API..." -ForegroundColor Cyan
Write-Host ""

# Test Health Endpoint
Write-Host "1. Testing Health Endpoint..." -ForegroundColor Yellow
try {
    $healthResponse = Invoke-WebRequest -Uri "http://localhost:3000/health" -UseBasicParsing -ErrorAction Stop
    Write-Host "✓ Health check passed!" -ForegroundColor Green
    Write-Host "Response: $($healthResponse.Content)" -ForegroundColor Gray
} catch {
    Write-Host "✗ Health check failed: $_" -ForegroundColor Red
    Write-Host "Make sure the server is running on port 3000" -ForegroundColor Yellow
    exit 1
}

Write-Host ""

# Test Root Endpoint
Write-Host "2. Testing Root Endpoint..." -ForegroundColor Yellow
try {
    $rootResponse = Invoke-WebRequest -Uri "http://localhost:3000/" -UseBasicParsing -ErrorAction Stop
    Write-Host "✓ Root endpoint works!" -ForegroundColor Green
    $rootJson = $rootResponse.Content | ConvertFrom-Json
    Write-Host "Available endpoints:" -ForegroundColor Gray
    $rootJson.endpoints.PSObject.Properties | ForEach-Object {
        Write-Host "  - $($_.Name): $($_.Value)" -ForegroundColor Gray
    }
} catch {
    Write-Host "✗ Root endpoint failed: $_" -ForegroundColor Red
}

Write-Host ""

# Test List Files Endpoint
Write-Host "3. Testing List Files Endpoint..." -ForegroundColor Yellow
try {
    $listResponse = Invoke-WebRequest -Uri "http://localhost:3000/api/download" -UseBasicParsing -ErrorAction Stop
    Write-Host "✓ List files endpoint works!" -ForegroundColor Green
    $listJson = $listResponse.Content | ConvertFrom-Json
    Write-Host "Files in storage: $($listJson.files.Count)" -ForegroundColor Gray
} catch {
    Write-Host "✗ List files endpoint failed: $_" -ForegroundColor Red
    Write-Host "This might be expected if Supabase is not configured" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "API Testing Complete!" -ForegroundColor Cyan
Write-Host ""
Write-Host "To test file upload, use:" -ForegroundColor Yellow
Write-Host '  curl -X POST http://localhost:3000/api/upload -F "file=@path/to/document.pdf"' -ForegroundColor Gray
Write-Host ""
Write-Host "To test chat, use:" -ForegroundColor Yellow
$chatExample = 'curl -X POST http://localhost:3000/api/chat -H "Content-Type: application/json" -d ''{"question": "What is this about?", "topK": 3}'''
Write-Host "  $chatExample" -ForegroundColor Gray

