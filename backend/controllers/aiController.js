import { getCache, setCache } from "../utils/cache.js";
import { createChatCacheKey } from "../utils/cacheKey.js";
import Document from '../models/Document.js'
import Flashcard from '../models/Flashcard.js'
import Quiz from '../models/Quiz.js'
import ChatHistory from '../models/ChatHistory.js'
import * as geminiService from '../utils/geminiService.js'
import { findRelevantChunks } from '../utils/vectorSearch.js'
import { runRagPipeline } from '../utils/ai/pipeline.js'


//desc  Generate flashCards from document
//route POST /api/ai/generate-flashcards
// access Private
export const generateFlashcards=async(req,res,next)=>{
    try {
         const { documentId, count=10 }=req.body;

         if(!documentId){
            return res.status(400).json({
                success:false,
                error:'Please provide documentId',
                statusCode:400
            })
         }

         const document=await Document.findOne({
            _id:documentId,
            userId:req.user._id,
            status:'ready'
         })

         if(!document){
            return res.status(404).json({
                success:false,
                error:'Document not found or not ready',
                statusCode:404
            })
         }

         //Generate flashcards using Gemini
         const cards=await geminiService.generateFlashcards(
            document.extractedText,
            parseInt(count)
         )
         
         //save to database
         const flashcardSet=await Flashcard.create({
            userId:req.user._id,
            documentId:document._id,
            cards:cards.map(card =>({
                question:card.question,
                answer:card.answer,
                difficulty:card.difficulty,
                reviewCount:0,
                isStarred:false,
            })

            )
         })
         res.status(201).json({
            success:true,
            data:flashcardSet,
            message:'Flashcards generated successfully'
         })
    } catch(error){
        next(error)
    }
}

//desc  Generate quiz from document
//route POST /api/ai/generate-quiz
// access Private
export const generateQuiz=async(req,res,next)=>{
    try {
      const {documentId,numQuestions=5,title }=req.body

      if(!documentId){
        return res.status(400).json({
            success:false,
            error:'Please provide documentId',
            statusCode:400
        })
      }

      const document=await Document.findOne({
        _id:documentId,
        userId:req.user._id,
        status:'ready'
      })

      if(!document){
        return res.status(404).json({
            success:false,
            error:'Document not found or not ready',
            statusCode:404,
        })
      }

    //Generate quiz using Gemini
    const questions=await geminiService.generateQuiz(
        document.extractedText,
        parseInt(numQuestions)
    )

    //save to database
    const quiz=await Quiz.create({
        userId:req.user._id,
        documentId:document._id,
        title:title || `${document.title}-Quiz`,
        questions:questions,
        totalQuestions:questions.length,
        userAnswers:[],
        score:0
    })
    res.status(201).json({
        success:true,
        data:quiz,
        message:'Quiz generated successfully'
    })

    } catch(error){
        next(error)
    }
}

//desc  Generate document summary
//route POST /api/ai/generate-summary
//access Private
export const generateSummary=async(req,res,next)=>{
    try {
       const { documentId }=req.body;
       
       if(!documentId){
       return res.status(400).json({
        success:false,
        error:"Please provide a documentID",
        statusCode:400,
       })
       }

       const document=await Document.findOne({
        _id:documentId,
        userId:req.user._id,
        status:'ready'
       })

       if(!document){
        return res.status(404).json({
            success:false,
            error:"Document not found or not ready",
            statusCode:404
        })
       }

       //Generate summary using Gemini
       const summary=await geminiService.generateSummary(document.extractedText)

       res.status(200).json({
        success:true,
        data:{
            documentId:document._id,
            title:document.title,
            summary
        },
        message:"Summary generated successfully"
       })
    } catch(error){
        next(error)
    }
}

// ---------------------------------------------------------------------------
// helpers shared by /chat (JSON) and /chat/stream (SSE)
// ---------------------------------------------------------------------------
const loadChatContext = async (req, res) => {
  const { documentId, question } = req.body;

  if (!documentId || !question || !String(question).trim()) {
    res.status(400).json({
      success: false,
      error: "Please provide a documentID and question",
      statusCode: 400,
    });
    return null;
  }

  const document = await Document.findOne({
    _id: documentId,
    userId: req.user._id,
    status: "ready",
  });

  if (!document) {
    res.status(404).json({
      success: false,
      error: "Document not found or not ready",
      statusCode: 404,
    });
    return null;
  }

  let chatHistory = await ChatHistory.findOne({ userId: req.user._id, documentId: document._id });
  if (!chatHistory) {
    chatHistory = await ChatHistory.create({ userId: req.user._id, documentId: document._id, messages: [] });
  }

  return { document, chatHistory, question: String(question).trim() };
};

// Redis cache is only used for standalone (non follow-up) questions
const makeCacheLookup = (req, documentId, question) => async ({ isFollowUp }) => {
  if (isFollowUp) return null;
  const cacheKey = createChatCacheKey(req.user._id.toString(), documentId.toString(), question);
  const cached = await getCache(cacheKey);
  if (cached) console.log("Redis Cache HIT");
  return cached ? { answer: cached.answer, sources: cached.sources || [], chunks: [], cachedData: cached } : null;
};

const saveConversation = async (chatHistory, question, result) => {
  const chunkIndices = (result.chunks || []).map((c) => c.chunkIndex);
  chatHistory.messages.push(
    { role: "user", content: question, timestamp: new Date(), relevantChunks: [] },
    { role: "assistant", content: result.answer, timestamp: new Date(), relevantChunks: chunkIndices }
  );
  await chatHistory.save();
  return chunkIndices;
};

const buildResponseData = (question, result, chunkIndices, chatHistory) => ({
  question,
  answer: result.answer,
  relevantChunks: result.fromCache ? result.cachedData?.relevantChunks || [] : chunkIndices,
  sources: result.sources,
  chatHistoryId: chatHistory._id,
});

const cacheResult = async (req, documentId, question, result, data) => {
  if (result.isFollowUp || result.fromCache) return;
  const cacheKey = createChatCacheKey(req.user._id.toString(), documentId.toString(), question);
  await setCache(cacheKey, data, 1800);
};

//desc  Chat with document (normal JSON response)
//route POST /api/ai/chat
// access Private
export const chat = async (req, res, next) => {
  try {
    const ctx = await loadChatContext(req, res);
    if (!ctx) return;
    const { document, chatHistory, question } = ctx;

    const result = await runRagPipeline({
      question,
      history: chatHistory.messages.slice(-6),
      documentId: document._id,
      userId: req.user._id,
      cacheLookup: makeCacheLookup(req, document._id, question),
    });

    const chunkIndices = await saveConversation(chatHistory, question, result);
    const data = buildResponseData(question, result, chunkIndices, chatHistory);
    await cacheResult(req, document._id, question, result, data);

    res.status(200).json({
      success: true,
      data,
      message: result.fromCache ? "Response retrieved from cache" : "Response generated Successfully",
    });
  } catch (error) {
    next(error);
  }
};

//desc  Chat with document - streamed token by token (Server-Sent Events)
//route POST /api/ai/chat/stream
// access Private
// Events: status | token | done | error
export const chatStream = async (req, res, next) => {
  let ctx;
  try {
    ctx = await loadChatContext(req, res);
  } catch (error) {
    return next(error);
  }
  if (!ctx) return;
  const { document, chatHistory, question } = ctx;

  res.status(200).set({
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders();

  const send = (event, data) => {
    if (!res.writableEnded) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };
  const heartbeat = setInterval(() => !res.writableEnded && res.write(": ping\n\n"), 15000);

  const abort = new AbortController();
  res.on("close", () => {
    clearInterval(heartbeat);
    if (!res.writableEnded) abort.abort(); // user pressed Stop / closed the tab
  });

  try {
    const result = await runRagPipeline({
      question,
      history: chatHistory.messages.slice(-6),
      documentId: document._id,
      userId: req.user._id,
      signal: abort.signal,
      onStatus: (text) => send("status", { text }),
      onToken: (text) => send("token", { text }),
      cacheLookup: async (info) => {
        const hit = await makeCacheLookup(req, document._id, question)(info);
        if (hit) {
          send("status", { text: "Found a saved answer…" });
          send("token", { text: hit.answer });
        }
        return hit;
      },
    });

    if (abort.signal.aborted) return res.end();

    const chunkIndices = await saveConversation(chatHistory, question, result);
    const data = buildResponseData(question, result, chunkIndices, chatHistory);
    await cacheResult(req, document._id, question, result, data);

    send("done", { ...data, cached: Boolean(result.fromCache) });
    clearInterval(heartbeat);
    res.end();
  } catch (error) {
    console.error("Chat stream error:", error);
    send("error", { message: "Sorry, I could not generate an answer. Please try again." });
    clearInterval(heartbeat);
    res.end();
  }
};


//desc  Generate concept from document
//route POST /api/ai/explain-concept
// access Private
export const explainConcept=async(req,res,next)=>{
    try {

        const { documentId , concept }=req.body;
       
       if(!documentId || !concept){
       return res.status(400).json({
        success:false,
        error:"Please provide a documentID and question",
        statusCode:400,
       })
       }

       const document=await Document.findOne({
        _id:documentId,
        userId:req.user._id,
        status:'ready'
       })

       if(!document){
        return res.status(404).json({
            success:false,
            error:"Document not found or not ready",
            statusCode:404
        })
    }

    //find relevant chunks for the concept
    const relevantChunks = await findRelevantChunks(
        concept,
        document._id,
        req.user._id,
        3
    );
    const context=relevantChunks.map(c=>c.content).join('\n\n')

    //generate explanantion using Gemini
    const explanation=await geminiService.explainConcept(concept,context);

    res.status(200).json({
        success:true,
        data:{
            concept,
            explanation,
            relevantChunks:relevantChunks.map(c=>c.chunkIndex)
        },
        message:"Explanation generated successfully"
    })
    
 } catch(error){
        next(error)
    }
}

//desc  Get chatHistory for a document
//route GET /api/ai/generate-flashhcards
// access Private
export const getChatHistory=async(req,res,next)=>{
    try {

        const {documentId }=req.params;

        if(!documentId){
            return res.status(400).json({
                success:false,
                error:"Please provide documentId",
                statusCode:400,
            })
        }

        const chatHistory=await ChatHistory.findOne({
            userId:req.user._id,
            documentId:documentId
        }).select('messages')  //only retrieve the messages array

        if(!chatHistory){
            return res.status(200).json({
                success:true,
                data:[],
                message:'No chat history found for this document'
            })
        }

        res.status(200).json({
            success:true,
            data:chatHistory.messages,
            message:'Chat history retrieved successfully'
        })
    } catch(error){
        next(error)
    }
}