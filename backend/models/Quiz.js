import mongoose from 'mongoose'

const quizSchema=new mongoose.Schema({
    userId:{
        type:mongoose.Schema.Types.ObjectId,
        ref:'User',
        required:true
    },
    documentId:{
        type:mongoose.Schema.Types.ObjectId,
        ref:"Document",  //as the documentId coming from the documents only
        required:true
    },
    title:{
        type:String,
        required:true,
        trim:true
    },
    questions:[{
        question:{
            type:String,
            required:true
        },
   
    options:{
        type:[String],
        required:true,
        validate:[array=> array.length===4,"Must have exactly 4 options"]
    },
    correctAnswer:{
        type:String,
        required:true,
    },
    explanation:{
        type:String,
        default:''
    },
    difficulty:{
        type:String,
        enum:['easy','medium','hard'],
        default:'medium'
    }
     }],
     userAnswers:[{
        questionIndex:{
            type:Number,
            required:true
        },
        selectedAnswer:{
            type:String,
            required:true
        },
        isCorrect:{
            type:Boolean,
            required:true
        },
        answeredAt:{
            type:Date,
            default:Date.now
        }
     }],
     score:{
        type:Number,
        default:0
     },
     totalQuestions:{
        type:Number,
        required:true
     },
     completedAt:{
        type:Date,
        default:null
     }
     },{
        timestamps:true
     }
)
//quiz generated only when user is present and the document is present
//Index for faster queries
quizSchema.index({userId:1,documentId:1});  //It is the optimisation for =>Quiz.find({ userId, documentId })
const Quiz=mongoose.model('Quiz',quizSchema)
export default Quiz

// An index is mainly used for optimization / performance improvement.

// 🧠 Why?

// Without an index:

// MongoDB must scan every document in the collection

// This is slow (called collection scan)

// With an index:

// MongoDB directly jumps to matching records

// Much faster (called index scan)

// ⚡ Real-Life Example

// Like a book:

// Without index → read every page to find a topic ❌
// With index → go to index page → directly jump to page ✔

// quizSchema.index({ userId: 1, documentId: 1 });
// It means:
// 1️⃣ MongoDB first searches by userId
// → “Find all quizzes belonging to this user”

// 2️⃣ Then inside that user’s data, it narrows to documentId
// → “From those quizzes, find the one related to this document”

// 🧠 Why this order is useful?
// Because:

// One user can create multiple documents

// Each document can have its own quiz

// We frequently query like: