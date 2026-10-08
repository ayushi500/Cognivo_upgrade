import React, {useState} from 'react'
import { Star, RotateCcw} from 'lucide-react'

const Flashcard = ({flashcard, onToggleStar}) => {
    const [isFlipped, setIsFlipped]=useState(false)

    const handleFlip=()=>{
        setIsFlipped(!isFlipped)
    }
    //style is used for inline css..Taiwind normally does not include perspective utiltites
    //perspective CSS property 3D animations / rotations ko realistic depth deti hai.
  return <div className='realtive w-full h-72' style={{perspective :'1000px'}}>  
    <div 
     className={`relative w-full h-full transition-transform duration-500 transform-gpu cursor-pointer`}
     style={{
      transformStyle:'preserve-3d',
      transform:isFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)'
     }}
     onClick={handleFlip}
     >
   {/* Front of the card (Question) */}
   <div
      className='absolute inset-0 w-full h-full bg-white/80 backdrop-blur-xl border-2 border-slate-200/60 shadow-xl shadow-slate-200/50 p-8 flex flex-col justify-between'
        style={{
          backfaceVisibility:'hidden',
          WebkitBackfaceVisibility:'hidden'
        }}
        >

          {/* Star Button */}

          <div className='flex items-start justify-between'>
            <div className='bg-slate-100 text-[10px] text-slate-600 rounded px-4 py-1 uppercase'>{flashcard?.difficulty}</div>
            <button
              onClick={(e)=>{
                e.stopPropagation();
                onToggleStar(flashcard._id)
              }}
              className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-200 ${
                flashcard.isStarred ?
                'bg-linear-to-br from-amber-400 to-yellow-500 text-white shadow-lg shadow-amber-500/25'
                :'bg-slate-100 text-slate-400 hover:bg-slate-200 hover:text-amber-500'
              }`}
              >
                <Star
                  className='w-4 h-4'
                  strokeWidth={2}
                  fill={flashcard.isStarred ? 'currentColor' :'none'}
                  />
              </button>
          </div>

          {/* Question content */}
          <div className='flex-1 flex items-center justify-center px-4 py-6'>
            <p className='text-lg font-semibold text-slate-900 text-center leading-relaxed'>
              {flashcard.question}
            </p>
          </div>

          {/* Flip Indicator */}
          <div className='flex items-center justify-cenetr gap-2 text-xs text-slate-400 font-medium'>
            <RotateCcw className='w-3 h-3.5' strokeWidth={2} />
            <span>Click to reveal answer</span>
          </div>
        </div>

        {/* Back of the card (answer) */}
        <div
          className='absolute inset-0 w-full h-full bg-linear-to-br from-emerald-500 to-teal-500 border-2 border-emerald-400/60 rounded-2xl shadow-xl shadow-emerald-500/30 p-8 flex flex-col justify-between'
            style={{
              backfaceVisibility:"hidden",
              WebkitBackfaceVisibility:'hidden',
              transform:'rotateY(180deg)'
            }}
            >
              {/* Star Button */}
              <div className='flex justify-end'>
                <button
                   onClick={(e)=>{
                    e.stopPropagation()
                    onToggleStar(flashcard._id)
                   }}
                   className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-200 ${
                    flashcard.isStarred ?
                    'bg-white/30 backdrop-blur-sm text-white border border-white/40'
                    :'bg-white/20 backdrop-blur-sm text-white/70 hover:bg-white/30 hover:text-white border border-white/20'
                   }`}>
                    <Star 
                      className='w-4 h-4'
                      strokeWidth={2}
                      fill={flashcard.isStarred ? 'currentColor' : 'none'}  //Fill the star With whatever color the icon currently has
                      />
                   </button>
              </div>

              {/* Answer content */}
              <div className='flex-1 flex items-center justify-center px-4 py-6'>
                <p className='text-base text-white text-center leading-relaxed font-medium'>
                  {flashcard.answer}
                </p>
              </div>

              {/* Flip Indicator */}
              <div className='flex items-center justify-center gap-2 text-xs text-white/70 font-medium'>
                <RotateCcw className='w-3.5 h-3.5' strokeWidth={2} />
                <span>Click to see a question</span>
              </div>
            </div>
     </div>
     </div>
    
    }
export default Flashcard

/**
 * This Flashcard component:
1️⃣ Shows a flashcard
2️⃣ Has a front side (question) and back side (answer)
3️⃣ Card flips when clicked
4️⃣ User can Star / Unstar a flashcard
5️⃣ Star button should NOT flip the card, so it has special handling

1️⃣ isFlipped (STATE — Component Internal)
This belongs only to this flashcard
Controls whether card is showing front or back
true → back shown
false → front shown

Backface hiding:
backfaceVisibility: 'hidden'
WebkitBackfaceVisibility: 'hidden'
This prevents text from showing reversed.

⭐ Star Button Important Trick
This line is VERY IMPORTANT:
e.stopPropagation()
📌 Why?
Whole card has onClick={handleFlip}
If we click star → card would flip ❌
But we DO NOT want that
So we stop click from bubbling to parent div
Result:
⭐ Button click = ONLY star
Card click = ONLY flip
 */