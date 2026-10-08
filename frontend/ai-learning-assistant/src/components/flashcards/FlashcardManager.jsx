import React, {useState,useEffect} from 'react'
import {
  Plus,
  ChevronLeft,
  ChevronRight,
  Trash2,
  ArrowLeft,
  Sparkles,
  Brain
}  from "lucide-react"
import toast from "react-hot-toast"
import moment from "moment"

import flashcardService from "../../services/flashcardService"
import aiService from "../../services//aiService"
import Spinner from "../common/Spinner"
import Modal from "../common/Modal"
import Flashcard from "./Flashcard"


const FlashcardManager = ({documentId}) => {
  const [flashcardSets,setFlashcardSets]=useState([])
  const [selectedSet, setSelectedSet]=useState(null)  //flashcardSets me jo set khula hua hai
  const [loading, setLoading]=useState(true)
  const [generating, setGenerating]=useState(false)
  const [currentCardIndex, setCurrentCardIndex]=useState(0)
  const [isDeleteModalOpen, setIsDeleteModalOpen]=useState(false)
  const [deleting, setDeleting]=useState(false)
  const [setToDelete, setSetToDelete]=useState(null)

  const fetchFlashcardSets=async()=>{
    setLoading(true)
    try{
      const response=await flashcardService.getFlashcardsForDocument(
        documentId
      )
      setFlashcardSets(response.data)
    }catch(error){
      toast.error("Failed to fetch flashcard sets")
      console.error(error)
    }finally{
      setLoading(false)
    }
  }

  useEffect(()=>{
    if(documentId){
      fetchFlashcardSets()
    }
  },[documentId])

  const handleGenerateFlashcards=async()=>{
    setGenerating(true)
    try{
      await aiService.generateFlashcards(documentId)
      toast.success("Flashcards generated successfully!")
      fetchFlashcardSets()
    }catch(error){
      toast.error(error.message || "Failed to generate flashcards")
    }finally{
      setGenerating(false)
    }
  }

  const handleNextCard=()=>{
    if(selectedSet){
     handleReview(currentCardIndex)   //Next card me jane se pehle,maine current card ko review kr liya hai,ab main next card me jaungi
    
     setCurrentCardIndex(
      (prevIndex)=>(prevIndex+1) % selectedSet.cards.length  //this modulo is used for rotation,if we are in last index so on clicking next,we move to start
    )
  }
  }

  const handlePrevCard=()=>{
    if(selectedSet){
      handleReview(currentCardIndex)
    
      setCurrentCardIndex(
      (prevIndex)=>(prevIndex-1+selectedSet.cards.length) % selectedSet.cards.length   //this modulo(%) is used for rotation,if we are in last index so on clicking next,we move to start
    )
  }
}

  const handleReview=async (index)=>{
    const currentCard=selectedSet?.cards[currentCardIndex]
    if(!currentCard) return;
    
    try{
      await flashcardService.reviewFlashcard(currentCard._id, index)
      toast.success("Flashcard reviewed")
    }catch(error){
      toast.error("Failed to review flashcard")
    }
  }

  const handleToggleStar=async (cardId)=>{
  try{
    await flashcardService.toggleStar(cardId)  //maine backend me card ko star kr diya ya pir star hta diya
    //ab frontend me krna hai
    const updatedSets=flashcardSets.map((set)=>{
      if(set._id===selectedSet._id){
        const updatedCards=set.cards.map((card)=>
          card._id===cardId ? {...card,isStarred:!card.isStarred}:card
      )
      return  {...set, cards:updatedCards} 
      }
      return set;
    })
    setFlashcardSets(updatedSets)  //Flashcard list screen update ho gyi
    setSelectedSet(updatedSets.find((set)=>set._id===selectedSet._id))//jo mere paas opened set screen pr hai,uska updated version lga diya
    toast.success("Flashcard starred status updated")
  }catch(error){
    toast.error("Failed to update star status")
  }
  }

  const handleDeleteRequest=(e,set)=>{
    e.stopPropagation()
    setSetToDelete(set)
    setIsDeleteModalOpen(true)
  }

  const handleConfirmDelete=async()=>{
   if(!setToDelete) return  //if no flashcardSet was selected for deleting
  setDeleting(true)
  try{
    await flashcardService.deleteFlashcardSet(setToDelete._id)
    toast.success("Flashcard set deleted successfully")
    setIsDeleteModalOpen(false)
    setSetToDelete(null)
    fetchFlashcardSets()  //You delete set from database =>But UI still shows the old list (because flashcardSets state is unchanged) =>fetchFlashcardSets() again calls API → gets fresh updated list =>UI updates, and deleted set disappears from screen ✔️
  }catch(error){
    toast.error(error.message || "Failed to delete flashcard set")
  }finally{
    setDeleting(false)
  }
  }

  const handleSelectSet=(set)=>{
    setSelectedSet(set)   //When you select a flashcard set => React opens that set and resets you to the first card of that set
    setCurrentCardIndex(0)
  }

  const renderFlashcardViewer=()=>{  //Show ONE selected flashcard set and let user study it.Jo flashcard ke andar cards rhenge
     const currentCard=selectedSet.cards[currentCardIndex]

     return(
      <div className='space-y-8'>
        {/* Back Button */}
        <button
           onClick={()=> setSelectedSet(null)}
           className="group inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-emerald-600 transition-colors duration-200"
           >
            <ArrowLeft
               className='w-4 h-4 group-hover:-translate-x-1 transition-transform duration-200'
               strokeWidth={2}
               />
               Back to Sets
               </button>

               {/* FlashCard Display */}
               <div className='flex flex-col items-center space-y-8'>
                <div className='w-full max-w-2xl'>
                  <Flashcard
                  flashcard={currentCard}
                  onToggleStar={handleToggleStar}
                  />
                </div>

                {/* Navigation Controls */}
                <div className='flex items-center gap-6'>
                  <button
                    onClick={handlePrevCard}
                    disabled={selectedSet.cards.length<=1}
                    className='group flex items-center gap-2 px-5 h-11 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium text-sm rounded-xl transition-all duration-200 disabled:opacity-40 disabled:opacity-40 disbled:cursor-not-allowed disabled:hover:bg-slate-100'
                    >
                      <ChevronLeft
                         className='w-4 h-4 group-hover:-translate-x-0.5 transition-transform duration-200'
                         strokeWidth={2.5}
                         />
                         Previous
                    </button>

                    <div className='px-4 py-2 bg-slte-50 rounded-lg border border-slate-200'>
                      <span className='text-sm font-semibold text-slate-700'>
                        {currentCardIndex + 1}{" "}
                        <span className='text-slate-400 font-normal'>/</span>
                        {selectedSet.cards.length}
                      </span>
                    </div>


                    <button
                      onClick={handleNextCard}
                      disabled={selectedSet.cards.length<=1}
                      className='group flex items-center gap-2 px-5 h-11 bg-slate-100 hover:bg-slate-200 text-slate-200 text-slate-700 font-medium text-sm rounded-xl transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-slate-100'
                      >
                        Next
                        <ChevronRight
                          className='w-4 h-4 group-hover:-translate-x-0.5 transition-transform duration-200'
                          strokeWidth={2.5}
                          />
                      </button>
                </div>
               </div>
      </div>
     )
  }
  const renderSetList=()=>{  //Show all flashcard sets so the user can choose one.
    if(loading){
      return (
        <div className='flex items-center justify-center py-20'>
          <Spinner/>
        </div>
      )
    }
  


    if(flashcardSets.length===0){
    
      return (
        <div className='flex flex-col items-center justify-center py-16 px-6'>
          <div className='inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-linear-to-br from-emerald-100 to-teal-100 mb-6'>
            <Brain className='w-8 h-8 text-emerald-600' strokeWidth={2}/>
          </div>
          <h3 className='text-xl font-semibold text-slate-900 mb-2'>
            No Flashcards Yet
          </h3>
          <p className='text-sm text-slate-500 mb-8 text-center max-w-sm'>
            Generate flashcards from your document to start learning and 
            reinforce your knowledge
          </p>

          <button
            onClick={handleGenerateFlashcards}
            disabled={generating}
            className='group inline-flex items-center gap-2 px-6 h-12 bg-linear-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white font-semibold text-sm rounded-xl transition-all duration-200 shadow-lg shadow-emerald-500/25 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100'
            >
              {generating ? (
                <>
                <div className='w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin'/>
                Generating...
                </>
              ):(
                <>
                <Sparkles className='w-4 h-4'  strokeWidth={2} />
                Generate Flashcards
                </>
              )}
            </button>
        </div>
      )
  }

  //if i have generated the flashcard means on clicking the generate button i will be redirect here
  return (
    <div className='space-y-6'>
      {/* Header with generate button */}
      <div className='flex items-center justify-between'>
        <div>
          <h3 className='text-lg font-semibold text-slate-900'>
            Your FlashcardSets
          </h3>
          <p className='text-sm text-slate-500 mt-1'>
            {flashcardSets.length}{" "}
            {flashcardSets.length===1 ? "set" : "sets"} available
          </p>
        </div>
        <button 
          onClick={handleGenerateFlashcards}
          disabled={generating}
          className='group inline-flex items-center gap-2 px-5 h-11 bg-linear-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white font-semibold text-sm rounded-xl transition-all duration-200 shadow-lg shadow-emerald-500/25 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale:100'
          >
            {generating ? (
              <>
              <div className='w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin' />
                Generating...
              </>
            ):(
              <>
               <Plus className='w-4 h-4' strokeWidth={2.5} />
               Generate New Set
              </>
            )}
          </button>
      </div>

      {/* Flashcard sets Grid */}

      <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid:cols-3 gap-4'>
        {flashcardSets.map((set)=>(
          <div 
             key={set._id}   //on clicking single flashcardSet, we get the SelectedSet
             onClick={()=>handleSelectSet(set)}
             className='group relative bg-white/80 backdrop-blur-xl border-2 border-slate-200 hover:border-emerald-300 rounded-2xl p-6 cursor-pointer transition-all duration-200 hover:shadow-lg hover:shadow-emerald-500/10'
             >
           {/* Delete button */}
           <button
           onClick={(e)=> handleDeleteRequest(e,set)}
           className='absolute top-4 right-4 p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-all duration-200 opacity-0 group-hover:opacity-100'
           >
            <Trash2 className='w-4 h-4' strokeWidth={2}/>
           </button>

           {/* Set content */}

           <div className='space-y-4'>
            <div className='inline-flex items-center justify-center w-12 h-12 rounded-xl bg-linear-to-br from-emerald-100 to-teal-100'>
              <Brain className='w-6 h-6 text-emerald-600' strokeWidth={2} />
            </div>

            <div>
              <h4 className='text-base font-semibold text-slate-900 mb-1'>
                Flashcard Set
              </h4>
              <p className='text-xs font-medium text-slate-500 uppercase tracking-wide'>
                Created {moment(set.createdAt).format("MM D, YYYY")}
              </p>
            </div>

            <div className='flex items-center gap-2 pt-2 border-t border-slate-100'>
              <div className='px-3 py-1.5 bg-emerald-50 border border-emerald-200 rounded-lg'>
                <span className='text-sm font-semibold text-emerald-700'>
                  {set.cards.length}{" "}
                  {set.cards.length===1 ? "card" : "cards"}
                </span>
              </div>
            </div>
            </div>
            </div>
        ))}
        
      </div>
    </div>
  )

}
  

  return (
    <>
    <div className='bg-white/80 backdrop-blur-xl border border-slate-200/60 rounded-3xl shadow-xl shadow-slate-200/50 p-8'>
      {selectedSet ? renderFlashcardViewer():renderSetList()}
    </div>

     {/* Delete confirmation Modal */}
     <Modal
        isOpen={isDeleteModalOpen}
        onClose={()=>setIsDeleteModalOpen(false)}
        title="Delete Flashcard Set?"
        >
          <div className='space-y-6'>
            <p className='text-sm text-slate-600'>
              Are you sure you want to delete this flashcardset? This action cannot 
              be undone and all cards will be permanently removed.
            </p>
            <div className="flex items-center justify-end gap-3 pt-2">
              <button 
                type="button"
                onClick={()=> setIsDeleteModalOpen(false)}
                disabled={deleting}
                className='px-5 h-11 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium text-sm rounded-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed'
                >
                  Cancel
                </button>

                <button
                  onClick={handleConfirmDelete}
                  disabled={deleting}
                  className='px-5 h-11 bg-linear-to-r from-rose-500 to-red-500 hover:from-rose-600 hover:to-red-600 text-white font-semibold text-sm rounded-xl transition-all duration-200 shadow-rose-500/25 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100'
                  >
                    {deleting ?(
                      <span className='flex items-center gap-2'>
                        <div className='w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin'/>
                        Deleting...
                      </span>
                    ):(
                      "Delete Set"
                    )}
                  </button>
            </div>
          </div>
        </Modal>
    </>
  )
}

export default FlashcardManager

/**
 * Maan lo tumhare paas flashcards ka array hai:
const flashcards = ["Card1", "Card2", "Card3"]
Aur tum ek state rakhte ho:
const [currentIndex, setCurrentIndex] = useState(0)
Matlab:
0 → Card 1 dikh raha
1 → Card 2 dikh raha
2 → Card 3 dikh raha
✅ Why handleNextCard() ?
👉 Jab user Next button dabaye,
Hume next card dikhana hai
Toh index badhana padega
const handleNextCard = () => {
  setCurrentIndex((prev) => prev + 1)
}
So:
0 → 1 bana
1 → 2 bana
next card show 🎉

✅ Why handlePreviousCard() ?
👉 Jab user Previous dabaye,
index ko peeche le jaana padega:
const handlePreviousCard = () => {
  setCurrentIndex((prev) => prev - 1)
}
So:
2 → 1
1 → 0
previous card show 🎉


✅ handleReview usually kya karta hai?
✔️ Track karta hai user ne card revise kiya
✔️ Card ko “reviewed”, “correct”, “wrong”, “learned” jaise status deta hai
✔️ Backend ko batata hai ke user ne is card ko review kiya
✔️ Progress update karta hai
✔️ Kabhi-kabhi card ko next schedule karta hai (spaced repetition)


********************************************************
✅ 2. Important States
flashcardSets
All sets returned from the backend.
Example:
[
  { title: "Chapter 1", cards: [...] },
  { title: "React Basics", cards: [...] }
]
selectedSet=>
Which set user is currently viewing.
selectedSet = flashcardSets[0]
currentCardIndex
Which card number is currently displayed.
0 → first card  
1 → second card  
isDeleteModalOpen, setToDelete
For delete confirmation modal.


handleReview
✔ index = what user selected
Not the card number!
Possible values:
index = 0 → Don’t Know  
index = 1 → Maybe  
index = 2 → I Know
✔ currentCardIndex = which card we are currently showing
Example:
We are on card #2 → currentCardIndex = 1
currentCard = selectedSet.cards[1]


****************************************************
handleTogglecard
✅ Step 1 — Backend update
await flashcardService.toggleStar(cardId)
➡️ Server ko bol diya:
“Is card ko ⭐ bana do ya hatado”
✅ Step 2 — Frontend update shuru
const updatedSets = flashcardSets.map((set) => {
➡️ Tumhare paas bohot saare flashcard sets hain
Hum un sab par loop lagate hain
✅ Step 3 — Sirf currently opened set ko update karo
if (set._id === selectedSet._id) {
➡️ Jo set screen par open hai
➡️ Usko hi change karna hai
➡️ Baaki sets ko nahi chhedna
✅ Step 4 — Us set ke cards me star toggle karo
const updatedCards = set.cards.map((card) =>
  card._id === cardId
    ? { ...card, isStarred: !isStarred }
    : card
)
Ye karta kya hai?
Saare cards loop karo
Jiska cardId match kare
Uska isStarred ulta kar do
⭐ true → false
❌ false → true
✅ Step 5 — Set ko update karke return kar do
return { ...set, cards: updatedCards }
✅ Step 6 — Baaki sets normal return
return set
✅ Step 7 — State update (UI refresh)
setFlashcardSets(updatedSets)
➡️ Flashcard list screen update ho jaati hai
✅ Step 8 — Selected set bhi update karo
setSelectedSet(updatedSets.find((set) => set._id === selectedSet._id))
➡️ Current opened set ka latest version laga diya
 */