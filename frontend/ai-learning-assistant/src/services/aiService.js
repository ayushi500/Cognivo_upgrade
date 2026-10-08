import axiosInstance from "../utils/axiosInstance";
import { API_PATHS, BASE_URL } from "../utils/apiPaths";

const generateFlashcards=async (documentId,options)=>{
    try{
        const response=await axiosInstance.post(API_PATHS.AI.GENERATE_FLASHCARDS,{documentId,...options})
        return response.data;
    }catch(error){
        throw error.response?.data || {message:"Failed to generate flashcards"}
    }
}

const generateQuiz=async (documentId,options)=>{
    try{
        const response=await axiosInstance.post(API_PATHS.AI.GENERATE_QUIZ,{documentId,...options})
        return response.data;
    }catch(error){
        throw error.response?.data || {message:"Failed to generate quiz"}
    }
}

const generateSummary=async (documentId)=>{
    try{
        const response=await axiosInstance.post(API_PATHS.AI.GENERATE_SUMMARY,{documentId})
        return response.data?.data;
    }catch(error){
        throw error.response?.data || {message:"Failed to generate summary"}
    }
}

const chat=async (documentId,message)=>{
    try{
        const response=await axiosInstance.post(API_PATHS.AI.CHAT,{documentId , question:message})
        return response.data;
    }catch(error){
        throw error.response?.data || {message:"Chat request failed"}
    }
}

// Streaming chat (Server-Sent Events over fetch, because EventSource cannot POST / send headers).
// handlers: { onStatus(text), onToken(text), onDone(data), onError(message) }
const chatStream=async (documentId,message,handlers={},signal)=>{
    const token=localStorage.getItem("token");
    const response=await fetch(`${BASE_URL}${API_PATHS.AI.CHAT_STREAM}`,{
        method:"POST",
        headers:{
            "Content-Type":"application/json",
            Accept:"text/event-stream",
            ...(token?{Authorization:`Bearer ${token}`}:{})
        },
        body:JSON.stringify({documentId,question:message}),
        signal
    })

    if(!response.ok || !response.body){
        let error=null
        try{ error=await response.json() }catch{ /* ignore */ }
        throw error || {message:"Chat request failed"}
    }

    const reader=response.body.getReader()
    const decoder=new TextDecoder()
    let buffer=""

    const dispatch=(raw)=>{
        let event="message"
        let data=""
        for(const line of raw.split("\n")){
            if(line.startsWith("event:")) event=line.slice(6).trim()
            else if(line.startsWith("data:")) data+=line.slice(5).trim()
        }
        if(!data) return
        let payload
        try{ payload=JSON.parse(data) }catch{ return }
        if(event==="status") handlers.onStatus?.(payload.text)
        else if(event==="token") handlers.onToken?.(payload.text)
        else if(event==="done") handlers.onDone?.(payload)
        else if(event==="error") handlers.onError?.(payload.message)
    }

    for(;;){
        const {value,done}=await reader.read()
        if(done) break
        buffer+=decoder.decode(value,{stream:true}).replace(/\r\n/g,"\n")
        let idx
        while((idx=buffer.indexOf("\n\n"))!==-1){
            dispatch(buffer.slice(0,idx))
            buffer=buffer.slice(idx+2)
        }
    }
}



const explainConcept=async (documentId,concept)=>{
    try{
        const response=await axiosInstance.post(API_PATHS.AI.EXPLAIN_CONCEPT,{documentId , concept})
        return response.data?.data;
    }catch(error){
        throw error.response?.data || {message:"Failed to explain concept"}
    }
}

const getChatHistory=async (documentId)=>{
    try{
        const response=await axiosInstance.get(API_PATHS.AI.GET_CHAT_HISTORY(documentId))   //GET request me documentId URL me pass kiya     No body required
        return response.data;
    }catch(error){
        throw error.response?.data || {message:"Failed to fetch chat history"}
    }
}

const aiService={
    generateFlashcards,
    generateQuiz,
    generateSummary,
    chat,
    chatStream,
  
    explainConcept,
    getChatHistory
}

export default aiService




/**
 * 🔹 Why options Are Required

1️⃣ Customize flashcard generation
Server ko bas documentId milna kaafi nahi hai.
Options allow karte hain ki:

options = {
    numberOfCards: 10,       // kitne flashcards chahiye
    difficulty: "medium",    // easy, medium, hard
    includeSummary: true,    // summary ke saath flashcards
    language: "en"           // English / Hindi
}

Backend ye options use karke AI model ko instructions deta hai.
 */

//************************************************************
 /**response.data?.data
  * 
   response = {
  data: { … },      // ← backend ka response JSON   i.e.response.data = backend se jo JSON aaya
  status: 200,
  statusText: "OK",
  headers: { … },
  config: { … }
}

2️⃣ Backend Response Example
Suppose backend summary generate karta hai:
return res.json({
  success: true,
  message: "Summary generated",
  data: {
    summary: "This is the generated summary..."
  }
});

response.data?.data   optional chaining

Agar response.data undefined hua (server ne kuch galat bheja)
To error throw hone ki bajay undefined return hoga
Safe programming ka tareeka hai

  */