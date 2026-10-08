# 🤖 AI Learning Assistant

An AI-powered learning platform that allows users to upload PDF documents and interact with them through **document-grounded question answering, summaries, quizzes, and flashcards**.

The project implements a **Hybrid RAG (Retrieval-Augmented Generation) pipeline** combining semantic vector search, keyword search, Reciprocal Rank Fusion (RRF), and LLM-based reranking to improve the relevance of retrieved information.

---

## 🚀 Features

* 📄 Upload and process PDF documents
* 🔍 Document-grounded AI question answering
* 🧠 Semantic chunking with page and heading information
* 🖼️ OCR support for scanned/image-based PDF pages
* 🔢 Gemini-based text embeddings
* 🔎 MongoDB Atlas Vector Search
* 🔤 BM25 keyword-based retrieval
* 🔀 Hybrid retrieval using RRF
* 🎯 LLM-based reranking of retrieved chunks
* 🔄 Query rewriting for better retrieval of follow-up questions
* ⚡ Redis-based response caching
* 📡 Server-Sent Events (SSE) for streaming AI responses
* 📝 AI-generated summaries, flashcards, and quizzes
* ✅ Zod-based structured output validation
* 🔐 JWT-based authentication and protected document access
* 🧪 Unit and integration tests for core RAG components

---

## 🏗️ RAG Architecture

```text
                 User Question
                       │
                       ▼
              Query Preprocessing
                       │
                       ▼
                Query Rewriting
                       │
                       ▼
              ┌─────────────────┐
              │  Hybrid Search  │
              └─────────────────┘
                 │           │
                 ▼           ▼
          Vector Search    BM25 Search
                 │           │
                 └─────┬─────┘
                       ▼
                      RRF
                       │
                       ▼
                Candidate Chunks
                       │
                       ▼
                LLM Reranking
                       │
                       ▼
              Top Relevant Chunks
                       │
                       ▼
                  Gemini LLM
                       │
                       ▼
             Grounded AI Response
```

---

## 📚 Document Processing Pipeline

When a PDF is uploaded:

```text
PDF Upload
    ↓
PDF Text Extraction
    ↓
Scanned Page Detection
    ↓
OCR for Image-Based Pages
    ↓
Page / Heading / Sentence Aware Chunking
    ↓
Generate Embeddings
    ↓
Store Chunks + Embeddings
    ↓
Ready for Retrieval
```

Each chunk maintains metadata such as:

* Document ID
* User ID
* Page number
* Chunk index
* Heading
* Text content
* Embedding vector

This allows the system to retrieve relevant content while preserving document context.

---

## 🔍 Hybrid Retrieval

Instead of depending only on semantic search, the project combines two retrieval strategies.

### 1. Semantic Search

The user's query is converted into an embedding and compared against document chunk embeddings using vector similarity.

This helps retrieve conceptually similar content even when the exact words are different.

### 2. BM25 Search

BM25 performs lexical/keyword-based retrieval.

This is useful when the user asks about:

* exact technical terms
* names
* numbers
* formulas
* specific keywords

### 3. Reciprocal Rank Fusion

Results from vector search and BM25 are combined using **Reciprocal Rank Fusion (RRF)**.

This gives the system a better balance between:

```text
Semantic relevance + Keyword relevance
```

---

## 🎯 LLM Reranking

After hybrid retrieval, the system obtains a candidate set of relevant chunks.

Instead of directly sending all candidates to the LLM, the candidates are passed through an additional reranking step.

The LLM evaluates how relevant each chunk is to the user's query and selects the strongest candidates.

```text
Hybrid Retrieval
       ↓
Candidate Chunks
       ↓
LLM Reranking
       ↓
Top-K Chunks
       ↓
Final Answer
```

This reduces irrelevant context being passed to the generation model.

---

## 🔄 Query Rewriting

The system can rewrite user questions before retrieval.

This is particularly useful for follow-up questions.

For example:

```text
User:
"What is overfitting?"

User:
"How can we prevent it?"
```

The second question may be rewritten into a more complete retrieval query:

```text
"How can overfitting be prevented in machine learning?"
```

This improves retrieval when the user's latest question depends on previous conversation context.

---

## ⚡ Redis Caching

Frequently repeated questions can be served from Redis instead of executing the complete retrieval and generation pipeline again.

Conceptually:

```text
Question
   ↓
Generate Cache Key
   ↓
Redis
 ┌───────┴───────┐
 │               │
Hit             Miss
 │               │
 ▼               ▼
Response      RAG Pipeline
                 │
                 ▼
              Redis
```

The cache key is scoped using information such as the user, document, and normalized question.

---

## 📡 Streaming Responses

The chat API uses **Server-Sent Events (SSE)** to stream responses from the backend to the frontend.

Instead of waiting for the complete answer:

```text
Request
   ↓
Backend
   ↓
LLM Generation
   ↓
token → token → token → token
   ↓
Frontend
```

This provides a more responsive chat experience.

---

## 🧠 Structured AI Output

For features such as quizzes and flashcards, the LLM output is validated using **Zod schemas**.

For example, a quiz question can require:

```text
question
options[]
correctOptionIndex
explanation
difficulty
```

The application validates the generated structure before storing it.

This prevents malformed LLM responses from directly entering the database.

---

## 🔐 Security

The application uses:

* JWT authentication
* Password hashing with bcrypt
* Protected API routes
* User-specific document access
* Document-level filtering during retrieval

Retrieval is restricted using the authenticated user's identity and requested document.

---

## 🛠️ Tech Stack

### Frontend

* React
* Tailwind CSS
* Axios
* React Markdown
* Lucide React

### Backend

* Node.js
* Express.js
* MongoDB
* Mongoose
* Redis

### AI / RAG

* Google Gemini
* Gemini Embeddings
* MongoDB Atlas Vector Search
* BM25
* Reciprocal Rank Fusion
* LLM Reranking
* OCR

---

## 📁 High-Level Architecture

```text
Frontend
   │
   │ HTTP / SSE
   ▼
Express Backend
   │
   ├── Authentication
   │
   ├── Document Processing
   │       ├── PDF Parser
   │       ├── OCR
   │       ├── Chunking
   │       └── Embeddings
   │
   ├── Retrieval
   │       ├── Vector Search
   │       ├── BM25
   │       ├── RRF
   │       └── Reranking
   │
   ├── AI Generation
   │       ├── Q&A
   │       ├── Summaries
   │       ├── Quizzes
   │       └── Flashcards
   │
   └── Redis Cache

        │
        ├── MongoDB
        ├── MongoDB Atlas Vector Search
        └── Redis
```

---

## 🎯 Why Hybrid RAG?

A pure vector search system can sometimes struggle with exact terms, identifiers, formulas, or uncommon keywords.

A pure keyword search system can struggle when the user expresses the same concept using different wording.

Therefore, this project combines:

```text
Vector Search → semantic understanding
BM25          → exact keyword matching
RRF           → combine rankings
Reranking     → select the most relevant context
```

This creates a more robust retrieval pipeline than relying on a single retrieval method.

---

## 🧪 Testing

The project includes tests for important components such as:

* Text chunking
* BM25 retrieval
* RRF ranking
* Structured LLM output
* Retrieval
* Streaming
* Reranking
* LangChain retriever components

---

## 🔮 Future Improvements

* Automated RAG evaluation dataset
* Recall@K / Precision@K / MRR evaluation
* Better citation verification
* Background document-processing workers
* Distributed caching
* Scalable lexical search
* Improved document-level observability
* Retrieval and generation latency monitoring

---

## 💡 Key Learning

This project helped me understand how a production-oriented RAG system is built beyond simply sending a PDF to an LLM.

The main focus was on:

**document processing → retrieval quality → context selection → grounded generation → caching → streaming → structured AI output.**
