import Document from '../models/Document.js'
import DocumentChunk from "../models/DocumentChunk.js";
import Flashcard from '../models/Flashcard.js'
import Quiz from '../models/Quiz.js'
import { extractTextFromPDF } from '../utils/pdfParser.js'
import { chunkPages } from '../utils/textChunker.js'
import fs from 'fs/promises'
import mongoose from 'mongoose'
import { embedChunks } from '../utils/embeddingService.js'
import { clearChunkCache } from '../utils/ai/retrieval.js'

//here we use fs promises,so that we dont need to use callback
/**
 * Normal fs uses callbacks
"fs/promises" gives Promise-based API
Works smoothly with async/await
 */

//desc upload pdf document
//route POST /api/documents/upload
//access Private
export const uploadDocument=async (req,res,next)=>{
    try {
        if(!req.file){
            return res.status(400).json({
                success:false,
                error:"Please upload a PDF file",
                statusCode:400
            })
        }

        const { title }=req.body;

        if(!title){
            //Delete uploaded file if no title provided
            await fs.unlink(req.file.path);
            return res.status(400).json({
                success:false,
                error:"Please provide a document title",
                statusCode:400
            })
        }

        //construct the URL for the uploaded file
        const baseUrl=`http://localhost:${process.env.PORT || 8000}`;
        const fileUrl=`${baseUrl}/uploads/documents/${req.file.filename}`

        //cretae a document record
        const document=await Document.create({
            userId:req.user._id,
            title,
            fileName:req.file.originalname,
            filePath:fileUrl, //store the url instead of local path
            fileSize:req.file.size,
            status:'processing'
        })

        //process a pdf in background(in production,use a queue like Bull)
        processPDF(document._id,req.file.path).catch(err=>{
            console.error('PDF processing error',err)
        })

        res.status(201).json({
            success:true,
            data:document,
            message:'Document uploaded successfully.Processing in progress...'
        })
    }catch(error){
        //clean up the file on error
        if(req.file){
            await fs.unlink(req.file.path).catch(()=>{})               //If path refers to a symbolic link, then the link is removed without affecting the file or directory to which that link refers,req.file.path=url
        }
        next(error)
    }
}

//Helper function to process pdf
// extract text (+OCR for scanned pages) -> heading-aware chunks -> batch embeddings -> MongoDB
const processPDF=async (documentId,filePath)=>{
    try{

        const document = await Document.findById(documentId);

        if (!document) {
            throw new Error("Document not found");
        }

        const { text, pages, ocrPages } = await extractTextFromPDF(filePath);

        if (!text || text.trim().length < 20) {
            throw new Error("No readable text found in this PDF (even after OCR)");
        }

        // Semantic, page-aware chunks (headings kept, sentences never cut in half)
        const rawChunks = chunkPages(pages);
        if (!rawChunks.length) {
            throw new Error("Could not create chunks from this PDF");
        }

        // Batched embeddings (16 chunks per API call)
        const chunks = await embedChunks(rawChunks, {
            onProgress: (done, total) => console.log(`Embedding chunks ${done}/${total}`),
        });

        // Re-processing safety: remove old chunks of this document first
        await DocumentChunk.deleteMany({ documentId: document._id });
        clearChunkCache(document._id);

        await DocumentChunk.insertMany(
            chunks.map((chunk) => ({
                documentId: document._id,
                userId: document.userId,
                content: chunk.content,
                heading: chunk.heading || "",
                pageNumber: chunk.pageNumber,
                chunkIndex: chunk.chunkIndex,
                embedding: chunk.embedding,
            }))
        );

        console.log(`${chunks.length} chunks saved to DocumentChunk (OCR pages: ${ocrPages.length})`);

        //Update document (vectors live in DocumentChunk, so they are not duplicated here)
        await Document.findByIdAndUpdate(documentId,{
            extractedText:text,
            ocrPages,
            chunks:rawChunks,
            status:'ready'
        })

        console.log(`Document ${documentId} processesd successfully`)

    }catch(error){
        console.error(`Error processing document ${documentId}:`,error)

        await Document.findByIdAndUpdate(documentId,{
            status:'failed'
        })
    }
}

// Everything else in this file (uploadDocument, getDocuments, getDocument,
// deleteDocument) stays exactly the same.
 



//desc get all user documents
//route GET /api/documents
//access Private
export const getDocuments=async(req,res,next)=>{
try {
   const documents=await Document.aggregate([
    {
    $match:{userId: new mongoose.Types.ObjectId(req.user._id)}
    },
    {
        $lookup:{
            from:'flashcards',
            localField:'_id',
            foreignField:'documentId',
            as:'flashcardSets'
        }
    },
    {
        $lookup:{
            from:'quizzes',
            localField:'_id',
            foreignField:'documentId',
            as:'quizzes'
        }
    },
    {
       $addFields:{
        flashcardCount:{ $size:'$flashcardSets'},
        quizCount:{$size:'$quizzes'}
       }
    },
    {
        $project:{
            extractedText:0,
            chunks:0,
            flashcardSets:0,
            quizzes:0
        }
        
    },
    {
       $sort:{ uploadDate:-1}
    }
   ]);

    res.status(200).json({
        success:true,
        count:documents.length,
        data:documents
    })

    }catch(error){
        next(error)
    }
}

//desc get single document with chunks
//route GET /api/documents/:id
//access Private


export const getDocument=async(req,res,next)=>{
try {
     const document=await Document.findOne({
        _id:req.params.id,
        userId:req.user._id     //Give me the document whose _id equals this URL id AND whose userId equals the currently logged-in user’s id.”
     })

     if(!document){
        return res.status(404).json({
            success:false,
            error:"Document not found",
            statusCode:404
        })
     }
        // Get counts of associated flashCards and quizzes with the document
        const flashcardCount=await Flashcard.countDocuments({documentId:document._id,userId:req.user._id})
        const quizCount=await Quiz.countDocuments({documentId:document._id,userId:req.user._id})

    //Update last Accessed
    document.lastAccessed=Date.now();
    await document.save();

    //combine document data with counts
    const documentData=document.toObject();
    documentData.flashcardCount=flashcardCount;
    documentData.quizCount=quizCount;

    res.status(200).json({
        success:true,
        data:documentData
    })

    }catch(error){
        next(error)
    }
}

//desc delete single document with chunks
//route DELETE /api/documents/:id
//access Private
export const deleteDocument=async(req,res,next)=>{
try {
    const document=await Document.findOne({
        _id:req.params.id,
        userId:req.user._id
    })

    if(!document){
        return res.status(404).json({
            success:false,
            error:'Document not found',
            statusCode:404
        })
    }

    //Delete file from filesystem
    await fs.unlink(document.filePath).catch(()=>{})
    
    //delete document + its vector chunks
    await DocumentChunk.deleteMany({ documentId: document._id });
    clearChunkCache(document._id);
    await document.deleteOne();

    res.status(200).json({
        success:true,
        message:'Document deleted successfully'
    })

    }catch(error){
        next(error)
    }
}
