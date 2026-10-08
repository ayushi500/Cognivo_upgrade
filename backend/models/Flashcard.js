import mongoose from "mongoose";

const flashCardSchema=new mongoose.Schema({
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
    cards:[
        {
            question:{type:String,required:true},
            answer:{type:String,required:true},
            difficulty:{
                type:String,
                enum:["easy","medium","hard"],
                default:"medium",
            },
            lastReviewed:{
                type:Date,
                default:null,
            },
            reviewCount:{
                type:Number,
                default:0,
            },
            isStarred:{
                type:Boolean,
                default:false,
            }
        }
    ]

    
},{
    timestamps:true,
})

flashCardSchema.index({userId:1,documentId:1})

const FlashCard=mongoose.model("FlashCard",flashCardSchema)
export default FlashCard