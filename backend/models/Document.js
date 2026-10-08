import mongoose from "mongoose";

const documentSchema=new mongoose.Schema({
    userId:{
        type:mongoose.Schema.Types.ObjectId,
        ref:"User",
        required:true
    },
    title:{
        type:String,
        required:[true,"PLease provide a document Title"],
        trim:true
    },
    fileName:{
        type:String,
        required:true
    },
    filePath:{
        type:String,
        required:true
    },
    fileSize:{
        type:Number,
        required:true
    },
    extractedText:{
        type:String,
        default:''
    },
    ocrPages:{
        type:[Number],
        default:[]
    },
    chunks:[{
        content:{
            type:String,
            required:true
        },
        heading:{
            type:String,
            default:''
        },
        pageNumber:{
            type:Number,
            default:0
        },
        chunkIndex:{
            type:Number,
            required:true
        },
         embedding:{                 // <-- NEW
            type:[Number],           // <-- NEW  (768 floats from Gemini)
            default:[]                // <-- NEW
        }  
    }],
    uploadDate:{
        type:Date,
        default:Date.now()
    },
    lastAccessed:{
        type:Date,
        default:Date.now
    },
    status:{
        type:String,
        enum:['processing','ready','failed'],
        default:"processing"
    }
},{
    timestamps:true
})

//Index for faster queries
documentSchema.index({userId:1 , uploadDate:-1})
// First filter by user
// Then sort by latest uploaded document
// This makes:
// ✔ fetching user documents fast
// ✔ showing recent documents fast


const Document=mongoose.model('Document',documentSchema)

export default Document


// Chunks in your AI Learning Assistant app
// 🔹 Why you NEED chunks

// PDFs and documents can be:

// Very long

// Too big for AI models

// Heavy for memory

// So you split the text into chunks.